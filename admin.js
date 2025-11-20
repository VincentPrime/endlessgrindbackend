// admin.js
import bcrypt from "bcryptjs";
import pool from "./db/endlessgrinddb.js"; // ✅ make sure this path is correct

const createAdmin = async () => {
  try {
    const firstname = "Super";
    const lastname = "Admin";
    const sex = "male";
    const date_of_birth = "2000-01-01"; // ✅ placeholder birthday
    const email = "admin";
    const plainPassword = "admin@123";
    const hashedPassword = await bcrypt.hash(plainPassword, 10);
    const role = "admin";

    // ✅ include date_of_birth in the insert query
    await pool.query(
      `INSERT INTO users_infos 
        (firstname, lastname, sex, date_of_birth, email, password, role)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [firstname, lastname, sex, date_of_birth, email, hashedPassword, role]
    );

    console.log("✅ Admin account created successfully!");
  } catch (err) {
    console.error("❌ Error creating admin:", err);
  } finally {
    process.exit();
  }
};

createAdmin();
