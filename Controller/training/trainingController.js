import pool from "../../db/endlessgrinddb.js";

// 🏋️ LOG TRAINING SESSION (Coach logs attendance + updates weight)
export const logTrainingSession = async (req, res) => {
  try {
    const { application_id } = req.params;
    const { user_weight, notes } = req.body;
    const coach_id = req.session.user?.user_id;

    if (!coach_id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - Coach login required"
      });
    }

    // Verify this application belongs to this coach
    const [applications] = await pool.query(
      `SELECT a.*, a.user_id 
       FROM applications a 
       WHERE a.application_id = ? AND a.coach_id = ? AND a.application_status = 'approved'`,
      [application_id, coach_id]
    );

    if (applications.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Application not found or you don't have access"
      });
    }

    const application = applications[0];
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // Check if session already logged today
    const [existingSession] = await pool.query(
      "SELECT session_id FROM training_sessions WHERE application_id = ? AND session_date = ?",
      [application_id, today]
    );

    if (existingSession.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Session already logged for today"
      });
    }

    // Insert training session
    await pool.query(
      `INSERT INTO training_sessions 
       (application_id, user_id, coach_id, session_date, user_weight, notes) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [application_id, application.user_id, coach_id, today, user_weight || null, notes || null]
    );

    // Update application training_status to 'ongoing' if it's the first session
    if (application.training_status === 'not_started') {
      await pool.query(
        "UPDATE applications SET training_status = 'ongoing' WHERE application_id = ?",
        [application_id]
      );
    }

    res.status(201).json({
      success: true,
      message: "Training session logged successfully"
    });

  } catch (error) {
    console.error("Error logging training session:", error);
    res.status(500).json({
      success: false,
      message: "Failed to log training session",
      error: error.message
    });
  }
};

// ✅ COMPLETE TRAINING PROGRAM (Coach marks entire program as completed)
export const completeTrainingProgram = async (req, res) => {
  try {
    const { application_id } = req.params;
    const coach_id = req.session.user?.user_id;

    if (!coach_id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - Coach login required"
      });
    }

    // Verify this application belongs to this coach
    const [applications] = await pool.query(
      `SELECT * FROM applications 
       WHERE application_id = ? AND coach_id = ? AND application_status = 'approved'`,
      [application_id, coach_id]
    );

    if (applications.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Application not found or you don't have access"
      });
    }

    const application = applications[0];

    if (application.training_status === 'completed') {
      return res.status(400).json({
        success: false,
        message: "Training program already completed"
      });
    }

    // Update training_status to completed
    await pool.query(
      "UPDATE applications SET training_status = 'completed' WHERE application_id = ?",
      [application_id]
    );

    res.status(200).json({
      success: true,
      message: "Training program marked as completed"
    });

  } catch (error) {
    console.error("Error completing training program:", error);
    res.status(500).json({
      success: false,
      message: "Failed to complete training program",
      error: error.message
    });
  }
};

// 📋 GET COACH'S CLIENTS (for /coach/clients page)
export const getCoachClients = async (req, res) => {
  try {
    const coach_id = req.session.user?.user_id;

    if (!coach_id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - Coach login required"
      });
    }

    // Get all approved applications for this coach with latest weight
    const [clients] = await pool.query(
      `SELECT 
        a.application_id,
        a.user_id,
        a.name as user_name,
        a.weight as starting_weight,
        a.height,
        a.training_status,
        a.submitted_at,
        p.title as package_title,
        c.coach_name,
        c.availability as coach_availability,
        (SELECT user_weight 
         FROM training_sessions 
         WHERE application_id = a.application_id 
         ORDER BY session_date DESC 
         LIMIT 1) as current_weight,
        (SELECT COUNT(*) 
         FROM training_sessions 
         WHERE application_id = a.application_id) as total_sessions
      FROM applications a
      LEFT JOIN packages p ON a.package_id = p.package_id
      LEFT JOIN coaches c ON a.coach_id = c.coach_id
      WHERE a.coach_id = ? AND a.application_status = 'approved'
      ORDER BY 
        CASE a.training_status
          WHEN 'ongoing' THEN 1
          WHEN 'not_started' THEN 2
          WHEN 'completed' THEN 3
        END,
        a.submitted_at DESC`,
      [coach_id]
    );

    res.status(200).json({
      success: true,
      clients,
      count: clients.length
    });

  } catch (error) {
    console.error("Error fetching coach clients:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch clients",
      error: error.message
    });
  }
};

// 📋 GET USER'S SCHEDULE (for /users/myschedule page)
export const getUserSchedule = async (req, res) => {
  try {
    const user_id = req.session.user?.user_id;

    if (!user_id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - User login required"
      });
    }

    // Get user's current approved application with sessions
    const [schedule] = await pool.query(
      `SELECT 
        a.application_id,
        a.name as user_name,
        a.training_status,
        a.submitted_at,
        p.title as package_title,
        p.description as package_description,
        c.coach_name,
        c.availability as coach_availability,
        (SELECT COUNT(*) 
         FROM training_sessions 
         WHERE application_id = a.application_id) as total_sessions
      FROM applications a
      LEFT JOIN packages p ON a.package_id = p.package_id
      LEFT JOIN coaches c ON a.coach_id = c.coach_id
      WHERE a.user_id = ? AND a.application_status = 'approved' AND a.training_status != 'completed'
      ORDER BY a.submitted_at DESC
      LIMIT 1`,
      [user_id]
    );

    if (schedule.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No active training program found"
      });
    }

    // Get session history
    const [sessions] = await pool.query(
      `SELECT 
        ts.session_id,
        ts.session_date,
        ts.user_weight,
        ts.notes,
        c.coach_name
      FROM training_sessions ts
      LEFT JOIN coaches c ON ts.coach_id = c.coach_id
      WHERE ts.application_id = ?
      ORDER BY ts.session_date DESC`,
      [schedule[0].application_id]
    );

    res.status(200).json({
      success: true,
      schedule: schedule[0],
      sessions
    });

  } catch (error) {
    console.error("Error fetching user schedule:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch schedule",
      error: error.message
    });
  }
};

// 📊 GET ALL SCHEDULES (Admin - for /admin/schedule page)
export const getAllSchedules = async (req, res) => {
  try {
    const admin_id = req.session.user?.user_id;

    if (!admin_id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - Admin login required"
      });
    }

    const [schedules] = await pool.query(
      `SELECT 
        a.application_id,
        a.user_id,
        a.name as user_name,
        a.training_status,
        a.submitted_at,
        p.title as package_title,
        c.coach_name,
        (SELECT COUNT(*) 
         FROM training_sessions 
         WHERE application_id = a.application_id) as total_sessions,
        (SELECT MAX(session_date) 
         FROM training_sessions 
         WHERE application_id = a.application_id) as last_session_date
      FROM applications a
      LEFT JOIN packages p ON a.package_id = p.package_id
      LEFT JOIN coaches c ON a.coach_id = c.coach_id
      WHERE a.application_status = 'approved'
      ORDER BY 
        CASE a.training_status
          WHEN 'ongoing' THEN 1
          WHEN 'not_started' THEN 2
          WHEN 'completed' THEN 3
        END,
        a.submitted_at DESC`
    );

    res.status(200).json({
      success: true,
      schedules,
      count: schedules.length
    });

  } catch (error) {
    console.error("Error fetching schedules:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch schedules",
      error: error.message
    });
  }
};

// 📊 GET SESSION DETAILS (Admin can view any session history)
export const getSessionHistory = async (req, res) => {
  try {
    const { application_id } = req.params;

    const [sessions] = await pool.query(
      `SELECT 
        ts.*,
        c.coach_name,
        CONCAT(u.firstname, ' ', u.lastname) as user_name
      FROM training_sessions ts
      LEFT JOIN coaches c ON ts.coach_id = c.coach_id
      LEFT JOIN users_infos u ON ts.user_id = u.user_id
      WHERE ts.application_id = ?
      ORDER BY ts.session_date DESC`,
      [application_id]
    );

    res.status(200).json({
      success: true,
      sessions
    });

  } catch (error) {
    console.error("Error fetching session history:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch session history",
      error: error.message
    });
  }
};