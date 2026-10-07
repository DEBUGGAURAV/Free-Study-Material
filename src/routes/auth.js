const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { db } = require("../firebase");
const { auth } = require("../middleware/auth");

const jwtSecret = process.env.JWT_SECRET || "fallback_secret";

// POST /api/auth/signin
router.post("/signin", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !email.trim() || !password || !password.trim()) {
      return res.status(400).json({ success: false, message: "All fields are mandatory. Please enter both email and password." });
    }
    const normalizedEmail = email.toLowerCase().trim();
    if (!normalizedEmail.includes("@gmail.com")) {
      return res.status(400).json({ success: false, message: "Enter the email that contain @gmail.com" });
    }

    const docId = Buffer.from(normalizedEmail).toString("base64url");
    let userSnapshot = await db.collection("users").doc(docId).get();
    let userData = null;

    if (userSnapshot.exists) {
      userData = { id: userSnapshot.id, ...userSnapshot.data() };
    } else {
      const qSnap = await db.collection("users").where("email", "==", normalizedEmail).limit(1).get();
      if (!qSnap.empty) {
        userData = { id: qSnap.docs[0].id, ...qSnap.docs[0].data() };
      }
    }

    if (!userData) {
      return res.status(401).json({ success: false, message: "Email or password is incorrect." });
    }

    if (userData.passwordHash) {
      const isMatch = await bcrypt.compare(password, userData.passwordHash);
      if (!isMatch) {
        return res.status(401).json({ success: false, message: "Email or password is incorrect." });
      }
    } else if (userData.password && userData.password !== password) {
      return res.status(401).json({ success: false, message: "Email or password is incorrect." });
    }

    if (userData.blocked) {
      return res.status(403).json({ success: false, message: "This account is blocked." });
    }

    const token = jwt.sign(
      { userId: userData.id, email: userData.email, role: userData.role || "student" },
      jwtSecret,
      { expiresIn: "30d" }
    );

    res.json({
      success: true,
      token,
      user: {
        id: userData.id,
        email: userData.email,
        name: userData.name || "",
        mobile: userData.mobile || "",
        college: userData.college || "",
        year: userData.year || "1st year",
        branch: userData.branch || "",
        course: userData.course || userData.branch || "",
        role: userData.role || "student",
        permissions: userData.permissions || {},
        blocked: false
      }
    });
  } catch (err) {
    console.error("[Auth Signin Error]:", err);
    res.status(500).json({ success: false, message: "Authentication service error: " + err.message });
  }
});

// POST /api/auth/logout
router.post("/logout", auth, (req, res) => {
  res.json({ success: true, recorded: true });
});

module.exports = router;

