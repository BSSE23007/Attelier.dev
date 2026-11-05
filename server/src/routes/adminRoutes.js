import express from "express";
import { getAdminOverview } from "../controllers/adminOverviewController.js";
import {
  addAdminInquiryNote,
  getAdminInquiry,
  listAdminInquiries,
  markAdminInquiryResponded,
  updateAdminInquiryPriority,
  updateAdminInquiryFollowUp,
  updateAdminInquiryStatus,
} from "../controllers/adminInquiryController.js";
import { requireAdmin, requireTrustedOrigin } from "../middleware/adminAuth.js";
import {
  createAdminProject,
  createProjectImageUploadSignature,
  getAdminProject,
  listAdminProjects,
  reorderAdminProjects,
  setAdminProjectFeatured,
  setAdminProjectPublished,
  updateAdminProject,
} from "../controllers/projectController.js";

const router = express.Router();
router.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
router.use(requireAdmin);

router.get("/overview", getAdminOverview);
router.get("/projects", listAdminProjects);
router.post("/projects/upload-signature", requireTrustedOrigin, createProjectImageUploadSignature);
router.post("/projects", requireTrustedOrigin, createAdminProject);
router.patch("/projects/reorder", requireTrustedOrigin, reorderAdminProjects);
router.get("/projects/:id", getAdminProject);
router.patch("/projects/:id", requireTrustedOrigin, updateAdminProject);
router.patch("/projects/:id/publish", requireTrustedOrigin, setAdminProjectPublished);
router.patch("/projects/:id/featured", requireTrustedOrigin, setAdminProjectFeatured);
router.get("/inquiries", listAdminInquiries);
router.get("/inquiries/:id", getAdminInquiry);
router.patch("/inquiries/:id/status", requireTrustedOrigin, updateAdminInquiryStatus);
router.patch("/inquiries/:id/priority", requireTrustedOrigin, updateAdminInquiryPriority);
router.post("/inquiries/:id/first-response", requireTrustedOrigin, markAdminInquiryResponded);
router.patch("/inquiries/:id/follow-up", requireTrustedOrigin, updateAdminInquiryFollowUp);
router.post("/inquiries/:id/notes", requireTrustedOrigin, addAdminInquiryNote);

export default router;
