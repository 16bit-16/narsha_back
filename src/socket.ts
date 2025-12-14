import { Server as HTTPServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import Message from "./models/Message";
import { readUserFromReq } from "./utils/authToken";

interface CustomSocket extends Socket {
    userId?: string;
}

export function initializeSocket(httpServer: HTTPServer) {
    const io = new SocketIOServer(httpServer, {
        cors: {
            origin: [
                "http://local.palpalshop.shop:5173",
                "http://localhost:5173",
                "https://palpalshop.shop",
                "https://www.palpalshop.shop",
            ],
            credentials: true,
        },
    });

    // 사용자 연결 추적
    const userSockets = new Map<string, string>(); // userId -> socketId

    io.on("connection", (socket: CustomSocket) => {
        console.log("새 사용자 연결:", socket.id);
    
        socket.on("join", (userId: string) => {
            socket.userId = userId;
            userSockets.set(userId, socket.id);
            console.log(`${userId} (${socket.id}) 입장, 총 ${userSockets.size}명`);
        });
    
        socket.on("send_message", async (data: any) => {
            console.log("send_message 수신:", data);
            try {
                if (!socket.userId) {
                    socket.emit("error", "로그인이 필요합니다");
                    return;
                }
    
                const roomId = [socket.userId, data.receiverId].sort().join("-");
    
                const message = await Message.create({
                    roomId,
                    senderId: socket.userId,
                    receiverId: data.receiverId,
                    productId: data.productId,
                    text: data.text,
                });
    
                console.log("메시지 저장됨:", message._id);
    
                socket.emit("message_sent", {
                    _id: message._id,
                    text: message.text,
                    senderId: socket.userId,
                    receiverId: data.receiverId,
                    createdAt: message.createdAt,
                });
    
                const receiverSocketId = userSockets.get(data.receiverId);
                console.log(`수신자 ${data.receiverId} 소켓ID: ${receiverSocketId}`);
                
                if (receiverSocketId) {
                    io.to(receiverSocketId).emit("receive_message", {
                        _id: message._id,
                        text: message.text,
                        senderId: socket.userId,
                        receiverId: data.receiverId,
                        productId: data.productId,
                        createdAt: message.createdAt,
                    });
                    console.log("메시지 전송 완료");
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