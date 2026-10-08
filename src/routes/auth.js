const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { db } = require("../firebase");
const { JWT_SECRET, authenticateToken } = require("../middleware/auth");

const MAIN_ADMIN_EMAIL = "jnplotus@gmail.com";
const ADMIN_ALIASES = ["admin", "jnplotus", "mainadmin"];

/**
 * POST /api/auth/login
 * Handles both admin login and student login
 */
router.post("/login", async (req, res) => {
  try {
    const { identifier, email, password, role } = req.body;
    let inputIdentity = (identifier || email || "").trim().toLowerCase();

    if (!inputIdentity || !password) {
      return res.status(400).json({ success: false, message: "Identifier and password are required." });
    }

    // Check if input is Main Admin alias
    if (ADMIN_ALIASES.includes(inputIdentity) || inputIdentity === MAIN_ADMIN_EMAIL) {
      inputIdentity = MAIN_ADMIN_EMAIL;
    }

    // Check in Firestore users collection
    let userRecord = null;
    let docId = null;

    if (db) {
      const snap = await db.collection("users").where("email", "==", inputIdentity).limit(1).get();
      if (!snap.empty) {
        userRecord = snap.docs[0].data();
        docId = snap.docs[0].id;
      }
    }

    // Verify Password
    let passwordValid = false;

    if (userRecord && userRecord.password) {
      if (userRecord.password.startsWith("$2a$") || userRecord.password.startsWith("$2b$")) {
        passwordValid = await bcrypt.compare(password, userRecord.password);
      } else {
        passwordValid = userRecord.password === password;
      }
    }

    // Fallback for Master Admin credentials
    if (!passwordValid && inputIdentity === MAIN_ADMIN_EMAIL && password === "Admin@12345") {
      passwordValid = true;
      if (!userRecord) {
        userRecord = {
          email: MAIN_ADMIN_EMAIL,
          name: "Tech Titan Main Admin",
          role: "admin",
          department: "Computer Science & Engineering",
        };
      }
    }

    if (!passwordValid) {
      return res.status(401).json({ success: false, message: "Invalid email/username or password." });
    }

    const payload = {
      id: docId || "admin-root",
      email: userRecord.email,
      name: userRecord.name || "Administrator",
      role: inputIdentity === MAIN_ADMIN_EMAIL ? "admin" : (userRecord.role || "student"),
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });

    return res.json({
      success: true,
      message: "Authentication successful.",
      token,
      user: payload,
    });
  } catch (err) {
    console.error("[AUTH] Login error:", err);
    return res.status(500).json({ success: false, message: "Server error during authentication." });
  }
});

/**
 * GET /api/auth/me
 */
router.get("/me", authenticateToken, (req, res) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "Not authenticated" });
  }
  return res.json({ success: true, user: req.user });
});

module.exports = router;
