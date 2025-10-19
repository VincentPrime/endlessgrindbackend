import { createClient } from "@supabase/supabase-js";
import pool from "../../db/endlessgrinddb.js";

// 🔧 Supabase Setup
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 🟢 CREATE PACKAGE
export const createPackage = async (req, res) => {
  try {
    const { title, description, picture, price } = req.body;

    if (!title || !price || !picture) {
      return res.status(400).json({ message: "Title, price, and picture URL are required" });
    }

    const [result] = await pool.query(
      "INSERT INTO packages (title, description, picture, price) VALUES (?, ?, ?, ?)",
      [title, description, picture, price]
    );

    res.status(201).json({
      message: "Package created successfully",
      package: {
        id: result.insertId,
        title,
        description,
        price,
        picture,
      },
    });
  } catch (error) {
    console.error("Error creating package:", error);
    res.status(500).json({ message: "Failed to create package", error });
  }
};

// 📋 GET ALL PACKAGES
export const getAllPackages = async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM packages ORDER BY created_at DESC");
    res.status(200).json(rows);
  } catch (error) {
    console.error("Error fetching packages:", error);
    res.status(500).json({ message: "Failed to fetch packages", error });
  }
};

// 🗑️ DELETE PACKAGE
export const deletePackage = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if package exists
    const [pkg] = await pool.query("SELECT picture FROM packages WHERE package_id = ?", [id]);
    if (pkg.length === 0) {
      return res.status(404).json({ message: "Package not found" });
    }

    // Delete image from Supabase storage
    const imageUrl = pkg[0].picture;
    try {
      const urlParts = imageUrl.split("promo");
      if (urlParts.length > 1) {
        const fileName = urlParts[1].split("?")[0];
        const { error: deleteError } = await supabase.storage
          .from("promo")
          .remove([fileName]);
        if (deleteError) console.warn("⚠️ Failed to delete image from Supabase:", deleteError.message);
      }
    } catch (err) {
      console.warn("⚠️ Could not parse image URL for deletion:", err);
    }

    // Delete record from database
    await pool.query("DELETE FROM packages WHERE package_id = ?", [id]);
    res.status(200).json({ message: "Package deleted successfully" });
  } catch (error) {
    console.error("Error deleting package:", error);
    res.status(500).json({ message: "Failed to delete package", error: error.message });
  }
};
