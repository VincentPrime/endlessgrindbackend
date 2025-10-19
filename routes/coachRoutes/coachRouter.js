import express from 'express';
import { coachSignup, coachLogin, getAllCoaches, deleteCoach } from '../../Controller/coachesController/authcoaches.js';
import { requireAdmin } from '../../middlerware/authMiddleware.js'; // optional

const router = express.Router();

// Signup
router.post('/coaches/signup', coachSignup);

// Login
router.post('/coaches/login', coachLogin);

// Admin-only routes
router.get('/coaches/all', requireAdmin, getAllCoaches);
router.delete('/coaches/delete/:id', requireAdmin, deleteCoach);

export default router;
