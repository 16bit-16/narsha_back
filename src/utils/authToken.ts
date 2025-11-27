// server/src/utils/authToken.ts
import jwt, { type SignOptions, type JwtPayload } from "jsonwebtoken";
import type { Request as ExRequest, Response as ExResponse } from "express";
import "cookie-parser";

const secret = process.env.JWT_SECRET || "dev-secret";
const cookieName = process.env.JWT_COOKIE || "krush_token";

export function signUser(payload: {
  id: string;
  userId: string;
  email: string;
}) {
  const raw = process.env.JWT_EXPIRES ?? "7d";
  const expiresIn: SignOptions["expiresIn"] = /^\d+$/.test(raw)
    ? Number(raw)
    : raw;
  return jwt.sign(payload as JwtPayload, secret, { expiresIn });
}

export function setAuthCookie(res: ExResponse, token: string) {
  res.cookie(cookieName, token, {
    httpOnly: true, // ✅ 항상 true
    sameSite: "none",
    secure: true, // ✅ 항상 true
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

export function clearAuthCookie(res: ExResponse) {
  res.cookie(cookieName, "", {
    httpOnly: true, // ✅ 항상 true
    sameSite: "none",
    secure: true, // ✅ 항상 true
    expires: new Date(0),
    path: "/",
  });
}

// ✅ Authorization 헤더와 쿠키 둘 다 지원
export function readUserFromReq(req: ExRequest) {
  let token: string | undefined;

  // 1. Authorization 헤더에서 먼저 찾기 (Bearer 토큰)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } 
  // 2. 쿠키에서 찾기 (fallback)
  else {
    token = req.cookies?.[cookieName] as string | undefined;
  }

  if (!token) return null;

  try {
    const decoded = jwt.verify(token, secret) as {
      id: string;
      userId: string;
      email: string;
    };
    return decoded;
  } catch {
    return null;
  }
}