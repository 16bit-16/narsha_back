import { Router } from "express";
import type { Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { readUserFromReq } from "../utils/authToken";
import sharp from "sharp";

const router = Router();

// 업로드 디렉토리 준비
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// multer 설정
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, "");
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `${base || "image"}-${unique}${ext}`);
  },
});

const fileFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
  if (/^image\/(png|jpe?g|gif|webp|bmp)$/i.test(file.mimetype)) cb(null, true);
  else cb(new Error("Only image files are allowed"));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 5 },
});

// ✅ 절대 URL 계산 유틸 개선
function getBaseUrl(req: Request) {
  // ✅ 1순위: 환경변수 (프로덕션용)
  if (process.env.API_URL) {
    return process.env.API_URL;
  }

  // ✅ 2순위: PUBLIC_BASE_URL
  if (process.env.PUBLIC_BASE_URL) {
    return process.env.PUBLIC_BASE_URL;
  }

  // ✅ 3순위: 요청 헤더로 추론 (개발용)
  const proto =
    (req.headers["x-forwarded-proto"] as string) || req.protocol || "http";
  const host = req.get("host");
  return `${proto}://${host}`;
}

// server/routes/uploads.ts

router.post(
  "/images",
  upload.array("files", 5),
  async (req: Request, res: Response) => {
    const user = readUserFromReq(req);
    if (!user)
      return res.status(401).json({ ok: false, error: "unauthorized" });

    const files =
      (req as Request & { files?: Express.Multer.File[] }).files ?? [];

    if (files.length === 0) {
      return res.status(400).json({ ok: false, error: "파일이 없습니다" });
    }

    try {
      const base = getBaseUrl(req);
      
      const urls = await Promise.all(
        files.map(async (f) => {
          // ✅ .webp 확장자로 변경
          const baseName = path.basename(f.path, path.extname(f.path));
          const outputFilename = `optimized-${baseName}.webp`;
          const outputPath = path.join(uploadDir, outputFilename);

          // ✅ WebP로 변환 (JPEG보다 30-50% 작음)
          await sharp(f.path)
            .resize(1200, 1200, { 
              fit: "inside", 
              withoutEnlargement: true 
            })
            .webp({ quality: 85 }) // ✅ webp로 변경
            .toFile(outputPath);

          // 원본 파일 삭제
          fs.unlinkSync(f.path);

          return `${base}/uploads/${outputFilename}`;
        })
      );

      return res.status(201).json({ ok: true, urls });
    } catch (err: any) {
      console.error("Image optimization error:", err);
      
      const base = getBaseUrl(req);
      const urls = files.map((f) => `${base}/uploads/${path.basename(f.path)}`);
      return res.status(201).json({ ok: true, urls });
    }
  }
);

export default router;