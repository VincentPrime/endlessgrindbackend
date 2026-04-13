import express from "express";
import {
  submitApplication,
  cancelApplication,
  cancelApplicationAdmin,
  paymongoWebhook,
  getAllApplications,
  approveApplication,
  declineApplication,
  getUserApplication,
  archiveApplication,
  getArchivedApplications,
  deleteArchivedApplication,
  deleteAllArchivedApplications,
} from "../../Controller/applicationform/applicationController.js";
import { requireAuth, requireAdmin } from "../../middlerware/authMiddleware.js";

const router = express.Router();

// 📝 User submits application (creates payment link)
router.post("/applications/submit", requireAuth, submitApplication);

// ❌ User cancels their own application
router.delete('/applications/cancel/:application_id', requireAuth, cancelApplication);

// 👤 Get current user's application status
router.get("/applications/my-application", requireAuth, getUserApplication);

// 🔔 PayMongo webhook (NO auth middleware - webhooks come from PayMongo)
router.post("/webhook/paymongo", paymongoWebhook);

// 📋 Admin: Get all active (non-archived) applications
router.get("/applications/all", requireAdmin, getAllApplications);

// ✅ Admin: Approve application
router.put("/applications/:application_id/approve", requireAdmin, approveApplication);

// ❌ Admin: Decline application (with refund)
router.put("/applications/:application_id/decline", requireAdmin, declineApplication);

// 🗑️ Admin: Cancel/Delete application (DEPRECATED - use archive instead)
router.delete("/applications/:application_id/cancel", requireAdmin, cancelApplicationAdmin);

// 📦 Admin: Archive application (soft delete)
router.put("/applications/:application_id/archive", requireAdmin, archiveApplication);

// 📋 Admin: Get all archived applications
router.get("/applications/archived/all", requireAdmin, getArchivedApplications);

// 🗑️ Admin: Permanently delete single archived application
router.delete("/applications/archived/:application_id", requireAdmin, deleteArchivedApplication);

// 🗑️ Admin: Permanently delete ALL archived applications
router.delete("/applications/archived/delete-all", requireAdmin, deleteAllArchivedApplications);


// 🔍 TEMP: Check available payment methods
router.get("/check-payment-methods", async (req, res) => {
  try {
    const response = await axios.get(
      'https://api.paymongo.com/v1/payment_methods/available',
      {
        headers: {
          Authorization: `Basic ${Buffer.from(process.env.PAYMONGO_SECRET_KEY + ":").toString("base64")}`
        }
      }
    );
    res.json(response.data);
  } catch (error) {
    res.json({ error: error.response?.data || error.message });
  }
});

export default router;