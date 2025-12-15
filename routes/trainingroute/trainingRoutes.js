import express from "express";
import {
  logTrainingSession,
  completeTrainingProgram,
  getCoachClients,
  getUserSchedule,
  getAllSchedules,
  getSessionHistory,
   getCoachSessions,   
  updateTrainingSession 
} from "../../Controller/training/trainingController.js";
import { requireAuth, requireCoach, requireAdmin } from "../../middlerware/authMiddleware.js";

const router = express.Router();

// 🏋️ Coach logs a training session
router.post("/training/log-session/:application_id", requireCoach, logTrainingSession);

// ✅ Coach completes training program
router.put("/training/complete/:application_id", requireCoach, completeTrainingProgram);

// 📋 Coach gets their clients
router.get("/coach/my-clients", requireCoach, getCoachClients);

// 📋 User gets their schedule
router.get("/user/my-schedule", requireAuth, getUserSchedule);

// 📊 Admin gets all schedules
router.get("/admin/all-schedules", requireAdmin, getAllSchedules);

// 📊 Get session history for an application
router.get("/training/sessions/:application_id", requireAuth, getSessionHistory);

router.get("/coach/my-sessions", requireCoach, getCoachSessions);

router.put("/training/update-session/:session_id", requireCoach, updateTrainingSession);

export default router;