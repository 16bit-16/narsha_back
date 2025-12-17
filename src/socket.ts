import { Server as HTTPServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import Chat from "./models/Chat";

// ✅ CustomSocket 타입 정의
interface CustomSocket extends Socket {
    userId?: string;
}

export function initializeSocket(httpServer: HTTPServer) {
    const io = new SocketIOServer(httpServer, {
        cors: {
            origin: [
                "http://localhost:5173",
                "http://local.palpalshop.shop:5173",
                "https://www.palpalshop.shop",
                "https://palpalshop.shop",
            ],
            credentials: true,
        },
    });

    const userSockets = new Map<string, string>();

    io.on("connection", (socket: CustomSocket) => {  // ✅ CustomSocket 사용
        console.log("새 사용자 연결:", socket.id);

        socket.on("user_login", (userId: string) => {
            socket.userId = userId;
            userSockets.set(userId, socket.id);
            console.log(`${userId} (${socket.id}) 입장, 총 ${userSockets.size}명`);
        });

        socket.on("send_message", async (data: any) => {
            try {
                if (!socket.userId) {
                    socket.emit("error", "로그인이 필요합니다");
                    return;
                }

                const roomId = [socket.userId, data.receiverId].sort().join("-");

                const message = await Chat.create({
                    sender: socket.userId,
                    receiver: data.receiverId,
                    product: data.productId,
                    message: data.message,
                });

                await message.populate("sender", "nickname profileImage");
                await message.populate("receiver", "nickname profileImage");

                console.log("메시지 저장됨:", message._id);

                socket.emit("message_sent", {
                    _id: message._id,
                    sender: message.sender,
                    receiver: message.receiver,
                    message: message.message,
                    product: data.productId,
                    createdAt: message.createdAt,
                });

                const receiverSocketId = userSockets.get(data.receiverId);
                if (receiverSocketId) {
                    io.to(receiverSocketId).emit("receive_message", {
                        _id: message._id,
                        sender: message.sender,
                        receiver: message.receiver,
                        message: message.message,
                        product: data.productId,
                        createdAt: message.createdAt,
                    });
                    console.log("receive_message 전송 완료");
                }

            } catch (err) {
                console.error("메시지 저장 실패:", err);
                socket.emit("error", "메시지 전송 실패");
            }
        });

        socket.on("disconnect", () => {
            if (socket.userId) {
                userSockets.delete(socket.userId);
                console.log(`${socket.userId} 퇴장, 남은 사용자: ${userSockets.size}명`);
            }
        });
    });

    return io;
}