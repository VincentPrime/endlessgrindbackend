import pool from "../../db/endlessgrinddb.js";
import axios from "axios";

const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY;
const PAYMONGO_API_URL = "https://api.paymongo.com/v1";

// 📝 SUBMIT APPLICATION (creates PayMongo payment link)
export const submitApplication = async (req, res) => {
  try {
    const {
      name,
      nickname,
      sex,
      age,
      date_of_birth,
      email,
      facebook,
      address,
      goal,
      weight,
      height,
      package_id,
      coach_id,
      waiver_accepted
    } = req.body;

    // Validate required fields
    if (!name || !sex || !age || !date_of_birth || !email || !goal || !package_id || !coach_id) {
      return res.status(400).json({ 
        success: false, 
        message: "Missing required fields" 
      });
    }

    if (!waiver_accepted) {
      return res.status(400).json({ 
        success: false, 
        message: "Waiver must be accepted" 
      });
    }

    // Get user_id from session
    const user_id = req.session.user?.user_id;
    if (!user_id) {
      return res.status(401).json({ 
        success: false, 
        message: "Unauthorized - please login" 
      });
    }

    // Check if user already has a pending or approved application
    const [existingApp] = await pool.query(
      "SELECT application_id, application_status FROM applications WHERE user_id = ? AND application_status IN ('pending', 'approved')",
      [user_id]
    );

    if (existingApp.length > 0) {
      return res.status(400).json({
        success: false,
        message: "You already have a pending or active application"
      });
    }

    // Fetch package details to get the correct price
    const [packageData] = await pool.query(
      "SELECT package_id, title, price FROM packages WHERE package_id = ?",
      [package_id]
    );

    if (packageData.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Package not found" 
      });
    }

    const packageInfo = packageData[0];
    const amountInCentavos = Math.round(packageInfo.price * 100); // Convert to centavos

    // Insert application into database (payment_status = pending)
    const [result] = await pool.query(
      `INSERT INTO applications 
      (user_id, name, nickname, sex, age, date_of_birth, email, facebook, address, goal, weight, height, package_id, coach_id, waiver_accepted, payment_status, application_status) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending')`,
      [user_id, name, nickname, sex, age, date_of_birth, email, facebook, address, goal, weight, height, package_id, coach_id, waiver_accepted]
    );

    const application_id = result.insertId;

    // Create PayMongo Payment Link
    try {
      const paymentLinkResponse = await axios.post(
        `${PAYMONGO_API_URL}/links`,
        {
          data: {
            attributes: {
              amount: amountInCentavos,
              description: `Gym Membership - ${packageInfo.title}`,
              remarks: `Application ID: ${application_id}`,
              // Add metadata to track the application
              metadata: {
                application_id: application_id.toString(),
                user_id: user_id.toString(),
                package_id: package_id.toString()
              }
            }
          }
        },
        {
          headers: {
            Authorization: `Basic ${Buffer.from(PAYMONGO_SECRET_KEY).toString("base64")}`,
            "Content-Type": "application/json"
          }
        }
      );

      const paymentLink = paymentLinkResponse.data.data.attributes.checkout_url;
      const paymentLinkId = paymentLinkResponse.data.data.id;

      // Update application with payment link reference
      await pool.query(
        "UPDATE applications SET payment_id = ? WHERE application_id = ?",
        [paymentLinkId, application_id]
      );

      res.status(201).json({
        success: true,
        message: "Application submitted successfully",
        application_id,
        payment_url: paymentLink,
        amount: packageInfo.price
      });

    } catch (paymentError) {
      console.error("PayMongo Error:", paymentError.response?.data || paymentError.message);
      
      // Rollback: delete the application if payment link creation fails
      await pool.query("DELETE FROM applications WHERE application_id = ?", [application_id]);
      
      return res.status(500).json({
        success: false,
        message: "Failed to create payment link",
        error: paymentError.response?.data?.errors || paymentError.message
      });
    }

  } catch (error) {
    console.error("Error submitting application:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to submit application", 
      error: error.message 
    });
  }
};

// ❌ CANCEL APPLICATION (User can cancel their own pending application)
export const cancelApplication = async (req, res) => {
  try {
    const { application_id } = req.params;
    const user_id = req.session.user?.user_id;

    if (!user_id) {
      return res.status(401).json({ 
        success: false, 
        message: "Unauthorized" 
      });
    }

    // Get application details and verify ownership
    const [applications] = await pool.query(
      "SELECT * FROM applications WHERE application_id = ? AND user_id = ?",
      [application_id, user_id]
    );

    if (applications.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Application not found or you don't have permission to cancel it" 
      });
    }

    const application = applications[0];

    // Don't allow canceling approved applications
    if (application.application_status === 'approved') {
      return res.status(400).json({
        success: false,
        message: "Cannot cancel an approved application. Please contact admin."
      });
    }

    // If payment was completed, initiate refund via PayMongo
    let refundInitiated = false;
    if (application.payment_status === "completed" && application.payment_id) {
      try {
        // Fetch package price for refund amount
        const [packageData] = await pool.query(
          "SELECT price FROM packages WHERE package_id = ?",
          [application.package_id]
        );

        if (packageData.length > 0) {
          await axios.post(
            `${PAYMONGO_API_URL}/refunds`,
            {
              data: {
                attributes: {
                  payment_id: application.payment_id,
                  amount: Math.round(packageData[0].price * 100),
                  reason: "requested_by_customer",
                  notes: `Application cancelled by user`
                }
              }
            },
            {
              headers: {
                Authorization: `Basic ${Buffer.from(PAYMONGO_SECRET_KEY).toString("base64")}`,
                "Content-Type": "application/json"
              }
            }
          );

          refundInitiated = true;
        }
      } catch (refundError) {
        console.error("Refund error:", refundError.response?.data || refundError.message);
        // Continue with deletion even if refund fails
      }
    }

    // Delete the application from database
    await pool.query(
      "DELETE FROM applications WHERE application_id = ?",
      [application_id]
    );

    res.status(200).json({
      success: true,
      message: refundInitiated 
        ? "Application cancelled and refund initiated successfully" 
        : "Application cancelled successfully",
      refund_initiated: refundInitiated
    });
  } catch (error) {
    console.error("Error cancelling application:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to cancel application" 
    });
  }
};

// 🔔 PAYMONGO WEBHOOK HANDLER
export const paymongoWebhook = async (req, res) => {
  try {
    const event = req.body.data;

    // Handle payment success
    if (event.attributes.type === "link.payment.paid") {
      const paymentLinkId = event.attributes.data.attributes.payment_link_id;
      const paymentId = event.attributes.data.id;
      
      // Find application by payment_id
      const [applications] = await pool.query(
        "SELECT application_id, application_status FROM applications WHERE payment_id = ?",
        [paymentLinkId]
      );

      if (applications.length > 0) {
        const app = applications[0];
        
        // Update payment status to completed
        await pool.query(
          "UPDATE applications SET payment_status = 'completed', payment_id = ? WHERE application_id = ?",
          [paymentId, app.application_id]
        );

        console.log(`✅ Payment completed for application ${app.application_id}`);
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).json({ error: "Webhook processing failed" });
  }
};

// 📋 GET ALL APPLICATIONS (Admin only)
export const getAllApplications = async (req, res) => {
  try {
    console.log("📋 Fetching all applications...");
    
    // Fetch applications with related data using the correct table and column names
    const [applications] = await pool.query(
      `SELECT 
        a.application_id,
        a.user_id,
        a.name,
        a.nickname,
        a.sex,
        a.age,
        a.date_of_birth,
        a.email,
        a.facebook,
        a.address,
        a.goal,
        a.weight,
        a.height,
        a.package_id,
        a.coach_id,
        a.waiver_accepted,
        a.payment_status,
        a.payment_id,
        a.application_status,
        a.submitted_at,
        a.reviewed_at,
        a.reviewed_by,
        CONCAT(u.firstname, ' ', COALESCE(u.middlename, ''), ' ', u.lastname) as username,
        p.title as package_title,
        p.price as package_price,
        c.coach_name,
        CONCAT(reviewer.firstname, ' ', COALESCE(reviewer.middlename, ''), ' ', reviewer.lastname) as reviewed_by_name
      FROM applications a
      LEFT JOIN users_infos u ON a.user_id = u.user_id
      LEFT JOIN packages p ON a.package_id = p.package_id
      LEFT JOIN coaches c ON a.coach_id = c.coach_id
      LEFT JOIN users_infos reviewer ON a.reviewed_by = reviewer.user_id
      ORDER BY a.submitted_at DESC`
    );

    console.log(`✅ Found ${applications.length} applications`);

    res.status(200).json({
      success: true,
      applications,
      count: applications.length
    });
  } catch (error) {
    console.error("❌ Error fetching applications:", error.message);
    console.error("❌ SQL Error:", error.sqlMessage || 'No SQL info');
    
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch applications",
      error: error.message,
      sqlError: error.sqlMessage || 'No SQL error info'
    });
  }
};

// ✅ APPROVE APPLICATION (Admin only)
// ✅ APPROVE APPLICATION (Admin only)
export const approveApplication = async (req, res) => {
  try {
    const { application_id } = req.params;
    const admin_id = req.session.user?.user_id;

    if (!admin_id) {
      return res.status(401).json({ 
        success: false, 
        message: "Unauthorized" 
      });
    }

    // Check if application exists
    const [applications] = await pool.query(
      "SELECT * FROM applications WHERE application_id = ?",
      [application_id]
    );

    if (applications.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Application not found" 
      });
    }

    const application = applications[0];

    // Check if already approved
    if (application.application_status === 'approved') {
      return res.status(400).json({
        success: false,
        message: "Application is already approved"
      });
    }

    // Admin can approve regardless of payment status
    // Update application status AND set training_status to 'not_started'
    await pool.query(
      `UPDATE applications 
       SET application_status = 'approved', 
           training_status = 'not_started',
           reviewed_at = NOW(), 
           reviewed_by = ? 
       WHERE application_id = ?`,
      [admin_id, application_id]
    );

    console.log(`✅ Application ${application_id} approved by admin ${admin_id}`);

    res.status(200).json({
      success: true,
      message: "Application approved successfully"
    });
  } catch (error) {
    console.error("Error approving application:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to approve application" 
    });
  }
};

// ❌ DECLINE APPLICATION (Admin only)
export const declineApplication = async (req, res) => {
  try {
    const { application_id } = req.params;
    const admin_id = req.session.user?.user_id;

    if (!admin_id) {
      return res.status(401).json({ 
        success: false, 
        message: "Unauthorized" 
      });
    }

    // Get application details
    const [applications] = await pool.query(
      "SELECT * FROM applications WHERE application_id = ?",
      [application_id]
    );

    if (applications.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Application not found" 
      });
    }

    const application = applications[0];

    // If payment was completed, initiate refund via PayMongo
    if (application.payment_status === "completed" && application.payment_id) {
      try {
        // Get package price for refund
        const [packageData] = await pool.query(
          "SELECT price FROM packages WHERE package_id = ?",
          [application.package_id]
        );

        if (packageData.length > 0) {
          // Create refund via PayMongo API
          await axios.post(
            `${PAYMONGO_API_URL}/refunds`,
            {
              data: {
                attributes: {
                  payment_id: application.payment_id,
                  amount: Math.round(packageData[0].price * 100), // amount in centavos
                  reason: "requested_by_customer",
                  notes: `Application declined by admin`
                }
              }
            },
            {
              headers: {
                Authorization: `Basic ${Buffer.from(PAYMONGO_SECRET_KEY).toString("base64")}`,
                "Content-Type": "application/json"
              }
            }
          );

          // Update payment status to refunded
          await pool.query(
            "UPDATE applications SET payment_status = 'refunded' WHERE application_id = ?",
            [application_id]
          );
        }
      } catch (refundError) {
        console.error("Refund error:", refundError.response?.data || refundError.message);
        // Continue with declining even if refund fails - admin can process manually
      }
    }

    // Update application status
    await pool.query(
      `UPDATE applications 
       SET application_status = 'declined', 
           reviewed_at = NOW(), 
           reviewed_by = ? 
       WHERE application_id = ?`,
      [admin_id, application_id]
    );

    res.status(200).json({
      success: true,
      message: "Application declined successfully",
      refund_initiated: application.payment_status === "completed"
    });
  } catch (error) {
    console.error("Error declining application:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to decline application" 
    });
  }
};

// 👤 GET USER'S APPLICATION STATUS
export const getUserApplication = async (req, res) => {
  try {
    const user_id = req.session.user?.user_id;

    if (!user_id) {
      return res.status(401).json({ 
        success: false, 
        message: "Unauthorized" 
      });
    }

    const [applications] = await pool.query(
      `SELECT 
        a.*,
        p.title as package_title,
        p.price as package_price,
        c.coach_name,
        c.specialty
      FROM applications a
      LEFT JOIN packages p ON a.package_id = p.package_id
      LEFT JOIN coaches c ON a.coach_id = c.coach_id
      WHERE a.user_id = ?
      ORDER BY a.submitted_at DESC
      LIMIT 1`,
      [user_id]
    );

    if (applications.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No application found"
      });
    }

    res.status(200).json({
      success: true,
      application: applications[0]
    });
  } catch (error) {
    console.error("Error fetching user application:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch application" 
    });
  }
};
// 🗑️ CANCEL APPLICATION (Admin can delete any application)
export const cancelApplicationAdmin = async (req, res) => {
  try {
    const { application_id } = req.params;
    const admin_id = req.session.user?.user_id;

    if (!admin_id) {
      return res.status(401).json({ 
        success: false, 
        message: "Unauthorized" 
      });
    }

    // Get application details (admin can delete any application, not just their own)
    const [applications] = await pool.query(
      "SELECT * FROM applications WHERE application_id = ?",
      [application_id]
    );

    if (applications.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Application not found" 
      });
    }

    const application = applications[0];

    // If payment was completed, initiate refund via PayMongo
    let refundInitiated = false;
    if (application.payment_status === "completed" && application.payment_id) {
      try {
        // Fetch package price for refund amount
        const [packageData] = await pool.query(
          "SELECT price FROM packages WHERE package_id = ?",
          [application.package_id]
        );

        if (packageData.length > 0) {
          await axios.post(
            `${PAYMONGO_API_URL}/refunds`,
            {
              data: {
                attributes: {
                  payment_id: application.payment_id,
                  amount: Math.round(packageData[0].price * 100),
                  reason: "requested_by_customer",
                  notes: `Application cancelled by admin ${admin_id}`
                }
              }
            },
            {
              headers: {
                Authorization: `Basic ${Buffer.from(PAYMONGO_SECRET_KEY).toString("base64")}`,
                "Content-Type": "application/json"
              }
            }
          );

          refundInitiated = true;
        }
      } catch (refundError) {
        console.error("Refund error:", refundError.response?.data || refundError.message);
        // Continue with deletion even if refund fails
      }
    }

    // Delete the application from database
    await pool.query(
      "DELETE FROM applications WHERE application_id = ?",
      [application_id]
    );

    console.log(`🗑️ Application ${application_id} deleted by admin ${admin_id}`);

    res.status(200).json({
      success: true,
      message: refundInitiated 
        ? "Application cancelled and refund initiated successfully" 
        : "Application cancelled successfully",
      refund_initiated: refundInitiated
    });
  } catch (error) {
    console.error("Error cancelling application:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to cancel application",
      error: error.message 
    });
  }
};