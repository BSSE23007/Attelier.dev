import express from "express";
import cors from "cors";
import helmet from "helmet";
import inquiryRoutes from "./routes/inquiryRoutes.js";
import projectRoutes from "./routes/projectRoutes.js";
import adminAuthRoutes from "./routes/adminAuthRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import { createApiLimiter } from "./middleware/rateLimiters.js";
import { apiErrorHandler, notFoundHandler } from "./middleware/errorHandling.js";

const app = express();
const clientOrigin = process.env.CLIENT_ORIGIN || "http://localhost:5173";

if (process.env.NODE_ENV === "production" && !process.env.CLIENT_ORIGIN) {
  throw new Error("CLIENT_ORIGIN must be configured in production.");
}

app.disable("x-powered-by");
// Keep client IPs tied to the TCP peer until a documented trusted proxy chain exists.
app.set("trust proxy", false);

// 1. Core Security & Parsing Middlewares (Sab se pehle)
app.use(helmet());
app.use(
  cors({
    origin: clientOrigin,
    credentials: true,
  })
);
app.use(express.json({ limit: "10kb" }));

// 2. Global Rate Limiter for API Routes
app.use("/api", createApiLimiter());

// 3. Health Check Route
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Attelier.dev API is running",
  });
});

// 4. Feature Routes
app.use("/api/inquiries", inquiryRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/admin/auth", adminAuthRoutes);
app.use("/api/admin", adminRoutes);

app.use(notFoundHandler);
app.use(apiErrorHandler);

export default app;
