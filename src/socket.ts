// backend/src/socket.ts

import { Server as HTTPServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import Chat from "./models/Chat";

export function initializeSocket(httpServer: HTTPServer) {
    const io = new SocketIOServer(httpServer, {
        cors: {
            origin: [
                "http://localhost:5173",
                "https://www.palpalshop.shop",
                "https://palpalshop.shop",
            ],
            credentials: true,
        },
    });

    const userSockets = new Map<string, string>();

    io.on("connection", (socket) => {
        console.log("사용자 연결:", socket.id);

        // 사용자 등록
        socket.on("user_login", (userId: string) => {
            userSockets.set(userId, socket.id);
            console.log(`${userId} 온라인`);
        });

        // 메시지 수신
        socket.on("send_message", async (data: {
            senderId: string;
            receiverId: string;
            productId: string;
            message: string;
        }) => {
            try {
                // DB에 저장
                const chat = await Chat.create({
                    sender: data.senderId,
                    receiver: data.receiverId,
                    product: data.productId,
                    message: data.message,
                });

                await chat.populate("sender", "nickname profileImage");
                await chat.populate("receiver", "nickname profileImage");

                // 수신자에게 전송
                const receiverSocketId = userSockets.get(data.receiverId);
                if (receiverSocketId) {
                    io.to(receiverSocketId).emit("receive_message", {
                        _id: chat._id,
                        sender: chat.sender,
                        receiver: chat.receiver,
                        message: chat.message,
                        createdAt: chat.createdAt,
                    });
                }

                // 송신자에게 확인
                socket.emit("message_sent", {
                    _id: chat._id,
                    message: chat.message,
                    createdAt: chat.createdAt,
                });
            } catch (err) {
                console.error("메시지 저장 실패:", err);
                socket.emit("error", "메시지 전송 실패");
            }
        });

        socket.on("disconnect", () => {
            for (const [userId, id] of userSockets) {
                if (id === socket.id) {
                    userSockets.delete(userId);
                    console.log(`${userId} 오프라인`);
                    break;
                }
            }
        });
    });

    return io;
}