// backend/src/routes/chat.ts

import { Router } from "express";
import Chat from "../models/Chat";
import { readUserFromReq } from "../utils/authToken";

const router = Router();

// 채팅 목록
router.get("/list", async (req, res) => {
    try {
        const user = readUserFromReq(req);
        if (!user) return res.status(401).json({ ok: false });

        const chats = await Chat.find({
            $or: [{ sender: user.id }, { receiver: user.id }],
        })
            .populate("sender", "nickname profileImage")
            .populate("receiver", "nickname profileImage")
            .populate("product", "title images price")
            .sort({ createdAt: -1 });

        return res.json({ ok: true, chats });
    } catch (err: any) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

router.delete("/:messageId", async (req, res) => {
    try {
        const user = readUserFromReq(req);
        if (!user) {
            return res.status(401).json({ ok: false, error: "로그인이 필요합니다" });
        }

        const { messageId } = req.params;

        const message = await Chat.findById(messageId);
        if (!message) {
            return res.status(404).json({ ok: false, error: "메시지를 찾을 수 없습니다" });
        }

        // 본인 메시지만 삭제 가능
        if (message.sender.toString() !== user.id) {
            return res.status(403).json({ ok: false, error: "본인 메시지만 삭제할 수 있습니다" });
        }

        await Chat.findByIdAndDelete(messageId);

        return res.json({ ok: true });
    } catch (err: any) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

// 특정 채팅 조회
router.get("/:userId/:productId", async (req, res) => {
    try {
        const user = readUserFromReq(req);
        if (!user) return res.status(401).json({ ok: false });

        const { userId, productId } = req.params;

        const messages = await Chat.find({
            $or: [
                { sender: user.id, receiver: userId, product: productId },
                { sender: userId, receiver: user.id, product: productId },
            ],
        })
            .populate("sender", "nickname profileImage")
            .populate("receiver", "nickname profileImage")
            .sort({ createdAt: 1 });

        return res.json({ ok: true, messages });
    } catch (err: any) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

export default router;