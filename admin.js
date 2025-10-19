// admin.js
import bcrypt from "bcryptjs";
import pool from "./db/endlessgrinddb.js"; // ✅ check if path is correct

const createAdmin = async () => {
  try {
    const firstname = "Super Admin";
    const sex = "male";
    const email = "admin";
    const plainPassword = "admin@123";
    const hashedPassword = await bcrypt.hash(plainPassword, 10);
    const role = "admin";

    await pool.query(
      `INSERT INTO users_infos 
        (firstname, sex, email, password, role)
       VALUES (?, ?, ?, ?, ?)`, // ✅ NO trailing comma!
      [firstname, sex, email, hashedPassword, role]
    );

    console.log("✅ Admin account created successfully!");
  } catch (err) {
    console.error("❌ Error creating admin:", err);
  } finally {
    process.exit();
  }
};

createAdmin();
