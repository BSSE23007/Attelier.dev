import express from "express";
import { changeAdminPassword, getAdminSession, loginAdmin, logoutAdmin } from "../controllers/adminAuthController.js";
import { requireAdmin, requireTrustedOrigin } from "../middleware/adminAuth.js";
import { createLoginLimiter, createPasswordChangeLimiter } from "../middleware/rateLimiters.js";

const router = express.Router();
const loginLimiter = createLoginLimiter();
const passwordChangeLimiter = createPasswordChangeLimiter();

router.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

router.post("/login", requireTrustedOrigin, loginLimiter, loginAdmin);
router.get("/session", requireAdmin, getAdminSession);
router.post("/logout", requireTrustedOrigin, requireAdmin, logoutAdmin);
router.post("/password", requireTrustedOrigin, requireAdmin, passwordChangeLimiter, changeAdminPassword);

export default router;
