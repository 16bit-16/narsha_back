import { Router } from "express";
import { z } from "zod";
import Product from "../models/Product";
import { readUserFromReq } from "../utils/authToken";

const router = Router();

// 검색
router.get("/search", async (req, res) => {
  try {
    const query = req.query.q as string;
    
    if (!query || !query.trim()) {
      return res.json({ ok: true, products: [] });
    }

    // 제목 또는 설명에서 검색 (대소문자 구분 없이)
    const products = await Product.find({
      $or: [
        { title: { $regex: query.trim(), $options: "i" } },
        { description: { $regex: query.trim(), $options: "i" } },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(100);

    return res.json({ ok: true, products });
  } catch (err: any) {
    console.error("검색 에러:", err);
    return res.status(500).json({ 
      ok: false, 
      error: err.message || "검색 실패" 
    });
  }
});

/** 등록 */
router.post("/", async (req, res) => {
  const user = readUserFromReq(req);
  if (!user) return res.status(401).json({ ok: false, error: "unauthorized" });

  const Body = z.object({
    title: z.string().min(1),
    description: z.string().optional().default(""),
    price: z.number().nonnegative(),
    category: z.string().optional().default("기타"),
    location: z.string().optional().default("미정"),
    images: z.array(z.string().url()).optional().default([]),
    lat: z.number().optional(),
    lng: z.number().optional(),

    // detail sidebar
    brand: z.string().optional().default(""),
    quality: z.enum([
      "미개봉",
      "최상",
      "상",
      "중상",
      "중",
      "중하",
      "하",
    ]).optional().default("미개봉"),
    buydate: z.string().optional().default(""),
    trade: z.string().optional().default(""), 
    deliveryfee: z.string().optional().default("배송비 미포함"),
    isSailed: z.boolean().optional().default(false),
  });

  const parsed = Body.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: parsed.error.message });
  }

  const doc = await Product.create({ ...parsed.data, seller: user.id });
  return res.status(201).json({ ok: true, product: doc });
});

// server/routes/products.ts

// 상품 상태 변경
router.patch("/:id/status", async (req, res) => {
  const user = readUserFromReq(req);
  if (!user) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  const { status } = z.object({
    status: z.enum(["selling", "reserved", "sold"]),
  }).parse(req.body);

  const product = await Product.findById(req.params.id);
  if (!product) {
    return res.status(404).json({ ok: false, error: "상품을 찾을 수 없습니다" });
  }

  // 본인 상품인지 확인
  if (product.seller.toString() !== user.id) {
    return res.status(403).json({ ok: false, error: "권한이 없습니다" });
  }

  product.status = status;
  await product.save();

  return res.json({ ok: true, product });
});

// 상품 삭제
router.delete("/:id", async (req, res) => {
  const user = readUserFromReq(req);
  if (!user) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  const product = await Product.findById(req.params.id);
  if (!product) {
    return res.status(404).json({ ok: false, error: "상품을 찾을 수 없습니다" });
  }

  if (product.seller.toString() !== user.id) {
    return res.status(403).json({ ok: false, error: "권한이 없습니다" });
  }

  await product.deleteOne();

  return res.json({ ok: true });
});

// 내가 올린 상품
router.get("/my", async (req, res) => {
  const user = readUserFromReq(req);
  if (!user) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  const products = await Product.find({ seller: user.id })
    .sort({ createdAt: -1 })
    .limit(100);

  return res.json({ ok: true, products });
});

// 찜한 상품
router.get("/liked", async (req, res) => {
  const user = readUserFromReq(req);
  if (!user) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  const products = await Product.find({ likes: user.id })
    .sort({ createdAt: -1 })
    .limit(100);

  return res.json({ ok: true, products });
});

/** 목록 (최신순) */
router.get("/", async (_req, res) => {
  const list = await Product.find().sort({ createdAt: -1 }).limit(200);
  return res.json({ ok: true, products: list });
});

/** 단건 조회 - 좋아요 정보 포함 ✅ */
router.get("/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate("seller", "userId nickname profileImage rating");
    if (!product) {
      return res.status(404).json({ ok: false, error: "not_found" });
    }

    // ✅ 현재 유저의 좋아요 여부 확인
    const user = readUserFromReq(req);
    const isLiked = user && product.likes 
      ? product.likes.some((likeId) => likeId.toString() === user.id)
      : false;

    return res.json({ 
      ok: true, 
      product,
      isLiked, // ✅ 좋아요 여부 추가
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: "조회 실패" });
  }
});

/** 좋아요 토글 ✅ */
router.post("/:id/like", async (req, res) => {
  try {
    const user = readUserFromReq(req);
    if (!user) {
      return res.status(401).json({ ok: false, error: "로그인이 필요합니다" });
    }

    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ ok: false, error: "상품을 찾을 수 없습니다" });
    }

    const userId = user.id;
    const likedIndex = product.likes.findIndex(
      (id) => id.toString() === userId
    );

    if (likedIndex > -1) {
      // 이미 좋아요 → 취소
      product.likes.splice(likedIndex, 1);
    } else {
      // 좋아요 추가
      product.likes.push(userId as any);
    }

    product.likeCount = product.likes.length;
    await product.save();

    res.json({
      ok: true,
      product,
      isLiked: likedIndex === -1,
      likeCount: product.likeCount,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: "서버 오류" });
  }
});

export default router;