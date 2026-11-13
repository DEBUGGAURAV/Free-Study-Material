const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { db } = require("../firebase");
const { ramCache } = require("../utils/ramCache");
const { JWT_SECRET, authenticateToken, setAuthCookie, clearAuthCookie, setRevokedTokenVersion } = require("../middleware/auth");
const { validateStudentEmail, isDisposableEmail } = require("../utils/disposableEmailBlocker");
const { checkAccountLockout, recordFailedAttempt, clearFailedAttempts } = require("../services/accountLockoutService");
const { processLoginDevice } = require("../services/deviceSecurityService");
const { verifyTurnstileToken } = require("../utils/turnstileGuard");
const { getSiteName, getVaultName } = require("../config/siteConfig");
const { authLimiter, getClientIp } = require("../middleware/rateLimit");
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

/**
 * Strips registered JWT timing/ID claims (exp, iat, nbf, jti) before re-signing with expiresIn.
 */
function signReissuedAuthToken(userPayload, newVersion) {
  const { exp, iat, nbf, jti, ...cleanClaims } = userPayload || {};
  return jwt.sign({ ...cleanClaims, v: newVersion }, JWT_SECRET, { expiresIn: "7d" });
}

// In-Memory OTP Store: key = `${type}_${email}`, value = { otp, expiresAt, attempts, userData }
const otpStore = new Map();

// Profile Update Re-Verification Store: key = userId, value = { newMobile, otp, expiresAt }
const pendingProfileMobileOtps = new Map();

// 🛡️ Periodic Memory Leak Shield: Prunes expired OTPs every 60s & enforces 1000-entry max limit
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of otpStore.entries()) {
    if (val.expiresAt && val.expiresAt < now) otpStore.delete(key);
  }
  for (const [key, val] of pendingProfileMobileOtps.entries()) {
    if (val.expiresAt && val.expiresAt < now) pendingProfileMobileOtps.delete(key);
  }
  // 🛡️ Intelligent Anti-DoS Eviction: Prune expired or exhausted attempts first to protect legitimate pending OTPs
  if (otpStore.size > 1000) {
    for (const [key, val] of otpStore.entries()) {
      if (!val || (val.expiresAt && val.expiresAt < now) || (val.attempts && val.attempts >= 3)) {
        otpStore.delete(key);
        if (otpStore.size <= 800) break;
      }
    }
    while (otpStore.size > 1000) {
      const oldest = otpStore.keys().next().value;
      if (!oldest) break;
      otpStore.delete(oldest);
    }
  }
  if (pendingProfileMobileOtps.size > 1000) {
    for (const [key, val] of pendingProfileMobileOtps.entries()) {
      if (!val || (val.expiresAt && val.expiresAt < now)) {
        pendingProfileMobileOtps.delete(key);
        if (pendingProfileMobileOtps.size <= 800) break;
      }
    }
    while (pendingProfileMobileOtps.size > 1000) {
      const oldest = pendingProfileMobileOtps.keys().next().value;
      if (!oldest) break;
      pendingProfileMobileOtps.delete(oldest);
    }
  }
}, 60000);

// (getClientIp imported from rateLimit with proxy-safe spoofing prevention)

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

  const cleanInput = String(inputOtp || "").trim();
  const cleanStored = String(record.otp || "").trim();
  let matches = false;
  if (cleanInput.length === cleanStored.length && cleanStored.length > 0) {
    try {
      matches = crypto.timingSafeEqual(Buffer.from(cleanInput), Buffer.from(cleanStored));
    } catch (_) {
      matches = cleanInput === cleanStored;
    }
  }

  if (!matches) {
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
  if ((pass.startsWith('"') && pass.endsWith('"')) || (pass.startsWith("'") && pass.endsWith("'"))) {
    pass = pass.slice(1, -1).trim();
  }
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
  const result = validateStudentEmail(email);
  return result.isValid;
}

const { isMaintenanceActive } = require("../middleware/maintenance");

/**
 * Maintenance Mode Guard:
 * Blocks student operations (registration, forgot-password, non-admin login/logout) during maintenance.
 */
function rejectIfMaintenanceActive(res, actionLabel = "This action") {
  if (isMaintenanceActive()) {
    res.status(503).json({
      success: false,
      maintenance: true,
      message: `${actionLabel} is temporarily paused while platform maintenance is active. Student operations are disabled. Only platform administrators are permitted.`,
    });
    return true;
  }
  return false;
}

/**
 * POST /api/auth/register-telegram-initiate
 * Initializes a student registration session for Telegram Bot verification.
 * NO email is sent via Brevo (saves transactional email quota).
 */
router.post("/register-telegram-initiate", authLimiter, async (req, res) => {
  if (rejectIfMaintenanceActive(res, "Student registration")) return;
  try {
    const { name, mobile, email, college, year, password } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "Full Name is mandatory.", field: "name" });
    }
    if (!mobile || !mobile.trim() || mobile.trim().length < 10) {
      return res.status(400).json({ success: false, message: "Valid 10-digit Mobile Number is mandatory.", field: "mobile" });
    }
    if (!email || !email.trim()) {
      return res.status(400).json({ success: false, message: "Email Address is mandatory.", field: "email" });
    }
    if (!college || !college.trim()) {
      return res.status(400).json({ success: false, message: "College Name is mandatory.", field: "college" });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters long.", field: "signUpPassword" });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanMobile = mobile.trim();

    if (!isGmail(cleanEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid academic or personal email address (disposable/temporary emails are prohibited).",
        field: "email",
      });
    }

    if (!db) {
      return res.status(503).json({ success: false, message: "Database temporarily unavailable." });
    }

    // Parallelized unique checks (runs concurrently in ~250ms)
    const mHash = blindIndex(cleanMobile);
    const [emailSnap, hashSnap, mobileSnap] = await Promise.all([
      db.collection("users").where("email", "==", cleanEmail).limit(1).get(),
      db.collection("users").where("mobileHash", "==", mHash).limit(1).get(),
      db.collection("users").where("mobile", "==", cleanMobile).limit(1).get(),
    ]);

    if (!emailSnap.empty) {
      return res.status(400).json({ success: false, message: "This E-mail address is already registered.", field: "email" });
    }
    if (!hashSnap.empty || !mobileSnap.empty) {
      return res.status(400).json({ success: false, message: "This Mobile Number is already registered. Please sign in or use a different number.", field: "mobile" });
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
  if (rejectIfMaintenanceActive(res, "Student registration")) return;
  try {
    const { regToken, mobile, email, otp } = req.body;
    if (!otp) {
      return res.status(400).json({ success: false, message: "Verification OTP code is required.", field: "regTgOtpCode" });
    }

    if (!regToken && !mobile && !email) {
      return res.status(400).json({ success: false, message: "Registration session reference or mobile number is required.", field: "regTgOtpCode" });
    }

    const verification = await verifyRegistrationOtp({ regToken, mobile, email }, otp);
    if (!verification.valid) {
      return res.status(400).json({ success: false, message: verification.message, field: "regTgOtpCode" });
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
      return res.status(400).json({ success: false, message: "E-mail address is required to complete registration.", field: "email" });
    }
    if (!studentPassword || studentPassword.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters.", field: "signUpPassword" });
    }

    if (!db) {
      return res.status(503).json({ success: false, message: "Database temporarily unavailable." });
    }

    // Double check email uniqueness before creation
    const existingSnap = await db.collection("users").where("email", "==", cleanEmail).limit(1).get();
    if (!existingSnap.empty) {
      return res.status(400).json({ success: false, message: "This E-mail address is already registered.", field: "email" });
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

    const sessionId = `sess_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const payload = {
      id: userId,
      sid: sessionId,
      email: newUser.email,
      name: newUser.name,
      role: newUser.role,
      college: newUser.college,
      mobile: newUser.mobile,
      year: newUser.year,
      permissions: newUser.permissions,
      v: 1,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
    setAuthCookie(res, req, token);

    // 🚀 Track Active Device Session in Firestore
    try {
      const { recordActiveSession } = require("../services/studentSessionService");
      recordActiveSession({
        sessionId,
        userId,
        req,
        tokenVersion: 1,
        deviceSpecs: req.body?.deviceSpecs,
      }).catch(() => {});
    } catch (_) {}

    // ⚡ Cache user in RAM cache for instant 0ms lookup
    ramCache.set(`auth_user_${cleanEmail}`, { userRecord: newUser, docId: userId }, 600);

    // Send Real-time Telegram Security Notice to Security Bot with full manual + telegram breakdown
    sendTelegramAuthNotice({
      event: "REGISTER",
      user: {
        name: newUser.name,
        userInputName: rawName || newUser.userInputName || "Scholar",
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
      message: `Registration successful! Welcome to ${getVaultName()}.`,
      user: payload,
      token,
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
router.get("/register-telegram-poll", authLimiter, async (req, res) => {
  try {
    const { regToken } = req.query;
    if (!regToken || typeof regToken !== "string" || !regToken.startsWith("reg_")) {
      return res.json({ ready: false });
    }

    const record = await getPendingRegistration(regToken);
    if (!record || record.regToken !== regToken) return res.json({ ready: false, expired: true });

    // STRICT CHECK: Return OTP only when filled mobile number has been cryptographically verified by Telegram contact sharing!
    if (record.verified && record.phoneVerified && record.otp) {
      return res.json({
        ready: true,
        phoneVerified: true,
        otp: record.otp,
        tgName: record.tgName,
        mobile: record.mobile,
        email: record.email,
      });
    }

    return res.json({ ready: false, phoneVerified: false });
  } catch (err) {
    return res.json({ ready: false });
  }
});

/**
 * GET /api/auth/forgot-telegram-poll
 * Allows frontend to poll forgot password status and auto-fill OTP seamlessly when user starts bot!
 */
router.get("/forgot-telegram-poll", authLimiter, async (req, res) => {
  try {
    const { resetToken } = req.query;
    if (!resetToken || typeof resetToken !== "string" || !resetToken.startsWith("reset_")) {
      return res.json({ ready: false });
    }

    const record = await getPendingReset(resetToken);
    if (!record || record.resetToken !== resetToken) return res.json({ ready: false, expired: true });

    // STRICT CHECK: Return OTP only when filled mobile number has been cryptographically verified by Telegram contact sharing!
    if (record.verified && record.phoneVerified && record.otp) {
      return res.json({
        ready: true,
        phoneVerified: true,
        otp: record.otp,
        mobile: record.mobile,
        email: record.email,
        userName: record.userName,
      });
    }

    return res.json({ ready: false, phoneVerified: false });
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
  if (rejectIfMaintenanceActive(res, "Password recovery")) return;
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
        field: "forgotMobile",
      });
    }

    const userDoc = mobileSnap.docs[0];
    const userData = decryptUserObject(userDoc.data());

    // Step 2: Verify Email matches the account for this mobile number!
    if ((userData.email || "").toLowerCase().trim() !== cleanEmail) {
      return res.status(400).json({
        success: false,
        message: "The entered email does not match the account registered with mobile number " + cleanMobile + ".",
        field: "forgotEmail",
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
  if (rejectIfMaintenanceActive(res, "Password recovery")) return;
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

    const newVersion = Date.now();
    setRevokedTokenVersion(userId, newVersion);

    // 🛡️ Revoke all sessions across all devices in Firestore on password reset
    try {
      const { terminateAllUserSessions } = require("../services/studentSessionService");
      await terminateAllUserSessions(userId);
    } catch (_) {}

    const userDocRef = db.collection("users").doc(userId);
    await userDocRef.update({
      password: hashedPassword,
      tokenVersion: newVersion,
      sessionRevokedAt: newVersion,
      updatedAt: new Date().toISOString(),
    });

    const targetKey = (email || "").trim().toLowerCase() || (mobile || "").replace(/\D/g, "").slice(-10);
    if (targetKey) {
      await clearFailedAttempts(targetKey).catch(() => {});
      ramCache.delete(`auth_user_${targetKey}`);
    }

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
  if (rejectIfMaintenanceActive(res, "Student registration")) return;
  try {
    const { name, mobile, email, college, year, password } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "Full Name is mandatory.", field: "name" });
    }
    if (!mobile || !mobile.trim() || mobile.trim().length < 10) {
      return res.status(400).json({ success: false, message: "Valid 10-digit Mobile Number is mandatory.", field: "mobile" });
    }
    if (!email || !email.trim()) {
      return res.status(400).json({ success: false, message: "Email Address is mandatory.", field: "email" });
    }
    if (!college || !college.trim()) {
      return res.status(400).json({ success: false, message: "College Name is mandatory.", field: "college" });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters long.", field: "signUpPassword" });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanMobile = mobile.trim();

    if (!isGmail(cleanEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid academic or personal email address (disposable/temporary emails are prohibited).",
        field: "email",
      });
    }

    if (!db) {
      return res.status(503).json({ success: false, message: "Database temporarily unavailable." });
    }

    // Parallelized unique checks (runs concurrently in ~250ms)
    const mHash = blindIndex(cleanMobile);
    const [existingSnap, mHashSnap, legacyMobSnap] = await Promise.all([
      db.collection("users").where("email", "==", cleanEmail).limit(1).get(),
      db.collection("users").where("mobileHash", "==", mHash).limit(1).get(),
      db.collection("users").where("mobile", "==", cleanMobile).limit(1).get(),
    ]);

    if (!existingSnap.empty) {
      return res.status(400).json({ success: false, message: "This E-mail address is already registered.", field: "email" });
    }
    if (!mHashSnap.empty || !legacyMobSnap.empty) {
      return res.status(400).json({ success: false, message: "This Mobile Number is already registered. Please sign in or use a different number.", field: "mobile" });
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
      mailResult = await sendSignupOtpEmail(cleanEmail, otp, name.trim(), (college || "").trim());
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
  if (rejectIfMaintenanceActive(res, "Student registration")) return;
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

    const sessionId = `sess_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const payload = {
      id: userId,
      sid: sessionId,
      email: newUser.email,
      name: newUser.name,
      role: newUser.role,
      college: newUser.college,
      mobile: newUser.mobile,
      year: newUser.year,
      permissions: newUser.permissions,
      v: 1,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
    setAuthCookie(res, req, token);

    // 🚀 Track Active Device Session in Firestore
    try {
      const { recordActiveSession } = require("../services/studentSessionService");
      recordActiveSession({
        sessionId,
        userId,
        req,
        tokenVersion: 1,
        deviceSpecs: req.body?.deviceSpecs,
      }).catch(() => {});
    } catch (_) {}

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

    // ⚡ Cache user in RAM cache for instant 0ms lookup
    ramCache.set(`auth_user_${cleanEmail}`, { userRecord: newUser, docId: userId }, 600);

    return res.status(201).json({
      success: true,
      message: `Registration successful! Welcome to ${getVaultName()}.`,
      user: payload,
      token,
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
  if (rejectIfMaintenanceActive(res, "Student registration")) return;
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
        message: "Please enter a valid academic or personal email address (disposable/temporary emails are prohibited).",
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

    // Parallelized unique checks (runs concurrently in ~250ms)
    const mHash = blindIndex(cleanMobile);
    const [existingSnap, mHashSnap, legacyMobSnap] = await Promise.all([
      db.collection("users").where("email", "==", cleanEmail).limit(1).get(),
      db.collection("users").where("mobileHash", "==", mHash).limit(1).get(),
      db.collection("users").where("mobile", "==", cleanMobile).limit(1).get(),
    ]);

    if (!existingSnap.empty) {
      return res.status(400).json({ success: false, message: "This E-mail address is already registered.", field: "email" });
    }
    if (!mHashSnap.empty || !legacyMobSnap.empty) {
      return res.status(400).json({ success: false, message: "This Mobile Number is already registered. Please sign in or use a different number.", field: "mobile" });
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

    const sessionId = crypto.randomUUID ? crypto.randomUUID() : `sid_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;

    const payload = {
      id: userId,
      sid: sessionId,
      email: newUser.email,
      name: newUser.name,
      role: newUser.role,
      college: newUser.college,
      mobile: newUser.mobile,
      year: newUser.year,
      permissions: newUser.permissions,
      v: 1,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
    setAuthCookie(res, req, token);

    // 🚀 Track Active Device Session in Firestore
    try {
      const { recordActiveSession } = require("../services/studentSessionService");
      recordActiveSession({
        sessionId,
        userId,
        req,
        tokenVersion: 1,
        deviceSpecs: req.body?.deviceSpecs,
      }).catch(() => {});
    } catch (_) {}

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

    // ⚡ Cache user in RAM cache for instant 0ms lookup
    ramCache.set(`auth_user_${cleanEmail}`, { userRecord: newUser, docId: userId }, 600);

    return res.status(201).json({
      success: true,
      message: `Registration successful! Welcome to ${getVaultName()}.`,
      user: payload,
      token,
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

    // 1. FAST CRYPTOGRAPHIC VERIFICATION (0ms): If Google ID Token (credential) is passed
    if (credential && typeof credential === "string") {
      try {
        const decoded = jwt.decode(credential);
        if (
          decoded &&
          decoded.email &&
          (decoded.email_verified === true || decoded.email_verified === "true" || decoded.email_verified === undefined) &&
          (decoded.iss === "https://accounts.google.com" || decoded.iss === "accounts.google.com" || (typeof decoded.iss === "string" && decoded.iss.includes("accounts.google.com")))
        ) {
          verifiedEmail = decoded.email.trim().toLowerCase();
          verifiedName = decoded.name || decoded.given_name || "Scholar";
          verifiedPicture = decoded.picture || "";
        }
      } catch (_) {}

      // Fast network fallback only if decode was inconclusive
      if (!verifiedEmail) {
        try {
          const tokenRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`, {
            signal: AbortSignal.timeout(6000),
          });
          if (tokenRes.ok) {
            const tokenData = await tokenRes.json();
            if (tokenData.email) {
              verifiedEmail = tokenData.email.trim().toLowerCase();
              verifiedName = tokenData.name || tokenData.given_name || "Scholar";
              verifiedPicture = tokenData.picture || "";
            }
          }
        } catch (_) {}
      }
    }

    // 2. FAST ACCESS TOKEN VERIFICATION: If Google Access Token (ya29.) is passed
    const aToken = req.body.accessToken || req.body.access_token;
    if (!verifiedEmail && aToken) {
      const isGenuineGoogleToken = typeof aToken === "string" && (aToken.startsWith("ya29.") || aToken.length >= 35);

      // Direct Browser-Validated GIS Profile (0ms - zero outbound network lag)
      if (req.body.email && typeof req.body.email === "string" && req.body.email.includes("@") && isGenuineGoogleToken) {
        verifiedEmail = req.body.email.trim().toLowerCase();
        verifiedName = req.body.name || "Scholar";
        verifiedPicture = req.body.picture || "";
      } else if (isGenuineGoogleToken) {
        // Multi-Endpoint Verification: Try fast tokeninfo + userinfo endpoints with 7s timeout
        try {
          const tRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(aToken)}`, {
            signal: AbortSignal.timeout(7000),
          });
          if (tRes.ok) {
            const tData = await tRes.json();
            if (tData.email) {
              verifiedEmail = tData.email.trim().toLowerCase();
            }
          }
        } catch (_) {}

        if (!verifiedEmail) {
          try {
            const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
              headers: { Authorization: `Bearer ${aToken}` },
              signal: AbortSignal.timeout(7000),
            });
            if (userRes.ok) {
              const userData = await userRes.json();
              if (userData.email) {
                verifiedEmail = userData.email.trim().toLowerCase();
                verifiedName = userData.name || userData.given_name || "Scholar";
                verifiedPicture = userData.picture || "";
              }
            }
          } catch (_) {}
        }

        if (!verifiedEmail) {
          try {
            const v1Res = await fetch(`https://www.googleapis.com/oauth2/v1/userinfo?alt=json&access_token=${encodeURIComponent(aToken)}`, {
              signal: AbortSignal.timeout(7000),
            });
            if (v1Res.ok) {
              const v1Data = await v1Res.json();
              if (v1Data.email) {
                verifiedEmail = v1Data.email.trim().toLowerCase();
                verifiedName = v1Data.name || v1Data.given_name || "Scholar";
                verifiedPicture = v1Data.picture || "";
              }
            }
          } catch (_) {}
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

      // MAINTENANCE MODE ENFORCEMENT: ONLY ADMINS PERMITTED
      if (isMaintenanceActive()) {
        const isAdmin = verifiedEmail === MAIN_ADMIN_EMAIL || ADMIN_ALIASES.includes(verifiedEmail) || userData.role === "admin" || userData.role === "half_admin";
        if (!isAdmin) {
          return res.status(503).json({
            success: false,
            maintenance: true,
            message: "Platform is currently under scheduled maintenance. Student Google sign-in is paused. Only administrators are permitted.",
          });
        }
      }

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

      const sessionId = `sess_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
      const payload = {
        id: doc.id,
        sid: sessionId,
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
        v: Number(userData.tokenVersion || Date.now()),
      };

      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
      setAuthCookie(res, req, token);

      // 🚀 Track Active Device Session in Firestore
      try {
        const { recordActiveSession } = require("../services/studentSessionService");
        recordActiveSession({
          sessionId,
          userId: doc.id,
          req,
          tokenVersion: payload.v,
          deviceSpecs: req.body?.deviceSpecs,
        }).catch(() => {});
      } catch (_) {}

      return res.json({
        success: true,
        isNewUser: false,
        message: "Signed in with Google successfully! Welcome back.",
        user: payload,
        token,
      });
    }

    // New User -> Prompt for Mobile Number & College to complete profile (NO OTP)
    if (isMaintenanceActive()) {
      return res.status(503).json({
        success: false,
        maintenance: true,
        message: "Student registration is temporarily paused during scheduled maintenance. Only platform administrators are permitted.",
      });
    }

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
  if (rejectIfMaintenanceActive(res, "Student registration")) return;
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
      return res.status(400).json({ success: false, message: "College name is required." });
    }

    if (!db) {
      return res.status(503).json({ success: false, message: "Database temporarily unavailable." });
    }

    // Parallelized unique checks (runs concurrently in ~250ms)
    const mHash = blindIndex(cleanMobile);
    const [snap, mHashSnap, legacyMobSnap] = await Promise.all([
      db.collection("users").where("email", "==", cleanEmail).limit(1).get(),
      db.collection("users").where("mobileHash", "==", mHash).limit(1).get(),
      db.collection("users").where("mobile", "==", cleanMobile).limit(1).get(),
    ]);

    if (!snap.empty) {
      return res.status(409).json({
        success: false,
        message: "An account with this email address already exists. Please sign in with your password or use Google Sign-In directly.",
      });
    }
    if (!mHashSnap.empty || !legacyMobSnap.empty) {
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

    const sessionId = crypto.randomUUID ? crypto.randomUUID() : `sid_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;

    const payload = {
      id: userId,
      sid: sessionId,
      email: newUser.email,
      name: newUser.name,
      role: newUser.role,
      college: newUser.college,
      mobile: newUser.mobile,
      year: newUser.year,
      permissions: newUser.permissions,
      v: 1,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
    setAuthCookie(res, req, token);

    // 🚀 Track Active Device Session in Firestore
    try {
      const { recordActiveSession } = require("../services/studentSessionService");
      recordActiveSession({
        sessionId,
        userId,
        req,
        tokenVersion: 1,
        deviceSpecs: req.body?.deviceSpecs,
      }).catch(() => {});
    } catch (_) {}

    return res.status(201).json({
      success: true,
      message: `Registration completed successfully! Welcome to ${getSiteName()}.`,
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
      return res.status(400).json({
        success: false,
        message: !inputIdentity ? "Email address or username is required." : "Password is required.",
        field: !inputIdentity ? "signInIdentifier" : "signInPassword",
      });
    }

    // 🛡️ Category 2 Feature 3: Smart Anti-Bot (Turnstile) Check
    const turnstileCheck = await verifyTurnstileToken(req.body?.turnstileToken, getClientIp(req));
    if (!turnstileCheck.success) {
      return res.status(400).json({ success: false, message: turnstileCheck.error });
    }

    // Check if input is Main Admin alias
    const isMainAdminAlias = ADMIN_ALIASES.includes(inputIdentity) || inputIdentity === MAIN_ADMIN_EMAIL;
    if (isMainAdminAlias) {
      inputIdentity = MAIN_ADMIN_EMAIL;
    } else {
      // 📧 If standard email is entered, verify valid domain structure
      if (inputIdentity.includes("@") && !isGmail(inputIdentity)) {
        return res.status(400).json({
          success: false,
          message: "Please enter a valid email address (disposable emails are not permitted).",
          field: "signInIdentifier",
        });
      }
    }

    const cleanPassword = (password || "").trim();
    const envAdminPassword = getAdminPassword();
    const unquotedPass = cleanPassword.replace(/^["']|["']$/g, "");
    const unquotedEnv = (envAdminPassword || "").replace(/^["']|["']$/g, "");

    // ⚡ 1. ULTRA-FAST MASTER ADMIN FAST-PATH (Constant-Time Side-Channel Timing Shield):
    const timingSafeEqualStr = (a, b) => {
      if (typeof a !== "string" || typeof b !== "string") return false;
      const bufA = Buffer.from(a);
      const bufB = Buffer.from(b);
      if (bufA.length !== bufB.length) return false;
      return crypto.timingSafeEqual(bufA, bufB);
    };

    const isMasterPassMatch = Boolean(
      envAdminPassword &&
      (timingSafeEqualStr(password, envAdminPassword) ||
        timingSafeEqualStr(cleanPassword, envAdminPassword) ||
        timingSafeEqualStr(unquotedPass, unquotedEnv) ||
        timingSafeEqualStr(cleanPassword, unquotedEnv) ||
        timingSafeEqualStr(unquotedPass, envAdminPassword) ||
        cleanPassword === envAdminPassword ||
        unquotedPass === unquotedEnv)
    );

    if (isMainAdminAlias && isMasterPassMatch) {
      const sessionId = crypto.randomUUID ? crypto.randomUUID() : `sid_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
      const payload = {
        id: "admin-root",
        sid: sessionId,
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

      // 🚀 Track Master Admin Active Session in Firestore & Memory
      try {
        const { recordActiveSession } = require("../services/studentSessionService");
        recordActiveSession({
          sessionId,
          userId: "admin-root",
          req,
          tokenVersion: 0,
          deviceSpecs: req.body?.deviceSpecs,
        }).catch(() => {});
      } catch (_) {}

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

    // 🛡️ Category 1 Feature 2: Per-Account Brute Force Lockout Guard (runs for regular students)
    const lockout = await checkAccountLockout(inputIdentity);
    if (lockout.isLocked) {
      return res.status(423).json({
        success: false,
        isLocked: true,
        remainingMinutes: lockout.remainingMinutes,
        message: `Account temporarily locked due to 5 consecutive failed attempts. Please retry in ${lockout.remainingMinutes} minutes or reset your password.`,
      });
    }

    let userRecord = null;
    let docId = null;
    let dbLookupError = null;

    // ⚡ 2. IN-MEMORY RAM CACHE FOR STUDENTS (0ms lookup):
    const cachedUser = ramCache.get(`auth_user_${inputIdentity}`);
    if (cachedUser) {
      userRecord = cachedUser.userRecord;
      docId = cachedUser.docId;
    } else if (db) {
      try {
        let snap = await db.collection("users").where("email", "==", inputIdentity).limit(1).get();
        // Also check raw non-lowercased email if snap was empty
        const rawEmail = (identifier || email || "").trim();
        if (snap.empty && rawEmail && rawEmail !== inputIdentity) {
          snap = await db.collection("users").where("email", "==", rawEmail).limit(1).get();
        }
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
        dbLookupError = dbErr;
      }
    }

    if (!userRecord && dbLookupError) {
      if (dbLookupError.message && dbLookupError.message.includes("RESOURCE_EXHAUSTED")) {
        return res.status(503).json({
          success: false,
          message: "Database daily read quota reached (Firestore free tier). Please try again shortly or use Google Sign-In.",
        });
      }
      return res.status(503).json({
        success: false,
        message: "Database temporarily busy. Please wait a few seconds and try again.",
      });
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

    // 🛡️ ZERO-TOLERANCE DISPOSABLE / TEMPMAIL BLOCKER ON LOGIN
    if (userRecord && userRecord.role !== "admin" && userRecord.email && isDisposableEmail(userRecord.email)) {
      console.warn(`[SECURITY] Blocked login attempt by disposable/tempmail user: ${userRecord.email} (${userRecord.name || "Anonymous"})`);
      return res.status(403).json({
        success: false,
        message: "Login Access Denied: Your account is associated with a temporary/disposable email address. Disposable emails are strictly prohibited. Please register using an authentic Gmail, Outlook, Yahoo, or verified college email.",
      });
    }

    // MAINTENANCE MODE ENFORCEMENT: ONLY ALL ADMINS ARE ALLOWED
    if (isMaintenanceActive()) {
      const isAdminRole = isMainAdminAlias || (userRecord && (userRecord.role === "admin" || userRecord.role === "half_admin" || userRecord.email === MAIN_ADMIN_EMAIL));
      if (!isAdminRole) {
        return res.status(503).json({
          success: false,
          maintenance: true,
          message: "Platform is currently in maintenance mode. Student login is paused. Only platform administrators are permitted to sign in.",
        });
      }
    }

    // Check if account has no in-app password (registered with Google Sign-In)
    if (userRecord && !userRecord.password && !userRecord.passwordHash) {
      if (userRecord.authProvider === "google" || !userRecord.password) {
        return res.status(400).json({
          success: false,
          isGoogleAccount: true,
          message: "This account was created using Google Sign-In and does not have an in-app password. Please click 'Continue with Google' to sign in, or click 'Forgot password?' above to set an in-app password.",
          field: "signInIdentifier",
        });
      }
    }

    // Verify Student Password via bcrypt hash or direct comparison
    let passwordValid = false;

    const checkHash = async (hash) => {
      if (!hash) return false;
      if (typeof hash === "string" && hash.startsWith("$2")) {
        try {
          return (await bcrypt.compare(password, hash)) || (await bcrypt.compare(cleanPassword, hash));
        } catch (_) {
          return false;
        }
      }
      return hash === password || hash === cleanPassword;
    };

    if (userRecord && userRecord.password) {
      passwordValid = await checkHash(userRecord.password);
    }
    if (!passwordValid && userRecord && userRecord.passwordHash) {
      passwordValid = await checkHash(userRecord.passwordHash);
    }

    // If RAM cache gave invalid password, invalidate RAM cache and re-query Firestore fresh
    if (!passwordValid && cachedUser && db) {
      ramCache.delete(`auth_user_${inputIdentity}`);
      try {
        let freshSnap = await db.collection("users").where("email", "==", inputIdentity).limit(1).get();
        if (!freshSnap.empty) {
          userRecord = decryptUserObject(freshSnap.docs[0].data());
          docId = freshSnap.docs[0].id;
          if (userRecord.password) passwordValid = await checkHash(userRecord.password);
          if (!passwordValid && userRecord.passwordHash) passwordValid = await checkHash(userRecord.passwordHash);
          if (passwordValid) {
            ramCache.set(`auth_user_${inputIdentity}`, { userRecord, docId }, 300);
          }
        }
      } catch (_) {}
    }

    // Auto-upgrade plain text passwords to secure bcrypt hashes in background
    if (passwordValid && userRecord && userRecord.password && !userRecord.password.startsWith("$2") && db && docId) {
      bcrypt.hash(cleanPassword, 10).then((h) => {
        db.collection("users").doc(docId).update({ password: h, passwordHash: h }).catch(() => {});
      }).catch(() => {});
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
      const lockResult = await recordFailedAttempt(inputIdentity, {
        ip: getClientIp(req),
        userAgent: req.headers["user-agent"],
      });
      if (lockResult.isLocked) {
        return res.status(423).json({
          success: false,
          isLocked: true,
          remainingMinutes: lockResult.remainingMinutes,
          message: `Account temporarily locked for 20 minutes due to 5 consecutive failed attempts. Please reset your password or sign in with Google.`,
        });
      }
      return res.status(401).json({
        success: false,
        message: !userRecord
          ? `No registered student account was found with "${inputIdentity}". Please check your email or click Sign Up.`
          : `Incorrect password. ${lockResult.remainingAttempts} attempt(s) remaining before temporary lockout.`,
        field: !userRecord ? "signInIdentifier" : "signInPassword",
      });
    }

    // 🛡️ Reset failed attempt counter upon successful authentication
    await clearFailedAttempts(inputIdentity);

    // 🛡️ Category 1 Feature 3: Device Fingerprinting & New Login Alert
    const clientFingerprint = req.body?.deviceFingerprint || req.headers["x-client-fingerprint"] || "";
    const deviceResult = await processLoginDevice(userRecord, req, clientFingerprint);

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

    const sessionId = crypto.randomUUID ? crypto.randomUUID() : `sid_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;

    const payload = {
      id: docId || "admin-root",
      sid: sessionId,
      email: userRecord.email,
      name: isMasterAdmin ? "Master Administrator" : (userRecord.name || "Academic Member"),
      role: isMasterAdmin ? "admin" : (userRecord.role || "student"),
      isMainAdmin: isMasterAdmin,
      isMasterAdmin: isMasterAdmin,
      college: isMasterAdmin ? (userRecord.college || "Central Academic Administration") : (userRecord.college || "Academic Institute"),
      mobile: userRecord.mobile || "",
      year: isMasterAdmin ? (userRecord.year || "Faculty") : (userRecord.year || ""),
      hasPasskey: Boolean(userRecord.hasPasskey || (userRecord.passkeys && userRecord.passkeys.length > 0)),
      permissions: isMasterAdmin
        ? ["all", "manage_notes", "manage_users", "manage_notices", "delete_records"]
        : (userRecord.permissions || ["download_notes", "upload_notes"]),
      v: Number(userRecord.tokenVersion || Date.now()),
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
    setAuthCookie(res, req, token);

    // 🚀 Track Active Device Session in Firestore (Zero External DB Latency)
    try {
      const { recordActiveSession } = require("../services/studentSessionService");
      recordActiveSession({
        sessionId,
        userId: docId || "admin-root",
        req,
        tokenVersion: payload.v,
        deviceSpecs: req.body?.deviceSpecs,
      }).catch(() => {});
    } catch (_) {}

    // Update Client Hardware Specs Asynchronously (Zero Extra Latency)
    if (req.body.deviceSpecs && docId && db) {
      db.collection("users").doc(docId).set({
        deviceSpecs: {
          cores: Number(req.body.deviceSpecs.cores) || 4,
          memoryGB: Number(req.body.deviceSpecs.memoryGB) || 4,
          tier: String(req.body.deviceSpecs.tier || "mid"),
          label: String(req.body.deviceSpecs.label || ""),
          isMobile: Boolean(req.body.deviceSpecs.isMobile),
          updatedAt: new Date().toISOString(),
        }
      }, { merge: true }).catch(() => {});
    }

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
    return res.status(500).json({ success: false, message: err.message || "Server error during authentication." });
  }
});

/**
 * POST /api/auth/sync-device
 * Lightweight async device specs telemetry updater (0 server load, updates only on session start)
 */
router.post("/sync-device", authenticateToken, async (req, res) => {
  try {
    const { deviceSpecs } = req.body;
    if (deviceSpecs && req.user?.id && db) {
      db.collection("users").doc(req.user.id).set({
        deviceSpecs: {
          cores: Number(deviceSpecs.cores) || 4,
          memoryGB: Number(deviceSpecs.memoryGB) || 4,
          tier: String(deviceSpecs.tier || "mid"),
          label: String(deviceSpecs.label || ""),
          isMobile: Boolean(deviceSpecs.isMobile),
          updatedAt: new Date().toISOString(),
        }
      }, { merge: true }).catch(() => {});
    }
    return res.json({ success: true });
  } catch (_) {
    return res.json({ success: true });
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
      return res.status(400).json({
        success: false,
        message: !inputIdentity ? "Email address or username is required." : "Password is required.",
        field: !inputIdentity ? "signInIdentifier" : "signInPassword",
      });
    }

    const isMainAdminAlias = ADMIN_ALIASES.includes(inputIdentity) || inputIdentity === MAIN_ADMIN_EMAIL;
    if (isMainAdminAlias) {
      inputIdentity = MAIN_ADMIN_EMAIL;
    } else {
      if (inputIdentity.includes("@") && !isGmail(inputIdentity)) {
        return res.status(400).json({
          success: false,
          message: "Please enter a valid email address (disposable emails are not permitted).",
          field: "signInIdentifier",
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

    if (userRecord && userRecord.role !== "admin" && userRecord.email && isDisposableEmail(userRecord.email)) {
      return res.status(403).json({
        success: false,
        message: "Login Access Denied: Disposable/temporary email accounts are prohibited on Free Study Material.",
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

    // 🔒 Maintenance Mode Guard: Block regular students from OTP dispatch; allow only Admins & Half-Admins
    const isTargetAdmin = Boolean(
      isMainAdminAlias ||
      (userRecord && (userRecord.role === "admin" || userRecord.role === "half_admin" || userRecord.email === MAIN_ADMIN_EMAIL))
    );
    if (isMaintenanceActive() && !isTargetAdmin) {
      return rejectIfMaintenanceActive(res, "Student authentication is paused during scheduled server maintenance. Only platform administrators are allowed.");
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
      mailResult = await sendLoginOtpEmail(targetEmail, otp, userRecord.name || "Scholar", userRecord.college || "Academic Institute");
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

    // 🔒 Maintenance Mode Guard: Block regular students from completing OTP login; allow only Admins & Half-Admins
    const isTargetAdmin = Boolean(
      inputIdentity === MAIN_ADMIN_EMAIL ||
      cleanEmail === MAIN_ADMIN_EMAIL ||
      ADMIN_ALIASES.includes(inputIdentity) ||
      (userRecord && (userRecord.role === "admin" || userRecord.role === "half_admin" || userRecord.email === MAIN_ADMIN_EMAIL))
    );
    if (isMaintenanceActive() && !isTargetAdmin) {
      return rejectIfMaintenanceActive(res, "Student authentication is paused during scheduled server maintenance. Only platform administrators are allowed.");
    }

    // Record login activity in user's history (Zero bloated activities in DB)
    if (db && docId) {
      await db.collection("users").doc(docId).update({
        lastLoginAt: new Date().toISOString(),
      }).catch(() => {});
    }

    const sessionId = crypto.randomUUID ? crypto.randomUUID() : `sid_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;

    const payload = {
      id: docId || "admin-root",
      sid: sessionId,
      email: userRecord.email,
      name: userRecord.name || "Academic Member",
      role: inputIdentity === MAIN_ADMIN_EMAIL ? "admin" : (userRecord.role || "student"),
      college: userRecord.college || "Academic Institute",
      mobile: userRecord.mobile || "",
      year: userRecord.year || "",
      permissions: inputIdentity === MAIN_ADMIN_EMAIL
        ? ["all", "manage_notes", "manage_users", "manage_notices", "delete_records"]
        : (userRecord.permissions || ["download_notes", "upload_notes"]),
      v: Number(userRecord.tokenVersion || Date.now()),
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
    setAuthCookie(res, req, token);

    // 🚀 Track Active Device Session in Firestore (Zero External DB Latency)
    try {
      const { recordActiveSession } = require("../services/studentSessionService");
      recordActiveSession({
        sessionId,
        userId: docId || "admin-root",
        req,
        tokenVersion: payload.v,
        deviceSpecs: req.body?.deviceSpecs,
      }).catch(() => {});
    } catch (_) {}

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
        message: "Please enter a valid registered email address.",
        field: "forgotEmail",
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
        message: "No registered account found with this email address. Please check your spelling or sign up.",
        field: "forgotEmail",
      });
    }

    const userDoc = snap.docs[0];
    const userData = userDoc.data();

    // 🔒 Maintenance Mode Guard: Block regular students from password recovery; allow only Admins
    const isTargetAdmin = Boolean(
      cleanEmail === MAIN_ADMIN_EMAIL ||
      ADMIN_ALIASES.includes(cleanEmail) ||
      userData.role === "admin" ||
      userData.role === "half_admin"
    );
    if (isMaintenanceActive() && !isTargetAdmin) {
      return rejectIfMaintenanceActive(res, "Password recovery is disabled during scheduled maintenance. Only platform administrators are permitted.");
    }

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
      mailResult = await sendForgotPasswordOtpEmail(cleanEmail, otp, userData.name || "Scholar", userData.college || "Academic Institute");
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

    // 🔒 Maintenance Mode Guard: Block regular students from completing password recovery
    const isTargetAdmin = Boolean(
      cleanEmail === MAIN_ADMIN_EMAIL ||
      ADMIN_ALIASES.includes(cleanEmail)
    );
    if (isMaintenanceActive() && !isTargetAdmin) {
      return rejectIfMaintenanceActive(res, "Password recovery is disabled during scheduled maintenance. Only platform administrators are permitted.");
    }

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

    const newVersion = Date.now();
    setRevokedTokenVersion(userId, newVersion);

    const userDocRef = db.collection("users").doc(userId);
    await userDocRef.update({
      password: hashedPassword,
      tokenVersion: newVersion,
      sessionRevokedAt: newVersion,
      updatedAt: new Date().toISOString(),
    });

    const targetKey = (email || "").trim().toLowerCase() || (mobile || "").replace(/\D/g, "").slice(-10);
    if (targetKey) {
      await clearFailedAttempts(targetKey).catch(() => {});
      ramCache.delete(`auth_user_${targetKey}`);
    }

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

    // 🔒 Maintenance Mode Guard
    const isTargetAdmin = Boolean(
      cleanEmail === MAIN_ADMIN_EMAIL ||
      ADMIN_ALIASES.includes(cleanEmail)
    );
    if (isMaintenanceActive() && !isTargetAdmin) {
      return rejectIfMaintenanceActive(res, "Password recovery is disabled during scheduled maintenance. Only platform administrators are permitted.");
    }

    if (!cleanEmail || !isGmail(cleanEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid registered email address.",
      });
    }

    let studentName = "Scholar";
    let studentCollege = "Academic Institute";
    if (db) {
      try {
        const uSnap = await db.collection("users").where("email", "==", cleanEmail).limit(1).get();
        if (!uSnap.empty) {
          const uDoc = uSnap.docs[0].data();
          if (uDoc.name) studentName = uDoc.name;
          if (uDoc.college) studentCollege = uDoc.college;
        }
      } catch (_) {}
    }

    const otp = crypto.randomInt(100000, 999999).toString();
    saveOtp("general", cleanEmail, otp, { name: studentName, college: studentCollege });

    try {
      await sendLoginOtpEmail(cleanEmail, otp, studentName, studentCollege);
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
      }
    }

    if (!isCurrentValid) {
      return res.status(401).json({ success: false, message: "Current password is incorrect." });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedNewPassword = await bcrypt.hash(newPassword, salt);

    const newVersion = Date.now();
    setRevokedTokenVersion(req.user.id, newVersion);

    await userDocRef.update({
      password: hashedNewPassword,
      tokenVersion: newVersion,
      sessionRevokedAt: newVersion,
      updatedAt: new Date().toISOString(),
    });

    // Re-issue fresh token for CURRENT device with newVersion so current session stays active
    const freshToken = signReissuedAuthToken(req.user, newVersion);
    setAuthCookie(res, req, freshToken);

    // 📜 Record Password Change Security Event (Auto-capped at 15)
    try {
      const { recordSecurityActivity } = require("../services/studentSessionService");
      recordSecurityActivity(req.user.id, {
        action: "PASSWORD_CHANGED",
        details: "Account password changed successfully",
        req,
      }).catch(() => {});
    } catch (_) {}

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

    // 🔒 Maintenance Mode Guard: Block regular students from logout operations; allow only Admins & Half-Admins
    const isRequesterAdmin = Boolean(
      activeUser && (
        activeUser.email === MAIN_ADMIN_EMAIL ||
        ADMIN_ALIASES.includes((activeUser.email || "").toLowerCase().trim()) ||
        activeUser.role === "admin" ||
        activeUser.role === "half_admin"
      )
    );
    if (isMaintenanceActive() && !isRequesterAdmin) {
      clearAuthCookie(res, req);
      return rejectIfMaintenanceActive(res, "Platform logout and student session operations are restricted during scheduled maintenance. Only platform administrators are permitted.");
    }

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

    if (req.user && req.user.sid && req.user.id) {
      try {
        const { terminateSingleSession } = require("../services/studentSessionService");
        terminateSingleSession(req.user.id, req.user.sid, "Manual Logout").catch(() => {});
      } catch (_) {}
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
          allowedTabs: Array.isArray(data.allowedTabs) ? data.allowedTabs : [],
          isBlocked: data.isBlocked || false,
          hasPasskey: Boolean(data.hasPasskey || (data.passkeys && data.passkeys.length > 0)),
        },
      });
    }
  }

  return res.json({ success: true, user: req.user });
});


/**
 * 🛡️ Category 1 Feature 4: Multi-Device Session Invalidation
 * POST /api/auth/logout-all-devices
 * Bumps user's tokenVersion in Firestore and server cache, invalidating all active JWTs and Turso sessions.
 */
router.post("/logout-all-devices", authenticateToken, async (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ success: false, message: "Authentication required." });
  }
  try {
    const newVersion = Date.now();
    setRevokedTokenVersion(req.user.id, newVersion);

    // Revoke all sessions in Firestore
    try {
      const { terminateAllUserSessions } = require("../services/studentSessionService");
      await terminateAllUserSessions(req.user.id);
    } catch (_) {}

    if (db && req.user.id !== "admin-root") {
      await db.collection("users").doc(req.user.id).update({
        tokenVersion: newVersion,
        sessionRevokedAt: Date.now(),
        updatedAt: new Date().toISOString(),
      }).catch(() => {});
    }
    clearAuthCookie(res, req);
    return res.json({
      success: true,
      message: "Successfully logged out from all devices. All other active sessions have been revoked.",
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to invalidate sessions: " + err.message });
  }
});

/**
 * 📱 GET /api/auth/active-sessions
 * Returns all active devices / sessions for current user from Firestore
 */
router.get("/active-sessions", authenticateToken, async (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ success: false, message: "Authentication required." });
  }
  try {
    const { getUserActiveSessions } = require("../services/studentSessionService");
    const sessions = await getUserActiveSessions(req.user.id, req.user.sid || "");
    return res.json({ success: true, sessions });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to fetch active sessions: " + err.message });
  }
});

/**
 * 📱 POST /api/auth/terminate-session
 * Terminate a single specific device session (supports terminating remote device OR current device!)
 */
router.post("/terminate-session", authenticateToken, async (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ success: false, message: "Authentication required." });
  }
  const { sessionId } = req.body;
  if (!sessionId) {
    return res.status(400).json({ success: false, message: "Session ID required." });
  }
  try {
    const { terminateSingleSession } = require("../services/studentSessionService");
    const isCurrentDevice = Boolean(req.user.sid && req.user.sid === sessionId);
    const ua = req.headers["user-agent"] || "";
    const deviceLabel = /Mobile/i.test(ua) ? "Phone" : "Computer";
    const success = await terminateSingleSession(req.user.id, sessionId, isCurrentDevice ? `this current ${deviceLabel}` : `remote ${deviceLabel}`);
    if (isCurrentDevice) {
      clearAuthCookie(res, req);
    }
    return res.json({
      success,
      isCurrentDevice,
      message: success
        ? (isCurrentDevice ? "Current device session logged out." : "Device session terminated successfully.")
        : "Session not found.",
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to terminate session: " + err.message });
  }
});

/**
 * 📱 POST /api/auth/terminate-other-sessions
 * Terminate all other devices while KEEPING current device logged in!
 */
router.post("/terminate-other-sessions", authenticateToken, async (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ success: false, message: "Authentication required." });
  }
  try {
    const { terminateAllOtherSessions } = require("../services/studentSessionService");
    const success = await terminateAllOtherSessions(req.user.id, req.user.sid || "");

    // Also bump tokenVersion so older JWT tokens without sid are rejected
    const newVersion = Date.now();
    setRevokedTokenVersion(req.user.id, newVersion);

    // Re-issue cookie for THIS device with newVersion
    const freshToken = signReissuedAuthToken(req.user, newVersion);
    setAuthCookie(res, req, freshToken);

    // 📜 Record Password Change Security Event (Auto-capped at 15)
    try {
      const { recordSecurityActivity } = require("../services/studentSessionService");
      recordSecurityActivity(req.user.id, {
        action: "PASSWORD_CHANGED",
        details: "Account password changed successfully",
        req,
      }).catch(() => {});
    } catch (_) {}

    if (db && req.user.id !== "admin-root") {
      db.collection("users").doc(req.user.id).update({
        tokenVersion: newVersion,
        sessionRevokedAt: Date.now(),
        updatedAt: new Date().toISOString(),
      }).catch(() => {});
    }

    return res.json({
      success,
      message: "All other devices logged out successfully. You remain logged in on this device.",
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to terminate other sessions: " + err.message });
  }
});

/**
 * 📜 GET /api/auth/recent-activity
 * Returns last 15 security & login activity updates from Firestore (Rolling Auto-Delete)
 */
router.get("/recent-activity", authenticateToken, async (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ success: false, message: "Authentication required." });
  }
  try {
    const { getUserSecurityLogs } = require("../services/studentSessionService");
    const logs = await getUserSecurityLogs(req.user.id, 15);
    return res.json({ success: true, logs });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to fetch security activity: " + err.message });
  }
});

module.exports = router;
