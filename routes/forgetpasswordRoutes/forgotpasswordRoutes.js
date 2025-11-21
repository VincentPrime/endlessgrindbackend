// forgotPasswordRoutes.js
import express from 'express';
import {
  checkEmailExists,
  sendPasswordResetOTP,
  verifyPasswordResetOTP,
  resetPassword
} from '../../Controller/ForgetController/forgetpasswordController.js';

const router = express.Router();

// Step 1: Check if email exists
router.post('/check-email', checkEmailExists);

// Step 2: Send OTP to email
router.post('/send-otp', sendPasswordResetOTP);

// Step 3: Verify OTP
router.post('/verify-otp', verifyPasswordResetOTP);

// Step 4: Reset password
router.post('/reset-password', resetPassword);

export default router;

// In your main server.js or app.js, add:
// import forgotPasswordRoutes from './routes/forgotPasswordRoutes.js';
// app.use('/api/auth/forgot-password', forgotPasswordRoutes);