import express from "express";
import { listPublicProjects } from "../controllers/projectController.js";

const router = express.Router();

router.get("/", listPublicProjects);

export default router;
