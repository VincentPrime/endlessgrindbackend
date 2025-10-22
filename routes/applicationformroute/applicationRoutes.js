import express from "express";
import {
  submitApplication,
  cancelApplication,
  cancelApplicationAdmin,
  paymongoWebhook,
  getAllApplications,
  approveApplication,
  declineApplication,
  getUserApplication
} from "../../Controller/applicationform/applicationController.js";
import { requireAuth, requireAdmin } from "../../middlerware/authMiddleware.js";

const router = express.Router();

// 📝 User submits application (creates payment link)
router.post("/applications/submit", requireAuth, submitApplication);

router.delete('/applications/cancel/:application_id', cancelApplication);

// 👤 Get current user's application status
router.get("/applications/my-application", requireAuth, getUserApplication);

// 🔔 PayMongo webhook (NO auth middleware - webhooks come from PayMongo)
router.post("/webhook/paymongo", paymongoWebhook);

// 📋 Admin: Get all applications
router.get("/applications/all", requireAdmin, getAllApplications);

// ✅ Admin: Approve application
router.put("/applications/:application_id/approve", requireAdmin, approveApplication);

// ❌ Admin: Decline application (with refund)
router.put("/applications/:application_id/decline", requireAdmin, declineApplication);

router.delete("/applications/:application_id/cancel", requireAdmin, cancelApplicationAdmin);

export default router;