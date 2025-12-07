import { Schema, model, Types } from "mongoose";

const ProductSchema = new Schema(
  {
    seller: { type: Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    price: { type: Number, required: true, min: 0 },
    category: { type: String, default: "기타", index: true },
    location: { type: String, default: "미정", index: true },
    images: { type: [String], default: [] }, // 업로드된 이미지 URL 배열
    status: {
      type: String,
      enum: ["selling", "reserved", "sold"],
      default: "selling",
      index: true,
    },
    lat: { type: Number }, // 위도
    lng: { type: Number }, // 경도

    // detail sidebar
    brand: { type: String, default: "" },
    quality: {
      type: String,
      enum: ["미개봉", "최상", "상", "중상", "중", "중하", "하"],
      default: "",
    },
    buydate: { type: String, default: null },
    trade: { type: String, default: null },    
    deliveryfee: { type: String, default: "배송비 미포함" },
    likes: [{ type: Types.ObjectId, ref: "User" }], // 좋아요한 유저 ID 배열
    likeCount: { type: Number, default: 0 }, // 좋아요 수 (성능 최적화용)
  },
  { timestamps: true }
);

ProductSchema.index({ createdAt: -1 }); // 최신순 정렬 빠르게
ProductSchema.index({ seller: 1 }); // 판매자별 조회 빠르게
ProductSchema.index({ status: 1 }); // 상태별 조회 빠르게

export default model("Product", ProductSchema);
