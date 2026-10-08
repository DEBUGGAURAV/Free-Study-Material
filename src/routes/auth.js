const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { db } = require("../firebase");
const { JWT_SECRET, authenticateToken } = require("../middleware/auth");

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
 * POST /api/auth/register
 * Mandatory: name, mobile, email (@gmail.com), college, password
 * Optional: year
 */
router.post("/register", async (req, res) => {
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
    return res.status(500).json({ success: false, message: "Registration failed: " + err.message });
  }
});

/**
 * POST /api/auth/login
 * Handles both Main Admin login and Student login
 * Email field requires @gmail.com
 */
router.post("/login", async (req, res) => {
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
      const snap = await db.collection("users").where("email", "==", inputIdentity).limit(1).get();
      if (!snap.empty) {
        userRecord = snap.docs[0].data();
        docId = snap.docs[0].id;
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
    if (!passwordValid && isMainAdminAlias && password === "Admin@12345") {
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
 * POST /api/auth/send-otp
 * Prepares OTP dispatch for @gmail.com (Simulation / ready state for user's SMTP mailer)
 */
router.post("/send-otp", async (req, res) => {
  try {
    const { email } = req.body;
    const cleanEmail = (email || "").trim().toLowerCase();

    if (!cleanEmail || !isGmail(cleanEmail)) {
      return res.status(400).json({
        success: false,
        message: "Only @gmail.com email addresses are supported for OTP verification.",
      });
    }

    const simulatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
    console.log(`[AUTH-OTP] Generated OTP for ${cleanEmail}: ${simulatedOtp} (Ready for SMTP mailer)`);

    return res.json({
      success: true,
      message: `OTP request registered for ${cleanEmail}. (Ready for SMTP Mailer integration)`,
      email: cleanEmail,
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
router.put("/change-password", authenticateToken, async (req, res) => {
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
