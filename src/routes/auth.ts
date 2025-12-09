// server/src/routes/auth.ts
import path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import nodemailer from "nodemailer";
import bcrypt from "bcryptjs";

import EmailCode from "../models/EmailCode";
import { optimizeProfileImage } from "../utils/ImageOptimizer";
import User from "../models/User";
import {
  signUser,
  setAuthCookie,
  clearAuthCookie,
  readUserFromReq,
} from "../utils/authToken";

/* ---------------------- utils ---------------------- */
function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}
const mask = (s?: string) => (s ? s.slice(0, 2) + "***" : "(missing)");

/* ------------------- nodemailer -------------------- */
/**
 * Gmail 사용: 앱 비밀번호 필요(구글 계정 → 보안 → 2단계 인증 → 앱 비밀번호)
 */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: requireEnv("SMTP_USER"),
    pass: requireEnv("SMTP_PASS"),
  },
});

// 기동 시 1회 확인 로그
(async () => {
  console.log("[SMTP ENV]", {
    user: mask(process.env.SMTP_USER),
    pass: process.env.SMTP_PASS ? "(set)" : "(missing)",
  });
  try {
    await transporter.verify();
    console.log("SMTP ready");
  } catch (e: any) {
    console.error("SMTP verify failed:", e?.message || e);
  }
})();

/* ---------------------- schema --------------------- */
const sendSchema = z.object({ email: z.string().email() });
const verifySchema = z.object({
  email: z.string().email(),
  code: z.string().min(4).max(8),
});
const signupSchema = z.object({
  userId: z.string().min(3),
  password: z.string().min(4),
  email: z.string().email(),
});
const loginSchema = z.object({
  userId: z.string().min(1),
  password: z.string().min(1),
});

/* -------------------- router ----------------------- */
const router = Router();
const limiter = rateLimit({ windowMs: 60_000, max: 10 });

/**
 * POST /api/auth/send-code
 * body: { email }
 */
router.post("/send-code", limiter, async (req, res) => {
  try {
    const { email } = sendSchema.parse(req.body);

    // 6자리 코드 생성 & 만료 3분
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 3 * 60 * 1000);

    await EmailCode.findOneAndUpdate(
      { email },
      { code, expiresAt, attempts: 0 },
      { upsert: true, new: true }
    );

    const info = await transporter.sendMail({
      from: process.env.MAIL_FROM ?? requireEnv("SMTP_USER"),
      to: email,
      subject: "PALPAL 이메일 인증코드",
      text: `인증코드: ${code} (3분 이내 유효)`,
      html: `<p>인증코드: <b style="font-size:18px;">${code}</b></p><p>3분 이내에 입력해 주세요.</p>`,
    });

    return res.json({ ok: true, messageId: info.messageId });
  } catch (e: any) {
    console.error("send-code error:", e);
    const msg = e?.message || "Failed to send email code";
    return res.status(500).json({ ok: false, error: msg });
  }
});

/**
 * POST /api/auth/verify-code
 * body: { email, code }
 */
router.post("/verify-code", limiter, async (req, res) => {
  try {
    const { email, code } = verifySchema.parse(req.body);

    const doc = await EmailCode.findOne({ email });
    if (!doc) {
      return res
        .status(400)
        .json({ ok: false, error: "코드를 다시 요청하세요." });
    }

    if (doc.expiresAt.getTime() < Date.now()) {
      await doc.deleteOne();
      return res
        .status(400)
        .json({ ok: false, error: "코드가 만료되었습니다." });
    }

    if (doc.attempts >= 5) {
      return res.status(429).json({ ok: false, error: "시도 횟수 초과" });
    }

    if (doc.code !== code) {
      doc.attempts += 1;
      await doc.save();
      return res
        .status(400)
        .json({ ok: false, error: "인증코드가 일치하지 않습니다." });
    }

    // 성공 시 사용 완료 처리
    await EmailCode.deleteOne({ email });
    return res.json({ ok: true, verified: true });
  } catch (e: any) {
    console.error("verify-code error:", e);
    const msg = e?.message || "Failed to verify code";
    return res.status(400).json({ ok: false, error: msg });
  }
});

/**
 * POST /api/auth/signup
 * body: { userId, password, email }
 */
router.post("/signup", limiter, async (req, res) => {
  try {
    const { userId, password, email } = signupSchema.parse(req.body);

    const exists = await User.findOne({ $or: [{ userId }, { email }] });
    if (exists) {
      return res
        .status(409)
        .json({ ok: false, error: "이미 사용 중인 아이디/이메일" });
    }

    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({
      userId,
      passwordHash: hash,
      email,
      nickname: userId,
      profileImage: "https://img2.joongna.com/common/Profile/Default/profile_m.png",
      emailVerified: true, // 실제 서비스는 verify 후 true 권장
    });

    return res.json({
      ok: true,
      user: { id: String(user._id), userId: user.userId, email: user.email },
    });
  } catch (e: any) {
    console.error("signup error:", e);
    const msg = e?.message || "Failed to signup";
    return res.status(400).json({ ok: false, error: msg });
  }
});

/** 로그인 */
router.post("/login", limiter, async (req, res) => {
  try {
    const { userId, password } = loginSchema.parse(req.body);

    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(401).json({
        ok: false,
        error: "아이디 또는 비밀번호가 올바르지 않습니다.",
      });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({
        ok: false,
        error: "아이디 또는 비밀번호가 올바르지 않습니다.",
      });
    }

    const token = signUser({
      id: String(user._id),
      userId: user.userId,
      email: user.email,
    });

    // ✅ 쿠키 방식 유지 (옵션)
    setAuthCookie(res, token);

    // ✅ 토큰을 응답에 포함 (localStorage용)
    return res.json({
      ok: true,
      user: {
        id: String(user._id),
        userId: user.userId,
        email: user.email,
      },
      token, // ✅ 추가
    });
  } catch (e: any) {
    console.error("login error:", e);
    return res
      .status(500)
      .json({ ok: false, error: e?.message || "login failed" });
  }
});

/** 내 정보(me) */
router.get("/me", async (req, res) => {
  const u = readUserFromReq(req);
  if (!u) return res.status(401).json({ ok: false, error: "unauthorized" });

  try {
    // ✅ DB에서 전체 사용자 정보 조회
    const user = await User.findById(u.id)
      .select('userId nickname email profileImage');

    if (!user) {
      return res.status(404).json({ ok: false, error: "사용자를 찾을 수 없습니다" });
    }

    return res.json({
      ok: true,
      user: {
        _id: user._id,
        userId: user.userId,
        nickname: user.nickname,
        email: user.email,
        profileImage: user.profileImage
      }
    });
  } catch (err) {
    console.error('사용자 조회 실패:', err);
    return res.status(500).json({ ok: false, error: "서버 오류" });
  }
});

/** 로그아웃 */
router.post("/logout", (_req, res) => {
  clearAuthCookie(res);
  return res.json({ ok: true });
});

// 아이디 찾기
router.post("/find/id", limiter, async (req, res) => {
  try {
    const { email, code } = z.object({
      email: z.string().email(),
      code: z.string().min(4).max(8),
    }).parse(req.body);

    // 인증코드 확인
    const codeDoc = await EmailCode.findOne({ email });
    if (!codeDoc || codeDoc.code !== code) {
      return res.status(400).json({ ok: false, error: "인증코드가 일치하지 않습니다" });
    }

    // 이메일로 사용자 찾기
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ ok: false, error: "사용자를 찾을 수 없습니다" });
    }

    await EmailCode.deleteOne({ email });

    return res.json({ ok: true, userId: user.userId });
  } catch (err: any) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

router.post("checkId", limiter, async (req, res) => {
  try {
    const id = z.object({
      userId: z.string().min(1),
    }).parse(req.body).userId;
    const user = await User.findOne({ userId: id });
    if (!user) {
      return res.status(404).json({ ok: false, error: "사용자를 찾을 수 없습니다" });
    }
  } catch (err: any) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

// 비밀번호 재설정 코드 발송
router.post("/send-reset-code", limiter, async (req, res) => {
  try {
    const { userId, email } = z.object({
      userId: z.string().min(1),
      email: z.string().email(),
    }).parse(req.body);

    // 사용자 확인
    const user = await User.findOne({ userId, email });
    if (!user) {
      return res.status(404).json({ ok: false, error: "일치하는 사용자가 없습니다" });
    }

    // 코드 생성 & 발송
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await EmailCode.findOneAndUpdate(
      { email },
      { code, expiresAt, attempts: 0 },
      { upsert: true, new: true }
    );

    await transporter.sendMail({
      from: process.env.MAIL_FROM ?? requireEnv("SMTP_USER"),
      to: email,
      subject: "PALPAL 비밀번호 재설정 인증코드",
      text: `인증코드: ${code} (3분 이내 유효)`,
      html: `<p>인증코드: <b style="font-size:18px;">${code}</b></p><p>3분 이내에 입력해 주세요.</p>`,
    });

    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

// 비밀번호 재설정 코드 확인
router.post("/verify-reset-code", limiter, async (req, res) => {
  try {
    const { userId, email, code } = z.object({
      userId: z.string().min(1),
      email: z.string().email(),
      code: z.string().min(4).max(8),
    }).parse(req.body);

    const codeDoc = await EmailCode.findOne({ email });
    if (!codeDoc || codeDoc.code !== code) {
      return res.status(400).json({ ok: false, error: "인증코드가 일치하지 않습니다" });
    }

    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

// 비밀번호 재설정
router.post("/reset-password", limiter, async (req, res) => {
  try {
    const { userId, email, code, newPassword } = z.object({
      userId: z.string().min(1),
      email: z.string().email(),
      code: z.string().min(4).max(8),
      newPassword: z.string().min(4),
    }).parse(req.body);

    // 코드 재확인
    const codeDoc = await EmailCode.findOne({ email });
    if (!codeDoc || codeDoc.code !== code) {
      return res.status(400).json({ ok: false, error: "인증코드가 일치하지 않습니다" });
    }

    // 사용자 찾기
    const user = await User.findOne({ userId, email });
    if (!user) {
      return res.status(404).json({ ok: false, error: "사용자를 찾을 수 없습니다" });
    }

    // 비밀번호 변경
    const hash = await bcrypt.hash(newPassword, 10);
    user.passwordHash = hash;
    await user.save();

    // 코드 삭제
    await EmailCode.deleteOne({ email });

    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

router.patch("/profile", async (req, res) => {
  try {
    const user = readUserFromReq(req);
    if (!user) {
      return res.status(401).json({ ok: false, error: "로그인이 필요합니다" });
    }

    const { nickname, profileImage } = req.body;
    const updateData: any = {};

    if (nickname && nickname !== user.nickname) {
      const existing = await User.findOne({ nickname });
      if (existing) {
        return res.status(400).json({ ok: false, error: "이미 사용 중인 닉네임입니다" });
      }
      updateData.nickname = nickname;
    }

    if (profileImage && profileImage.startsWith("data:image")) {
      try {
        // Base64를 Buffer로 변환
        const base64Data = profileImage.split(",")[1];
        const buffer = Buffer.from(base64Data, "base64");

        // 이미지 최적화
        const optimizedUrl = await optimizeProfileImage(buffer, "profile");
        updateData.profileImage = optimizedUrl;

      } catch (err) {
        console.error("프로필 이미지 처리 실패:", err);
        return res.status(400).json({ ok: false, error: "이미지 처리 실패" });
      }
    }

    const updated = await User.findByIdAndUpdate(user.id, updateData, { new: true });

    return res.json({ ok: true, user: updated });
  } catch (err: any) {
    console.error("프로필 수정 에러:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;