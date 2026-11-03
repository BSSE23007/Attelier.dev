import express from "express";
import rateLimit from "express-rate-limit";
import { changeAdminPassword, getAdminSession, loginAdmin, logoutAdmin } from "../controllers/adminAuthController.js";
import { requireAdmin, requireTrustedOrigin } from "../middleware/adminAuth.js";

const router = express.Router();
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { success: false, message: "Too many login attempts. Please wait and try again." },
});
const passwordChangeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { success: false, message: "Too many password change attempts. Please wait and try again." },
});

router.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

router.post("/login", requireTrustedOrigin, loginLimiter, loginAdmin);
router.get("/session", requireAdmin, getAdminSession);
router.post("/logout", requireTrustedOrigin, requireAdmin, logoutAdmin);
router.post("/password", requireTrustedOrigin, requireAdmin, passwordChangeLimiter, changeAdminPassword);

export default router;
