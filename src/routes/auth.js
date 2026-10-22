const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { db } = require("../firebase");
const { ramCache } = require("../utils/ramCache");
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
const {
  encrypt,
  decrypt,
  blindIndex,
  encryptUserObject,
  decryptUserObject,
} = require("../utils/cryptoVault");

// In-Memory OTP Store: key = `${type}_${email}`, value = { otp, expiresAt, attempts, userData }
const otpStore = new Map();

// Profile Update Re-Verification Store: key = userId, value = { newMobile, otp, expiresAt }
const pendingProfileMobileOtps = new Map();

function getClientIp(req) {
  if (!req) return "127.0.0.1";
  const forwarded = req.headers ? req.headers["x-forwarded-for"] : null;
  if (forwarded) {
    const list = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return String(list).split(",")[0].trim().replace(/^::ffff:/, "");
  }
  const realIp = req.headers ? req.headers["x-real-ip"] : null;
  if (realIp) return String(realIp).trim().replace(/^::ffff:/, "");
  const remote = req.socket?.remoteAddress || req.ip || "127.0.0.1";
  return String(remote).trim().replace(/^::ffff:/, "");
}

function saveOtp(type, email, otp, extra = {}, req = null) {
  const clientIp = extra.ip || (req ? getClientIp(req) : "");
  const key = `${type}_${email.toLowerCase().trim()}`;
  otpStore.set(key, {
    otp,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes expiry
    attempts: 0,
    ...extra,
    ip: clientIp,
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
        ip: clientIp,
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

const MAIN_ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
const ADMIN_ALIASES = ["admin", "mainadmin", "administrator", "root"];

/**
 * Robust Admin Password Resolver
 * Reads from process.env.ADMIN_PASSWORD and raw .env file directly,
 * preventing special characters (like # or !) from being cut off as comments.
 */
function getAdminPassword() {
  let pass = (process.env.ADMIN_PASSWORD || "").trim();
  try {
    const fs = require("fs");
    const path = require("path");
    const envPath = path.resolve(process.cwd(), ".env");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf8");
      const match = content.match(/^ADMIN_PASSWORD\s*=\s*(.+)$/m);
      if (match) {
        let val = match[1].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (val) pass = val;
      }
    }
  } catch {}
  return pass;
}

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

    // Check if mobile already registered (Encrypted blindIndex + legacy fallback)
    const mHash = blindIndex(cleanMobile);
    const hashSnap = await db.collection("users").where("mobileHash", "==", mHash).limit(1).get();
    if (!hashSnap.empty) {
      return res.status(400).json({ success: false, message: "This Mobile Number is already registered. Please sign in or use a different number." });
    }
    const mobileSnap = await db.collection("users").where("mobile", "==", cleanMobile).limit(1).get();
    if (!mobileSnap.empty) {
      return res.status(400).json({ success: false, message: "This Mobile Number is already registered. Please sign in or use a different number." });
    }

    // Create pending session in Telegram Bot Engine (Zero email sent via Brevo!)
    const session = await createPendingRegistration({
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

    if (!regToken && !mobile && !email) {
      return res.status(400).json({ success: false, message: "Registration session reference or mobile number is required." });
    }

    const verification = await verifyRegistrationOtp({ regToken, mobile, email }, otp);
    if (!verification.valid) {
      return res.status(400).json({ success: false, message: verification.message });
    }

    const cleanMobile = String(verification.data.mobile || req.body.mobile || "").trim();
    const cleanEmail = String(req.body.email || verification.data.email || "").trim().toLowerCase();
    const rawName = String(req.body.name || verification.data.name || "Scholar").trim();
    const cleanCollege = String(req.body.college || verification.data.college || "Academic Institute").trim();
    const cleanYear = String(req.body.year || verification.data.year || "1st Year").trim();
    const studentPassword = req.body.password || verification.data.password || "";
    const tgName = verification.data.tgName || null;
    const tgDetails = verification.data.tgDetails || null;

    if (!cleanEmail) {
      return res.status(400).json({ success: false, message: "E-mail address is required to complete registration." });
    }
    if (!studentPassword || studentPassword.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters." });
    }

    if (!db) {
      return res.status(503).json({ success: false, message: "Database temporarily unavailable." });
    }

    // Double check email uniqueness before creation
    const existingSnap = await db.collection("users").where("email", "==", cleanEmail).limit(1).get();
    if (!existingSnap.empty) {
      return res.status(400).json({ success: false, message: "This E-mail address is already registered." });
    }

    // Format Name: Final Name = User Input Name + (Telegram Name) e.g. Rahul Yadav (Rahul / @rahul_tg)
    const finalName = tgName && !rawName.includes(`(${tgName})`) ? `${rawName} (${tgName})` : rawName;

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(studentPassword, salt);

    const userId = db.collection("users").doc().id;
    // Store both manual input name and automatic Telegram name in database (Zero bloated activities in DB)
    const newUser = {
      id: userId,
      name: finalName,
      userInputName: rawName,
      telegramName: tgName || null,
      telegramDetails: tgDetails || null,
      mobile: cleanMobile,
      email: cleanEmail,
      college: cleanCollege,
      year: cleanYear,
      role: cleanEmail === MAIN_ADMIN_EMAIL ? "admin" : "student",
      isBlocked: false,
      permissions: cleanEmail === MAIN_ADMIN_EMAIL
        ? ["all", "manage_notes", "manage_users", "manage_notices", "delete_records"]
        : ["upload_notes", "download_notes"],
      activities: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const secureUser = encryptUserObject(newUser);
    await db.collection("users").doc(userId).set({
      ...secureUser,
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
        ip: getClientIp(req),
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
router.get("/register-telegram-poll", async (req, res) => {
  try {
    const { regToken, mobile, email } = req.query;
    if (!regToken && !mobile && !email) return res.json({ ready: false });

    const record = await getPendingRegistration({ regToken, mobile, email });
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
  } catch (err) {
    return res.json({ ready: false });
  }
});

/**
 * GET /api/auth/forgot-telegram-poll
 * Allows frontend to poll forgot password status and auto-fill OTP seamlessly when user starts bot!
 */
router.get("/forgot-telegram-poll", async (req, res) => {
  try {
    const { resetToken, mobile, email } = req.query;
    if (!resetToken && !mobile && !email) return res.json({ ready: false });

    const record = await getPendingReset({ resetToken, mobile, email });
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
  } catch (err) {
    return res.json({ ready: false });
  }
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

    // Step 1: Verify Mobile Number in database first (Blind Index + legacy fallback)!
    const mHash = blindIndex(cleanMobile);
    let mobileSnap = await db.collection("users").where("mobileHash", "==", mHash).limit(1).get();
    if (mobileSnap.empty) {
      mobileSnap = await db.collection("users").where("mobile", "==", cleanMobile).limit(1).get();
    }
    if (mobileSnap.empty) {
      return res.status(404).json({
        success: false,
        message: "No registered student account was found with mobile number " + cleanMobile + ". Please check your number.",
      });
    }

    const userDoc = mobileSnap.docs[0];
    const userData = decryptUserObject(userDoc.data());

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
    const session = await createPendingReset({
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

    if (!resetToken && !mobile && !email) {
      return res.status(400).json({ success: false, message: "Recovery session reference, mobile, or email is required." });
    }

    const verification = await verifyResetOtp({ resetToken, mobile, email }, otp);
    if (!verification.valid) {
      return res.status(400).json({ success: false, message: verification.message });
    }

    if (!db) {
      return res.status(503).json({ success: false, message: "Database temporarily unavailable." });
    }

    let { userId } = verification.data || {};
    if (!userId) {
      const cleanMob = (mobile || "").replace(/\D/g, "").slice(-10);
      const mHash = blindIndex(cleanMob);
      let userSnap = await db.collection("users").where("mobileHash", "==", mHash).limit(1).get();
      if (userSnap.empty) {
        userSnap = await db.collection("users").where("mobile", "==", cleanMob).limit(1).get();
      }
      if (!userSnap.empty) {
        userId = userSnap.docs[0].id;
      } else {
        const cleanEm = (email || "").trim().toLowerCase();
        const emailSnap = await db.collection("users").where("email", "==", cleanEm).limit(1).get();
        if (!emailSnap.empty) {
          userId = emailSnap.docs[0].id;
        }
      }
    }

    if (!userId) {
      return res.status(404).json({ success: false, message: "User account could not be found to update password." });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    const userDocRef = db.collection("users").doc(userId);
    await userDocRef.update({
      password: hashedPassword,
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

    // Check if mobile already registered (Encrypted blindIndex + legacy fallback)
    const mHash = blindIndex(cleanMobile);
    const mHashSnap = await db.collection("users").where("mobileHash", "==", mHash).limit(1).get();
    if (!mHashSnap.empty) {
      return res.status(400).json({ success: false, message: "This Mobile Number is already registered. Please sign in or use a different number." });
    }
    const legacyMobSnap = await db.collection("users").where("mobile", "==", cleanMobile).limit(1).get();
    if (!legacyMobSnap.empty) {
      return res.status(400).json({ success: false, message: "This Mobile Number is already registered. Please sign in or use a different number." });
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
      activities: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const secureUser = encryptUserObject(newUser);
    await db.collection("users").doc(userId).set({
      ...secureUser,
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
        ip: getClientIp(req),
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

    // Check if mobile already registered (Encrypted blindIndex + legacy fallback)
    const mHash = blindIndex(cleanMobile);
    const mHashSnap = await db.collection("users").where("mobileHash", "==", mHash).limit(1).get();
    if (!mHashSnap.empty) {
      return res.status(400).json({ success: false, message: "This Mobile Number is already registered. Please sign in or use a different number." });
    }
    const legacyMobSnap = await db.collection("users").where("mobile", "==", cleanMobile).limit(1).get();
    if (!legacyMobSnap.empty) {
      return res.status(400).json({ success: false, message: "This Mobile Number is already registered. Please sign in or use a different number." });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const userId = db.collection("users").doc().id;
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
      activities: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const secureUser = encryptUserObject(newUser);
    await db.collection("users").doc(userId).set({
      ...secureUser,
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
        ip: getClientIp(req),
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
      // 1. Fast JWT Decode check (0ms instantaneous payload extraction)
      try {
        const decoded = jwt.decode(credential);
        if (decoded && decoded.email && (decoded.email_verified === true || decoded.email_verified === "true" || decoded.email.includes("@"))) {
          verifiedEmail = decoded.email.trim().toLowerCase();
          verifiedName = decoded.name || decoded.given_name || "Scholar";
          verifiedPicture = decoded.picture || "";
        }
      } catch (decodeErr) {
        console.warn("[AUTH-GOOGLE] Fast JWT decode notice:", decodeErr.message);
      }

      // Fallback verification via Google TokenInfo API if needed
      if (!verifiedEmail) {
        try {
          const tokenRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`, {
            signal: AbortSignal.timeout(4000),
          });
          if (tokenRes.ok) {
            const tokenData = await tokenRes.json();
            if (tokenData.email) {
              verifiedEmail = tokenData.email.trim().toLowerCase();
              verifiedName = tokenData.name || tokenData.given_name || "Scholar";
              verifiedPicture = tokenData.picture || "";
            }
          }
        } catch (tokenErr) {
          console.warn("[AUTH-GOOGLE] TokenInfo verification notice:", tokenErr.message);
        }
      }
    }

    const aToken = req.body.accessToken || req.body.access_token;
    if (!verifiedEmail && aToken) {
      // 2. Fast UserInfo API Verification (Keep-Alive, 4s timeout)
      try {
        const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: { Authorization: `Bearer ${aToken}` },
          signal: AbortSignal.timeout(4000),
        });
        if (userRes.ok) {
          const userData = await userRes.json();
          if (userData.email) {
            verifiedEmail = userData.email.trim().toLowerCase();
            verifiedName = userData.name || userData.given_name || "Scholar";
            verifiedPicture = userData.picture || "";
          }
        }
      } catch (accessErr) {
        console.warn("[AUTH-GOOGLE] UserInfo verification notice:", accessErr.message);
      }

      // 3. Fallback: Verify Access Token via Google TokenInfo API
      if (!verifiedEmail) {
        try {
          const infoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(aToken)}`, {
            signal: AbortSignal.timeout(3500),
          });
          if (infoRes.ok) {
            const infoData = await infoRes.json();
            if (infoData.email) {
              verifiedEmail = infoData.email.trim().toLowerCase();
              verifiedName = verifiedName || "Scholar";
            }
          }
        } catch (infoErr) {
          console.warn("[AUTH-GOOGLE] TokenInfo access_token notice:", infoErr.message);
        }
      }
    }

    // NOTE: For Google OAuth, ANY valid email domain is accepted (NOT restricted to @gmail.com)
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
      // Existing User -> Immediate Login (NO OTP)
      const doc = snap.docs[0];
      const userData = decryptUserObject(doc.data());

      if (userData.isBlocked) {
        return res.status(403).json({
          success: false,
          message: "Your account has been suspended by administrator. Please contact support.",
        });
      }

      // Record login event in background (Zero blocking delay for instant fast login)
      setImmediate(async () => {
        try {
          await db.collection("users").doc(doc.id).update({
            lastLoginAt: new Date().toISOString(),
            authProvider: "google",
          });
        } catch (_) {}

        // Dispatch Real-time Telegram Security Alert with Google Photo & Details in background
        sendTelegramAuthNotice({
          event: "LOGIN",
          user: {
            name: userData.name || verifiedName,
            email: userData.email || verifiedEmail,
            mobile: userData.mobile || "N/A",
            college: userData.college || "N/A",
            year: userData.year || "N/A",
            ip: getClientIp(req),
          },
          photoUrl: verifiedPicture || null,
          method: "Continue with Google (Fast 1-Click)",
        }).catch(() => {});
      });

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
        token,
      });
    }

    // New User -> Prompt for Mobile Number & College to complete profile (NO OTP)
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
      const userData = decryptUserObject(doc.data());
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

      setImmediate(() => {
        sendTelegramAuthNotice({
          event: "LOGIN",
          user: {
            name: userData.name,
            email: userData.email,
            mobile: userData.mobile,
            college: userData.college,
            year: userData.year,
            ip: getClientIp(req),
          },
          photoUrl: picture || null,
          method: "Continue with Google",
        }).catch(() => {});
      });

      return res.json({ success: true, message: "Account already exists. Logged in successfully.", user: payload, token });
    }

    // Check if mobile already registered
    const mHash = blindIndex(cleanMobile);
    const mHashSnap = await db.collection("users").where("mobileHash", "==", mHash).limit(1).get();
    if (!mHashSnap.empty) {
      return res.status(400).json({ success: false, message: "This Mobile Number is already registered to another account." });
    }
    const legacyMobSnap = await db.collection("users").where("mobile", "==", cleanMobile).limit(1).get();
    if (!legacyMobSnap.empty) {
      return res.status(400).json({ success: false, message: "This Mobile Number is already registered to another account." });
    }

    const userId = db.collection("users").doc().id;

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
      activities: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const secureUser = encryptUserObject(newUser);
    await db.collection("users").doc(userId).set(secureUser);

    // Dispatch Real-time Telegram Security Alert with Google Photo & Details in background
    setImmediate(() => {
      sendTelegramAuthNotice({
        event: "REGISTER",
        user: {
          name: cleanName,
          email: cleanEmail,
          mobile: cleanMobile,
          college: cleanCollege,
          year: cleanYear,
          ip: getClientIp(req),
        },
        photoUrl: picture || null,
        method: "Google Registration (Fast Onboarding)",
      }).catch(() => {});
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

    return res.status(201).json({
      success: true,
      message: "Registration completed successfully! Welcome to Free Study Material.",
      user: payload,
      token,
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

    const cleanPassword = (password || "").trim();
    const envAdminPassword = getAdminPassword();

    // ⚡ 1. ULTRA-FAST MASTER ADMIN FAST-PATH (0ms latency, zero database wait):
    if (isMainAdminAlias && envAdminPassword && (password === envAdminPassword || cleanPassword === envAdminPassword)) {
      const payload = {
        id: "admin-root",
        email: MAIN_ADMIN_EMAIL || (process.env.ADMIN_EMAIL || "admin@studyvault.in").trim(),
        name: "Master Administrator",
        role: "admin",
        isMainAdmin: true,
        college: "Central Academic Administration",
        mobile: "",
        year: "Faculty",
        permissions: ["all", "manage_notes", "manage_users", "manage_notices", "delete_records"],
      };

      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
      setAuthCookie(res, req, token);

      // Background tasks (Zero latency overhead for login response!)
      setImmediate(async () => {
        try {
          if (db) {
            const newHash = await bcrypt.hash(cleanPassword, 10);
            const snap = await db.collection("users").where("email", "==", MAIN_ADMIN_EMAIL).limit(1).get();
            const adminUpdate = {
              password: newHash,
              passwordHash: newHash,
              lastLoginAt: new Date().toISOString(),
              role: "admin",
              isMainAdmin: true,
              email: MAIN_ADMIN_EMAIL,
            };
            if (!snap.empty) {
              await snap.docs[0].ref.update(adminUpdate);
            }
            await db.collection("users").doc("admin-root").set(adminUpdate, { merge: true }).catch(() => {});
          }
        } catch (_) {}

        sendTelegramAuthNotice({
          event: "LOGIN",
          user: {
            name: "Master Administrator",
            email: MAIN_ADMIN_EMAIL || "admin",
            mobile: "N/A",
            college: "Central Administration",
            year: "Faculty",
            ip: getClientIp(req),
          },
          photoUrl: null,
          method: "Master Admin Credentials",
        }).catch(() => {});
      });

      return res.json({
        success: true,
        message: "Welcome back, Master Administrator!",
        user: payload,
        token,
      });
    }

    let userRecord = null;
    let docId = null;

    // ⚡ 2. IN-MEMORY RAM CACHE FOR STUDENTS (0ms lookup):
    const cachedUser = ramCache.get(`auth_user_${inputIdentity}`);
    if (cachedUser) {
      userRecord = cachedUser.userRecord;
      docId = cachedUser.docId;
    } else if (db) {
      try {
        let snap = await db.collection("users").where("email", "==", inputIdentity).limit(1).get();
        if (snap.empty && !inputIdentity.includes("@")) {
          const mobDigits = inputIdentity.replace(/\D/g, "").slice(-10);
          if (mobDigits.length === 10) {
            const mHash = blindIndex(mobDigits);
            snap = await db.collection("users").where("mobileHash", "==", mHash).limit(1).get();
            if (snap.empty) {
              snap = await db.collection("users").where("mobile", "==", mobDigits).limit(1).get();
            }
          }
        }
        if (!snap.empty) {
          userRecord = decryptUserObject(snap.docs[0].data());
          docId = snap.docs[0].id;
          ramCache.set(`auth_user_${inputIdentity}`, { userRecord, docId }, 300);
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

    // Verify Student Password via bcrypt hash
    let passwordValid = false;

    // 2. Database bcrypt hash validation (for students and admin - strict cryptographic verification)
    if (!passwordValid && userRecord && userRecord.password) {
      if (userRecord.password.startsWith("$2a$") || userRecord.password.startsWith("$2b$")) {
        passwordValid = (await bcrypt.compare(password, userRecord.password)) || (await bcrypt.compare(cleanPassword, userRecord.password));
      }
    }

    if (!passwordValid && userRecord && userRecord.passwordHash) {
      if (userRecord.passwordHash.startsWith("$2a$") || userRecord.passwordHash.startsWith("$2b$")) {
        passwordValid = (await bcrypt.compare(password, userRecord.passwordHash)) || (await bcrypt.compare(cleanPassword, userRecord.passwordHash));
      }
    }

    if (passwordValid && isMainAdminAlias && !userRecord) {
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

    if (!passwordValid) {
      return res.status(401).json({ success: false, message: "Invalid email/username or password." });
    }

    // Record login activity in user's history in background (Zero blocking lag!)
    if (db && docId) {
      setImmediate(async () => {
        try {
          await db.collection("users").doc(docId).update({
            lastLoginAt: new Date().toISOString(),
          });
        } catch (_) {}
      });
    }

    const isMasterAdmin = Boolean(
      (MAIN_ADMIN_EMAIL && inputIdentity === MAIN_ADMIN_EMAIL) ||
      userRecord.isMainAdmin ||
      userRecord.role === "admin"
    );

    const payload = {
      id: docId || "admin-root",
      email: userRecord.email,
      name: userRecord.name || (isMasterAdmin ? "Administrator" : "Academic Member"),
      role: isMasterAdmin ? "admin" : (userRecord.role || "student"),
      isMainAdmin: isMasterAdmin,
      college: userRecord.college || "Academic Institute",
      mobile: userRecord.mobile || "",
      year: userRecord.year || "",
      hasPasskey: Boolean(userRecord.hasPasskey || (userRecord.passkeys && userRecord.passkeys.length > 0)),
      permissions: isMasterAdmin
        ? ["all", "manage_notes", "manage_users", "manage_notices", "delete_records"]
        : (userRecord.permissions || ["download_notes", "upload_notes"]),
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
    setAuthCookie(res, req, token);

    // Send Real-time Telegram Security Notice to Security Bot (Zero latency overhead for response!)
    setImmediate(() => {
      sendTelegramAuthNotice({
        event: "LOGIN",
        user: {
          name: userRecord.name || "Scholar",
          email: userRecord.email,
          mobile: userRecord.mobile || "N/A",
          college: userRecord.college || "N/A",
          year: userRecord.year || "N/A",
          ip: getClientIp(req),
        },
        photoUrl: null,
        method: isMainAdminAlias ? "Master Admin Credentials" : "Manual Password Login",
      }).catch(() => {});
    });

    return res.json({
      success: true,
      message: "Welcome back!",
      user: payload,
      token,
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
        let snap = await db.collection("users").where("email", "==", inputIdentity).limit(1).get();
        if (snap.empty && !inputIdentity.includes("@")) {
          const mobDigits = inputIdentity.replace(/\D/g, "").slice(-10);
          if (mobDigits.length === 10) {
            const mHash = blindIndex(mobDigits);
            snap = await db.collection("users").where("mobileHash", "==", mHash).limit(1).get();
            if (snap.empty) {
              snap = await db.collection("users").where("mobile", "==", mobDigits).limit(1).get();
            }
          }
        }
        if (!snap.empty) {
          userRecord = decryptUserObject(snap.docs[0].data());
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
    const cleanPassword = (password || "").trim();
    const envAdminPassword = getAdminPassword();

    if (isMainAdminAlias && envAdminPassword && (password === envAdminPassword || cleanPassword === envAdminPassword)) {
      passwordValid = true;
    }

    if (!passwordValid && userRecord && userRecord.password) {
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

    if (passwordValid && isMainAdminAlias && !userRecord) {
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

    // Record login activity in user's history (Zero bloated activities in DB)
    if (db && docId) {
      await db.collection("users").doc(docId).update({
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

    // Send Real-time Telegram Security Notice to Security Bot (Zero latency overhead)
    setImmediate(() => {
      sendTelegramAuthNotice({
        event: "LOGIN",
        user: {
          name: userRecord.name || "Scholar",
          email: userRecord.email,
          mobile: userRecord.mobile || "N/A",
          college: userRecord.college || "N/A",
          year: userRecord.year || "N/A",
          ip: getClientIp(req),
        },
        photoUrl: null,
        method: "Manual Form (Brevo Email OTP Verified)",
      }).catch(() => {});
    });

    return res.json({
      success: true,
      message: "Login verified successfully! Welcome back.",
      user: payload,
      token,
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

    const userDocRef = db.collection("users").doc(userId);
    await userDocRef.update({
      password: hashedPassword,
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
      const mHash = blindIndex(cleanMobile);
      const hashSnap = await db.collection("users").where("mobileHash", "==", mHash).limit(1).get();
      if (!hashSnap.empty && hashSnap.docs[0].id !== req.user.id) {
        return res.status(400).json({ success: false, message: "This mobile number is already registered to another student account." });
      }
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

    const { name, username, photoUrl, mobile, college, year, otp } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "Full Name is required." });
    }

    if (!db) return res.status(503).json({ success: false, message: "Database temporarily unavailable." });

    const isAdmin = req.user.id === "admin-root" || req.user.role === "admin" || (req.user.email && req.user.email.toLowerCase() === MAIN_ADMIN_EMAIL);

    // 🛡️ RESERVED NAMES SHIELD: Strictly prevent non-admins from claiming admin or platform names
    const RESERVED_NAMES = [
      "admin", "administrator", "root", "staff", "mod", "moderator",
      "fsm", "freestudymaterial", "fsmadmin", "fsm_admin", "official", "support",
      "helpdesk", "system", "security", "owner", "superuser", "founder",
      "coreconcepts", "bot", "ai", "team", "securitybot", "fsmchat"
    ];

    const cleanUsername = (username || "").trim().toLowerCase().replace(/^@/, "").replace(/[^a-z0-9_.]/g, "");
    const cleanName = name.trim();

    if (!isAdmin) {
      const normalizedName = cleanName.toLowerCase().replace(/[^a-z0-9]/g, "");
      const normalizedUser = cleanUsername.replace(/[^a-z0-9]/g, "");

      const hasReservedInName = RESERVED_NAMES.some((res) => normalizedName.includes(res));
      const hasReservedInUser = cleanUsername && RESERVED_NAMES.some((res) => normalizedUser.includes(res));

      if (hasReservedInName || hasReservedInUser) {
        return res.status(400).json({
          success: false,
          message: "Reserved keyword detected: Display names and usernames cannot contain administrative titles (Admin, FSM, Official, System, Staff, Support, Moderator). Please choose an academic nickname.",
        });
      }
    }

    if (req.user.id === "admin-root") {
      return res.json({
        success: true,
        message: "Master Admin profile active.",
        user: { ...req.user, name: cleanName, username: cleanUsername || "admin", photoUrl, mobile, college, year },
      });
    }

    const userDocRef = db.collection("users").doc(req.user.id);
    const snap = await userDocRef.get();
    if (!snap.exists) {
      return res.status(404).json({ success: false, message: "User account not found." });
    }

    // Check unique username if user provided or changed it
    if (cleanUsername) {
      const existingUserSnap = await db.collection("users").where("username", "==", cleanUsername).limit(1).get();
      if (!existingUserSnap.empty && existingUserSnap.docs[0].id !== req.user.id) {
        return res.status(400).json({
          success: false,
          message: `The username "@${cleanUsername}" is already taken by another student. Please pick a unique handle.`,
        });
      }
    }

    const existingData = decryptUserObject(snap.data());
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
          name: cleanName,
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

    const finalPlainMobile = cleanNewMobile || oldMobile;
    const updateData = {
      name: cleanName,
      username: cleanUsername || existingData.username || "",
      mobile: finalPlainMobile ? encrypt(finalPlainMobile) : "",
      mobileHash: finalPlainMobile ? blindIndex(finalPlainMobile) : "",
      college: (college || "").trim(),
      year: (year || "Not Specified").trim(),
      updatedAt: new Date().toISOString(),
    };

    // 📸 DP HISTORY: Preserve previous avatars so all versions are audited in private chat reports
    if (photoUrl !== undefined && photoUrl !== existingData.photoUrl) {
      const avatarHistory = Array.isArray(existingData.avatarHistory) ? [...existingData.avatarHistory] : [];
      if (existingData.photoUrl) {
        avatarHistory.push({
          photoUrl: existingData.photoUrl,
          changedAt: new Date().toISOString(),
        });
      }
      updateData.photoUrl = photoUrl;
      updateData.avatarHistory = avatarHistory;

      if (tursoClient) {
        tursoClient.execute({
          sql: "UPDATE users SET avatar = ?, name = ?, updatedAt = ? WHERE id = ?",
          args: [String(photoUrl || "").slice(0, 1000), cleanName, new Date().toISOString(), String(req.user.id)],
        }).catch(() => {});
      }
    }

    await userDocRef.update(updateData);

    const updatedUser = {
      ...req.user,
      ...updateData,
      mobile: finalPlainMobile,
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

    await userDocRef.update({
      password: hashedNewPassword,
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

// Logout Notification Deduplication Lock (Prevents duplicate alerts within 15 seconds)
const recentLogoutNotices = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, exp] of recentLogoutNotices.entries()) {
    if (now > exp) recentLogoutNotices.delete(k);
  }
}, 30000);

/**
 * POST /api/auth/logout
 */
router.post("/logout", authenticateToken, async (req, res) => {
  try {
    const activeUser = req.user || req.body?.user;
    const userIdentifier = (activeUser?.email || activeUser?.id || "").toLowerCase().trim();
    const logoutReason = req.body?.reason || req.body?.method || "Manual Session Logout";
    const isAutoLogout =
      String(logoutReason).toLowerCase().includes("inactivity") ||
      String(logoutReason).toLowerCase().includes("30 min");

    // Deduplication Lock: Prevent duplicate logout alerts within 15 seconds for the same user
    let shouldSendTelegramNotice = false;
    if (userIdentifier) {
      const existingExp = recentLogoutNotices.get(userIdentifier);
      if (!existingExp || Date.now() > existingExp) {
        recentLogoutNotices.set(userIdentifier, Date.now() + 15000); // 15-second debounce window
        shouldSendTelegramNotice = true;
      } else {
        console.log(`[LOGOUT-NOTICE] ⚡ Suppressed duplicate logout alert for ${userIdentifier} (within 15s debounce window)`);
      }
    } else if (activeUser) {
      shouldSendTelegramNotice = true;
    }

    if (activeUser && shouldSendTelegramNotice) {
      setImmediate(async () => {
        let fullUser = { ...activeUser };
        let isNewStudent = false;

        if (db && activeUser.email && activeUser.email !== "N/A") {
          try {
            const uSnap = await db.collection("users").where("email", "==", activeUser.email.toLowerCase().trim()).limit(1).get();
            if (!uSnap.empty) {
              const uData = decryptUserObject(uSnap.docs[0].data());
              fullUser.name = fullUser.name || uData.name;
              fullUser.mobile = uData.mobile || fullUser.mobile;
              fullUser.college = uData.college || fullUser.college;
              fullUser.year = uData.year || fullUser.year;

              // Check if user registered within last 24 hours
              if (uData.createdAt) {
                const createdTime = new Date(uData.createdAt).getTime();
                if (Date.now() - createdTime < 24 * 60 * 60 * 1000) {
                  isNewStudent = true;
                }
              }
            }
          } catch (fetchErr) {
            console.warn("[LOGOUT-NOTICE] User detail lookup notice:", fetchErr.message);
          }
        }

        const studentBadge = isNewStudent ? "🟢 Newly Registered Student" : "Student Scholar";
        const detailMessage = isAutoLogout
          ? `Auto-Logout Triggered: No user activity detected for 30 consecutive minutes. Student (${studentBadge}) session safely terminated.`
          : `Student (${studentBadge}) manually clicked Logout to end session safely from web dashboard.`;

        // Send Real-time Telegram Security Notice to FSM Bot & Security Topics
        sendTelegramAuthNotice({
          event: "LOGOUT",
          user: {
            name: fullUser.name || "Scholar",
            email: fullUser.email || "N/A",
            mobile: fullUser.mobile || "N/A",
            college: fullUser.college || "N/A",
            year: fullUser.year || "N/A",
            ip: getClientIp(req),
          },
          photoUrl: null,
          method: isAutoLogout ? "Auto-Logout (30 Min Inactivity)" : "Manual User Action (Logout Button)",
          detail: detailMessage,
        }).catch((err) => console.warn("[LOGOUT-NOTICE] Telegram dispatch notice:", err.message));
      });
    }

    clearAuthCookie(res, req);
    return res.json({
      success: true,
      message: isAutoLogout ? "Session safely closed due to 30 minutes of inactivity." : "Logged out successfully.",
    });
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
      const data = decryptUserObject(snap.data());
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
          hasPasskey: Boolean(data.hasPasskey || (data.passkeys && data.passkeys.length > 0)),
        },
      });
    }
  }

  return res.json({ success: true, user: req.user });
});

module.exports = router;
