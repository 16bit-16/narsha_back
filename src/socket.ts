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
            ],
            credentials: true,
        },
    });

    // 사용자 연결 추적
    const userSockets = new Map<string, string>(); // userId -> socketId

    io.on("connection", (socket: CustomSocket) => {
        console.log(`사용자 연결: ${socket.id}`);

        // ✅ 사용자 ID와 소켓 ID 매핑
        socket.on("join", (userId: string) => {
            socket.userId = userId;
            userSockets.set(userId, socket.id);
            console.log(`${userId}가 입장했습니다. (${socket.id})`);
        });

        // ✅ 메시지 수신
        socket.on(
            "send_message",
            async (data: {
                receiverId: string;
                productId: string;
                text: string;
            }) => {
                try {
                    if (!socket.userId) {
                        socket.emit("error", "로그인이 필요합니다");
                        return;
                    }

                    const roomId = [socket.userId, data.receiverId]
                        .sort()
                        .join("-");

                    // ✅ 메시지 저장
                    const message = await Message.create({
                        roomId,
                        senderId: socket.userId,
                        receiverId: data.receiverId,
                        productId: data.productId,
                        text: data.text,
                    });

                    // ✅ 송신자에게 전송
                    socket.emit("message_sent", {
                        _id: message._id,
                        text: message.text,
                        senderId: socket.userId,
                        receiverId: data.receiverId,
                        createdAt: message.createdAt,
                    });

                    // ✅ 수신자에게 전송 (온라인이면)
                    const receiverSocketId = userSockets.get(data.receiverId);
                    if (receiverSocketId) {
                        io.to(receiverSocketId).emit("receive_message", {
                            _id: message._id,
                            text: message.text,
                            senderId: socket.userId,
                            receiverId: data.receiverId,
                            createdAt: message.createdAt,
                        });
                    }

                    console.log(
                        `메시지: ${socket.userId} → ${data.receiverId}: ${data.text}`
                    );
                } catch (err) {
                    console.error("메시지 저장 실패:", err);
                    socket.emit("error", "메시지 전송 실패");
                }
            }
        );

        // ✅ 연결 해제
        socket.on("disconnect", () => {
            if (socket.userId) {
                userSockets.delete(socket.userId);
                console.log(`${socket.userId}가 퇴장했습니다.`);
            }
        });
    });

    return io;
}