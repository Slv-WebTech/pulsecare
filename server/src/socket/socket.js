import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { pool } from "../config/db.js";
import { haveCareRelationship } from "../utils/access.js";
import { isAllowedFileUrl } from "../utils/validation.js";

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

    // Access tokens are short-lived: drop the connection when this one expires so the client
    // reconnects with a freshly refreshed token (a revoked session can't stay connected forever).
    const msLeft = socket.user.exp * 1000 - Date.now();
    const expiry = setTimeout(() => socket.disconnect(true), Math.max(msLeft, 0));
    socket.on("disconnect", () => clearTimeout(expiry));

    socket.on("message:send", async ({ recipientId, appointmentId, body, fileUrl } = {}) => {
      if (!recipientId || (!body && !fileUrl)) {
        socket.emit("message:error", { error: "recipientId and a body or fileUrl are required" });
        return;
      }

      if (!Number.isInteger(recipientId) || recipientId === socket.user.id) {
        socket.emit("message:error", { error: "Invalid recipient" });
        return;
      }
      if (typeof body === "string" && body.length > 5000) {
        socket.emit("message:error", { error: "Message too long" });
        return;
      }
      if (fileUrl && !isAllowedFileUrl(fileUrl)) {
        socket.emit("message:error", { error: "Invalid file URL" });
        return;
      }

      try {
        if (!(await haveCareRelationship(socket.user.id, recipientId))) {
          socket.emit("message:error", { error: "No care relationship with this user" });
          return;
        }
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

    socket.on("typing", async ({ recipientId } = {}) => {
      if (!Number.isInteger(recipientId)) return;
      try {
        if (!(await haveCareRelationship(socket.user.id, recipientId))) return;
      } catch {
        return;
      }
      io.to(`user:${recipientId}`).emit("typing", { from: socket.user.id });
    });
  });

  return io;
}
