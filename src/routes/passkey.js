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
const crypto = require("crypto");
const { db } = require("../firebase");
const { JWT_SECRET, authenticateToken, setAuthCookie } = require("../middleware/auth");
const { getClientIp, authLimiter } = require("../middleware/rateLimit");
const { decryptUserObject } = require("../utils/cryptoVault");
const { sendTelegramAuthNotice } = require("../services/emailService");
const { isMaintenanceActive } = require("../middleware/maintenance");
const { ramCache } = require("../utils/ramCache");
const { getCachedUserByEmailFromTurso } = require("../services/tursoUserCacheService");
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require("@simplewebauthn/server");

// In-Memory Challenge Store (TTL = 5 minutes)
const passkeyChallenges = new Map();

// ⚡ In-Memory High-Speed Passkey Cache (0ms instant biometric verification)
const ramPasskeyCache = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of passkeyChallenges.entries()) {
    if (value.expiresAt < now) {
      passkeyChallenges.delete(key);
    }
  }
}, 60000);

const { getSiteUrl } = require("../config/siteConfig");

const TRUSTED_PASSKEY_ORIGINS = [
  "https://freestudymaterial.pages.dev",
  "https://freestudymaterial.onrender.com",
  "https://freestudymaterial1.onrender.com",
  "https://freestudymaterial2.onrender.com",
];

function isTrustedPasskeyOrigin(candidateOrigin) {
  if (!candidateOrigin) return false;
  try {
    const url = new URL(candidateOrigin);
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") return true;
    if (host.endsWith(".pages.dev") || host.endsWith(".onrender.com") || host.endsWith(".workers.dev")) return true;
    const configuredSite = getSiteUrl();
    if (configuredSite) {
      try {
        if (new URL(configuredSite).hostname.toLowerCase() === host) return true;
      } catch (_) {}
    }
    return TRUSTED_PASSKEY_ORIGINS.some((t) => {
      try {
        return new URL(t).hostname.toLowerCase() === host;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

/**
 * Determine dynamic Relying Party ID and Expected Origin
 */
function getRpInfo(req) {
  const forwardedHost = req.get("x-forwarded-host");
  const originHeader = req.get("origin") || req.get("referer");
  let origin = originHeader;

  if (!origin || !isTrustedPasskeyOrigin(origin)) {
    const host = forwardedHost || req.get("host");
    if (host) {
      const proto = req.secure || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
      const candidate = `${proto}://${host}`;
      if (isTrustedPasskeyOrigin(candidate)) {
        origin = candidate;
      } else {
        origin = TRUSTED_PASSKEY_ORIGINS[0];
      }
    } else {
      origin = getSiteUrl(req) || TRUSTED_PASSKEY_ORIGINS[0];
    }
  }

  try {
    const url = new URL(origin);
    const rpID = url.hostname; // e.g. "localhost", "freestudymaterial.pages.dev", or "freestudymaterial.onrender.com"
    const expectedOrigin = url.origin;
    return { rpID, expectedOrigin };
  } catch (_) {
    return { rpID: "localhost", expectedOrigin: `http://${req.get("host") || "localhost:5000"}` };
  }
}


const MAIN_ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
const ADMIN_ALIASES = ["admin", "mainadmin", "administrator", "root"];

/**
 * Robust User Document Resolver
 * Handles standard students, Base64 email IDs, and synthetic 'admin-root' sessions
 */
async function resolveUserDocAndId(req) {
  if (!req.user) return { userDoc: null, effectiveUserId: null, isAdmin: false, userData: null };
  const userId = req.user.id;
  const userEmail = (req.user.email || "").toLowerCase().trim();
  const isAdmin = Boolean(
    req.user.role === "admin" ||
    req.user.isMainAdmin ||
    userId === "admin-root" ||
    ADMIN_ALIASES.includes(userEmail) ||
    (MAIN_ADMIN_EMAIL && userEmail === MAIN_ADMIN_EMAIL)
  );

  let userDoc = null;
  let userData = null;
  let effectiveUserId = userId;

  // 1. Try Firestore safely
  if (db && userId) {
    try {
      userDoc = await db.collection("users").doc(userId).get();
      if (userDoc && userDoc.exists) {
        userData = decryptUserObject(userDoc.data());
      }
    } catch (e) {
      console.warn("[PASSKEY] Firestore read notice in resolveUserDocAndId:", e.message);
    }
  }

  // 2. If not found by primary doc ID, check email query in Firestore
  if (!userData && userEmail && db) {
    try {
      const snap = await db.collection("users").where("email", "==", userEmail).limit(1).get();
      if (!snap.empty) {
        userDoc = snap.docs[0];
        effectiveUserId = userDoc.id;
        userData = decryptUserObject(userDoc.data());
      }
    } catch (_) {}
  }

  // 3. Fallback to RAM cache & Turso User Cache
  if (!userData && userEmail) {
    const cached = ramCache ? ramCache.get(`auth_user_${userEmail}`) : null;
    if (cached) {
      userData = cached.userRecord;
      effectiveUserId = cached.docId || userId;
    } else {
      try {
        const tursoCached = await getCachedUserByEmailFromTurso(userEmail);
        if (tursoCached) {
          userData = tursoCached;
          effectiveUserId = tursoCached.id || userId;
        }
      } catch (_) {}
    }
  }

  // 4. Admin root fallback
  if (!userData && isAdmin) {
    userData = {
      id: effectiveUserId || "admin-root",
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
    effectiveUserId = userData.id;
  }

  // Synthesize userDoc object if userDoc is missing or offline
  if (!userDoc && userData) {
    userDoc = {
      id: effectiveUserId,
      exists: true,
      data: () => userData,
    };
  }

  return { userDoc, effectiveUserId, isAdmin, userData };
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

    const { userDoc, effectiveUserId, isAdmin, userData: resolvedUser } = await resolveUserDocAndId(req);
    if (!userDoc || !userDoc.exists) {
      return res.status(404).json({ success: false, message: "User account not found." });
    }

    // 🔒 Maintenance Mode Guard: Only administrators can enroll or modify passkeys
    if (isMaintenanceActive() && !isAdmin) {
      return res.status(503).json({
        success: false,
        maintenance: true,
        message: "Passkey registration is paused during scheduled server maintenance. Only platform administrators are permitted.",
      });
    }

    const userData = resolvedUser || userDoc.data() || {};
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
 * 2. REGISTRATION VERIFICATION (Save Passkey to MongoDB Atlas & Biometric Vault)
 * POST /api/auth/passkey/register-verify
 * ============================================================================
 */
router.post("/register-verify", authenticateToken, async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ success: false, message: "Unauthorized: Login required to register passkey." });
    }
    const { credential, deviceName, context } = req.body;
    if (!credential || !credential.id) {
      return res.status(400).json({ success: false, message: "Missing credential response from biometric device." });
    }

    const { userDoc, effectiveUserId, isAdmin, userData: resolvedUser } = await resolveUserDocAndId(req);
    if (!userDoc || !userDoc.exists) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    // 🔒 Maintenance Mode Guard
    if (isMaintenanceActive() && !isAdmin) {
      return res.status(503).json({
        success: false,
        maintenance: true,
        message: "Passkey registration is paused during scheduled server maintenance. Only platform administrators are permitted.",
      });
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
    const allowedOrigins = Array.from(new Set([expectedOrigin, ...TRUSTED_PASSKEY_ORIGINS])).filter(isTrustedPasskeyOrigin);

    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge: stored.challenge,
      expectedOrigin: allowedOrigins,
      expectedRPID: rpID,
      requireUserVerification: false,
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

    const existingData = resolvedUser || userDoc.data() || {};
    const existingPasskeys = Array.isArray(existingData.passkeys) ? existingData.passkeys : [];

    // Filter out duplicates if re-registering
    const updatedPasskeys = existingPasskeys.filter((p) => p.id !== newPasskey.id);
    updatedPasskeys.push(newPasskey);

    const email = (req.user.email || existingData.email || "").toLowerCase().trim();

    const userToSave = {
      ...existingData,
      id: effectiveUserId,
      email,
      passkeys: updatedPasskeys,
      hasPasskey: true,
      updatedAt: new Date().toISOString(),
    };

    if (ramCache && email) {
      ramCache.set(`auth_user_${email}`, { userRecord: userToSave, docId: effectiveUserId }, 3600);
    }

    // Save directly to MongoDB Atlas database
    if (db) {
      try {
        await db.collection("users").doc(effectiveUserId).set(
          {
            passkeys: updatedPasskeys,
            hasPasskey: true,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );

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

        await db.collection("passkeys").doc(newPasskey.id).set({
          id: newPasskey.id,
          userId: effectiveUserId,
          email,
          userEmail: email,
          publicKey: newPasskey.publicKey,
          counter: newPasskey.counter,
          transports: newPasskey.transports,
          deviceName: newPasskey.deviceName,
          createdAt: newPasskey.createdAt,
        }).catch(() => {});
      } catch (dbErr) {
        console.warn("[PASSKEY] Database save notice:", dbErr.message);
      }
    }

    // Cache passkey in Turso Edge Cloud / Local LibSQL for instant sub-5ms login
    try {
      const { savePasskeyToTurso } = require("../services/tursoService");
      savePasskeyToTurso({
        id: newPasskey.id,
        userId: effectiveUserId,
        userEmail: email,
        publicKey: newPasskey.publicKey,
        counter: newPasskey.counter,
        transports: newPasskey.transports,
        deviceName: newPasskey.deviceName,
        createdAt: newPasskey.createdAt,
      }).catch(() => {});
    } catch (_) {}

    console.log(`[PASSKEY] ✅ Passkey registered safely for ${email} (${newPasskey.deviceName})`);

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
        email: email || "N/A",
        mobile: req.user.mobile || existingData.mobile || "N/A",
        college: req.user.college || existingData.college || "N/A",
        year: req.user.year || existingData.year || "N/A",
        ip: getClientIp(req),
        deviceSpecs: req.body?.deviceSpecs || { label: newPasskey.deviceName },
        userAgent: req.headers["user-agent"],
      },
      photoUrl: null,
      deviceSpecs: req.body?.deviceSpecs || { label: newPasskey.deviceName },
      userAgent: req.headers["user-agent"],
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
router.post("/login-options", authLimiter, async (req, res) => {
  try {
    const { email } = req.body || {};
    let allowCredentials = undefined;

    if (email && email.trim()) {
      const cleanEmail = email.toLowerCase().trim();
      let passkeys = [];

      // 1. Look up user's passkeys in RAM cache (0ms)
      if (ramCache) {
        const cached = ramCache.get(`auth_user_${cleanEmail}`);
        if (cached && Array.isArray(cached.userRecord?.passkeys)) {
          passkeys = cached.userRecord.passkeys;
        }
      }

      // 1.5 Look up user's passkeys in Turso Edge Cache (sub-5ms)
      if (!passkeys || passkeys.length === 0) {
        try {
          const { getPasskeysByEmailFromTurso } = require("../services/tursoService");
          const tursoPks = await getPasskeysByEmailFromTurso(cleanEmail);
          if (Array.isArray(tursoPks) && tursoPks.length > 0) {
            passkeys = tursoPks;
          }
        } catch (_) {}
      }

      // 2. Fallback to Firestore only if missing from RAM and Turso
      if ((!passkeys || passkeys.length === 0) && db) {
        try {
          const snap = await db.collection("users").where("email", "==", cleanEmail).limit(1).get();
          if (!snap.empty) {
            const userData = snap.docs[0].data();
            if (Array.isArray(userData?.passkeys) && userData.passkeys.length > 0) {
              passkeys = userData.passkeys;
            }
          }
        } catch (dbErr) {
          console.warn("[PASSKEY-LOGIN-OPTIONS] Database read notice:", dbErr.message);
        }
      }

      if (passkeys && passkeys.length > 0) {
        allowCredentials = passkeys.map((p) => ({
          id: p.id,
          transports: p.transports || ["internal", "hybrid"],
        }));
      }
    }

    const { rpID } = getRpInfo(req);

    const options = await generateAuthenticationOptions({
      rpID: rpID,
      allowCredentials: allowCredentials,
      userVerification: "preferred",
    });

    // Save challenge with strict Map size cap against RAM exhaustion
    if (passkeyChallenges.size >= 1000) {
      const oldestKey = passkeyChallenges.keys().next().value;
      if (oldestKey) passkeyChallenges.delete(oldestKey);
    }
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
 * 4. LOGIN VERIFICATION (Authenticate using MongoDB Atlas & Biometric Credentials)
 * POST /api/auth/passkey/login-verify
 * ============================================================================
 */
router.post("/login-verify", authLimiter, async (req, res) => {
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

    let passkeyRecord = null;
    let userId = null;
    let userRecord = null;

    // 0. High-Speed RAM Cache check (0.001ms instant biometric lookup)
    const cachedPk = ramPasskeyCache.get(credential.id);
    if (cachedPk && cachedPk.passkeyRecord) {
      passkeyRecord = cachedPk.passkeyRecord;
      userId = cachedPk.userId;
      userRecord = cachedPk.userRecord;
    }

    // 1. Check Turso Edge Cloud / Local LibSQL (sub-5ms)
    try {
      const { getPasskeyFromTurso } = require("../services/tursoService");
      const tursoPk = await getPasskeyFromTurso(credential.id);
      if (tursoPk && tursoPk.publicKey) {
        passkeyRecord = tursoPk;
        userId = tursoPk.userId;
      }
    } catch (_) {}

    // 2. Fallback: Check passkeys collection in Firestore
    if (!passkeyRecord && db) {
      try {
        const passkeyIndexDoc = await db.collection("passkeys").doc(credential.id).get();
        if (passkeyIndexDoc.exists) {
          const idxData = passkeyIndexDoc.data();
          userId = idxData.userId;
          passkeyRecord = idxData;
          try {
            const { savePasskeyToTurso } = require("../services/tursoService");
            savePasskeyToTurso(idxData).catch(() => {});
          } catch (_) {}
        }
      } catch (dbErr) {
        console.warn("[PASSKEY-LOGIN] Database index notice:", dbErr.message);
      }
    }

    // 2. If stored.email was provided, check user's passkeys in database
    if (!passkeyRecord && stored && stored.email) {
      if (db) {
        try {
          const snap = await db.collection("users").where("email", "==", stored.email).limit(1).get();
          if (!snap.empty) {
            const uData = snap.docs[0].data();
            const pList = Array.isArray(uData.passkeys) ? uData.passkeys : [];
            const match = pList.find((p) => p.id === credential.id);
            if (match) {
              userId = snap.docs[0].id;
              userRecord = decryptUserObject(uData);
              passkeyRecord = match;
            }
          }
        } catch (_) {}
      }
    }

    // 3. Admin fallback
    if (!passkeyRecord && db) {
      try {
        const adminDoc = await db.collection("users").doc("admin-root").get();
        if (adminDoc && adminDoc.exists) {
          const uData = adminDoc.data();
          const pList = Array.isArray(uData.passkeys) ? uData.passkeys : [];
          const match = pList.find((p) => p.id === credential.id);
          if (match) {
            userId = "admin-root";
            userRecord = decryptUserObject(uData);
            passkeyRecord = match;
          }
        }
      } catch (_) {}
    }

    if (!passkeyRecord || !passkeyRecord.publicKey) {
      return res.status(404).json({ success: false, message: "No registered biometric passkey found for this device." });
    }

    // Resolve user data if not resolved yet (RAM -> Turso -> Firestore)
    if (!userRecord && (userId || passkeyRecord.userEmail || stored?.email)) {
      const candidateEmail = stored?.email || passkeyRecord.userEmail;
      if (ramCache && candidateEmail) {
        const cached = ramCache.get(`auth_user_${candidateEmail}`);
        if (cached) userRecord = decryptUserObject(cached.userRecord);
      }
      if (!userRecord && candidateEmail) {
        try {
          const { getCachedUserByEmailFromTurso } = require("../services/tursoUserCacheService");
          const tursoUser = await getCachedUserByEmailFromTurso(candidateEmail);
          if (tursoUser) userRecord = decryptUserObject(tursoUser);
        } catch (_) {}
      }
      if (!userRecord && db && userId) {
        try {
          const userDoc = await db.collection("users").doc(userId).get();
          if (userDoc && userDoc.exists) {
            userRecord = decryptUserObject(userDoc.data());
          }
        } catch (_) {}
      }
      if (!userRecord && passkeyRecord.userEmail && db) {
        try {
          const snap = await db.collection("users").where("email", "==", passkeyRecord.userEmail).limit(1).get();
          if (!snap.empty) {
            userRecord = decryptUserObject(snap.docs[0].data());
          }
        } catch (_) {}
      }
    }

    // 🛡️ CRITICAL SECURITY FIX: Verify live account status (prevent blocked or deleted users from logging in via stale cache/passkey)
    if (db && userId && userId !== "admin-root") {
      try {
        const liveDoc = await db.collection("users").doc(userId).get();
        if (!liveDoc.exists) {
          ramPasskeyCache.delete(credential.id);
          return res.status(403).json({
            success: false,
            message: "This account no longer exists. Please register a new account.",
          });
        }
        const liveData = decryptUserObject(liveDoc.data());
        if (liveData) {
          userRecord = { ...userRecord, ...liveData, id: userId };
        }
      } catch (_) {}
    }

    // Only allow fallback admin-root profile for explicitly configured Master Admin; never fabricate student accounts
    if (!userRecord && userId === "admin-root" && MAIN_ADMIN_EMAIL) {
      userRecord = {
        id: "admin-root",
        email: MAIN_ADMIN_EMAIL,
        name: "Master Administrator",
        role: "admin",
        college: "Central Academic Administration",
        isMainAdmin: true,
        permissions: ["all", "manage_notes", "manage_users", "manage_notices", "delete_records"],
      };
    }

    if (!userRecord) {
      ramPasskeyCache.delete(credential.id);
      return res.status(404).json({ success: false, message: "No student account found registered with this passkey." });
    }

    // 🛡️ CRITICAL SECURITY FIX: Enforce account suspension/block check on passkey login
    if (userRecord.isBlocked) {
      ramPasskeyCache.delete(credential.id);
      return res.status(403).json({
        success: false,
        isBlocked: true,
        message: "Your account has been suspended by an administrator. Please contact support.",
      });
    }

    const { rpID, expectedOrigin } = getRpInfo(req);
    const allowedOrigins = Array.from(new Set([expectedOrigin, ...TRUSTED_PASSKEY_ORIGINS])).filter(isTrustedPasskeyOrigin);

    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge: stored.challenge,
      expectedOrigin: allowedOrigins,
      expectedRPID: rpID,
      credential: {
        id: passkeyRecord.id,
        publicKey: Buffer.from(passkeyRecord.publicKey, "base64url"),
        counter: passkeyRecord.counter || 0,
        transports: passkeyRecord.transports,
      },
      requireUserVerification: false,
    });

    if (!verification.verified) {
      return res.status(401).json({ success: false, message: "Biometric authentication failed. Signature mismatch." });
    }

    // Update counter in Database (replay attack protection)
    const newCounter = verification.authenticationInfo.newCounter;
    passkeyRecord.counter = newCounter;
    passkeyRecord.lastUsedAt = new Date().toISOString();
    ramPasskeyCache.set(passkeyRecord.id, { passkeyRecord, userId, userRecord });

    if (db && userId) {
      db.collection("passkeys").doc(passkeyRecord.id).set({ counter: newCounter, lastUsedAt: passkeyRecord.lastUsedAt }, { merge: true }).catch(() => {});
      db.collection("users").doc(userId).update({ lastLoginAt: new Date().toISOString() }).catch(() => {});
    }

    try {
      const { savePasskeyToTurso } = require("../services/tursoService");
      savePasskeyToTurso({
        ...passkeyRecord,
        counter: newCounter,
        lastUsedAt: passkeyRecord.lastUsedAt,
      }).catch(() => {});
    } catch (_) {}

    const isMasterAdmin = Boolean(
      (MAIN_ADMIN_EMAIL && userRecord.email?.toLowerCase().trim() === MAIN_ADMIN_EMAIL) ||
      userRecord.isMainAdmin ||
      userRecord.isMasterAdmin ||
      userId === "admin-root" ||
      userRecord.role === "admin"
    );

    const isMaintenancePermitted = isMasterAdmin || userRecord.role === "half_admin";

    // 🔒 Maintenance Mode Guard: Block student login; allow only platform administrators
    if (isMaintenanceActive() && !isMaintenancePermitted) {
      return res.status(503).json({
        success: false,
        maintenance: true,
        message: "Student authentication is paused during scheduled server maintenance. Only platform administrators are allowed.",
      });
    }

    // Ensure userRecord fields (like mobile) are always decrypted before JWT & Telegram notice
    userRecord = decryptUserObject(userRecord);

    const sessionId = crypto.randomUUID ? crypto.randomUUID() : `sid_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
    const payload = {
      id: userId || userRecord.id,
      sid: sessionId,
      email: userRecord.email,
      name: isMasterAdmin ? "Master Administrator" : (userRecord.name || "Academic Member"),
      role: isMasterAdmin ? "admin" : (userRecord.role || "student"),
      isMainAdmin: isMasterAdmin,
      isMasterAdmin: isMasterAdmin,
      college: isMasterAdmin ? (userRecord.college || "Central Academic Administration") : (userRecord.college || "Academic Institute"),
      mobile: userRecord.mobile || "",
      year: isMasterAdmin ? (userRecord.year || "Faculty") : (userRecord.year || ""),
      permissions: isMasterAdmin
        ? ["all", "manage_notes", "manage_users", "manage_notices", "delete_records"]
        : (userRecord.permissions || ["download_notes", "upload_notes"]),
      v: Number(userRecord.tokenVersion || Date.now()),
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
    setAuthCookie(res, req, token);

    // 🚀 Track Active Device Session in Firestore & Memory
    try {
      const { recordActiveSession } = require("../services/studentSessionService");
      recordActiveSession({
        sessionId,
        userId: userId || userRecord.id,
        req,
        tokenVersion: payload.v,
        deviceSpecs: req.body?.deviceSpecs || { label: passkeyRecord.deviceName || "Biometric Passkey Device" },
      }).catch(() => {});
    } catch (_) {}

    // Audit Notice to Telegram Security Bot
    setImmediate(() => {
      sendTelegramAuthNotice({
        event: "LOGIN",
        user: {
          name: isMasterAdmin ? "Master Administrator" : (userRecord.name || "Scholar"),
          email: userRecord.email,
          mobile: userRecord.mobile || "N/A",
          college: isMasterAdmin ? "Central Administration" : (userRecord.college || "N/A"),
          year: isMasterAdmin ? "Faculty" : (userRecord.year || "N/A"),
          ip: getClientIp(req),
          deviceSpecs: req.body?.deviceSpecs || { deviceName: passkeyRecord.deviceName || "Biometric Passkey Device" },
          userAgent: req.headers["user-agent"],
        },
        method: `Passkey / Biometric (${passkeyRecord.deviceName || "Device Sensor"})`,
        deviceSpecs: req.body?.deviceSpecs || { deviceName: passkeyRecord.deviceName || "Biometric Passkey Device" },
        userAgent: req.headers["user-agent"],
      }).catch(() => {});
    });

    console.log(`[PASSKEY] 🚀 0ms Passkey Login Successful for: ${userRecord.email}`);

    return res.json({
      success: true,
      message: isMasterAdmin ? "Welcome back, Master Administrator!" : "Biometric authentication successful! Welcome back.",
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
    if (!req.user || !req.user.id) {
      return res.json({ success: true, passkeys: [] });
    }

    const { userDoc, userData: resolvedUser } = await resolveUserDocAndId(req);
    const data = resolvedUser || (userDoc && userDoc.exists ? userDoc.data() : {}) || {};
    const passkeyList = Array.isArray(data.passkeys) ? data.passkeys : [];

    const passkeys = passkeyList.map((p) => ({
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
    if (!req.user || !req.user.id) {
      return res.status(401).json({ success: false, message: "Unauthorized: Login required to delete passkey." });
    }
    const credId = req.params.id;
    if (!credId) {
      return res.status(400).json({ success: false, message: "Missing passkey ID." });
    }

    const { userDoc, effectiveUserId, isAdmin, userData: resolvedUser } = await resolveUserDocAndId(req);
    const data = resolvedUser || (userDoc && userDoc.exists ? userDoc.data() : {}) || {};
    const passkeys = Array.isArray(data.passkeys) ? data.passkeys : [];
    
    // Strict Object-Level Authorization
    const targetPasskey = passkeys.find((p) => p.id === credId);
    if (!targetPasskey && !isAdmin) {
      return res.status(403).json({ success: false, message: "Unauthorized: This passkey does not belong to your account." });
    }

    const filtered = passkeys.filter((p) => p.id !== credId);

    const updatePayload = {
      passkeys: filtered,
      hasPasskey: filtered.length > 0,
      updatedAt: new Date().toISOString(),
    };

    // Delete from database
    if (db) {
      try {
        await db.collection("users").doc(effectiveUserId).set(updatePayload, { merge: true });
        await db.collection("passkeys").doc(credId).delete();
      } catch (_) {}
    }

    // Delete from Turso to prevent orphan records
    try {
      const { deletePasskeyFromTurso } = require("../services/tursoService");
      await deletePasskeyFromTurso(credId);
    } catch (_) {}

    // Send Real-time Security Notification
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
    }).catch(() => {});

    return res.json({ success: true, message: "Passkey removed from account." });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || "Failed to remove passkey." });
  }
});

module.exports = router;

