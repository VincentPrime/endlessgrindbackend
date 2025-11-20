import pool from "../../db/endlessgrinddb.js";

// 📅 GET COACH AVAILABILITY (with booked slots)
export const getCoachAvailability = async (req, res) => {
  try {
    const { coach_id } = req.params;
    const { date } = req.query; // Optional: specific date, otherwise returns all future bookings

    // Get coach details and availability
    const [coaches] = await pool.query(
      "SELECT coach_id, coach_name, availability FROM coaches WHERE coach_id = ? AND is_active = 1",
      [coach_id]
    );

    if (coaches.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Coach not found"
      });
    }

    const coach = coaches[0];

    // Get all booked slots for this coach (future dates only)
    let query = `
      SELECT 
        b.booking_id,
        b.booking_date,
        b.start_time,
        b.end_time,
        b.status,
        CONCAT(u.firstname, ' ', u.lastname) as user_name,
        p.title as package_title
      FROM bookings b
      LEFT JOIN users_infos u ON b.user_id = u.user_id
      LEFT JOIN applications a ON b.application_id = a.application_id
      LEFT JOIN packages p ON a.package_id = p.package_id
      WHERE b.coach_id = ? AND b.status = 'scheduled'
    `;

    const params = [coach_id];

    if (date) {
      query += " AND b.booking_date = ?";
      params.push(date);
    } else {
      query += " AND b.booking_date >= CURDATE()";
    }

    query += " ORDER BY b.booking_date, b.start_time";

    const [bookedSlots] = await pool.query(query, params);

    res.status(200).json({
      success: true,
      coach: {
        coach_id: coach.coach_id,
        coach_name: coach.coach_name,
        availability: coach.availability
      },
      booked_slots: bookedSlots
    });

  } catch (error) {
    console.error("Error fetching coach availability:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch availability",
      error: error.message
    });
  }
};

// ✅ BOOK A TIME SLOT
export const bookTimeSlot = async (req, res) => {
  try {
    const { application_id, coach_id, booking_date, start_time, end_time } = req.body;
    const user_id = req.session.user?.user_id;

    if (!user_id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - User login required"
      });
    }

    // Validate required fields
    if (!application_id || !coach_id || !booking_date || !start_time || !end_time) {
      return res.status(400).json({
        success: false,
        message: "All fields are required"
      });
    }

    // Verify the application belongs to this user and is approved
    const [applications] = await pool.query(
      `SELECT application_id, coach_id, application_status 
       FROM applications 
       WHERE application_id = ? AND user_id = ? AND application_status = 'approved'`,
      [application_id, user_id]
    );

    if (applications.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Application not found or not approved"
      });
    }

    // Verify coach matches the application
    if (applications[0].coach_id !== parseInt(coach_id)) {
      return res.status(400).json({
        success: false,
        message: "Coach does not match your application"
      });
    }

    // Check if slot is already booked
    const [existingBooking] = await pool.query(
      `SELECT booking_id FROM bookings 
       WHERE coach_id = ? AND booking_date = ? AND start_time = ? AND status = 'scheduled'`,
      [coach_id, booking_date, start_time]
    );

    if (existingBooking.length > 0) {
      return res.status(400).json({
        success: false,
        message: "This time slot is already booked"
      });
    }

    // Check if user already has a booking on this date with this coach
    const [userBooking] = await pool.query(
      `SELECT booking_id FROM bookings 
       WHERE user_id = ? AND coach_id = ? AND booking_date = ? AND status = 'scheduled'`,
      [user_id, coach_id, booking_date]
    );

    if (userBooking.length > 0) {
      return res.status(400).json({
        success: false,
        message: "You already have a booking on this date with this coach"
      });
    }

    // Create the booking
    const [result] = await pool.query(
      `INSERT INTO bookings 
       (application_id, user_id, coach_id, booking_date, start_time, end_time, status) 
       VALUES (?, ?, ?, ?, ?, ?, 'scheduled')`,
      [application_id, user_id, coach_id, booking_date, start_time, end_time]
    );

    res.status(201).json({
      success: true,
      message: "Time slot booked successfully",
      booking_id: result.insertId
    });

  } catch (error) {
    console.error("Error booking time slot:", error);
    res.status(500).json({
      success: false,
      message: "Failed to book time slot",
      error: error.message
    });
  }
};

// 🗑️ CANCEL BOOKING (User can cancel their own booking)
export const cancelBooking = async (req, res) => {
  try {
    const { booking_id } = req.params;
    const user_id = req.session.user?.user_id;

    if (!user_id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }

    // Verify booking belongs to user
    const [bookings] = await pool.query(
      "SELECT booking_id, booking_date, status FROM bookings WHERE booking_id = ? AND user_id = ?",
      [booking_id, user_id]
    );

    if (bookings.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Booking not found"
      });
    }

    const booking = bookings[0];

    // Don't allow canceling completed bookings
    if (booking.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: "Cannot cancel a completed booking"
      });
    }

    // Update status to cancelled
    await pool.query(
      "UPDATE bookings SET status = 'cancelled' WHERE booking_id = ?",
      [booking_id]
    );

    res.status(200).json({
      success: true,
      message: "Booking cancelled successfully"
    });

  } catch (error) {
    console.error("Error cancelling booking:", error);
    res.status(500).json({
      success: false,
      message: "Failed to cancel booking",
      error: error.message
    });
  }
};

// 📋 GET USER'S BOOKINGS
export const getUserBookings = async (req, res) => {
  try {
    const user_id = req.session.user?.user_id;

    if (!user_id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }

    const [bookings] = await pool.query(
      `SELECT 
        b.booking_id,
        b.booking_date,
        b.start_time,
        b.end_time,
        b.status,
        b.notes,
        c.coach_name,
        c.specialty,
        p.title as package_title
      FROM bookings b
      LEFT JOIN coaches c ON b.coach_id = c.coach_id
      LEFT JOIN applications a ON b.application_id = a.application_id
      LEFT JOIN packages p ON a.package_id = p.package_id
      WHERE b.user_id = ?
      ORDER BY b.booking_date DESC, b.start_time DESC`,
      [user_id]
    );

    res.status(200).json({
      success: true,
      bookings
    });

  } catch (error) {
    console.error("Error fetching user bookings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch bookings",
      error: error.message
    });
  }
};

// 📋 GET COACH'S BOOKINGS (for coach dashboard)
export const getCoachBookings = async (req, res) => {
  try {
    const coach_id = req.session.user?.user_id;

    if (!coach_id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - Coach login required"
      });
    }

    const { date } = req.query;

    let query = `
      SELECT 
        b.booking_id,
        b.booking_date,
        b.start_time,
        b.end_time,
        b.status,
        b.notes,
        CONCAT(u.firstname, ' ', u.lastname) as user_name,
        u.image as user_image,
        p.title as package_title,
        a.weight,
        a.height
      FROM bookings b
      LEFT JOIN users_infos u ON b.user_id = u.user_id
      LEFT JOIN applications a ON b.application_id = a.application_id
      LEFT JOIN packages p ON a.package_id = p.package_id
      WHERE b.coach_id = ?
    `;

    const params = [coach_id];

    if (date) {
      query += " AND b.booking_date = ?";
      params.push(date);
    } else {
      query += " AND b.booking_date >= CURDATE()";
    }

    query += " ORDER BY b.booking_date, b.start_time";

    const [bookings] = await pool.query(query, params);

    res.status(200).json({
      success: true,
      bookings,
      count: bookings.length
    });

  } catch (error) {
    console.error("Error fetching coach bookings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch bookings",
      error: error.message
    });
  }
};

// ✅ MARK BOOKING AS COMPLETED (Coach only)
export const completeBooking = async (req, res) => {
  try {
    const { booking_id } = req.params;
    const coach_id = req.session.user?.user_id;

    if (!coach_id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - Coach login required"
      });
    }

    // Verify booking belongs to this coach
    const [bookings] = await pool.query(
      "SELECT booking_id, status FROM bookings WHERE booking_id = ? AND coach_id = ?",
      [booking_id, coach_id]
    );

    if (bookings.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Booking not found"
      });
    }

    // Update status to completed
    await pool.query(
      "UPDATE bookings SET status = 'completed' WHERE booking_id = ?",
      [booking_id]
    );

    res.status(200).json({
      success: true,
      message: "Booking marked as completed"
    });

  } catch (error) {
    console.error("Error completing booking:", error);
    res.status(500).json({
      success: false,
      message: "Failed to complete booking",
      error: error.message
    });
  }
};