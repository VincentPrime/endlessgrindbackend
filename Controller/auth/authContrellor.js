import pool from '../../db/endlessgrinddb.js';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import { sendOTPEmail } from "../../service/emailService.js"

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Configure multer for memory storage (we'll upload to Supabase)
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  // Accept images only
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

export const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// 🆕 UPDATE PROFILE
export const updateProfile = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const userId = req.session.user.user_id;
    const { firstname, middlename, lastname, address, email, password } = req.body;
    
    // Build dynamic update query
    const updates = [];
    const values = [];

    if (firstname) {
      updates.push('firstname = ?');
      values.push(firstname);
    }
    if (middlename !== undefined) { // Allow empty string to clear middlename
      updates.push('middlename = ?');
      values.push(middlename || null);
    }
    if (lastname) {
      updates.push('lastname = ?');
      values.push(lastname);
    }
    if (address !== undefined) { // Allow empty string
      updates.push('address = ?');
      values.push(address);
    }
    if (email) {
      // Check if email already exists for another user
      const [existingUser] = await pool.query(
        'SELECT user_id FROM users_infos WHERE email = ? AND user_id != ?',
        [email, userId]
      );
      if (existingUser.length > 0) {
        return res.status(400).json({ message: 'Email already in use' });
      }
      updates.push('email = ?');
      values.push(email);
    }
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updates.push('password = ?');
      values.push(hashedPassword);
    }

    // Handle profile image upload to Supabase
    if (req.file) {
      try {
        // Generate unique filename
        const fileExt = req.file.originalname.split('.').pop();
        const fileName = `profile-${userId}-${Date.now()}.${fileExt}`;
        const filePath = `pictures/${fileName}`;

        // Upload to Supabase Storage (bucket: promo, folder: pictures)
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('promo')
          .upload(filePath, req.file.buffer, {
            contentType: req.file.mimetype,
            upsert: false
          });

        if (uploadError) {
          console.error('❌ Supabase upload error:', uploadError);
          return res.status(500).json({ message: 'Failed to upload image' });
        }

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('promo')
          .getPublicUrl(filePath);

        // Delete old image from Supabase if exists
        const [currentUser] = await pool.query(
          'SELECT image FROM users_infos WHERE user_id = ?',
          [userId]
        );
        
        if (currentUser[0]?.image && currentUser[0].image.includes('supabase')) {
          // Extract the file path from the URL
          const oldImageUrl = currentUser[0].image;
          const oldFilePath = oldImageUrl.split('/promo/')[1];
          
          if (oldFilePath) {
            await supabase.storage
              .from('promo')
              .remove([oldFilePath]);
          }
        }

        // Add image URL to update
        updates.push('image = ?');
        values.push(publicUrl);

      } catch (error) {
        console.error('❌ Image upload error:', error);
        return res.status(500).json({ message: 'Failed to process image' });
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    // Add userId to values array
    values.push(userId);

    // Execute update query
    await pool.query(
      `UPDATE users_infos SET ${updates.join(', ')} WHERE user_id = ?`,
      values
    );

    // Fetch updated user data
    const [updatedUser] = await pool.query(
      'SELECT user_id, firstname, middlename, lastname, sex, civil_status, date_of_birth, weight, height, address, email, role, image FROM users_infos WHERE user_id = ?',
      [userId]
    );

    // Update session
    req.session.user = {
      ...req.session.user,
      firstname: updatedUser[0].firstname,
      lastname: updatedUser[0].lastname,
      email: updatedUser[0].email,
      image: updatedUser[0].image
    };

    // Save session and return response
    req.session.save((err) => {
      if (err) {
        console.error('❌ Session save error:', err);
        return res.status(500).json({ message: 'Failed to update session' });
      }

      res.json({
        message: 'Profile updated successfully',
        user: updatedUser[0]
      });
    });

  } catch (error) {
    console.error('❌ Update profile error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// 🧩 UNIFIED LOGIN - Checks both users_infos and coaches tables
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ message: "Email and password required" });

    // ✅ First, check users_infos table (for users and admin)
    const [userRows] = await pool.query(`SELECT * FROM users_infos WHERE email = ?`, [email]);
    
    if (userRows.length > 0) {
      const user = userRows[0];
      const isMatch = await bcrypt.compare(password, user.password);
      
      if (!isMatch)
        return res.status(400).json({ message: "Invalid credentials" });

      // Store user in session
      req.session.user = {
        user_id: user.user_id,
        firstname: user.firstname,
        lastname: user.lastname,
        email: user.email,
        role: user.role,
        image: user.image
      };

      // Save session explicitly
      return req.session.save((err) => {  // ✅ ADD RETURN HERE
        if (err) {
          console.error('❌ Session save error:', err);
          return res.status(500).json({ message: "Failed to create session" });
        }
        
        console.log('✅ Session saved successfully:', req.session.user);
        console.log('✅ Session ID:', req.sessionID);
        
        return res.json({
          message: "Logged in",
          user: req.session.user,
        });
      });
    }

    // ✅ If not found in users_infos, check coaches table
    const [coachRows] = await pool.query(`SELECT * FROM coaches WHERE email = ?`, [email]);
    
    if (coachRows.length > 0) {
      const coach = coachRows[0];
      const isMatch = await bcrypt.compare(password, coach.password);
      
      if (!isMatch)
        return res.status(400).json({ message: "Invalid credentials" });

      // Store coach in session
      req.session.user = {
        user_id: coach.coach_id,
        coach_name: coach.coach_name,
        email: coach.email,
        role: 'coach',
        profile_image: coach.profile_image
      };

      // Save session explicitly - ✅ THIS WAS THE BUG!
      return req.session.save((err) => {  // ✅ MUST HAVE RETURN HERE
        if (err) {
          console.error('❌ Session save error:', err);
          return res.status(500).json({ message: "Failed to create session" });
        }
        
        console.log('✅ Coach session saved successfully:', req.session.user);
        console.log('✅ Session ID:', req.sessionID);
        
        return res.json({
          message: "Logged in",
          user: req.session.user,
        });
      });
    }

    // ✅ If not found in either table
    return res.status(400).json({ message: "Invalid credentials" });

  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ message: "Server error" });
  }
};

// 🧩 SIGNUP (keep existing)
export const signup = async (req, res) => {
  try {
    const { firstname, middlename, lastname, sex, civil_status, date_of_birth, weight, height, address, email, password, role } = req.body;

    if (!firstname || !lastname || !sex || !civil_status || !date_of_birth || !email || !password) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      `INSERT INTO users_infos (firstname, middlename, lastname, sex, civil_status, date_of_birth, weight, height, address, email, password, role)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [firstname, middlename, lastname, sex, civil_status, date_of_birth, weight || null, height || null, address || '', email, hashedPassword, role || 'user']
    );

    res.status(201).json({ message: 'User created', userId: result.insertId });
  } catch (error) {
    console.error(error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'Email already exists' });
    }
    res.status(500).json({ message: 'Server error' });
  }
};

// 🧩 LOGOUT (keep existing)
export const logout = (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ message: 'Could not log out' });
    res.clearCookie('connect.sid');
    res.json({ message: 'Logged out' });
  });
};

// 🧩 GET SESSION (keep existing)
export const getSession = (req, res) => {
  if (req.session.user) {
    res.json({ loggedIn: true, user: req.session.user });
  } else {
    res.json({ loggedIn: false });
  }
};

// 🧩 GET ALL USERS (keep existing)
export const getAllUsers = async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM users_infos WHERE role = ?", ["user"]);
    res.status(200).json(rows);
  } catch (error) {
    res.status(500).json({ message: "Error fetching users", error });
  }
};

// 🧩 DELETE USER (keep existing)
export const deleteUsers = async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await pool.query("DELETE FROM users_infos WHERE user_id = ?", [id]);
    if (result.affectedRows === 0)
      return res.status(404).json({ message: "User not Found" });

    res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting User", error });
  }
};

//new

// 🔐 SEND OTP
export const sendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    // Check if email already exists
    const [existingUser] = await pool.query(
      'SELECT email FROM users_infos WHERE email = ?',
      [email]
    );

    if (existingUser.length > 0) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Set expiration time (2 minutes from now)
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000);

    // Delete any existing OTP for this email
    await pool.query('DELETE FROM otp_verifications WHERE email = ?', [email]);

    // Store OTP in database
    await pool.query(
      'INSERT INTO otp_verifications (email, otp, expires_at) VALUES (?, ?, ?)',
      [email, otp, expiresAt]
    );

    // Send OTP email
    const emailResult = await sendOTPEmail(email, otp);

    if (!emailResult.success) {
      return res.status(500).json({ message: 'Failed to send OTP email' });
    }

    res.json({ 
      message: 'OTP sent successfully',
      expiresIn: 120 // seconds
    });

  } catch (error) {
    console.error('❌ Send OTP error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// 🔐 VERIFY OTP
export const verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }

    // Find OTP record
    const [otpRecords] = await pool.query(
      'SELECT * FROM otp_verifications WHERE email = ? AND otp = ? AND verified = FALSE ORDER BY created_at DESC LIMIT 1',
      [email, otp]
    );

    if (otpRecords.length === 0) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    const otpRecord = otpRecords[0];

    // Check if OTP is expired
    if (new Date() > new Date(otpRecord.expires_at)) {
      return res.status(400).json({ message: 'OTP has expired' });
    }

    // Mark OTP as verified
    await pool.query(
      'UPDATE otp_verifications SET verified = TRUE WHERE id = ?',
      [otpRecord.id]
    );

    res.json({ message: 'OTP verified successfully' });

  } catch (error) {
    console.error('❌ Verify OTP error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// 🔐 SIGNUP WITH OTP VERIFICATION
export const signupWithVerification = async (req, res) => {
  try {
    const { 
      firstname, middlename, lastname, sex, civil_status, 
      date_of_birth, weight, height, address, email, password, role 
    } = req.body;

    if (!firstname || !lastname || !sex || !civil_status || !date_of_birth || !email || !password) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Check if OTP was verified
    const [otpRecords] = await pool.query(
      'SELECT * FROM otp_verifications WHERE email = ? AND verified = TRUE ORDER BY created_at DESC LIMIT 1',
      [email]
    );

    if (otpRecords.length === 0) {
      return res.status(400).json({ message: 'Email not verified. Please verify your email first.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      `INSERT INTO users_infos (firstname, middlename, lastname, sex, civil_status, date_of_birth, weight, height, address, email, password, role)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [firstname, middlename, lastname, sex, civil_status, date_of_birth, weight || null, height || null, address || '', email, hashedPassword, role || 'user']
    );

    // Clean up OTP records for this email
    await pool.query('DELETE FROM otp_verifications WHERE email = ?', [email]);

    res.status(201).json({ message: 'Account created successfully', userId: result.insertId });
  } catch (error) {
    console.error('❌ Signup error:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'Email already exists' });
    }
    res.status(500).json({ message: 'Server error' });
  }
};