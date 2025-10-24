import express from 'express';
import { coachSignup, getAllCoaches, deleteCoach,updateCoachProfile } from '../../Controller/coachesController/authcoaches.js';
import { requireAdmin } from '../../middlerware/authMiddleware.js'; // optional

const router = express.Router();

// Signup
router.post('/coaches/signup', coachSignup);


// Admin-only routes
router.get('/coaches/all', getAllCoaches);
router.delete('/coaches/delete/:id', requireAdmin, deleteCoach);

router.put('/coaches/update/:id', updateCoachProfile);
export default router;
