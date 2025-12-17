import { Server as HTTPServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import Chat from "./models/Chat";

// CustomSocket 타입 정의
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

    io.on("connection", (socket: CustomSocket) => {  // CustomSocket 사용

        socket.on("user_login", (userId: string) => {
            socket.userId = userId;
            userSockets.set(userId, socket.id);
        });

        socket.on("send_message", async (data: any) => {
            try {
                if (!socket.userId) {
                    socket.emit("error", "로그인이 필요합니다");
                    return;
                }
        
                const roomId = [socket.userId, data.receiverId].sort().join("-");
        
                // message 또는 image 둘 중 하나는 필수
                if (!data.message?.trim() && !data.image) {
                    socket.emit("error", "메시지 또는 이미지를 입력하세요");
                    return;
                }
        
                const message = await Chat.create({
                    sender: socket.userId,
                    receiver: data.receiverId,
                    product: data.productId,
                    message: data.message || "",
                    image: data.image || null,  // 이미지 URL 저장
                });
        
                await message.populate("sender", "nickname profileImage");
                await message.populate("receiver", "nickname profileImage");
        
                socket.emit("message_sent", {
                    _id: message._id,
                    sender: message.sender,
                    receiver: message.receiver,
                    message: message.message,
                    image: message.image,
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
                        image: message.image,  // 이미지 포함
                        product: data.productId,
                        createdAt: message.createdAt,
                    });
                }
        
            } catch (err) {
                console.error("메시지 저장 실패:", err);
                socket.emit("error", "메시지 전송 실패");
            }
        });

        socket.on("disconnect", () => {
            if (socket.userId) {
                userSockets.delete(socket.userId);
            }
        });
    });

    return io;
}