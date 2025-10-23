import pool from "../../db/endlessgrinddb.js";

// 📊 GET DASHBOARD STATS
export const getDashboardStats = async (req, res) => {
  try {
    const [usersCount] = await pool.query(
      "SELECT COUNT(*) AS total FROM users_infos WHERE role = 'user'"
    );

    const [coachesCount] = await pool.query(
      "SELECT COUNT(*) AS total FROM coaches WHERE is_active = 1"
    );

    const [packagesCount] = await pool.query(
      "SELECT COUNT(*) AS total FROM packages WHERE is_active = 1"
    );

    res.json({
      success: true,
      data: {
        totalUsers: usersCount[0].total,
        totalCoaches: coachesCount[0].total,
        totalPackages: packagesCount[0].total,
      },
    });
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    res.status(500).json({ error: "Failed to fetch dashboard statistics" });
  }
};

// 💰 GET REVENUE DATA - UPDATED TO USE application_status
export const getRevenueData = async (req, res) => {
  try {
    // Monthly revenue based on approved applications
    const [monthlyRevenue] = await pool.query(`
      SELECT 
        DATE_FORMAT(submitted_at, '%Y-%m') AS month,
        DATE_FORMAT(submitted_at, '%b %Y') AS monthName,
        COUNT(*) AS applications,
        SUM(p.price) AS revenue
      FROM applications a
      JOIN packages p ON a.package_id = p.package_id
      WHERE a.application_status = 'approved'
      GROUP BY DATE_FORMAT(submitted_at, '%Y-%m')
      ORDER BY month DESC
      LIMIT 12
    `);

    // Total revenue from approved applications
    const [totalRevenue] = await pool.query(`
      SELECT SUM(p.price) AS total
      FROM applications a
      JOIN packages p ON a.package_id = p.package_id
      WHERE a.application_status = 'approved'
    `);

    // Revenue by package for approved applications
    const [revenueByPackage] = await pool.query(`
      SELECT 
        p.title AS packageName,
        COUNT(*) AS sales,
        SUM(p.price) AS revenue
      FROM applications a
      JOIN packages p ON a.package_id = p.package_id
      WHERE a.application_status = 'approved'
      GROUP BY p.package_id, p.title
      ORDER BY revenue DESC
    `);

    res.json({
      success: true,
      data: {
        totalRevenue: totalRevenue[0].total || 0,
        monthlyRevenue: monthlyRevenue.reverse(),
        revenueByPackage,
      },
    });
  } catch (error) {
    console.error("Error fetching revenue data:", error);
    res.status(500).json({ error: "Failed to fetch revenue data" });
  }
};

// 📋 GET RECENT APPLICATIONS
export const getRecentApplications = async (req, res) => {
  try {
    const [applications] = await pool.query(`
      SELECT 
        a.application_id,
        a.name,
        a.email,
        p.title AS package,
        p.price,
        a.payment_status,
        a.application_status,
        a.submitted_at
      FROM applications a
      JOIN packages p ON a.package_id = p.package_id
      ORDER BY a.submitted_at DESC
      LIMIT 10
    `);

    res.json({
      success: true,
      data: applications,
    });
  } catch (error) {
    console.error("Error fetching recent applications:", error);
    res.status(500).json({ error: "Failed to fetch recent applications" });
  }
};