import pool from '../../db/endlessgrinddb.js';
import bcrypt from 'bcryptjs';

// 🟢 COACH SIGNUP
export const coachSignup = async (req, res) => {
  try {
    const {
      coach_name,
      email,
      password,
      bio,
      profile_image,
      specialty,
      certifications,
      years_of_experience,
      availability
    } = req.body;

    if ( !coach_name || !email || !password) {
      return res.status(400).json({ message: 'user_id, coach_name, email, and password are required' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      `INSERT INTO coaches 
        ( coach_name, email, password, role, bio, profile_image, specialty, certifications, years_of_experience, availability)
       VALUES ( ?, ?, ?, 'coach', ?, ?, ?, ?, ?, ?)`,
      [
        coach_name,
        email,
        hashedPassword,
        bio || null,
        profile_image || null,
        specialty || null,
        certifications || null,
        years_of_experience || 0,
        availability ? JSON.stringify(availability) : null
      ]
    );

    res.status(201).json({ message: 'Coach account created', coachId: result.insertId });
  } catch (error) {
    console.error(error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'Email or user_id already exists' });
    }
    res.status(500).json({ message: 'Server error', error });
  }
};

// 🟢 COACH LOGIN
export const coachLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' });

    const [rows] = await pool.query('SELECT * FROM coaches WHERE email = ?', [email]);
    if (rows.length === 0) return res.status(400).json({ message: 'Invalid credentials' });

    const coach = rows[0];
    const isMatch = await bcrypt.compare(password, coach.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

    // Save session
    req.session.user = { id: coach.coach_id, email: coach.email, role: 'coach' };

    res.json({ message: 'Logged in', user: { id: coach.coach_id, coach_name: coach.coach_name, role: 'coach' } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error });
  }
};

// 🟢 GET ALL COACHES
export const getAllCoaches = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM coaches');
    res.status(200).json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error });
  }
};

// 🟢 DELETE COACH
export const deleteCoach = async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await pool.query('DELETE FROM coaches WHERE coach_id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Coach not found' });
    res.status(200).json({ message: 'Coach deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error });
  }
};
