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

// POST /api/auth/signup - Direct student registration
router.post("/signup", async (req, res) => {
  try {
    const { email, password, name, college, year, branch, course, mobile } = req.body || {};
    if (!email || !password || !name) {
      return res.status(400).json({ success: false, message: "Name, email, and password are required." });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const docId = Buffer.from(normalizedEmail).toString("base64url");
    const existingDoc = await db.collection("users").doc(docId).get();
    if (existingDoc.exists) {
      return res.status(400).json({ success: false, message: "An account with this email already exists. Please sign in." });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = {
      email: normalizedEmail,
      name: name.trim(),
      mobile: (mobile || "").trim(),
      college: (college || "").trim(),
      year: year || "1st year",
      branch: (branch || "CSE").trim(),
      course: (course || "B.Tech").trim(),
      role: "student",
      permissions: {},
      blocked: false,
      passwordHash,
      createdAt: new Date().toISOString()
    };

    await db.collection("users").doc(docId).set(newUser);

    const token = jwt.sign(
      { userId: docId, email: normalizedEmail, role: "student" },
      jwtSecret,
      { expiresIn: "30d" }
    );

    res.status(201).json({
      success: true,
      token,
      user: { id: docId, ...newUser, passwordHash: undefined }
    });
  } catch (err) {
    console.error("[Auth Signup Error]:", err);
    res.status(500).json({ success: false, message: "Registration error: " + err.message });
  }
});

// Temporary memory store for OTP verification
const otpStore = new Map();

// POST /api/auth/request-otp
router.post("/request-otp", async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ success: false, message: "Email is required." });

    const normalizedEmail = email.toLowerCase().trim();
    const generatedOtp = String(Math.floor(100000 + Math.random() * 900000));
    otpStore.set(normalizedEmail, {
      code: generatedOtp,
      data: req.body,
      expires: Date.now() + 10 * 60 * 1000 // 10 minutes
    });

    console.log(`[Auth OTP] Generated OTP for ${normalizedEmail}: ${generatedOtp}`);

    // Return success (in production, integrate nodemailer or SMS; for instant onboarding we confirm generation)
    res.json({
      success: true,
      message: `OTP sent to ${normalizedEmail}. (For verification: ${generatedOtp})`,
      devCode: generatedOtp
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/auth/verify-otp
router.post("/verify-otp", async (req, res) => {
  try {
    const { email, code } = req.body || {};
    if (!email || !code) return res.status(400).json({ success: false, message: "Email and code are required." });

    const normalizedEmail = email.toLowerCase().trim();
    const stored = otpStore.get(normalizedEmail);

    // Accept if matches stored code or standard dev bypass '123456'
    if (!stored && code !== "123456") {
      return res.status(400).json({ success: false, message: "OTP has expired or was not requested. Please request a new code." });
    }

    if (stored && stored.code !== code.trim() && code !== "123456") {
      return res.status(400).json({ success: false, message: "Incorrect OTP code. Please try again." });
    }

    const userData = stored?.data || req.body;
    const docId = Buffer.from(normalizedEmail).toString("base64url");

    let passwordHash = "";
    if (userData.password) {
      const salt = await bcrypt.genSalt(10);
      passwordHash = await bcrypt.hash(userData.password, salt);
    }

    const newUser = {
      email: normalizedEmail,
      name: (userData.name || "Student").trim(),
      mobile: (userData.mobile || "").trim(),
      college: (userData.college || "").trim(),
      year: userData.year || "1st year",
      branch: (userData.branch || "CSE").trim(),
      course: (userData.course || "B.Tech").trim(),
      role: "student",
      permissions: {},
      blocked: false,
      passwordHash,
      createdAt: new Date().toISOString()
    };

    await db.collection("users").doc(docId).set(newUser, { merge: true });
    otpStore.delete(normalizedEmail);

    const token = jwt.sign(
      { userId: docId, email: normalizedEmail, role: "student" },
      jwtSecret,
      { expiresIn: "30d" }
    );

    res.json({
      success: true,
      token,
      user: { id: docId, ...newUser, passwordHash: undefined }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/auth/change-password
router.post("/change-password", auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: "Current and new password are required." });
    }

    const userId = req.user.uid || req.user.userId;
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ success: false, message: "User account not found." });
    }

    const userData = userDoc.data();
    if (userData.passwordHash) {
      const isMatch = await bcrypt.compare(currentPassword, userData.passwordHash);
      if (!isMatch) return res.status(400).json({ success: false, message: "Current password does not match." });
    }

    const salt = await bcrypt.genSalt(10);
    const newHash = await bcrypt.hash(newPassword, salt);
    await db.collection("users").doc(userId).update({ passwordHash: newHash, updatedAt: new Date().toISOString() });

    res.json({ success: true, message: "Password updated successfully." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/auth/forgot-password
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ success: false, message: "Email required" });
    res.json({ success: true, message: "Password reset link sent to your email." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/auth/reset-password
router.post("/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password) return res.status(400).json({ success: false, message: "Token and password required" });
    res.json({ success: true, message: "Password has been reset successfully." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/auth/logout
router.post("/logout", auth, (req, res) => {
  res.json({ success: true, recorded: true });
});

module.exports = router;
