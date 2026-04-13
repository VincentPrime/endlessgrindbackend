import pool from "../../db/endlessgrinddb.js";
import axios from "axios";
import { 
  sendCoachNotification, 
  sendApplicationApprovedEmail, 
  sendApplicationDeclinedEmail  
} from '../../service/emailService.js';

const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY;
const PAYMONGO_API_URL = "https://api.paymongo.com/v1/payments";

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
      waiver_accepted,
      id_picture_url  // NEW: ID picture URL from frontend (already uploaded to Supabase)
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
      "SELECT application_id, application_status FROM applications WHERE user_id = ? AND application_status IN ('pending', 'approved') AND is_archived = 0",
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
    const amountInCentavos = Math.round(packageInfo.price * 100);

    // Insert application into database (now includes id_picture_url)
    const [result] = await pool.query(
      `INSERT INTO applications 
      (user_id, name, nickname, sex, age, date_of_birth, email, facebook, address, goal, id_picture_url, weight, height, package_id, coach_id, waiver_accepted, payment_status, application_status) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending')`,
      [user_id, name, nickname, sex, age, date_of_birth, email, facebook, address, goal, id_picture_url || null, weight, height, package_id, coach_id, waiver_accepted]
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
        a.id_picture_url,  -- ✅ ADD THIS LINE HERE
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
      WHERE a.is_archived = 0
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
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch applications",
      error: error.message
    });
  }
};


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

    // Check if application exists and get all details including coach email
    const [applications] = await pool.query(
      `SELECT 
        a.*,
        p.title as package_title,
        p.price as package_price,
        c.email as coach_email,
        c.coach_name,
        c.specialty as coach_specialty
      FROM applications a
      LEFT JOIN packages p ON a.package_id = p.package_id
      LEFT JOIN coaches c ON a.coach_id = c.coach_id
      WHERE a.application_id = ?`,
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

    // 📧 SEND EMAIL NOTIFICATION TO COACH
    if (application.coach_email) {
      const coachEmailData = {
        name: application.name,
        nickname: application.nickname,
        age: application.age,
        sex: application.sex,
        email: application.email,
        facebook: application.facebook,
        weight: application.weight,
        height: application.height,
        goal: application.goal,
        package_title: application.package_title,
        package_price: application.package_price,
      };

      const coachEmailResult = await sendCoachNotification(application.coach_email, coachEmailData);
      
      if (coachEmailResult.success) {
        console.log(`📧 Email sent to coach: ${application.coach_email}`);
      } else {
        console.error(`❌ Failed to send email to coach: ${coachEmailResult.error}`);
      }
    }

    // 📧 SEND EMAIL NOTIFICATION TO USER (NEW!)
    if (application.email) {
      const userEmailData = {
        name: application.name,
        package_title: application.package_title,
        package_price: application.package_price,
        coach_name: application.coach_name,
        coach_specialty: application.coach_specialty,
      };

      const userEmailResult = await sendApplicationApprovedEmail(application.email, userEmailData);
      
      if (userEmailResult.success) {
        console.log(`📧 Approval email sent to user: ${application.email}`);
      } else {
        console.error(`❌ Failed to send approval email to user: ${userEmailResult.error}`);
      }
    }

    res.status(200).json({
      success: true,
      message: "Application approved successfully and notifications sent"
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

    // Get application details with package info
    const [applications] = await pool.query(
      `SELECT 
        a.*,
        p.title as package_title,
        p.price as package_price
      FROM applications a
      LEFT JOIN packages p ON a.package_id = p.package_id
      WHERE a.application_id = ?`,
      [application_id]
    );

    if (applications.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Application not found" 
      });
    }

    const application = applications[0];
    let refundInitiated = false;

    // If payment was completed, initiate refund via PayMongo
    if (application.payment_status === "completed" && application.payment_id) {
      try {
        // Create refund via PayMongo API
        await axios.post(
          `${PAYMONGO_API_URL}/refunds`,
          {
            data: {
              attributes: {
                payment_id: application.payment_id,
                amount: Math.round(application.package_price * 100),
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
        
        refundInitiated = true;
      } catch (refundError) {
        console.error("Refund error:", refundError.response?.data || refundError.message);
      }
    }

    // ✅ FIXED: Only update status to declined, DON'T archive it
    await pool.query(
      `UPDATE applications 
       SET application_status = 'declined',
           reviewed_at = NOW(),
           reviewed_by = ?
       WHERE application_id = ?`,
      [admin_id, application_id]
    );

    console.log(`❌ Application ${application_id} declined by admin ${admin_id}`);

    // 📧 SEND EMAIL NOTIFICATION TO USER
    if (application.email) {
      const userEmailData = {
        name: application.name,
        package_title: application.package_title,
        package_price: application.package_price,
        submitted_at: application.submitted_at,
        refund_initiated: refundInitiated,
      };

      const userEmailResult = await sendApplicationDeclinedEmail(application.email, userEmailData);
      
      if (userEmailResult.success) {
        console.log(`📧 Decline email sent to user: ${application.email}`);
      } else {
        console.error(`❌ Failed to send decline email to user: ${userEmailResult.error}`);
      }
    }

    res.status(200).json({
      success: true,
      message: "Application declined successfully. You can archive it later if needed.",
      refund_initiated: refundInitiated
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

    // 🔥 FIXED: Added "AND a.is_archived = 0"
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
      WHERE a.user_id = ? AND a.is_archived = 0
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

// 📦 ARCHIVE APPLICATION (Admin only - soft delete)
export const archiveApplication = async (req, res) => {
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
      "SELECT * FROM applications WHERE application_id = ? AND is_archived = 0",
      [application_id]
    );

    if (applications.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Application not found or already archived" 
      });
    }

    const application = applications[0];

    // Prepare archive reason and training status update
    let archiveReason = `Archived by admin - Status: ${application.application_status}`;
    let newTrainingStatus = application.training_status;
    let membershipCancelled = false;
    
    // If approved and training was ongoing, mark as cancelled
    if (application.application_status === 'approved' && 
        (application.training_status === 'not_started' || application.training_status === 'ongoing')) {
      archiveReason = 'Membership cancelled by admin';
      newTrainingStatus = 'cancelled';
      membershipCancelled = true;
    }

    // 🔥 NEW: Delete all associated training sessions for this application
    // This ensures the user's training schedule and gym membership data are removed
    await pool.query(
      "DELETE FROM training_sessions WHERE application_id = ?",
      [application_id]
    );

    console.log(`🗑️ Deleted all training sessions for application ${application_id}`);

    // Update application - set is_archived = 1 and update training_status
    await pool.query(
      `UPDATE applications 
       SET is_archived = 1, 
           archived_at = NOW(), 
           archived_by = ?,
           archive_reason = ?,
           training_status = ?
       WHERE application_id = ?`,
      [admin_id, archiveReason, newTrainingStatus, application_id]
    );

    console.log(`📦 Application ${application_id} archived by admin ${admin_id}`);

    res.status(200).json({
      success: true,
      message: membershipCancelled 
        ? "Application archived, membership cancelled, and all training sessions removed. User can now apply for a new membership."
        : "Application archived successfully. User can now apply for a new membership.",
      membership_cancelled: membershipCancelled,
      training_sessions_deleted: true
    });

  } catch (error) {
    console.error("Error archiving application:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to archive application",
      error: error.message 
    });
  }
};

// 📋 GET ALL ARCHIVED APPLICATIONS (Admin only)
export const getArchivedApplications = async (req, res) => {
  try {
    const [archivedApps] = await pool.query(
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
        a.training_status,
        a.submitted_at,
        a.reviewed_at,
        a.reviewed_by,
        a.is_archived,
        a.archived_at,
        a.archived_by,
        a.archive_reason,
        CONCAT(u.firstname, ' ', COALESCE(u.middlename, ''), ' ', u.lastname) as username,
        p.title as package_title,
        p.price as package_price,
        c.coach_name,
        CONCAT(admin.firstname, ' ', COALESCE(admin.middlename, ''), ' ', admin.lastname) as archived_by_name
      FROM applications a
      LEFT JOIN users_infos u ON a.user_id = u.user_id
      LEFT JOIN packages p ON a.package_id = p.package_id
      LEFT JOIN coaches c ON a.coach_id = c.coach_id
      LEFT JOIN users_infos admin ON a.archived_by = admin.user_id
      WHERE a.is_archived = 1
      ORDER BY a.archived_at DESC`
    );

    res.status(200).json({
      success: true,
      archived_applications: archivedApps,
      count: archivedApps.length
    });
  } catch (error) {
    console.error("Error fetching archived applications:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch archived applications" 
    });
  }
};

// 🗑️ PERMANENTLY DELETE ARCHIVED APPLICATION (Admin only)
export const deleteArchivedApplication = async (req, res) => {
  try {
    const { application_id } = req.params;
    const admin_id = req.session.user?.user_id;

    if (!admin_id) {
      return res.status(401).json({ 
        success: false, 
        message: "Unauthorized" 
      });
    }

    // Check if application exists and is archived
    const [archived] = await pool.query(
      "SELECT * FROM applications WHERE application_id = ? AND is_archived = 1",
      [application_id]
    );

    if (archived.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Archived application not found" 
      });
    }

    // Permanently delete from database
    await pool.query(
      "DELETE FROM applications WHERE application_id = ? AND is_archived = 1",
      [application_id]
    );

    console.log(`🗑️ Archived application ${application_id} permanently deleted by admin ${admin_id}`);

    res.status(200).json({
      success: true,
      message: "Archived application permanently deleted"
    });
  } catch (error) {
    console.error("Error deleting archived application:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to delete archived application" 
    });
  }
};

// 🗑️ DELETE ALL ARCHIVED APPLICATIONS (Admin only)
export const deleteAllArchivedApplications = async (req, res) => {
  try {
    const admin_id = req.session.user?.user_id;

    if (!admin_id) {
      return res.status(401).json({ 
        success: false, 
        message: "Unauthorized" 
      });
    }

    // Get count before deleting
    const [countResult] = await pool.query(
      "SELECT COUNT(*) as count FROM applications WHERE is_archived = 1"
    );
    const count = countResult[0].count;

    // Delete all archived applications
    await pool.query("DELETE FROM applications WHERE is_archived = 1");

    console.log(`🗑️ All ${count} archived applications permanently deleted by admin ${admin_id}`);

    res.status(200).json({
      success: true,
      message: `Successfully deleted ${count} archived application(s)`,
      deleted_count: count
    });
  } catch (error) {
    console.error("Error deleting all archived applications:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to delete archived applications" 
    });
  }
};