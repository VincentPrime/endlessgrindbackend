import express from "express";
import { getUserProgress } from "../../Controller/progressController/progressController.js";
import { requireAuth } from "../../middlerware/authMiddleware.js";

const router = express.Router();

// 📊 Get user's progress data
router.get("/user/progress", requireAuth, getUserProgress);

export default router;