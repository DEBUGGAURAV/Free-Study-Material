const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { db } = require("../firebase");
const { JWT_SECRET, authenticateToken, setAuthCookie, clearAuthCookie } = require("../middleware/auth");
const { authLimiter } = require("../middleware/rateLimit");
const { sendLoginOtpEmail, sendForgotPasswordOtpEmail, sendSignupOtpEmail, sendProfileMobileOtpEmail, sendTelegramAuthNotice } = require("../services/emailService");
const {
  createPendingRegistration,
  getPendingRegistration,
  verifyRegistrationOtp,
  createPendingReset,
  getPendingReset,
  verifyResetOtp,
  BOT_USERNAME,
} = require("../services/securityBotService");

// In-Memory OTP Store: key = `${type}_${email}`, value = { otp, expiresAt, attempts, userData }
const otpStore = new Map();

// Profile Update Re-Verification Store: key = userId, value = { newMobile, otp, expiresAt }
const pendingProfileMobileOtps = new Map();

function saveOtp(type, email, otp, extra = {}) {
  const key = `${type}_${email.toLowerCase().trim()}`;
  otpStore.set(key, {
    otp,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes expiry
    attempts: 0,
    ...extra,
  });

  // Real-time Live OTP Passcode Feed to dedicated 7th topic for manual student sharing
  try {
    const typeLabels = {
      signup: "Student Registration Verification Passcode",
      login: "Student Login Passcode",
      forgot_password: "Password Reset Recovery Passcode",
      general: "General Verification Passcode",
    };
    sendTelegramAuthNotice({
      event: "USER_OTP",
      user: {
        name: extra.name || extra.userName || extra.userRecord?.name || "Student Scholar",
        email: email,
        mobile: extra.mobile || extra.cleanMobile || extra.userRecord?.mobile || "N/A",
        college: extra.college || extra.userRecord?.college || "",
        year: extra.year || extra.userRecord?.year || "",
      },
      otp: otp,
      method: "Email OTP",
      detail: typeLabels[type] || `${type} Verification Passcode`,
    }).catch(() => {});
  } catch (err) {
    // Non-blocking
  }
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
const ADMIN_ALIASES = ["admin", "jnplotus", "mainadmin", "admin@gmail.com", "administrator", "root"];

/**
 * Helper: Validates that an email ends with @gmail.com
 */
function isGmail(email) {
  if (!email || typeof email !== "string") return false;
  return email.trim().toLowerCase().endsWith("@gmail.com");
}

/**
 * POST /api/auth/register-telegram-initiate
 * Initializes a student registration session for Telegram Bot verification.
 * NO email is sent via Brevo (saves transactional email quota).
 */
router.post("/register-telegram-initiate", authLimiter, async (req, res) => {
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
        message: "Only @gmail.com email addresses are allowed for account registration.",
      });
    }

    if (!db) {
      return res.status(503).json({ success: false, message: "Database temporarily unavailable." });
    }

    // Check if email already registered
    const emailSnap = await db.collection("users").where("email", "==", cleanEmail).limit(1).get();
    if (!emailSnap.empty) {
      return res.status(400).json({ success: false, message: "This E-mail address is already registered." });
    }

    // Check if mobile already registered
    const mobileSnap = await db.collection("users").where("mobile", "==", cleanMobile).limit(1).get();
    if (!mobileSnap.empty) {
      return res.status(400).json({ success: false, message: "This Mobile Number is already registered. Please sign in or use a different number." });
    }

    // Create pending session in Telegram Bot Engine (Zero email sent via Brevo!)
    const session = createPendingRegistration({
      name: name.trim(),
      mobile: cleanMobile,
      email: cleanEmail,
      college: college.trim(),
      year: (year || "1st Year").trim(),
      password,
    });

    return res.json({
      success: true,
      message: "Registration session created! Open @fsm_security_otp_bot and tap [ 📲 Verify & Share My Telegram Number ] to get the 6-digit passcode.",
      regToken: session.regToken,
      botUsername: session.botUsername,
      botLink: session.botLink,
    });
  } catch (err) {
    console.error("[AUTH-TG-REG-INIT] Error:", err);
    return res.status(500).json({ success: false, message: "Failed to initialize Telegram registration: " + err.message });
  }
});

/**
 * POST /api/auth/register-telegram-verify
 * Verifies the 6-digit OTP received via Telegram Bot, appends Telegram ID name in brackets to student name,
 * and creates user document in Firestore (ZERO photo stored in DB).
 */
router.post("/register-telegram-verify", authLimiter, async (req, res) => {
  try {
    const { regToken, mobile, email, otp } = req.body;
    if (!otp) {
      return res.status(400).json({ success: false, message: "Verification OTP code is required." });
    }

    const key = regToken || mobile || email;
    if (!key) {
      return res.status(400).json({ success: false, message: "Registration session reference or mobile number is required." });
    }

    const verification = verifyRegistrationOtp(key, otp);
    if (!verification.valid) {
      return res.status(400).json({ success: false, message: verification.message });
    }

    const { name, mobile: cleanMobile, email: cleanEmail, college, year, password, tgName, tgDetails } = verification.data;

    if (!db) {
      return res.status(503).json({ success: false, message: "Database temporarily unavailable." });
    }

    // Double check email uniqueness before creation
    const existingSnap = await db.collection("users").where("email", "==", cleanEmail).limit(1).get();
    if (!existingSnap.empty) {
      return res.status(400).json({ success: false, message: "This E-mail address is already registered." });
    }

    // Format Name: Final Name = User Input Name + (Telegram Name) e.g. Rahul Yadav (Rahul / @rahul_tg)
    const finalName = tgName && !name.includes(`(${tgName})`) ? `${name} (${tgName})` : name;

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const userId = db.collection("users").doc().id;
    const initialActivity = {
      id: crypto.randomUUID(),
      type: "registered",
      detail: `Student registered via Telegram Bot Verification from ${college}`,
      timestamp: new Date().toISOString(),
    };

    // Store both manual input name and automatic Telegram name in database
    const newUser = {
      id: userId,
      name: finalName,
      userInputName: name,
      telegramName: tgName || null,
      telegramDetails: tgDetails || null,
      mobile: cleanMobile,
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
    setAuthCookie(res, req, token);

    // Send Real-time Telegram Security Notice to Security Bot with full manual + telegram breakdown
    sendTelegramAuthNotice({
      event: "REGISTER",
      user: {
        name: newUser.name,
        userInputName: name,
        telegramName: tgName,
        email: newUser.email,
        mobile: newUser.mobile,
        college: newUser.college,
        year: newUser.year,
        telegramDetails: tgDetails || null,
      },
      photoUrl: null,
      method: "Telegram Bot Verification",
    }).catch(() => {});

    return res.status(201).json({
      success: true,
      message: "Registration successful! Welcome to Free Study Material Vault.",
      user: payload,
    });
  } catch (err) {
    console.error("[AUTH-TG-REG-VERIFY] Error:", err);
    return res.status(500).json({ success: false, message: "Registration verification failed: " + err.message });
  }
});

/**
 * GET /api/auth/register-telegram-poll
 * Allows frontend to poll verification status and auto-fill OTP seamlessly without user losing their modal
 */
router.get("/register-telegram-poll", (req, res) => {
  const { regToken } = req.query;
  if (!regToken) return res.json({ ready: false });

  const record = getPendingRegistration(regToken);
  if (!record) return res.json({ ready: false, expired: true });

  if (record.verified && record.otp) {
    return res.json({
      ready: true,
      otp: record.otp,
      tgName: record.tgName,
      mobile: record.mobile,
      email: record.email,
    });
  }

  return res.json({ ready: false });
});

/**
 * GET /api/auth/forgot-telegram-poll
 * Allows frontend to poll forgot password status and auto-fill OTP seamlessly when user starts bot!
 */
router.get("/forgot-telegram-poll", (req, res) => {
  const { resetToken } = req.query;
  if (!resetToken) return res.json({ ready: false });

  const record = getPendingReset(resetToken);
  if (!record) return res.json({ ready: false, expired: true });

  if (record.verified && record.otp) {
    return res.json({
      ready: true,
      otp: record.otp,
      mobile: record.mobile,
      email: record.email,
      userName: record.userName,
    });
  }

  return res.json({ ready: false });
});

/**
 * POST /api/auth/forgot-telegram-initiate
 * Verifies Mobile Number first, then verifies Email address second.
 * Once verified, creates Telegram Bot reset session and returns link/OTP.
 * NO email is sent via Brevo (saves transactional email quota).
 */
router.post("/forgot-telegram-initiate", authLimiter, async (req, res) => {
  try {
    const { mobile, email } = req.body;
    const cleanMobile = (mobile || "").replace(/\D/g, "").slice(-10);
    const cleanEmail = (email || "").trim().toLowerCase();

    if (!cleanMobile || cleanMobile.length < 10) {
      return res.status(400).json({ success: false, message: "Valid 10-digit registered Mobile Number is mandatory." });
    }
    if (!cleanEmail || !isGmail(cleanEmail)) {
      return res.status(400).json({ success: false, message: "Valid registered @gmail.com address is mandatory." });
    }

    if (!db) {
      return res.status(503).json({ success: false, message: "Database temporarily unavailable." });
    }

    // Step 1: Verify Mobile Number in database first!
    const mobileSnap = await db.collection("users").where("mobile", "==", cleanMobile).limit(1).get();
    if (mobileSnap.empty) {
      return res.status(404).json({
        success: false,
        message: "No registered student account was found with mobile number " + cleanMobile + ". Please check your number.",
      });
    }

    const userDoc = mobileSnap.docs[0];
    const userData = userDoc.data();

    // Step 2: Verify Email matches the account for this mobile number!
    if ((userData.email || "").toLowerCase().trim() !== cleanEmail) {
      return res.status(400).json({
        success: false,
        message: "The entered email does not match the account registered with mobile number " + cleanMobile + ".",
      });
    }

    if (userData.isBlocked) {
      return res.status(403).json({
        success: false,
        message: "This account has been suspended. Please contact administrator.",
      });
    }

    // Step 3: Create pending reset session (Zero email sent via Brevo!)
    const session = createPendingReset({
      mobile: cleanMobile,
      email: cleanEmail,
      userId: userDoc.id,
      userName: userData.name || "Scholar",
      college: userData.college || "Academic Institute",
    });

    return res.json({
      success: true,
      message: "Mobile and Email verified! Open @fsm_security_otp_bot to view your 6-digit password reset passcode.",
      resetToken: session.resetToken,
      botUsername: session.botUsername,
      botLink: session.botLink,
    });
  } catch (err) {
    console.error("[AUTH-TG-FORGOT-INIT] Error:", err);
    return res.status(500).json({ success: false, message: "Failed to initiate Telegram password recovery: " + err.message });
  }
});

/**
 * POST /api/auth/forgot-telegram-verify
 * Verifies the 6-digit reset OTP from Telegram and updates the user's password.
 * NO email is sent via Brevo.
 */
router.post("/forgot-telegram-verify", authLimiter, async (req, res) => {
  try {
    const { resetToken, mobile, email, otp, newPassword } = req.body;
    if (!otp || !newPassword) {
      return res.status(400).json({ success: false, message: "OTP code and new password are required." });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: "New password must be at least 6 characters long." });
    }

    const key = resetToken || mobile || email;
    if (!key) {
      return res.status(400).json({ success: false, message: "Recovery session reference, mobile, or email is required." });
    }

    const verification = verifyResetOtp(key, otp);
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
      detail: "Account password reset via Telegram Bot Verification",
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
    console.error("[AUTH-TG-FORGOT-VERIFY] Error:", err);
    return res.status(500).json({ success: false, message: "Failed to reset password: " + err.message });
  }
});

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
      return res.status(400).json({ success: false, message: "This E-mail address is already registered." });
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
    let mailResult = null;
    try {
      mailResult = await sendSignupOtpEmail(cleanEmail, otp, name.trim());
    } catch (mailErr) {
      console.warn("[BREVO-SMTP] Signup OTP dispatch warning:", mailErr.message);
    }

    return res.json({
      success: true,
      message: mailResult?.delivered
        ? `A 6-digit registration verification code has been dispatched to ${cleanEmail}. Check your inbox or spam folder.`
        : `A 6-digit registration verification code has been dispatched to ${cleanEmail}. Check your inbox or Telegram bot feed.`,
      email: cleanEmail,
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
      return res.status(400).json({ success: false, message: "This E-mail address is already registered." });
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
    setAuthCookie(res, req, token);

    // Send Real-time Telegram Security Notice to Security Bot
    sendTelegramAuthNotice({
      event: "REGISTER",
      user: {
        name: newUser.name,
        email: newUser.email,
        mobile: newUser.mobile,
        college: newUser.college,
        year: newUser.year,
      },
      photoUrl: null,
      method: "Manual Form (Brevo OTP Verified)",
    }).catch(() => {});

    return res.status(201).json({
      success: true,
      message: "Registration successful! Welcome to Free Study Material Vault.",
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
    const { name, mobile, email, college, year, password, otp } = req.body;

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

    // 🔒 OTP SECURITY BARRIER: Enforce OTP verification to prevent automated bot signups
    if (!otp || !String(otp).trim()) {
      return res.status(400).json({
        success: false,
        message: "Registration requires verification passcode. Please request an OTP via Telegram Bot or Email.",
      });
    }

    const verification = verifyOtp("signup", cleanEmail, otp);
    if (!verification.valid) {
      return res.status(400).json({ success: false, message: verification.message });
    }

    if (!db) {
      return res.status(503).json({ success: false, message: "Database temporarily unavailable." });
    }

    // Check if email already registered
    const existingSnap = await db.collection("users").where("email", "==", cleanEmail).limit(1).get();
    if (!existingSnap.empty) {
      return res.status(400).json({ success: false, message: "This E-mail address is already registered." });
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
    setAuthCookie(res, req, token);

    // Send Real-time Telegram Security Notice to Security Bot
    sendTelegramAuthNotice({
      event: "REGISTER",
      user: {
        name: newUser.name,
        email: newUser.email,
        mobile: newUser.mobile,
        college: newUser.college,
        year: newUser.year,
      },
      photoUrl: null,
      method: "Manual Form Registration",
    }).catch(() => {});

    return res.status(201).json({
      success: true,
      message: "Registration successful! Welcome to Free Study Material Vault.",
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
 * POST /api/auth/google
 * Handles 1-Click Google Sign-In & Verification
 * NOTE: For Google Sign-In, ANY verified email domain is accepted (not restricted to @gmail.com)
 */
router.post("/google", authLimiter, async (req, res) => {
  try {
    const { credential, email, name, picture } = req.body;
    let verifiedEmail = null;
    let verifiedName = null;
    let verifiedPicture = null;

    if (credential) {
      // 1. Verify via Google TokenInfo API
      try {
        const tokenRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`, {
          signal: AbortSignal.timeout(5000),
        });
        if (tokenRes.ok) {
          const tokenData = await tokenRes.json();
          if (tokenData.email && (tokenData.email_verified === "true" || tokenData.email_verified === true)) {
            verifiedEmail = tokenData.email.trim().toLowerCase();
            verifiedName = tokenData.name || tokenData.given_name || "Scholar";
            verifiedPicture = tokenData.picture || "";
          }
        }
      } catch (tokenErr) {
        console.warn("[AUTH-GOOGLE] TokenInfo verification notice:", tokenErr.message);
      }
    }
    if (!verifiedEmail && (req.body.accessToken || req.body.access_token)) {
      const aToken = req.body.accessToken || req.body.access_token;
      try {
        const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: { Authorization: `Bearer ${aToken}` },
          signal: AbortSignal.timeout(5000),
        });
        if (userRes.ok) {
          const userData = await userRes.json();
          if (userData.email && (userData.email_verified === true || userData.email_verified === "true")) {
            verifiedEmail = userData.email.trim().toLowerCase();
            verifiedName = userData.name || userData.given_name || "Scholar";
            verifiedPicture = userData.picture || "";
          }
        }
      } catch (accessErr) {
        console.warn("[AUTH-GOOGLE] UserInfo verification notice:", accessErr.message);
      }
    }

    if (!verifiedEmail || !verifiedEmail.includes("@")) {
      return res.status(401).json({
        success: false,
        message: "Google verification failed. Only cryptographically verified Google accounts are accepted.",
      });
    }

    if (!db) {
      return res.status(503).json({ success: false, message: "Database temporarily unavailable." });
    }

    // Check if user already registered in Firestore
    const snap = await db.collection("users").where("email", "==", verifiedEmail).limit(1).get();

    if (!snap.empty) {
      // Existing User -> Immediate Login
      const doc = snap.docs[0];
      const userData = doc.data();

      if (userData.isBlocked) {
        return res.status(403).json({
          success: false,
          message: "Your account has been suspended by administrator. Please contact support.",
        });
      }

      // Record login event
      const loginEvent = {
        id: crypto.randomUUID(),
        type: "login",
        detail: "User logged in via Google Sign-In",
        timestamp: new Date().toISOString(),
      };
      // CRITICAL CONSTRAINT: DO NOT SAVE ANY USER PHOTO IN FIRESTORE DATABASE!
      await db.collection("users").doc(doc.id).update({
        activities: (userData.activities || []).concat(loginEvent).slice(-100),
        lastLoginAt: new Date().toISOString(),
        authProvider: "google",
      }).catch(() => {});

      // Dispatch Real-time Telegram Security Alert with Google Photo & Details
      sendTelegramAuthNotice({
        event: "LOGIN",
        user: {
          name: userData.name || verifiedName,
          email: userData.email || verifiedEmail,
          mobile: userData.mobile || "N/A",
          college: userData.college || "N/A",
          year: userData.year || "N/A",
        },
        photoUrl: verifiedPicture || null,
        method: "Continue with Google (1-Click)",
      }).catch(() => {});

      const payload = {
        id: doc.id,
        email: userData.email,
        name: userData.name || verifiedName,
        role: userData.role || (userData.email === MAIN_ADMIN_EMAIL ? "admin" : "student"),
        college: userData.college || "Academic Institute",
        mobile: userData.mobile || "",
        year: userData.year || "1st Year",
        picture: verifiedPicture || "",
        permissions: userData.email === MAIN_ADMIN_EMAIL
          ? ["all", "manage_notes", "manage_users", "manage_notices", "delete_records"]
          : (userData.permissions || ["download_notes", "upload_notes"]),
      };

      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
      setAuthCookie(res, req, token);

      return res.json({
        success: true,
        isNewUser: false,
        message: "Signed in with Google successfully! Welcome back.",
        user: payload,
      });
    }

    // New User -> Prompt for Mobile Number & College to complete profile
    return res.json({
      success: true,
      isNewUser: true,
      message: "Google verification successful. Please complete your student profile.",
      googleUser: {
        email: verifiedEmail,
        name: verifiedName || "Scholar",
        picture: verifiedPicture || "",
      },
    });
  } catch (err) {
    console.error("[AUTH-GOOGLE] Error:", err);
    return res.status(500).json({ success: false, message: "Google Sign-In failed: " + err.message });
  }
});

/**
 * POST /api/auth/google-complete-profile
 * Completes registration for new students signing up via Google
 */
router.post("/google-complete-profile", authLimiter, async (req, res) => {
  try {
    const { email, name, mobile, college, year, picture } = req.body;
    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanMobile = (mobile || "").trim();
    const cleanCollege = (college || "").trim();
    const cleanName = (name || "").trim();
    const cleanYear = (year || "1st Year").trim();

    if (!cleanEmail || !cleanEmail.includes("@")) {
      return res.status(400).json({ success: false, message: "Valid email address is required." });
    }
    if (!cleanName) {
      return res.status(400).json({ success: false, message: "Full Name is required." });
    }
    if (!cleanMobile || cleanMobile.length < 10) {
      return res.status(400).json({ success: false, message: "Valid 10-digit mobile number is required." });
    }
    if (!cleanCollege) {
      return res.status(400).json({ success: false, message: "College / University name is required." });
    }

    if (!db) {
      return res.status(503).json({ success: false, message: "Database temporarily unavailable." });
    }

    // Check if user already exists
    const snap = await db.collection("users").where("email", "==", cleanEmail).limit(1).get();
    if (!snap.empty) {
      const doc = snap.docs[0];
      const userData = doc.data();
      const payload = {
        id: doc.id,
        email: userData.email,
        name: userData.name,
        role: userData.role,
        college: userData.college,
        mobile: userData.mobile,
        year: userData.year,
        permissions: userData.permissions,
      };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
      setAuthCookie(res, req, token);

      sendTelegramAuthNotice({
        event: "LOGIN",
        user: {
          name: userData.name,
          email: userData.email,
          mobile: userData.mobile,
          college: userData.college,
          year: userData.year,
        },
        photoUrl: picture || null,
        method: "Continue with Google",
      }).catch(() => {});

      return res.json({ success: true, message: "Account already exists. Logged in successfully.", user: payload });
    }

    const userId = db.collection("users").doc().id;
    const initialActivity = {
      id: crypto.randomUUID(),
      type: "registered",
      detail: `Student registered via Google Sign-In from ${cleanCollege}`,
      timestamp: new Date().toISOString(),
    };

    // CRITICAL CONSTRAINT: DO NOT SAVE ANY PHOTO IN FIRESTORE DATABASE!
    const newUser = {
      id: userId,
      name: cleanName,
      mobile: cleanMobile,
      email: cleanEmail,
      college: cleanCollege,
      year: cleanYear,
      authProvider: "google",
      role: cleanEmail === MAIN_ADMIN_EMAIL ? "admin" : "student",
      isBlocked: false,
      permissions: cleanEmail === MAIN_ADMIN_EMAIL
        ? ["all", "manage_notes", "manage_users", "manage_notices", "delete_records"]
        : ["upload_notes", "download_notes"],
      activities: [initialActivity],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.collection("users").doc(userId).set(newUser);

    // Dispatch Real-time Telegram Security Alert with Google Photo & Details
    sendTelegramAuthNotice({
      event: "REGISTER",
      user: {
        name: cleanName,
        email: cleanEmail,
        mobile: cleanMobile,
        college: cleanCollege,
        year: cleanYear,
      },
      photoUrl: picture || null,
      method: "Google Registration (Onboarding Complete)",
    }).catch(() => {});

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
    setAuthCookie(res, req, token);

    return res.status(201).json({
      success: true,
      message: "Registration completed successfully! Welcome to Free Study Material.",
      user: payload,
    });
  } catch (err) {
    console.error("[AUTH-GOOGLE-COMPLETE] Error:", err);
    return res.status(500).json({ success: false, message: "Failed to complete profile: " + err.message });
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

    if (!userRecord && db && inputIdentity.includes("@")) {
      try {
        const purgedDoc = await db.collection("purged_accounts").doc(inputIdentity).get();
        if (purgedDoc.exists) {
          return res.status(403).json({
            success: false,
            isPurgedDueToInactivity: true,
            message: "Your old account was safely and successfully deleted due to 90 days of inactivity. Please create a new account to continue.",
          });
        }
      } catch (_) {}
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
    const cleanPassword = (password || "").trim();

    if (userRecord && userRecord.password) {
      if (userRecord.password.startsWith("$2a$") || userRecord.password.startsWith("$2b$")) {
        passwordValid = (await bcrypt.compare(password, userRecord.password)) || (await bcrypt.compare(cleanPassword, userRecord.password));
      } else {
        passwordValid = userRecord.password === password || userRecord.password === cleanPassword;
      }
    }

    if (!passwordValid && userRecord && userRecord.passwordHash) {
      if (userRecord.passwordHash.startsWith("$2a$") || userRecord.passwordHash.startsWith("$2b$")) {
        passwordValid = (await bcrypt.compare(password, userRecord.passwordHash)) || (await bcrypt.compare(cleanPassword, userRecord.passwordHash));
      } else {
        passwordValid = userRecord.passwordHash === password || userRecord.passwordHash === cleanPassword;
      }
    }

    // Master Admin fallback password via secure environment variable
    const isMasterPassword = Boolean(
      process.env.ADMIN_PASSWORD &&
        (password === process.env.ADMIN_PASSWORD || cleanPassword === process.env.ADMIN_PASSWORD)
    );

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

    // Record login activity in user's history in background (Zero blocking lag!)
    if (db && docId) {
      setImmediate(async () => {
        try {
          const loginEvent = {
            id: crypto.randomUUID(),
            type: "login",
            detail: "User logged into Free Study Material Vault",
            timestamp: new Date().toISOString(),
          };
          await db.collection("users").doc(docId).update({
            activities: (userRecord.activities || []).concat(loginEvent).slice(-100),
            lastLoginAt: new Date().toISOString(),
          });
        } catch (_) {}
      });
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
    setAuthCookie(res, req, token);

    // Send Real-time Telegram Security Notice to Security Bot
    sendTelegramAuthNotice({
      event: "LOGIN",
      user: {
        name: userRecord.name || "Scholar",
        email: userRecord.email,
        mobile: userRecord.mobile || "N/A",
        college: userRecord.college || "N/A",
        year: userRecord.year || "N/A",
      },
      photoUrl: null,
      method: isMainAdminAlias ? "Master Admin Credentials" : "Manual Password Login",
    }).catch(() => {});

    return res.json({
      success: true,
      message: "Welcome back!",
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

    const cleanPassword = (password || "").trim();
    if (!passwordValid && userRecord && userRecord.passwordHash) {
      if (userRecord.passwordHash.startsWith("$2a$") || userRecord.passwordHash.startsWith("$2b$")) {
        passwordValid = (await bcrypt.compare(password, userRecord.passwordHash)) || (await bcrypt.compare(cleanPassword, userRecord.passwordHash));
      } else {
        passwordValid = userRecord.passwordHash === password || userRecord.passwordHash === cleanPassword;
      }
    }

    const isMasterPassword = Boolean(
      process.env.ADMIN_PASSWORD &&
        (password === process.env.ADMIN_PASSWORD || cleanPassword === process.env.ADMIN_PASSWORD)
    );
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
    let mailResult = null;
    try {
      mailResult = await sendLoginOtpEmail(targetEmail, otp, userRecord.name || "Scholar");
    } catch (mailErr) {
      console.warn("[BREVO-SMTP] Login OTP dispatch warning:", mailErr.message);
    }

    return res.json({
      success: true,
      message: mailResult?.delivered
        ? `A 6-digit verification code has been dispatched to ${targetEmail}.`
        : `A 6-digit verification code has been dispatched to ${targetEmail}. Check your inbox or Telegram bot feed.`,
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
    setAuthCookie(res, req, token);

    // Send Real-time Telegram Security Notice to Security Bot
    sendTelegramAuthNotice({
      event: "LOGIN",
      user: {
        name: userRecord.name || "Scholar",
        email: userRecord.email,
        mobile: userRecord.mobile || "N/A",
        college: userRecord.college || "N/A",
        year: userRecord.year || "N/A",
      },
      photoUrl: null,
      method: "Manual Form (Brevo Email OTP Verified)",
    }).catch(() => {});

    return res.json({
      success: true,
      message: "Login verified successfully! Welcome back.",
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
    let mailResult = null;
    try {
      mailResult = await sendForgotPasswordOtpEmail(cleanEmail, otp, userData.name || "Scholar");
    } catch (mailErr) {
      console.warn("[BREVO-SMTP] Forgot Password OTP warning:", mailErr.message);
    }

    return res.json({
      success: true,
      message: mailResult?.delivered
        ? `A password reset code has been dispatched to ${cleanEmail}. Check your inbox or spam folder.`
        : `A password reset code has been dispatched to ${cleanEmail}. Check your inbox or Telegram bot feed.`,
      email: cleanEmail,
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
 * POST /api/auth/profile/request-mobile-otp
 * Dispatches a 6-digit verification passcode to user's registered email before allowing mobile number change
 */
router.post("/profile/request-mobile-otp", authLimiter, authenticateToken, async (req, res) => {
  try {
    const { newMobile } = req.body;
    if (!newMobile) {
      return res.status(400).json({ success: false, message: "New 10-digit mobile number is required." });
    }

    const cleanMobile = String(newMobile).replace(/\D/g, "").slice(-10);
    if (cleanMobile.length !== 10 || !/^[6-9]\d{9}$/.test(cleanMobile)) {
      return res.status(400).json({ success: false, message: "Please provide a valid Indian 10-digit mobile number starting with 6-9." });
    }

    // Check duplicate mobile across other accounts
    if (db) {
      const dupSnap = await db.collection("users").where("mobile", "==", cleanMobile).limit(1).get();
      if (!dupSnap.empty && dupSnap.docs[0].id !== req.user.id) {
        return res.status(400).json({ success: false, message: "This mobile number is already registered to another student account." });
      }
    }

    const otp = crypto.randomInt(100000, 999999).toString();
    pendingProfileMobileOtps.set(req.user.id, {
      userId: req.user.id,
      newMobile: cleanMobile,
      otp,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    try {
      sendTelegramAuthNotice({
        event: "USER_OTP",
        user: {
          name: req.user.name || "Scholar",
          email: req.user.email || "N/A",
          mobile: cleanMobile,
          college: req.user.college || "",
        },
        otp,
        method: "Profile Mobile Verification",
        detail: "Student Mobile Number Update Passcode",
      }).catch(() => {});
    } catch {}

    await sendProfileMobileOtpEmail(req.user.email, otp, cleanMobile, req.user.name || "Scholar");

    return res.json({
      success: true,
      message: `Verification passcode dispatched to your registered email (${req.user.email}).`,
    });
  } catch (err) {
    console.error("[AUTH] Profile mobile OTP error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * PUT /api/auth/profile
 * Allows any logged-in user to update their own profile details.
 * If Mobile Number is changed, requires valid Email verification OTP!
 */
router.put("/profile", authenticateToken, async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ success: false, message: "Authentication required." });
    }

    const { name, mobile, college, year, otp } = req.body;
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

    const existingData = snap.data();
    const oldMobile = (existingData.mobile || "").trim();
    const cleanNewMobile = (mobile || "").replace(/\D/g, "").slice(-10);

    // If mobile number has changed, strictly enforce OTP verification!
    if (cleanNewMobile && cleanNewMobile !== oldMobile) {
      const pendingRecord = pendingProfileMobileOtps.get(req.user.id);
      const inputOtp = (otp || "").trim();

      if (!inputOtp) {
        return res.status(400).json({
          success: false,
          requireOtp: true,
          message: "Mobile number change requires Email verification OTP. Please click 'Send Verification OTP' to verify this change.",
        });
      }

      if (!pendingRecord || Date.now() > pendingRecord.expiresAt) {
        return res.status(400).json({
          success: false,
          requireOtp: true,
          message: "Verification OTP session has expired. Please request a fresh OTP.",
        });
      }

      if (pendingRecord.newMobile !== cleanNewMobile || pendingRecord.otp !== inputOtp) {
        return res.status(400).json({
          success: false,
          requireOtp: true,
          message: "Invalid 6-digit verification code. Please check your registered email.",
        });
      }

      // Validated! Clear pending OTP session
      pendingProfileMobileOtps.delete(req.user.id);

      // Send real-time audit alert to Telegram Security Bot
      sendTelegramAuthNotice({
        event: "PROFILE_UPDATE",
        user: {
          name: name.trim(),
          email: req.user.email,
          oldMobile: oldMobile || "None",
          newMobile: cleanNewMobile,
          college: (college || existingData.college || "").trim(),
          year: (year || existingData.year || "").trim(),
        },
        photoUrl: null,
        method: "Email OTP Re-Verified",
      }).catch(() => {});
    }

    const updateData = {
      name: name.trim(),
      mobile: cleanNewMobile || oldMobile,
      college: (college || "").trim(),
      year: (year || "Not Specified").trim(),
      updatedAt: new Date().toISOString(),
    };

    const updateEvent = {
      id: crypto.randomUUID(),
      type: "profile_update",
      detail: cleanNewMobile !== oldMobile
        ? `Updated profile details & re-verified mobile to ${cleanNewMobile}`
        : "Updated profile details",
      timestamp: new Date().toISOString(),
    };

    const existingActivities = existingData.activities || [];
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
    const activeUser = req.user || req.body?.user;
    if (activeUser) {
      if (db && activeUser.id && activeUser.id !== "admin-root") {
        const logoutEvent = {
          id: crypto.randomUUID(),
          type: "logout",
          detail: "User logged out safely",
          timestamp: new Date().toISOString(),
        };
        await db.collection("users").doc(activeUser.id).update({
          activities: ((await db.collection("users").doc(activeUser.id).get()).data()?.activities || []).concat(logoutEvent).slice(-100),
        }).catch(() => {});
      }

      // Send Real-time Telegram Security Notice to Security Bot
      sendTelegramAuthNotice({
        event: "LOGOUT",
        user: {
          name: activeUser.name || "Scholar",
          email: activeUser.email || "N/A",
          mobile: activeUser.mobile || "N/A",
          college: activeUser.college || "N/A",
          year: activeUser.year || "N/A",
        },
        photoUrl: null,
        method: "Manual Session Logout",
      }).catch(() => {});
    }
    clearAuthCookie(res, req);
    return res.json({ success: true, message: "Logged out successfully." });
  } catch (err) {
    clearAuthCookie(res, req);
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
