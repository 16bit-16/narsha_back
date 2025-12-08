import { Router } from "express";
import Message from "../models/Message";
import { readUserFromReq } from "../utils/authToken";

const router = Router();

// ✅ 채팅 히스토리 조회
router.get("/chat/:receiverId/:productId", async (req, res) => {
    try {
        const user = readUserFromReq(req);
        if (!user) {
            return res.status(401).json({ ok: false, error: "unauthorized" });
        }

        const { receiverId, productId } = req.params;
        const roomId = [user.id, receiverId].sort().join("-");

        const messages = await Message.find({ roomId, productId })
            .populate("senderId", "nickname profileImage")
            .populate("receiverId", "nickname profileImage")
            .sort({ createdAt: 1 })
            .limit(50);

        return res.json({ ok: true, messages });
    } catch (err: any) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

export default router;