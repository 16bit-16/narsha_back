import sharp from "sharp";
import path from "path";
import fs from "fs";

// 이미지 최적화 유틸
// 400x400 webp

export async function optimizeProfileImage(
    buffer: Buffer,
    filename: string
): Promise<string> {
    try {
        // uploads 폴더 생성
        const uploadsDir = path.join(process.cwd(), "uploads", "profiles");
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }

        // 파일명 생성 (짧게)
        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).slice(2, 8);
        const optimizedFilename = `p_${timestamp}_${randomStr}.webp`; // 짧은 이름

        const filepath = path.join(uploadsDir, optimizedFilename);

        // Sharp로 이미지 최적화
        await sharp(buffer)
            .resize(400, 400, {
                fit: "cover",
                position: "center",
            })
            .webp({ quality: 80 }) // WebP로 변환 (크기 감소)
            .toFile(filepath);

        // URL 반환 (짧음)
        const apiBase = process.env.API_BASE || "https://api.palpalshop.shop";
        return `${apiBase}/uploads/profiles/${optimizedFilename}`;
    } catch (err) {
        console.error("이미지 최적화 실패:", err);
        throw new Error("이미지 최적화 실패");
    }
}