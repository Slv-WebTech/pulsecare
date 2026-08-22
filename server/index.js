import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createServer } from "http";

import authRoutes from "./src/routes/auth.routes.js";
import doctorRoutes from "./src/routes/doctor.routes.js";
import appointmentRoutes from "./src/routes/appointment.routes.js";
import documentRoutes from "./src/routes/document.routes.js";
import chatRoutes from "./src/routes/chat.routes.js";
import adminRoutes from "./src/routes/admin.routes.js";
import { attachSocket } from "./src/socket/socket.js";

dotenv.config();

if (!process.env.JWT_SECRET || process.env.JWT_SECRET === "change-me") {
  console.error(
    "Fatal: JWT_SECRET is unset or still the placeholder value. Set a strong secret in server/.env before starting the server."
  );
  process.exit(1);
}

const app = express();
const clientOrigin = process.env.CLIENT_ORIGIN || "http://localhost:5173";

app.use(cors({ origin: clientOrigin }));
app.use(express.json());

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRoutes);
app.use("/api/doctors", doctorRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/admin", adminRoutes);

app.use((err, req, res, _next) => {
  console.error(err);

  // Multer's own validation errors (bad MIME type, oversized file) don't carry
  // a `.status` by default and would otherwise surface as a raw 500.
  if (err.name === "MulterError" && !err.status) {
    err.status = 400;
  }

  // Only a deliberately-flagged error (one a controller/middleware explicitly
  // marked with `.status`) has its message returned to the client. Anything
  // else — an unexpected DB error, a bug — is logged above but never echoed
  // back verbatim, since that can leak internal details (e.g. Postgres
  // constraint text).
  const status = err.status || 500;
  const message = err.status ? err.message : "Internal server error";
  res.status(status).json({ error: message });
});

const httpServer = createServer(app);
attachSocket(httpServer, clientOrigin);

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
