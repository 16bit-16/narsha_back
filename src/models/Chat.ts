// backend/src/models/Chat.ts

import { Schema, model, Types } from "mongoose";

const ChatSchema = new Schema(
    {
        sender: { type: Types.ObjectId, ref: "User", required: true },
        receiver: { type: Types.ObjectId, ref: "User", required: true },
        product: { type: Types.ObjectId, ref: "Product", required: true },
        message: { type: String, defalut: "" },
        image: { type: String, default: null },
        read: { type: Boolean, default: false },
    },
    { timestamps: true }
);

ChatSchema.index({ sender: 1, receiver: 1, product: 1 });

export default model("Chat", ChatSchema);