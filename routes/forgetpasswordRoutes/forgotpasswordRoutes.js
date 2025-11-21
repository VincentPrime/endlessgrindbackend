// forgotPasswordRoutes.js
import express from 'express';
import {
  checkEmailExists,
  sendResetOTP,
  verifyResetOTP,
  resetPassword
} from '../../Controller/ForgetController/forgetpasswordController.js';

const router = express.Router();

// Step 1: Check if email exists
router.post('/check-email', checkEmailExists);

// Step 2: Send OTP to email
router.post('/send-otp', sendResetOTP);

// Step 3: Verify OTP
router.post('/verify-otp', verifyResetOTP);

// Step 4: Reset password
router.post('/reset-password', resetPassword);

export default router;
