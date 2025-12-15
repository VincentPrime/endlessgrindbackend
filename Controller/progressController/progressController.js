import pool from "../../db/endlessgrinddb.js";

// 📊 GET USER'S PROGRESS DATA
export const getUserProgress = async (req, res) => {
  try {
    const user_id = req.session.user?.user_id;

    if (!user_id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - User login required"
      });
    }

    // Get user's initial weight and height from users_infos
    const [userInfo] = await pool.query(
      `SELECT 
        weight as initial_weight, 
        height, 
        created_at as signup_date
       FROM users_infos 
       WHERE user_id = ?`,
      [user_id]
    );

    if (userInfo.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const user = userInfo[0];

    // If user doesn't have initial weight/height, return empty progress
    if (!user.initial_weight || !user.height) {
      return res.status(200).json({
        success: true,
        hasData: false,
        message: "No weight/height data available. Please update your profile.",
        initial: null,
        sessions: []
      });
    }

    // Calculate initial BMI
    const heightInMeters = user.height / 100;
    const initialBMI = (user.initial_weight / (heightInMeters * heightInMeters)).toFixed(1);

    // Get user's current approved application (non-archived)
    const [applications] = await pool.query(
      `SELECT application_id 
       FROM applications 
       WHERE user_id = ? 
         AND application_status = 'approved' 
         AND is_archived = 0
       ORDER BY submitted_at DESC 
       LIMIT 1`,
      [user_id]
    );

    let sessions = [];

    // If user has an active application, get all training sessions
    if (applications.length > 0) {
      const application_id = applications[0].application_id;

      const [sessionData] = await pool.query(
        `SELECT 
          session_date as date,
          user_weight as weight,
          notes
         FROM training_sessions 
         WHERE application_id = ?
         ORDER BY session_date ASC`,
        [application_id]
      );

      sessions = sessionData;
    }

    res.status(200).json({
      success: true,
      hasData: true,
      initial: {
        weight: user.initial_weight,
        height: user.height,
        bmi: parseFloat(initialBMI),
        date: user.signup_date
      },
      sessions: sessions
    });

  } catch (error) {
    console.error("Error fetching user progress:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch progress data",
      error: error.message
    });
  }
};