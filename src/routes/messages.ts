import { Router } from "express";
import Message from "../models/Message";
import { readUserFromReq } from "../utils/authToken";

const router = Router();

// 메시지 전송
router.post("/send", async (req, res) => {
    try {
        const user = readUserFromReq(req);
        if (!user) {
            return res.status(401).json({ ok: false, error: "unauthorized" });
        }

        const { receiverId, productId, text } = req.body;

        if (!receiverId || !productId || !text) {
            return res.status(400).json({
                ok: false,
                error: "receiverId, productId, text are required"
            });
        }

        const roomId = [user.id, receiverId].sort().join("-");

        const message = new Message({
            roomId,
            senderId: user.id,
            receiverId,
            productId,
            text: text.trim(),
            read: false,
        });

        await message.save();
        await message.populate("senderId", "nickname profileImage");
        await message.populate("receiverId", "nickname profileImage");

        return res.json({ ok: true, message });
    } catch (err: any) {
        console.error("메시지 전송 에러:", err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

router.get("/rooms", async (req, res) => {
    try {
        const user = readUserFromReq(req);
        if (!user) {
            return res.status(401).json({ ok: false, error: "unauthorized" });
        }

        // ✅ 사용자가 참여한 모든 채팅방 조회
        const rooms = await Message.aggregate([
            {
                $match: {
                    $or: [
                        { senderId: user.id },
                        { receiverId: user.id },
                    ],
                },
            },
            {
                $sort: { createdAt: -1 },
            },
            {
                $group: {
                    _id: "$roomId",
                    lastMessage: { $first: "$text" },
                    lastMessageTime: { $first: "$createdAt" },
                    senderId: { $first: "$senderId" },
                    receiverId: { $first: "$receiverId" },
                    productId: { $first: "$productId" },
                },
            },
            {
                $lookup: {
                    from: "products",
                    localField: "productId",
                    foreignField: "_id",
                    as: "product",
                },
            },
            {
                $unwind: "$product",
            },
            {
                $lookup: {
                    from: "users",
                    let: {
                        otherUserId: {
                            $cond: [
                                { $eq: ["$senderId", user.id] },
                                "$receiverId",
                                "$senderId",
                            ],
                        },
                    },
                    pipeline: [
                        { $match: { $expr: { $eq: ["$_id", "$$otherUserId"] } } },
                        {
                            $project: {
                                _id: 1,
                                nickname: 1,
                                profileImage: 1,
                            },
                        },
                    ],
                    as: "otherUser",
                },
            },
            {
                $unwind: "$otherUser",
            },
        ]);

        const chatRooms = rooms.map((room) => ({
            _id: room._id,
            participantIds: [room.senderId, room.receiverId],
            productId: room.productId,
            productTitle: room.product.title,
            productImage: room.product.images?.[0] || "",
            lastMessage: room.lastMessage,
            lastMessageTime: room.lastMessageTime,
            otherUser: room.otherUser,
            unreadCount: 0, // TODO: read 필드 활용
        }));

        return res.json({ ok: true, chatRooms });
    } catch (err: any) {
        console.error("채팅 목록 조회 에러:", err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

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