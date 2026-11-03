import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import inquiryRoutes from "./routes/inquiryRoutes.js";
import adminAuthRoutes from "./routes/adminAuthRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";

const app = express();
const clientOrigin = process.env.CLIENT_ORIGIN || "http://localhost:5173";

if (process.env.NODE_ENV === "production" && !process.env.CLIENT_ORIGIN) {
  throw new Error("CLIENT_ORIGIN must be configured in production.");
}

app.disable("x-powered-by");

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
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

app.use("/api", apiLimiter);

// 3. Health Check Route
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Attelier.dev API is running",
  });
});

// 4. Feature Routes
app.use("/api/inquiries", inquiryRoutes);
app.use("/api/admin/auth", adminAuthRoutes);
app.use("/api/admin", adminRoutes);

export default app;
