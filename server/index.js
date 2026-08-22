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

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

const httpServer = createServer(app);
attachSocket(httpServer, clientOrigin);

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
