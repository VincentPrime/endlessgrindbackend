import pool from '../../db/endlessgrinddb.js';
import bcrypt from 'bcryptjs';

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