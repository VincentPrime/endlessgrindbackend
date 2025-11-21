// forgotPasswordController.js
import pool from '../../db/endlessgrinddb.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { sendPasswordResetOTPEmail } from '../../service/emailService.js';

// 🔐 CHECK EMAIL EXISTS (Step 1)
export const checkEmailExists = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    // Check users_infos table
    const [userRows] = await pool.query(
      'SELECT user_id, email FROM users_infos WHERE email = ?',
      [email]
    );

    if (userRows.length > 0) {
      return res.json({ 
        exists: true, 
        userType: 'user',
        message: 'Email found' 
      });
    }

    // Check coaches table
    const [coachRows] = await pool.query(
      'SELECT coach_id, email FROM coaches WHERE email = ?',
      [email]
    );

    if (coachRows.length > 0) {
      return res.json({ 
        exists: true, 
        userType: 'coach',
        message: 'Email found' 
      });
    }

    // Email not found in either table
    return res.status(404).json({ 
      exists: false, 
      message: 'No account found with this email address' 
    });

  } catch (error) {
    console.error('❌ Check email error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// 🔐 SEND PASSWORD RESET OTP (Step 2)
export const sendResetOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    // Verify email exists first
    const [userRows] = await pool.query(
      'SELECT user_id FROM users_infos WHERE email = ?',
      [email]
    );
    const [coachRows] = await pool.query(
      'SELECT coach_id FROM coaches WHERE email = ?',
      [email]
    );

    if (userRows.length === 0 && coachRows.length === 0) {
      return res.status(404).json({ message: 'Email not found' });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Set expiration time (5 minutes for password reset)
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    // Delete any existing password reset OTP for this email
    await pool.query(
      'DELETE FROM password_reset_otps WHERE email = ?', 
      [email]
    );

    // Store OTP in database
    await pool.query(
      'INSERT INTO password_reset_otps (email, otp, expires_at) VALUES (?, ?, ?)',
      [email, otp, expiresAt]
    );

    // Send OTP email using the email service
    const emailResult = await sendPasswordResetOTPEmail(email, otp);

    if (!emailResult.success) {
      return res.status(500).json({ message: 'Failed to send OTP email' });
    }

    res.json({ 
      message: 'OTP sent successfully to your email',
      expiresIn: 300 // 5 minutes in seconds
    });

  } catch (error) {
    console.error('❌ Send password reset OTP error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// 🔐 VERIFY PASSWORD RESET OTP (Step 3)
export const verifyResetOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }

    // Find OTP record
    const [otpRecords] = await pool.query(
      'SELECT * FROM password_reset_otps WHERE email = ? AND otp = ? AND used = FALSE ORDER BY created_at DESC LIMIT 1',
      [email, otp]
    );

    if (otpRecords.length === 0) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    const otpRecord = otpRecords[0];

    // Check if OTP is expired
    if (new Date() > new Date(otpRecord.expires_at)) {
      return res.status(400).json({ message: 'OTP has expired. Please request a new one.' });
    }

    // Generate a reset token for the password reset step
    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Update OTP record with reset token
    await pool.query(
      'UPDATE password_reset_otps SET verified = TRUE, reset_token = ?, token_expires_at = ? WHERE id = ?',
      [resetToken, tokenExpiry, otpRecord.id]
    );

    res.json({ 
      message: 'OTP verified successfully',
      resetToken: resetToken // Frontend will use this to authorize password reset
    });

  } catch (error) {
    console.error('❌ Verify password reset OTP error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// 🔐 RESET PASSWORD (Step 4)
export const resetPassword = async (req, res) => {
  try {
    const { email, resetToken, newPassword } = req.body;

    if (!email || !resetToken || !newPassword) {
      return res.status(400).json({ message: 'Email, reset token, and new password are required' });
    }

    // Validate password strength
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    // Verify reset token
    const [tokenRecords] = await pool.query(
      'SELECT * FROM password_reset_otps WHERE email = ? AND reset_token = ? AND verified = TRUE AND used = FALSE',
      [email, resetToken]
    );

    if (tokenRecords.length === 0) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    const tokenRecord = tokenRecords[0];

    // Check if token is expired
    if (new Date() > new Date(tokenRecord.token_expires_at)) {
      return res.status(400).json({ message: 'Reset token has expired. Please start over.' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password in users_infos
    const [userUpdate] = await pool.query(
      'UPDATE users_infos SET password = ?, failed_login_attempts = 0, locked_until = NULL WHERE email = ?',
      [hashedPassword, email]
    );

    // If not found in users_infos, try coaches
    if (userUpdate.affectedRows === 0) {
      const [coachUpdate] = await pool.query(
        'UPDATE coaches SET password = ?, failed_login_attempts = 0, locked_until = NULL WHERE email = ?',
        [hashedPassword, email]
      );

      if (coachUpdate.affectedRows === 0) {
        return res.status(404).json({ message: 'Account not found' });
      }
    }

    // Mark OTP as used
    await pool.query(
      'UPDATE password_reset_otps SET used = TRUE WHERE id = ?',
      [tokenRecord.id]
    );

    // Clean up old OTP records for this email
    await pool.query(
      'DELETE FROM password_reset_otps WHERE email = ? AND id != ?',
      [email, tokenRecord.id]
    );

    res.json({ message: 'Password reset successfully. You can now login with your new password.' });

  } catch (error) {
    console.error('❌ Reset password error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};