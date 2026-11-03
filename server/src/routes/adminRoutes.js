import express from "express";
import { getAdminOverview } from "../controllers/adminOverviewController.js";
import {
  addAdminInquiryNote,
  getAdminInquiry,
  listAdminInquiries,
  updateAdminInquiryStatus,
} from "../controllers/adminInquiryController.js";
import { requireAdmin, requireTrustedOrigin } from "../middleware/adminAuth.js";

const router = express.Router();
router.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
router.use(requireAdmin);

router.get("/overview", getAdminOverview);
router.get("/inquiries", listAdminInquiries);
router.get("/inquiries/:id", getAdminInquiry);
router.patch("/inquiries/:id/status", requireTrustedOrigin, updateAdminInquiryStatus);
router.post("/inquiries/:id/notes", requireTrustedOrigin, addAdminInquiryNote);

export default router;
