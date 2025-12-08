import { Schema, model, Types } from "mongoose";

const MessageSchema = new Schema(
    {
        roomId: { type: String, required: true, index: true },
        senderId: { type: Types.ObjectId, ref: "User", required: true },
        receiverId: { type: Types.ObjectId, ref: "User", required: true },
        productId: { type: Types.ObjectId, ref: "Product", required: true },
        text: { type: String, required: true },
        read: { type: Boolean, default: false },
    },
    { timestamps: true }
);

// roomId로 빠르게 조회
MessageSchema.index({ roomId: 1, createdAt: -1 });

export default model("Message", MessageSchema);