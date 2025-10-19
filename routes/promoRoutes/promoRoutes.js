import express from "express";
import { createPackage, getAllPackages, deletePackage } from "../../Controller/promo/promoController.js";

const router = express.Router();

router.post("/create", createPackage);

// Get all packages
router.get("/getpackages", getAllPackages);

// Delete package
router.delete("/deletepack/:id", deletePackage);

export default router;
