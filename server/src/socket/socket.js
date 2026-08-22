import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { pool } from "../config/db.js";

export function attachSocket(httpServer, corsOrigin) {
  const io = new Server(httpServer, {
    cors: { origin: corsOrigin },
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      socket.user = jwt.verify(token, process.env.JWT_SECRET);
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    socket.join(`user:${socket.user.id}`);

    socket.on("message:send", async ({ recipientId, appointmentId, body, fileUrl } = {}) => {
      if (!recipientId || (!body && !fileUrl)) {
        socket.emit("message:error", { error: "recipientId and a body or fileUrl are required" });
        return;
      }

      try {
        const result = await pool.query(
          `INSERT INTO messages (appointment_id, sender_id, recipient_id, body, file_url)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [appointmentId || null, socket.user.id, recipientId, body || null, fileUrl || null]
        );

        const message = result.rows[0];
        io.to(`user:${recipientId}`).to(`user:${socket.user.id}`).emit("message:new", message);
      } catch (err) {
        console.error("message:send failed:", err);
        socket.emit("message:error", { error: "Failed to send message" });
      }
    });

    socket.on("typing", ({ recipientId }) => {
      io.to(`user:${recipientId}`).emit("typing", { from: socket.user.id });
    });
  });

  return io;
}
