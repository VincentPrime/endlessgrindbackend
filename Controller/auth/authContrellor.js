import pool from '../../db/endlessgrinddb.js';
import bcrypt from 'bcryptjs';

// 🧩 SIGNUP
export const signup = async (req, res) => {
  try {
    const { firstname, middlename, lastname, sex, civil_status, date_of_birth, weight, height, address, email, password, role } = req.body;

    if (!firstname || !lastname || !sex || !civil_status || !date_of_birth || !email || !password) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Hash password
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

// 🧩 LOGIN
// 🧩 LOGIN
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ message: "Email and password required" });

    const [rows] = await pool.query(`SELECT * FROM users_infos WHERE email = ?`, [email]);

    if (rows.length === 0)
      return res.status(400).json({ message: "Invalid credentials" });

    const user = rows[0];

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Invalid credentials" });

    // ✅ Store FULL user in session
    req.session.user = {
      id: user.user_id,
      firstname: user.firstname,
      lastname: user.lastname,
      email: user.email,
      role: user.role,
      image: user.image // if exists
    };

    res.json({
      message: "Logged in",
      user: req.session.user, // same as session
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};


// 🧩 LOGOUT
export const logout = (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ message: 'Could not log out' });
    res.clearCookie('connect.sid'); // clear session cookie
    res.json({ message: 'Logged out' });
  });
};

// 🧩 GET ALL USERS (admin only)

export const getAllUsers = async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM users_infos WHERE role = ?", ["user"]);
    res.status(200).json(rows);
  } catch (error) {
    res.status(500).json({ message: "Error fetching coaches", error });
  }
};

// ✅ Delete a coach by ID
export const deleteUsers = async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await pool.query("DELETE FROM users_infos WHERE id = ?", [id]);
    if (result.affectedRows === 0)
      return res.status(404).json({ message: "User not Found" });

    res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting User", error });
  }
};

export const getSession = (req, res) => {
  if (req.session.user) {
    res.json({ loggedIn: true, user: req.session.user });
  } else {
    res.json({ loggedIn: false });
  }
};