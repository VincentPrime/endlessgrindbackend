import express from 'express';
import { 
  signup, 
  login, 
  logout, 
  getAllUsers, 
  deleteUsers, 
  getSession,
  updateProfile,
  upload,
  sendOTP, 
  verifyOTP, 
  signupWithVerification
 } from '../../Controller/auth/authContrellor.js';

const router = express.Router();

router.post('/signup', signup);
router.post('/login', login);
router.post('/logout', logout);
router.get('/allUsers', getAllUsers);
router.delete("/delete/:id", deleteUsers); 
router.get("/session", getSession);
//new
router.post('/send-otp', sendOTP);
router.post('/verify-otp', verifyOTP);
router.post('/signup-verified', signupWithVerification);

router.put('/update-profile', upload.single('profileImage'), updateProfile);

export default router;

