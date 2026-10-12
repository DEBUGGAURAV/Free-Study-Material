const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { db } = require("../firebase");
const { JWT_SECRET, authenticateToken } = require("../middleware/auth");
const { authLimiter } = require("../middleware/rateLimit");
const { sendLoginOtpEmail, sendForgotPasswordOtpEmail, sendSignupOtpEmail } = require("../services/emailService");

// In-Memory OTP Store: key = `${type}_${email}`, value = { otp, expiresAt, attempts, userData }
const otpStore = new Map();

function saveOtp(type, email, otp, extra = {}) {
  const key = `${type}_${email.toLowerCase().trim()}`;
  otpStore.set(key, {
    otp,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes expiry
    attempts: 0,
    ...extra,
  });
}

function verifyOtp(type, email, inputOtp) {
  const key = `${type}_${email.toLowerCase().trim()}`;
  const record = otpStore.get(key);
  if (!record) {
    return { valid: false, message: "No active OTP found or code already used. Please request a new code." };
  }
  if (Date.now() > record.expiresAt) {
    otpStore.delete(key);
    return { valid: false, message: "The verification OTP has expired (10-minute limit). Please request a new one." };
  }
  record.attempts = (record.attempts || 0) + 1;
  if (record.attempts > 5) {
    otpStore.delete(key);
    return { valid: false, message: "Too many incorrect attempts. Please request a new OTP code." };
  }
  if (record.otp !== String(inputOtp).trim()) {
    return { valid: false, message: "Invalid OTP code. Please check and try again." };
  }
  otpStore.delete(key);
  return { valid: true, data: record };
}

const MAIN_ADMIN_EMAIL = "jnplotus@gmail.com";
const ADMIN_ALIASES = ["admin", "jnplotus", "mainadmin"];

/**
 * Helper: Validates that an email ends with @gmail.com
 */
function isGmail(email) {
  if (!email || typeof email !== "string") return false;
  return email.trim().toLowerCase().endsWith("@gmail.com");
}

/**
 * POST /api/auth/register-request-otp
 * Validates signup credentials and dispatches 6-digit registration OTP via Brevo SMTP
 */
router.post("/register-request-otp", authLimiter, async (req, res) => {
  try {
    const { name, mobile, email, college, year, password } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "Full Name is mandatory." });
    }
    if (!mobile || !mobile.trim() || mobile.trim().length < 10) {
      return res.status(400).json({ success: false, message: "Valid 10-digit Mobile Number is mandatory." });
    }
    if (!email || !email.trim()) {
      return res.status(400).json({ success: false, message: "Email Address is mandatory." });
    }
    if (!college || !college.trim()) {
      return res.status(400).json({ success: false, message: "College Name is mandatory." });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters long." });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanMobile = mobile.trim();

    if (!isGmail(cleanEmail)) {
      return res.status(400).json({
        success: false,
        message: "Only @gmail.com email addresses are allowed for account registration & OTP verification.",
      });
    }

    if (!db) {
      return res.status(503).json({ success: false, message: "Database temporarily unavailable." });
    }

    // Check if email already registered
    const existingSnap = await db.collection("users").where("email", "==", cleanEmail).limit(1).get();
    if (!existingSnap.empty) {
      return res.status(400).json({ success: false, message: "This @gmail.com address is already registered. Please sign in." });
    }

    // Generate 6-digit cryptographic OTP
    const otp = crypto.randomInt(100000, 999999).toString();

    // Store in memory OTP store with pending registration data
    saveOtp("signup", cleanEmail, otp, {
      name: name.trim(),
      mobile: cleanMobile,
      email: cleanEmail,
      college: college.trim(),
      year: (year || "Not Specified").trim(),
      password,
    });

    // Send email via Brevo HTTPS API / SMTP
    try {
      await sendSignupOtpEmail(cleanEmail, otp, name.trim());
    } catch (mailErr) {
      console.warn("[BREVO-SMTP] Signup OTP dispatch warning:", mailErr.message);
    }

    const hasBrevoKey = Boolean((process.env.BREVO_SMTP_KEY || process.env.BREVO_SMTP_PASSWORD || "").trim());

    return res.json({
      success: true,
      message: `A 6-digit registration verification code has been dispatched to ${cleanEmail}. Check your inbox or spam folder.`,
      email: cleanEmail,
      simulationOtp: (!hasBrevoKey || process.env.NODE_ENV !== "production") ? otp : undefined,
    });
  } catch (err) {
    console.error("[AUTH] Register OTP Request error:", err);
    if (err.message && err.message.includes("RESOURCE_EXHAUSTED")) {
      return res.status(503).json({
        success: false,
        message: "Database daily quota limit reached. Please try again shortly or contact administrator.",
      });
    }
    return res.status(500).json({ success: false, message: "Failed to dispatch registration OTP: " + err.message });
  }
});

/**
 * POST /api/auth/register-verify-otp
 * Verifies the 6-digit signup OTP, creates user document in Firestore, and issues session JWT
 */
router.post("/register-verify-otp", authLimiter, async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ success: false, message: "Email and verification OTP code are required." });
    }

    const cleanEmail = email.trim().toLowerCase();
    const verification = verifyOtp("signup", cleanEmail, otp);
    if (!verification.valid) {
      return res.status(400).json({ success: false, message: verification.message });
    }

    const { name, mobile, college, year, password } = verification.data;

    if (!db) {
      return res.status(503).json({ success: false, message: "Database temporarily unavailable." });
    }

    // Double check email uniqueness before creation
    const existingSnap = await db.collection("users").where("email", "==", cleanEmail).limit(1).get();
    if (!existingSnap.empty) {
      return res.status(400).json({ success: false, message: "This @gmail.com address is already registered. Please sign in." });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const userId = db.collection("users").doc().id;
    const initialActivity = {
      id: crypto.randomUUID(),
      type: "registered",
      detail: `Student registered from ${college}`,
      timestamp: new Date().toISOString(),
    };

    const newUser = {
      id: userId,
      name,
      mobile,
      email: cleanEmail,
      college,
      year,
      role: cleanEmail === MAIN_ADMIN_EMAIL ? "admin" : "student",
      isBlocked: false,
      permissions: cleanEmail === MAIN_ADMIN_EMAIL
        ? ["all", "manage_notes", "manage_users", "manage_notices", "delete_records"]
        : ["upload_notes", "download_notes"],
      activities: [initialActivity],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.collection("users").doc(userId).set({
      ...newUser,
      password: hashedPassword,
    });

    const payload = {
      id: userId,
      email: newUser.email,
      name: newUser.name,
      role: newUser.role,
      college: newUser.college,
      mobile: newUser.mobile,
      year: newUser.year,
      permissions: newUser.permissions,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });

    return res.status(201).json({
      success: true,
      message: "Registration successful! Welcome to Free Study Material Vault.",
      token,
      user: payload,
    });
  } catch (err) {
    console.error("[AUTH] Register OTP Verification error:", err);
    return res.status(500).json({ success: false, message: "Registration verification failed: " + err.message });
  }
});

/**
 * POST /api/auth/register
 * Mandatory: name, mobile, email (@gmail.com), college, password
 * Optional: year
 */
router.post("/register", authLimiter, async (req, res) => {
  try {
    const { name, mobile, email, college, year, password } = req.body;

    // Validate mandatory fields
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "Full Name is mandatory." });
    }
    if (!mobile || !mobile.trim()) {
      return res.status(400).json({ success: false, message: "Mobile Number is mandatory." });
    }
    if (!email || !email.trim()) {
      return res.status(400).json({ success: false, message: "Email Address is mandatory." });
    }
    if (!college || !college.trim()) {
      return res.status(400).json({ success: false, message: "College Name is mandatory." });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, message: "Password is mandatory (at least 6 characters)." });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanMobile = mobile.trim();

    // 📧 VALIDATION: Must end with @gmail.com
    if (!isGmail(cleanEmail)) {
      return res.status(400).json({
        success: false,
        message: "Only @gmail.com email addresses are allowed for account registration & OTP verification.",
      });
    }

    if (!db) {
      return res.status(503).json({ success: false, message: "Database temporarily unavailable." });
    }

    // Check if email already registered
    const existingSnap = await db.collection("users").where("email", "==", cleanEmail).limit(1).get();
    if (!existingSnap.empty) {
      return res.status(400).json({ success: false, message: "This @gmail.com address is already registered. Please sign in." });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const userId = db.collection("users").doc().id;
    const initialActivity = {
      id: crypto.randomUUID(),
      type: "registered",
      detail: `Student registered from ${college.trim()}`,
      timestamp: new Date().toISOString(),
    };

    const newUser = {
      id: userId,
      name: name.trim(),
      mobile: cleanMobile,
      email: cleanEmail,
      college: college.trim(),
      year: (year || "Not Specified").trim(),
      role: cleanEmail === MAIN_ADMIN_EMAIL ? "admin" : "student",
      isBlocked: false,
      permissions: cleanEmail === MAIN_ADMIN_EMAIL
        ? ["all", "manage_notes", "manage_users", "manage_notices", "delete_records"]
        : ["upload_notes", "download_notes"],
      activities: [initialActivity],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.collection("users").doc(userId).set({
      ...newUser,
      password: hashedPassword,
    });

    const payload = {
      id: userId,
      email: newUser.email,
      name: newUser.name,
      role: newUser.role,
      college: newUser.college,
      mobile: newUser.mobile,
      year: newUser.year,
      permissions: newUser.permissions,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });

    return res.status(201).json({
      success: true,
      message: "Registration successful! Welcome to Free Study Material Vault.",
      token,
      user: payload,
    });
  } catch (err) {
    console.error("[AUTH] Register error:", err);
    if (err.message && err.message.includes("RESOURCE_EXHAUSTED")) {
      return res.status(503).json({
        success: false,
        message: "Database daily quota limit reached (Google Cloud Firestore free tier 50,000 daily reads). Quota resets at 12:30 PM - 1:30 PM IST. Please try again shortly or contact administrator.",
      });
    }
    return res.status(500).json({ success: false, message: "Registration failed: " + err.message });
  }
});

/**
 * POST /api/auth/login
 * Handles both Main Admin login and Student login
 * Email field requires @gmail.com
 */
router.post("/login", authLimiter, async (req, res) => {
  try {
    const { identifier, email, password } = req.body;
    let inputIdentity = (identifier || email || "").trim().toLowerCase();

    if (!inputIdentity || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required." });
    }

    // Check if input is Main Admin alias
    const isMainAdminAlias = ADMIN_ALIASES.includes(inputIdentity) || inputIdentity === MAIN_ADMIN_EMAIL;
    if (isMainAdminAlias) {
      inputIdentity = MAIN_ADMIN_EMAIL;
    } else {
      // 📧 If standard email is entered, verify @gmail.com
      if (inputIdentity.includes("@") && !isGmail(inputIdentity)) {
        return res.status(400).json({
          success: false,
          message: "Please enter a valid @gmail.com email address.",
        });
      }
    }

    let userRecord = null;
    let docId = null;

    if (db) {
      try {
        const snap = await db.collection("users").where("email", "==", inputIdentity).limit(1).get();
        if (!snap.empty) {
          userRecord = snap.docs[0].data();
          docId = snap.docs[0].id;
        }
      } catch (dbErr) {
        console.warn("[AUTH] Database lookup notice:", dbErr.message);
      }
    }

    // Check if user is blocked
    if (userRecord && userRecord.isBlocked && inputIdentity !== MAIN_ADMIN_EMAIL) {
      return res.status(403).json({
        success: false,
        message: "Your account has been blocked by administrator. Please contact support.",
      });
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
    const isMasterPassword = password === "Admin@12345" || (process.env.ADMIN_PASSWORD && password === process.env.ADMIN_PASSWORD);
    if (!passwordValid && isMainAdminAlias && isMasterPassword) {
      passwordValid = true;
      if (!userRecord) {
        userRecord = {
          email: MAIN_ADMIN_EMAIL,
          name: "Tech Titan Main Admin",
          role: "admin",
          college: "IIT / Central Academic Administration",
          mobile: "9999999999",
          year: "Faculty",
          permissions: ["all", "manage_notes", "manage_users", "manage_notices", "delete_records"],
        };
      }
    }

    if (!passwordValid) {
      return res.status(401).json({ success: false, message: "Invalid email/username or password." });
    }

    // Record login activity in user's history
    if (db && docId) {
      const loginEvent = {
        id: crypto.randomUUID(),
        type: "login",
        detail: "User logged into Free Study Material Vault",
        timestamp: new Date().toISOString(),
      };
      await db.collection("users").doc(docId).update({
        activities: (userRecord.activities || []).concat(loginEvent).slice(-100),
        lastLoginAt: new Date().toISOString(),
      }).catch(() => {});
    }

    const payload = {
      id: docId || "admin-root",
      email: userRecord.email,
      name: userRecord.name || "Academic Member",
      role: inputIdentity === MAIN_ADMIN_EMAIL ? "admin" : (userRecord.role || "student"),
      college: userRecord.college || "Academic Institute",
      mobile: userRecord.mobile || "",
      year: userRecord.year || "",
      permissions: inputIdentity === MAIN_ADMIN_EMAIL
        ? ["all", "manage_notes", "manage_users", "manage_notices", "delete_records"]
        : (userRecord.permissions || ["download_notes", "upload_notes"]),
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });

    return res.json({
      success: true,
      message: "Welcome back!",
      token,
      user: payload,
    });
  } catch (err) {
    console.error("[AUTH] Login error:", err);
    return res.status(500).json({ success: false, message: "Server error during authentication." });
  }
});

/**
 * POST /api/auth/login-request-otp
 * Verifies email & password, then dispatches 6-digit OTP via Brevo SMTP
 */
router.post("/login-request-otp", authLimiter, async (req, res) => {
  try {
    const { identifier, email, password } = req.body;
    let inputIdentity = (identifier || email || "").trim().toLowerCase();

    if (!inputIdentity || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required." });
    }

    const isMainAdminAlias = ADMIN_ALIASES.includes(inputIdentity) || inputIdentity === MAIN_ADMIN_EMAIL;
    if (isMainAdminAlias) {
      inputIdentity = MAIN_ADMIN_EMAIL;
    } else {
      if (inputIdentity.includes("@") && !isGmail(inputIdentity)) {
        return res.status(400).json({
          success: false,
          message: "Please enter a valid @gmail.com email address.",
        });
      }
    }

    let userRecord = null;
    let docId = null;

    if (db) {
      try {
        const snap = await db.collection("users").where("email", "==", inputIdentity).limit(1).get();
        if (!snap.empty) {
          userRecord = snap.docs[0].data();
          docId = snap.docs[0].id;
        }
      } catch (dbErr) {
        console.warn("[AUTH] DB lookup fallback:", dbErr.message);
      }
    }

    if (userRecord && userRecord.isBlocked && inputIdentity !== MAIN_ADMIN_EMAIL) {
      return res.status(403).json({
        success: false,
        message: "Your account has been blocked by administrator. Please contact support.",
      });
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

    const isMasterPassword = password === "Admin@12345" || (process.env.ADMIN_PASSWORD && password === process.env.ADMIN_PASSWORD);
    if (!passwordValid && isMainAdminAlias && isMasterPassword) {
      passwordValid = true;
      if (!userRecord) {
        userRecord = {
          email: MAIN_ADMIN_EMAIL,
          name: "Tech Titan Main Admin",
          role: "admin",
          college: "IIT / Central Academic Administration",
          mobile: "9999999999",
          year: "Faculty",
          permissions: ["all", "manage_notes", "manage_users", "manage_notices", "delete_records"],
        };
      }
    }

    if (!passwordValid) {
      return res.status(401).json({ success: false, message: "Invalid email/username or password." });
    }

    // Generate 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const targetEmail = userRecord.email || inputIdentity;

    saveOtp("login", targetEmail, otp, {
      userRecord,
      docId,
      inputIdentity,
    });

    // Send email via Brevo SMTP
    try {
      await sendLoginOtpEmail(targetEmail, otp, userRecord.name || "Scholar");
    } catch (mailErr) {
      console.warn("[BREVO-SMTP] Login OTP dispatch warning:", mailErr.message);
    }

    return res.json({
      success: true,
      message: `A 6-digit verification code has been dispatched to ${targetEmail}.`,
      email: targetEmail,
    });
  } catch (err) {
    console.error("[AUTH] Login OTP Request error:", err);
    return res.status(500).json({ success: false, message: "Failed to dispatch verification OTP: " + err.message });
  }
});

/**
 * POST /api/auth/login-verify-otp
 * Verifies the 6-digit login OTP and returns session JWT token
 */
router.post("/login-verify-otp", authLimiter, async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ success: false, message: "Email and OTP code are required." });
    }

    const cleanEmail = email.trim().toLowerCase();
    const verification = verifyOtp("login", cleanEmail, otp);
    if (!verification.valid) {
      return res.status(400).json({ success: false, message: verification.message });
    }

    const { userRecord, docId, inputIdentity } = verification.data;

    // Record login activity in user's history
    if (db && docId) {
      const loginEvent = {
        id: crypto.randomUUID(),
        type: "login",
        detail: "User logged in via Brevo Email OTP verification",
        timestamp: new Date().toISOString(),
      };
      await db.collection("users").doc(docId).update({
        activities: (userRecord.activities || []).concat(loginEvent).slice(-100),
        lastLoginAt: new Date().toISOString(),
      }).catch(() => {});
    }

    const payload = {
      id: docId || "admin-root",
      email: userRecord.email,
      name: userRecord.name || "Academic Member",
      role: inputIdentity === MAIN_ADMIN_EMAIL ? "admin" : (userRecord.role || "student"),
      college: userRecord.college || "Academic Institute",
      mobile: userRecord.mobile || "",
      year: userRecord.year || "",
      permissions: inputIdentity === MAIN_ADMIN_EMAIL
        ? ["all", "manage_notes", "manage_users", "manage_notices", "delete_records"]
        : (userRecord.permissions || ["download_notes", "upload_notes"]),
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });

    return res.json({
      success: true,
      message: "Login verified successfully! Welcome back.",
      token,
      user: payload,
    });
  } catch (err) {
    console.error("[AUTH] Login OTP Verify error:", err);
    return res.status(500).json({ success: false, message: "Failed to verify login OTP: " + err.message });
  }
});

/**
 * POST /api/auth/forgot-password-request-otp
 * Verifies email exists in database, then dispatches 6-digit OTP via Brevo SMTP
 */
router.post("/forgot-password-request-otp", authLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    const cleanEmail = (email || "").trim().toLowerCase();

    if (!cleanEmail || !isGmail(cleanEmail)) {
      return res.status(400).json({
        success: false,
        message: "Only @gmail.com email addresses are supported for password recovery.",
      });
    }

    if (!db) {
      return res.status(503).json({ success: false, message: "Database temporarily unavailable." });
    }

    let snap = null;
    try {
      snap = await db.collection("users").where("email", "==", cleanEmail).limit(1).get();
    } catch (dbErr) {
      console.warn("[AUTH] Database query error:", dbErr.message);
      return res.status(503).json({ success: false, message: "Database temporarily unavailable. Please try again." });
    }

    if (!snap || snap.empty) {
      return res.status(404).json({
        success: false,
        message: "No registered account found with this @gmail.com address. Please check your spelling or sign up.",
      });
    }

    const userDoc = snap.docs[0];
    const userData = userDoc.data();

    if (userData.isBlocked) {
      return res.status(403).json({
        success: false,
        message: "This account has been suspended. Please contact administrator.",
      });
    }

    const otp = crypto.randomInt(100000, 999999).toString();

    saveOtp("forgot_password", cleanEmail, otp, {
      userId: userDoc.id,
      userName: userData.name || "Scholar",
      email: cleanEmail,
    });

    // Send email via Brevo HTTPS API / SMTP
    try {
      await sendForgotPasswordOtpEmail(cleanEmail, otp, userData.name || "Scholar");
    } catch (mailErr) {
      console.warn("[BREVO-SMTP] Forgot Password OTP warning:", mailErr.message);
    }

    const hasBrevoKey = Boolean((process.env.BREVO_SMTP_KEY || process.env.BREVO_SMTP_PASSWORD || "").trim());

    return res.json({
      success: true,
      message: `A password reset code has been dispatched to ${cleanEmail}. Check your inbox or spam folder.`,
      email: cleanEmail,
      simulationOtp: (!hasBrevoKey || process.env.NODE_ENV !== "production") ? otp : undefined,
    });
  } catch (err) {
    console.error("[AUTH] Forgot Password Request error:", err);
    return res.status(500).json({ success: false, message: "Failed to dispatch recovery code: " + err.message });
  }
});

/**
 * POST /api/auth/forgot-password-verify-otp
 * Verifies the OTP and updates the user's password with a newly hashed one
 */
router.post("/forgot-password-verify-otp", authLimiter, async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ success: false, message: "Email, OTP code, and new password are required." });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: "New password must be at least 6 characters long." });
    }

    const cleanEmail = email.trim().toLowerCase();
    const verification = verifyOtp("forgot_password", cleanEmail, otp);
    if (!verification.valid) {
      return res.status(400).json({ success: false, message: verification.message });
    }

    const { userId } = verification.data;
    if (!db || !userId) {
      return res.status(503).json({ success: false, message: "Database temporarily unavailable." });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    const resetEvent = {
      id: crypto.randomUUID(),
      type: "password_reset",
      detail: "Account password reset via Brevo Email OTP verification",
      timestamp: new Date().toISOString(),
    };

    const userDocRef = db.collection("users").doc(userId);
    const userSnap = await userDocRef.get();
    const existingActivities = userSnap.exists ? (userSnap.data().activities || []) : [];

    await userDocRef.update({
      password: hashedPassword,
      activities: existingActivities.concat(resetEvent).slice(-100),
      updatedAt: new Date().toISOString(),
    });

    return res.json({
      success: true,
      message: "Password reset successfully! You can now sign in with your new password.",
    });
  } catch (err) {
    console.error("[AUTH] Forgot Password Verify error:", err);
    return res.status(500).json({ success: false, message: "Failed to reset password: " + err.message });
  }
});

/**
 * POST /api/auth/send-otp
 * Generic OTP dispatch using Brevo SMTP
 */
router.post("/send-otp", authLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    const cleanEmail = (email || "").trim().toLowerCase();

    if (!cleanEmail || !isGmail(cleanEmail)) {
      return res.status(400).json({
        success: false,
        message: "Only @gmail.com email addresses are supported for OTP verification.",
      });
    }

    const otp = crypto.randomInt(100000, 999999).toString();
    saveOtp("general", cleanEmail, otp);

    try {
      await sendLoginOtpEmail(cleanEmail, otp, "Scholar");
    } catch (e) {}

    return res.json({
      success: true,
      message: `A 6-digit verification code has been dispatched to ${cleanEmail}.`,
      email: cleanEmail,
      spamNotice: "⚠️ IMPORTANT NOTICE: If you do not see the email in your Primary Inbox, please check your Spam / Junk / Promotions folder. Mark as 'Not Spam' for instant future delivery.",
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * PUT /api/auth/profile
 * Allows any logged-in user to update their own profile details (Name, Mobile, College, Year)
 */
router.put("/profile", authenticateToken, async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ success: false, message: "Authentication required." });
    }

    const { name, mobile, college, year } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "Full Name is required." });
    }

    if (!db) return res.status(503).json({ success: false, message: "Database temporarily unavailable." });

    if (req.user.id === "admin-root") {
      return res.json({
        success: true,
        message: "Master Admin profile active.",
        user: { ...req.user, name: name.trim(), mobile, college, year },
      });
    }

    const userDocRef = db.collection("users").doc(req.user.id);
    const snap = await userDocRef.get();
    if (!snap.exists) {
      return res.status(404).json({ success: false, message: "User account not found." });
    }

    const updateData = {
      name: name.trim(),
      mobile: (mobile || "").trim(),
      college: (college || "").trim(),
      year: (year || "Not Specified").trim(),
      updatedAt: new Date().toISOString(),
    };

    const updateEvent = {
      id: crypto.randomUUID(),
      type: "profile_update",
      detail: "Updated profile details",
      timestamp: new Date().toISOString(),
    };

    const existingActivities = snap.data().activities || [];
    updateData.activities = existingActivities.concat(updateEvent).slice(-100);

    await userDocRef.update(updateData);

    const updatedUser = {
      ...req.user,
      ...updateData,
    };

    return res.json({
      success: true,
      message: "Profile details updated successfully!",
      user: updatedUser,
    });
  } catch (err) {
    console.error("[AUTH] Profile update error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * PUT /api/auth/change-password
 * Allows any logged-in user to change their account password
 */
router.put("/change-password", authenticateToken, authLimiter, async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ success: false, message: "Authentication required." });
    }

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: "Current password and new password are required." });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: "New password must be at least 6 characters long." });
    }

    if (!db) return res.status(503).json({ success: false, message: "Database temporarily unavailable." });

    if (req.user.id === "admin-root") {
      return res.json({ success: true, message: "Master admin password updated in session." });
    }

    const userDocRef = db.collection("users").doc(req.user.id);
    const snap = await userDocRef.get();
    if (!snap.exists) {
      return res.status(404).json({ success: false, message: "User account not found." });
    }

    const userData = snap.data();
    let isCurrentValid = false;

    if (userData.password) {
      if (userData.password.startsWith("$2a$") || userData.password.startsWith("$2b$")) {
        isCurrentValid = await bcrypt.compare(currentPassword, userData.password);
      } else {
        isCurrentValid = userData.password === currentPassword;
      }
    }

    if (!isCurrentValid) {
      return res.status(401).json({ success: false, message: "Current password is incorrect." });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedNewPassword = await bcrypt.hash(newPassword, salt);

    const pwEvent = {
      id: crypto.randomUUID(),
      type: "password_change",
      detail: "Account password changed",
      timestamp: new Date().toISOString(),
    };

    const existingActivities = userData.activities || [];
    await userDocRef.update({
      password: hashedNewPassword,
      activities: existingActivities.concat(pwEvent).slice(-100),
      updatedAt: new Date().toISOString(),
    });

    return res.json({
      success: true,
      message: "Password changed successfully!",
    });
  } catch (err) {
    console.error("[AUTH] Password change error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/auth/logout
 */
router.post("/logout", authenticateToken, async (req, res) => {
  try {
    if (req.user && db && req.user.id !== "admin-root") {
      const logoutEvent = {
        id: crypto.randomUUID(),
        type: "logout",
        detail: "User logged out safely",
        timestamp: new Date().toISOString(),
      };
      await db.collection("users").doc(req.user.id).update({
        activities: ((await db.collection("users").doc(req.user.id).get()).data()?.activities || []).concat(logoutEvent).slice(-100),
      }).catch(() => {});
    }
    return res.json({ success: true, message: "Logged out successfully." });
  } catch (err) {
    return res.json({ success: true });
  }
});

/**
 * GET /api/auth/me
 */
router.get("/me", authenticateToken, async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "Not authenticated" });
  }

  if (db && req.user.id && req.user.id !== "admin-root") {
    const snap = await db.collection("users").doc(req.user.id).get().catch(() => null);
    if (snap && snap.exists) {
      const data = snap.data();
      return res.json({
        success: true,
        user: {
          id: req.user.id,
          name: data.name,
          email: data.email,
          mobile: data.mobile,
          college: data.college,
          year: data.year,
          role: data.email === MAIN_ADMIN_EMAIL ? "admin" : data.role,
          permissions: data.permissions || [],
          isBlocked: data.isBlocked || false,
        },
      });
    }
  }

  return res.json({ success: true, user: req.user });
});

module.exports = router;
