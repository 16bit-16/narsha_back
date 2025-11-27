// server/src/app.ts
import path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import cookieParser from "cookie-parser";

// 기존 라우터
import authRouter from "./routes/auth";
// 새 라우터 추가
import productsRouter from "./routes/products";
import uploadRouter from "./routes/upload";

const app = express();

// CORS 설정 — 프리플라이트(OPTIONS) 완전 허용
const allowedOrigins = ["http://localhost:5173", "http://127.0.0.1:5173"];
app.use((req, res, next) => {
  const origin = req.headers.origin as string | undefined;
  if (!origin || allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin || "*");
    res.header("Vary", "Origin");
    res.header("Access-Control-Allow-Credentials", "true");
    // 업로드(FormData)에도 문제 없도록 헤더 확장
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.header(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS"
    );
  }
  if (req.method === "OPTIONS") return res.sendStatus(204); // 404 방지
  next();
});

// cors 미들웨어(중복 허용: 위 핸들러와 합쳐 안전망 역할)
app.use(cors({ origin: allowedOrigins, credentials: true }));

// 바디/쿠키
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

// 업로드 파일 정적 제공 (/uploads/파일명 으로 접근)
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// 헬스체크
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// 실제 라우터
app.use("/api/auth", authRouter);
app.use("/api/products", productsRouter);
app.use("/api/uploads", uploadRouter);

(async () => {
  try {
    // ⚠️ .env 키 이름 확인: 현재 코드는 MONGO_URI 사용
    // 예: MONGO_URI=mongodb://127.0.0.1:27017/krush
    await mongoose.connect(process.env.MONGO_URI!);
    console.log("MongoDB connected");

    const port = Number(process.env.PORT) || 4000;
    const host = process.env.HOST ?? "0.0.0.0";

    app.listen(port, host, () => {
      console.log(
        `Server running at http://${
          host === "0.0.0.0" ? "127.0.0.1" : host
        }:${port}`
      );
    });
  } catch (err) {
    console.error("Server startup failed:", err);
  }
})();

export default app;
