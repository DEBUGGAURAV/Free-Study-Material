/**
 * ============================================================================
 * 🔑 WEBAUTHN / PASSKEY AUTHENTICATION ROUTE (FIDO2 BIOMETRICS)
 * ============================================================================
 * Supports:
 * - Face ID, Fingerprint (Touch ID, Android Biometrics), Windows Hello, PIN, YubiKey
 * - 0ms Passwordless Sign-In (Phishing-Resistant)
 * - Uses the OLD / EXISTING FIREBASE for credential storage (as requested!)
 * - Zero disruption to existing authentication methods
 * ============================================================================
 */

const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const { db } = require("../firebase");
const { JWT_SECRET, authenticateToken, setAuthCookie } = require("../middleware/auth");
const { decryptUserObject } = require("../utils/cryptoVault");
const { sendTelegramAuthNotice } = require("../services/emailService");
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require("@simplewebauthn/server");

// In-Memory Challenge Store (TTL = 5 minutes)
const passkeyChallenges = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of passkeyChallenges.entries()) {
    if (value.expiresAt < now) {
      passkeyChallenges.delete(key);
    }
  }
}, 60000);

/**
 * Determine dynamic Relying Party ID and Expected Origin
 */
function getRpInfo(req) {
  const originHeader = req.get("origin") || req.get("referer");
  let origin = originHeader;

  if (!origin) {
    const host = req.get("host") || "localhost:5000";
    const proto = req.secure || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
    origin = `${proto}://${host}`;
  }

  try {
    const url = new URL(origin);
    const rpID = url.hostname; // e.g. "localhost" or "freestudymaterial.onrender.com"
    const expectedOrigin = url.origin;
    return { rpID, expectedOrigin };
  } catch (_) {
    return { rpID: "localhost", expectedOrigin: "http://localhost:5000" };
  }
}

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

const MAIN_ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
const ADMIN_ALIASES = ["admin", "mainadmin", "administrator", "root"];

/**
 * Robust User Document Resolver
 * Handles standard students, Base64 email IDs, and synthetic 'admin-root' sessions
 */
async function resolveUserDocAndId(req) {
  if (!req.user || !db) return { userDoc: null, effectiveUserId: null, isAdmin: false };
  const userId = req.user.id;
  const userEmail = (req.user.email || "").toLowerCase().trim();
  const isAdmin = Boolean(
    req.user.role === "admin" ||
    req.user.isMainAdmin ||
    userId === "admin-root" ||
    ADMIN_ALIASES.includes(userEmail) ||
    (MAIN_ADMIN_EMAIL && userEmail === MAIN_ADMIN_EMAIL)
  );

  let userDoc = userId ? await db.collection("users").doc(userId).get() : null;
  let effectiveUserId = userId;

  // If not found by primary doc ID, check email query
  if ((!userDoc || !userDoc.exists) && userEmail) {
    const snap = await db.collection("users").where("email", "==", userEmail).limit(1).get();
    if (!snap.empty) {
      userDoc = snap.docs[0];
      effectiveUserId = userDoc.id;
    }
  }

  // If still not found and user is an Admin, ensure admin-root and base64 doc exist
  if ((!userDoc || !userDoc.exists) && isAdmin) {
    const adminDocId = effectiveUserId || (userEmail ? Buffer.from(userEmail).toString("base64url") : "admin-root");
    const adminData = {
      email: userEmail || MAIN_ADMIN_EMAIL,
      name: req.user.name || "Master Administrator",
      role: "admin",
      isMainAdmin: true,
      college: "Central Academic Administration",
      permissions: ["all", "manage_notes", "manage_users", "manage_notices", "delete_records"],
      passkeys: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await db.collection("users").doc(adminDocId).set(adminData, { merge: true });
    userDoc = await db.collection("users").doc(adminDocId).get();
    effectiveUserId = adminDocId;
  }

  return { userDoc, effectiveUserId, isAdmin };
}

/**
 * ============================================================================
 * 1. REGISTRATION OPTIONS (User must be logged in to register a passkey)
 * GET /api/auth/passkey/register-options
 * ============================================================================
 */
router.get("/register-options", authenticateToken, async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ success: false, message: "Unauthorized: Login required to register passkey." });
    }

    if (!db) {
      return res.status(503).json({ success: false, message: "Database temporarily unavailable." });
    }

    const { userDoc, effectiveUserId, isAdmin } = await resolveUserDocAndId(req);
    if (!userDoc || !userDoc.exists) {
      return res.status(404).json({ success: false, message: "User account not found in database." });
    }

    const userData = userDoc.data() || {};
    const existingPasskeys = Array.isArray(userData.passkeys) ? userData.passkeys : [];

    const { rpID } = getRpInfo(req);

    const options = await generateRegistrationOptions({
      rpName: "Free Study Material Vault",
      rpID: rpID,
      userID: new Uint8Array(Buffer.from(effectiveUserId)),
      userName: req.user.email || userData.email || (isAdmin ? "admin@freestudymaterial.com" : "student@academic.edu"),
      userDisplayName: req.user.name || userData.name || (isAdmin ? "Master Administrator" : "Student Scholar"),
      attestationType: "none",
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
        // Platform authenticator = Face ID / Touch ID / Windows Hello / Android Biometrics
        authenticatorAttachment: "platform",
      },
      excludeCredentials: existingPasskeys.map((p) => ({
        id: p.id,
        transports: p.transports || ["internal", "hybrid"],
      })),
    });

    // Save challenge with 5-minute expiry under both IDs for instant lookup
    passkeyChallenges.set(`reg_${req.user.id}`, {
      challenge: options.challenge,
      userId: req.user.id,
      effectiveUserId,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });
    if (effectiveUserId !== req.user.id) {
      passkeyChallenges.set(`reg_${effectiveUserId}`, {
        challenge: options.challenge,
        userId: req.user.id,
        effectiveUserId,
        expiresAt: Date.now() + 5 * 60 * 1000,
      });
    }

    return res.json({ success: true, options });
  } catch (err) {
    console.error("[PASSKEY-REG-OPTIONS-ERROR]", err);
    return res.status(500).json({ success: false, message: err.message || "Failed to generate passkey registration options." });
  }
});

/**
 * ============================================================================
 * 2. REGISTRATION VERIFICATION (Save Passkey to OLD Firebase)
 * POST /api/auth/passkey/register-verify
 * ============================================================================
 */
router.post("/register-verify", authenticateToken, async (req, res) => {
  try {
    const { credential, deviceName, context } = req.body;
    if (!credential || !credential.id) {
      return res.status(400).json({ success: false, message: "Missing credential response from biometric device." });
    }

    const { userDoc, effectiveUserId, isAdmin } = await resolveUserDocAndId(req);
    if (!userDoc || !userDoc.exists) {
      return res.status(404).json({ success: false, message: "User not found in database." });
    }

    let challengeKey = `reg_${req.user.id}`;
    let stored = passkeyChallenges.get(challengeKey);
    if (!stored && effectiveUserId) {
      challengeKey = `reg_${effectiveUserId}`;
      stored = passkeyChallenges.get(challengeKey);
    }
    if (!stored || stored.expiresAt < Date.now()) {
      return res.status(400).json({ success: false, message: "Passkey registration session expired. Please try again." });
    }

    const { rpID, expectedOrigin } = getRpInfo(req);

    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge: stored.challenge,
      expectedOrigin: expectedOrigin,
      expectedRPID: rpID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ success: false, message: "Passkey biometric verification failed." });
    }

    // Clean up one-time challenge
    passkeyChallenges.delete(`reg_${req.user.id}`);
    if (effectiveUserId) passkeyChallenges.delete(`reg_${effectiveUserId}`);

    const { registrationInfo } = verification;
    const { credential: cred } = registrationInfo;

    const newPasskey = {
      id: cred.id,
      publicKey: Buffer.from(cred.publicKey).toString("base64url"),
      counter: cred.counter,
      transports: credential.response?.transports || ["internal", "hybrid"],
      deviceName: (deviceName || "Biometric Device (Face ID / Fingerprint)").trim(),
      createdAt: new Date().toISOString(),
    };

    // Store in Firestore user doc
    const existingData = userDoc.data() || {};
    const existingPasskeys = Array.isArray(existingData.passkeys) ? existingData.passkeys : [];

    // Filter out duplicates if re-registering
    const updatedPasskeys = existingPasskeys.filter((p) => p.id !== newPasskey.id);
    updatedPasskeys.push(newPasskey);

    await db.collection("users").doc(effectiveUserId).set(
      {
        passkeys: updatedPasskeys,
        hasPasskey: true,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    // If Admin, mirror to admin-root & am5wbG90dXNAZ21haWwuY29t so either lookup works 100%
    if (isAdmin) {
      await db.collection("users").doc("admin-root").set(
        { passkeys: updatedPasskeys, hasPasskey: true, updatedAt: new Date().toISOString() },
        { merge: true }
      ).catch(() => {});
      if (effectiveUserId !== "am5wbG90dXNAZ21haWwuY29t") {
        await db.collection("users").doc("am5wbG90dXNAZ21haWwuY29t").set(
          { passkeys: updatedPasskeys, hasPasskey: true, updatedAt: new Date().toISOString() },
          { merge: true }
        ).catch(() => {});
      }
    }

    // Also store index lookup in old Firebase "passkeys" collection for 0ms lookup
    await db.collection("passkeys").doc(newPasskey.id).set({
      id: newPasskey.id,
      userId: effectiveUserId,
      email: (req.user.email || existingData.email || "").toLowerCase().trim(),
      publicKey: newPasskey.publicKey,
      counter: newPasskey.counter,
      transports: newPasskey.transports,
      deviceName: newPasskey.deviceName,
      createdAt: newPasskey.createdAt,
    });

    console.log(`[PASSKEY] ✅ Passkey registered in Firebase for ${req.user.email || existingData.email} (${newPasskey.deviceName})`);

    const isRegOnboarding =
      String(context || "").toLowerCase().includes("reg") ||
      String(context || "").toLowerCase().includes("signup") ||
      (existingData?.createdAt && Date.now() - new Date(existingData.createdAt).getTime() < 30 * 60 * 1000);

    const enrollTiming = isRegOnboarding
      ? "🎯 Registration Onboarding (Setup directly during account signup)"
      : "🛡️ Account Security Center / Dashboard Setup";

    // 🚀 Send Real-time Security Notification to FSM Security Supergroup Topic 6
    sendTelegramAuthNotice({
      event: "PASSKEY_REGISTER",
      user: {
        id: effectiveUserId,
        name: req.user.name || existingData.name || "Scholar",
        email: (req.user.email || existingData.email || "N/A").toLowerCase().trim(),
        mobile: req.user.mobile || existingData.mobile || "N/A",
        college: req.user.college || existingData.college || "N/A",
        year: req.user.year || existingData.year || "N/A",
        ip: getClientIp(req),
      },
      photoUrl: null,
      method: `Biometric Passkey (${newPasskey.deviceName})`,
      detail: isRegOnboarding
        ? `Student enrolled a new FIDO2 Biometric Passkey (${newPasskey.deviceName}) directly during account registration onboarding!`
        : `Student successfully registered & activated FIDO2 / WebAuthn Biometric Passkey (${newPasskey.deviceName}) for instant 0ms fingerprint/Face ID sign-in.`,
      context: enrollTiming,
    }).catch((err) => console.warn("[PASSKEY-NOTICE] Telegram dispatch notice:", err.message));

    return res.json({
      success: true,
      message: "Passkey registered successfully! You can now sign in with Fingerprint, Face ID, or Windows Hello.",
      passkey: {
        id: newPasskey.id,
        deviceName: newPasskey.deviceName,
        createdAt: newPasskey.createdAt,
      },
    });
  } catch (err) {
    console.error("[PASSKEY-REG-VERIFY-ERROR]", err);
    return res.status(500).json({ success: false, message: err.message || "Failed to verify passkey registration." });
  }
});

/**
 * ============================================================================
 * 3. LOGIN OPTIONS (Passwordless 0ms Sign-In)
 * POST /api/auth/passkey/login-options
 * ============================================================================
 */
router.post("/login-options", async (req, res) => {
  try {
    const { email } = req.body || {};
    let allowCredentials = undefined;

    if (email && email.trim() && db) {
      const cleanEmail = email.toLowerCase().trim();
      const snap = await db.collection("users").where("email", "==", cleanEmail).limit(1).get();
      if (!snap.empty) {
        const userData = snap.docs[0].data();
        const passkeys = Array.isArray(userData?.passkeys) ? userData.passkeys : [];
        if (passkeys.length > 0) {
          allowCredentials = passkeys.map((p) => ({
            id: p.id,
            transports: p.transports || ["internal", "hybrid"],
          }));
        }
      }
    }

    const { rpID } = getRpInfo(req);

    const options = await generateAuthenticationOptions({
      rpID: rpID,
      allowCredentials: allowCredentials,
      userVerification: "preferred",
    });

    // Save challenge
    passkeyChallenges.set(`auth_${options.challenge}`, {
      challenge: options.challenge,
      email: email ? email.toLowerCase().trim() : null,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    return res.json({ success: true, options });
  } catch (err) {
    console.error("[PASSKEY-LOGIN-OPTIONS-ERROR]", err);
    return res.status(500).json({ success: false, message: err.message || "Failed to generate passkey authentication options." });
  }
});

/**
 * ============================================================================
 * 4. LOGIN VERIFICATION (Authenticate using OLD Firebase)
 * POST /api/auth/passkey/login-verify
 * ============================================================================
 */
router.post("/login-verify", async (req, res) => {
  try {
    const { credential, challenge } = req.body;
    if (!credential || !credential.id || !challenge) {
      return res.status(400).json({ success: false, message: "Invalid biometric credential submission." });
    }

    const challengeKey = `auth_${challenge}`;
    const stored = passkeyChallenges.get(challengeKey);
    if (!stored || stored.expiresAt < Date.now()) {
      return res.status(400).json({ success: false, message: "Authentication session expired. Please try again." });
    }

    // Clean up challenge
    passkeyChallenges.delete(challengeKey);

    if (!db) {
      return res.status(503).json({ success: false, message: "Database temporarily unavailable." });
    }

    // Look up credential from OLD Firebase
    let passkeyRecord = null;
    let userId = null;
    let userDocSnap = null;

    // Check direct index first (0ms)
    const passkeyIndexDoc = await db.collection("passkeys").doc(credential.id).get();
    if (passkeyIndexDoc.exists) {
      const idxData = passkeyIndexDoc.data();
      userId = idxData.userId;
      userDocSnap = await db.collection("users").doc(userId).get();
    } else {
      // Fallback: search users collection
      const usersSnap = await db.collection("users").get();
      for (const d of usersSnap.docs) {
        const uData = d.data();
        const pList = Array.isArray(uData.passkeys) ? uData.passkeys : [];
        const match = pList.find((p) => p.id === credential.id);
        if (match) {
          userId = d.id;
          userDocSnap = d;
          passkeyRecord = match;
          break;
        }
      }
    }

    if (!userDocSnap || !userDocSnap.exists) {
      return res.status(404).json({ success: false, message: "No student account found registered with this passkey." });
    }

    const rawUserData = userDocSnap.data();
    const userPasskeys = Array.isArray(rawUserData.passkeys) ? rawUserData.passkeys : [];
    if (!passkeyRecord) {
      passkeyRecord = userPasskeys.find((p) => p.id === credential.id);
    }

    if (!passkeyRecord || !passkeyRecord.publicKey) {
      return res.status(400).json({ success: false, message: "Passkey public key record missing from account." });
    }

    const { rpID, expectedOrigin } = getRpInfo(req);

    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge: stored.challenge,
      expectedOrigin: expectedOrigin,
      expectedRPID: rpID,
      credential: {
        id: passkeyRecord.id,
        publicKey: Buffer.from(passkeyRecord.publicKey, "base64url"),
        counter: passkeyRecord.counter || 0,
        transports: passkeyRecord.transports,
      },
    });

    if (!verification.verified) {
      return res.status(401).json({ success: false, message: "Biometric authentication failed. Signature mismatch." });
    }

    // Update counter in OLD Firebase (replay attack protection)
    const newCounter = verification.authenticationInfo.newCounter;
    passkeyRecord.counter = newCounter;
    passkeyRecord.lastUsedAt = new Date().toISOString();

    const updatedPasskeys = userPasskeys.map((p) => (p.id === passkeyRecord.id ? passkeyRecord : p));
    await db.collection("users").doc(userId).set({ passkeys: updatedPasskeys }, { merge: true });

    // Format safe user data
    const userRecord = decryptUserObject(rawUserData);
    const MAIN_ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
    const isMasterAdmin = Boolean(
      (MAIN_ADMIN_EMAIL && userRecord.email === MAIN_ADMIN_EMAIL) ||
      userRecord.isMainAdmin ||
      userRecord.role === "admin"
    );

    const payload = {
      id: userId,
      email: userRecord.email,
      name: userRecord.name || (isMasterAdmin ? "Administrator" : "Academic Member"),
      role: isMasterAdmin ? "admin" : (userRecord.role || "student"),
      isMainAdmin: isMasterAdmin,
      college: userRecord.college || "Academic Institute",
      mobile: userRecord.mobile || "",
      year: userRecord.year || "",
      permissions: isMasterAdmin
        ? ["all", "manage_notes", "manage_users", "manage_notices", "delete_records"]
        : (userRecord.permissions || ["download_notes", "upload_notes"]),
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
    setAuthCookie(res, req, token);

    // Audit Notice to Telegram Security Bot (Zero latency overhead for response!)
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
        method: `Passkey / Biometric (${passkeyRecord.deviceName || "Device Sensor"})`,
      }).catch(() => {});
    });

    console.log(`[PASSKEY] 🚀 0ms Passkey Login Successful for: ${userRecord.email}`);

    return res.json({
      success: true,
      message: "Biometric authentication successful! Welcome back.",
      user: payload,
      token,
    });
  } catch (err) {
    console.error("[PASSKEY-LOGIN-VERIFY-ERROR]", err);
    return res.status(500).json({ success: false, message: err.message || "Failed to verify biometric passkey." });
  }
});

/**
 * ============================================================================
 * 5. LIST USER PASSKEYS
 * GET /api/auth/passkey/list
 * ============================================================================
 */
router.get("/list", authenticateToken, async (req, res) => {
  try {
    if (!req.user || !req.user.id || !db) {
      return res.json({ success: true, passkeys: [] });
    }

    const { userDoc } = await resolveUserDocAndId(req);
    if (!userDoc || !userDoc.exists) {
      return res.json({ success: true, passkeys: [] });
    }

    const data = userDoc.data() || {};
    const passkeys = (Array.isArray(data.passkeys) ? data.passkeys : []).map((p) => ({
      id: p.id,
      deviceName: p.deviceName || "Biometric Authenticator",
      createdAt: p.createdAt || "Recently",
      lastUsedAt: p.lastUsedAt || null,
    }));

    return res.json({ success: true, passkeys });
  } catch (err) {
    return res.json({ success: true, passkeys: [] });
  }
});

/**
 * ============================================================================
 * 6. DELETE A PASSKEY
 * DELETE /api/auth/passkey/:id
 * ============================================================================
 */
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const credId = req.params.id;
    if (!credId || !db) {
      return res.status(400).json({ success: false, message: "Missing passkey ID." });
    }

    const { userDoc, effectiveUserId, isAdmin } = await resolveUserDocAndId(req);
    if (!userDoc || !userDoc.exists) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const data = userDoc.data() || {};
    const passkeys = Array.isArray(data.passkeys) ? data.passkeys : [];
    const filtered = passkeys.filter((p) => p.id !== credId);

    const updatePayload = {
      passkeys: filtered,
      hasPasskey: filtered.length > 0,
      updatedAt: new Date().toISOString(),
    };

    await db.collection("users").doc(effectiveUserId).set(updatePayload, { merge: true });

    // If Admin, mirror to admin-root & am5wbG90dXNAZ21haWwuY29t so either lookup works 100%
    if (isAdmin) {
      const email = data.email || req.user.email || MAIN_ADMIN_EMAIL;
      const b64DocId = email ? Buffer.from(email).toString("base64url") : null;
      if (effectiveUserId !== "admin-root") {
        await db.collection("users").doc("admin-root").set(updatePayload, { merge: true }).catch(() => {});
      }
      if (b64DocId && effectiveUserId !== b64DocId) {
        await db.collection("users").doc(b64DocId).set(updatePayload, { merge: true }).catch(() => {});
      }
    }

    try {
      await db.collection("passkeys").doc(credId).delete();
    } catch (_) {}

    // 🚀 Send Real-time Security Notification to FSM Security Supergroup Topic 6
    sendTelegramAuthNotice({
      event: "PASSKEY_DELETE",
      user: {
        id: effectiveUserId,
        name: req.user.name || data.name || "Scholar",
        email: (req.user.email || data.email || "N/A").toLowerCase().trim(),
        mobile: req.user.mobile || data.mobile || "N/A",
        college: req.user.college || data.college || "N/A",
        year: req.user.year || data.year || "N/A",
        ip: getClientIp(req),
      },
      photoUrl: null,
      method: "Passkey Revocation",
      detail: `Student removed a Biometric Passkey credential (${credId}) from account.`,
    }).catch((err) => console.warn("[PASSKEY-DELETE-NOTICE] Telegram dispatch notice:", err.message));

    return res.json({ success: true, message: "Passkey removed from account." });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || "Failed to remove passkey." });
  }
});

module.exports = router;

