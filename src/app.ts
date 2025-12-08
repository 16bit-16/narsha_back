// server/src/app.ts
import path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import cookieParser from "cookie-parser";
import compression from "compression";
import messagesRouter from "./routes/messages";
import http from "http";
import { initializeSocket } from "./socket";
import aiRouter from "./routes/ai";

// 기존 라우터
import authRouter from "./routes/auth";
// 새 라우터 추가
import productsRouter from "./routes/products";
import uploadRouter from "./routes/upload";

const app = express();
const httpServer = http.createServer(app); // ✅ 이미 있음

// CORS 설정 — 프리플라이트(OPTIONS) 완전 허용
const allowedOrigins = ["https://palpalshop.shop", "http://local.palpalshop.shop:5173", "https://firstnarsha.vercel.app", "https://www.palpalshop.shop"];
app.use((req, res, next) => {
  const origin = req.headers.origin as string | undefined;
  if (!origin || allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin || "*");
    res.header("Vary", "Origin");
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.header(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS"
    );
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(cors({ origin: allowedOrigins, credentials: true }));

// 바디/쿠키
app.use(compression());
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

// ✅ Socket.io 초기화
initializeSocket(httpServer);

app.use("/api/messages", messagesRouter);

// 업로드 파일 정적 제공
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// 헬스체크
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// 실제 라우터
app.use("/api/ai", aiRouter);
app.use("/api/auth", authRouter);
app.use("/api/users", authRouter);
app.use("/api/products", productsRouter);
app.use("/api/uploads", uploadRouter);
app.use("/api/messages", messagesRouter);

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI!);
    console.log("MongoDB connected");

    const port = Number(process.env.PORT) || 4000;
    const host = process.env.HOST ?? "0.0.0.0";

    // ✅ app.listen → httpServer.listen 변경 (중요!)
    httpServer.listen(port, host, () => {
      console.log(
        `🚀 Server running at http://${
          host === "0.0.0.0" ? "127.0.0.1" : host
        }:${port}`
      );
      console.log(`✅ WebSocket ready`);
    });
  } catch (err) {
    console.error("Server startup failed:", err);
  }
})();

export { httpServer, app };