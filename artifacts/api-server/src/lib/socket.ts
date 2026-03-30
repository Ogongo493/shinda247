import { Server as SocketIOServer } from "socket.io";
import type { Server as HttpServer } from "http";
import { logger } from "./logger";

let io: SocketIOServer | null = null;

export function initSocketIO(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: { origin: "*" },
    path: "/socket.io",
  });

  io.on("connection", (socket) => {
    logger.info({ id: socket.id }, "Socket client connected");
    socket.on("disconnect", () => {
      logger.info({ id: socket.id }, "Socket client disconnected");
    });
  });

  logger.info("Socket.io initialized");
  return io;
}

export function broadcastToClients(event: string, data: unknown): void {
  io?.emit(event, data);
}
