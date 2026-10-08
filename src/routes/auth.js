const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { db } = require("../firebase");
const { auth } = require("../middleware/auth");

const jwtSecret = process.env.JWT_SECRET || "fallback_secret";

// Helper: Find user document in Firestore by normalized email
async function findUserByEmail(normalizedEmail) {
  const docId = Buffer.from(normalizedEmail).toString("base64url");
  const docSnap = await db.collection("users").doc(docId).get();
  if (docSnap.exists) {
    return { id: docSnap.id, ...docSnap.data() };
  }

  // Fallback: Query by email property
  const qSnap = await db.collection("users").where("email", "==", normalizedEmail).get();
  if (!qSnap.empty) {
    // If multiple exist, prioritize document with passwordHash
    const match = qSnap.docs.find(d => d.data().passwordHash) || qSnap.docs[0];
    return { id: match.id, ...match.data() };
  }

  return null;
}

// 1. POST /api/auth/signin
router.post("/signin", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !email.trim() || !password || !password.trim()) {
      return res.status(400).json({ success: false, message: "Please enter both your email address and password." });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const userData = await findUserByEmail(normalizedEmail);

    if (!userData) {
      return res.status(404).json({
        success: false,
        isNewUser: true,
        message: "No account found with this email. Please switch to the 'Create Account' tab to register."
      });
    }

    if (userData.blocked) {
      return res.status(403).json({ success: false, message: "This account has been temporarily suspended. Contact administrator." });
    }

    // Verify Password
    let passwordValid = false;
    if (userData.passwordHash) {
      passwordValid = await bcrypt.compare(password, userData.passwordHash);
    } else if (userData.password) {
      passwordValid = (userData.password === password);
    }

    if (!passwordValid) {
      return res.status(401).json({
        success: false,
        message: "Incorrect password. Click 'Forgot password?' below to reset it instantly."
      });
    }

    // Issue JWT Token
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
        name: userData.name || "Student",
        mobile: userData.mobile || "",
        college: userData.college || "",
        year: userData.year || "1st year",
        branch: userData.branch || "CSE",
        course: userData.course || userData.branch || "B.Tech",
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

// 2. POST /api/auth/signup - Direct 1-click registration
router.post("/signup", async (req, res) => {
  try {
    const { email, password, name, college, year, branch, course, mobile } = req.body || {};
    if (!email || !email.trim() || !password || !password.trim()) {
      return res.status(400).json({ success: false, message: "Email and password are required." });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await findUserByEmail(normalizedEmail);

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "An account with this email already exists. Please sign in or reset your password."
      });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const docId = Buffer.from(normalizedEmail).toString("base64url");

    const newUser = {
      email: normalizedEmail,
      name: (name || "Student").trim(),
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

// 3. POST /api/auth/forgot-password - Instant self-service password recovery
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email || !email.trim()) {
      return res.status(400).json({ success: false, message: "Email address is required." });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const userData = await findUserByEmail(normalizedEmail);

    if (!userData) {
      return res.status(404).json({
        success: false,
        message: "No account found with this email. Please create an account."
      });
    }

    // Generate quick reset token
    const resetToken = Buffer.from(`${normalizedEmail}:${Date.now()}:${Math.random()}`).toString("base64url");

    // Save token in user doc with 1-hour expiry
    await db.collection("users").doc(userData.id).update({
      resetToken,
      resetTokenExpires: Date.now() + 60 * 60 * 1000
    });

    res.json({
      success: true,
      email: normalizedEmail,
      resetToken,
      message: "Account verified! Please enter your new password below."
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4. POST /api/auth/reset-password - Update password & return active session
router.post("/reset-password", async (req, res) => {
  try {
    const { email, password, newPassword, token: resetToken } = req.body || {};
    const passToSet = password || newPassword;

    if (!passToSet || passToSet.length < 6) {
      return res.status(400).json({ success: false, message: "New password must be at least 6 characters long." });
    }

    let userData = null;
    if (email) {
      userData = await findUserByEmail(email.toLowerCase().trim());
    } else if (resetToken) {
      const qSnap = await db.collection("users").where("resetToken", "==", resetToken).limit(1).get();
      if (!qSnap.empty) userData = { id: qSnap.docs[0].id, ...qSnap.docs[0].data() };
    }

    if (!userData) {
      return res.status(400).json({ success: false, message: "Invalid or expired recovery session. Please try again." });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(passToSet, salt);

    await db.collection("users").doc(userData.id).update({
      passwordHash,
      resetToken: null,
      resetTokenExpires: null,
      updatedAt: new Date().toISOString()
    });

    // Issue JWT token immediately so student is automatically signed in
    const token = jwt.sign(
      { userId: userData.id, email: userData.email, role: userData.role || "student" },
      jwtSecret,
      { expiresIn: "30d" }
    );

    res.json({
      success: true,
      token,
      message: "Password updated successfully! Signing you in...",
      user: {
        id: userData.id,
        email: userData.email,
        name: userData.name || "Student",
        mobile: userData.mobile || "",
        college: userData.college || "",
        year: userData.year || "1st year",
        branch: userData.branch || "CSE",
        course: userData.course || userData.branch || "B.Tech",
        role: userData.role || "student",
        permissions: userData.permissions || {},
        blocked: false
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5. POST /api/auth/change-password (Authenticated)
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

// 6. POST /api/auth/logout
router.post("/logout", auth, (req, res) => {
  res.json({ success: true, recorded: true });
});

module.exports = router;
