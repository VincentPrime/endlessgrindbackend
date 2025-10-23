import express from "express";
import {
  getDashboardStats,
  getRevenueData,
  getRecentApplications,
} from "../../Controller/admindashboard/admindashboardController.js";
import { requireAdmin } from "../../middlerware/authMiddleware.js"

const router = express.Router();

router.get("/stats", requireAdmin, getDashboardStats);
router.get("/revenue", requireAdmin, getRevenueData);
router.get("/recent-applications", requireAdmin, getRecentApplications);

export default router;
