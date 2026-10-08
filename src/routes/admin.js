const express = require("express");
const router = express.Router();
const { db } = require("../firebase");
const { authenticateToken, requireAdmin } = require("../middleware/auth");
const { invalidateAllCache } = require("../utils/ramCache");

const MAIN_ADMIN_EMAIL = "jnplotus@gmail.com";

/**
 * Middleware: Verify caller is Admin or has specific permission
 */
function checkAdminOrPermission(permissionKey) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Authentication required." });
    }
    const isMainAdmin = req.user.email?.toLowerCase() === MAIN_ADMIN_EMAIL;
    const isAdmin = req.user.role === "admin";
    const hasPerm = req.user.permissions?.includes("all") || req.user.permissions?.includes(permissionKey);

    if (isMainAdmin || isAdmin || hasPerm) {
      return next();
    }
    return res.status(403).json({ success: false, message: `Access denied. Requires '${permissionKey}' permission.` });
  };
}

/**
 * GET /api/admin/stats
 */
router.get("/stats", authenticateToken, checkAdminOrPermission("all"), async (req, res) => {
  try {
    if (!db) return res.json({ success: true, stats: {} });

    const [notesSnap, usersSnap] = await Promise.all([
      db.collection("notes").get(),
      db.collection("users").get(),
    ]);

    let totalNotes = 0;
    let totalOriginalBytes = 0;
    let totalCompressedBytes = 0;
    let totalDuplicates = 0;
    let totalDownloads = 0;

    notesSnap.forEach((doc) => {
      const data = doc.data();
      totalNotes++;
      const orig = Number(data.fileSize) || 0;
      const comp = Number(data.compressedSize) || orig;
      totalOriginalBytes += orig;
      totalCompressedBytes += comp;
      if (data.isDuplicate) totalDuplicates++;
      totalDownloads += Number(data.downloadsCount) || 0;
    });

    const totalSavedBytes = totalOriginalBytes - totalCompressedBytes;

    return res.json({
      success: true,
      stats: {
        totalNotes,
        totalStudents: usersSnap.size,
        totalDownloads,
        totalDuplicates,
        totalOriginalBytes,
        totalCompressedBytes,
        totalSavedBytes,
        formattedSaved: (totalSavedBytes / (1024 * 1024)).toFixed(2) + " MB",
        formattedOriginal: (totalOriginalBytes / (1024 * 1024)).toFixed(2) + " MB",
      },
    });
  } catch (err) {
    console.error("[ADMIN] Stats error:", err);
    return res.status(500).json({ success: false, message: "Error calculating stats." });
  }
});

/* ==========================================================================
   STUDENT & USER MANAGEMENT (WITH MAIN ADMIN IMMUNITY)
   ========================================================================== */

/**
 * GET /api/admin/users
 * Returns list of students/users with pagination (10 per page default)
 */
router.get("/users", authenticateToken, checkAdminOrPermission("manage_users"), async (req, res) => {
  try {
    if (!db) return res.json({ success: true, users: [], totalCount: 0 });

    const { page = 1, limit = 10, search = "" } = req.query;
    const pageNum = parseInt(page, 10) || 1;
    const pageLimit = parseInt(limit, 10) || 10;

    const snap = await db.collection("users").orderBy("createdAt", "desc").get();
    let users = [];

    snap.forEach((doc) => {
      const d = doc.data();
      users.push({
        id: doc.id,
        name: d.name || "Unnamed",
        email: d.email,
        mobile: d.mobile || "N/A",
        college: d.college || "N/A",
        year: d.year || "N/A",
        role: d.email === MAIN_ADMIN_EMAIL ? "admin" : (d.role || "student"),
        isBlocked: d.email === MAIN_ADMIN_EMAIL ? false : Boolean(d.isBlocked),
        permissions: d.permissions || [],
        activitiesCount: (d.activities || []).length,
        createdAt: d.createdAt,
        lastLoginAt: d.lastLoginAt,
        isMainAdmin: d.email === MAIN_ADMIN_EMAIL,
      });
    });

    if (search.trim() !== "") {
      const q = search.toLowerCase();
      users = users.filter((u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.mobile.toLowerCase().includes(q) ||
        u.college.toLowerCase().includes(q)
      );
    }

    const totalCount = users.length;
    const startIndex = (pageNum - 1) * pageLimit;
    const paginatedUsers = users.slice(startIndex, startIndex + pageLimit);

    return res.json({
      success: true,
      users: paginatedUsers,
      totalCount,
      page: pageNum,
      totalPages: Math.ceil(totalCount / pageLimit),
    });
  } catch (err) {
    console.error("[ADMIN] Users fetch error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/admin/users/:id/activities
 * Fetches all activity logs for a specific student (registered time, logins, logouts, downloaded PDFs)
 */
router.get("/users/:id/activities", authenticateToken, checkAdminOrPermission("manage_users"), async (req, res) => {
  try {
    const { id } = req.params;
    if (!db) return res.status(503).json({ success: false, message: "DB unavailable" });

    const doc = await db.collection("users").doc(id).get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const activities = doc.data()?.activities || [];
    // Sort newest activity first
    activities.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

    return res.json({ success: true, activities });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * DELETE /api/admin/users/:userId/activities/:activityId
 * Deletes a SINGLE activity event of a student
 */
router.delete("/users/:userId/activities/:activityId", authenticateToken, checkAdminOrPermission("manage_users"), async (req, res) => {
  try {
    const { userId, activityId } = req.params;
    if (!db) return res.status(503).json({ success: false, message: "DB unavailable" });

    const docRef = db.collection("users").doc(userId);
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).json({ success: false, message: "User not found" });

    const activities = doc.data()?.activities || [];
    const updatedActivities = activities.filter((act) => act.id !== activityId);

    await docRef.update({
      activities: updatedActivities,
      updatedAt: new Date().toISOString(),
    });

    return res.json({ success: true, message: "Activity event removed." });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * DELETE /api/admin/users/:userId/activities
 * Deletes ALL activity logs for a student
 */
router.delete("/users/:userId/activities", authenticateToken, checkAdminOrPermission("manage_users"), async (req, res) => {
  try {
    const { userId } = req.params;
    if (!db) return res.status(503).json({ success: false, message: "DB unavailable" });

    await db.collection("users").doc(userId).update({
      activities: [],
      updatedAt: new Date().toISOString(),
    });

    return res.json({ success: true, message: "All activity history cleared for student." });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * PUT /api/admin/users/:id
 * Edits student details & permissions
 * 🛡️ IMMUNITY: Main Admin (jnplotus@gmail.com) cannot be modified or demoted by anyone!
 */
router.put("/users/:id", authenticateToken, checkAdminOrPermission("manage_users"), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, mobile, college, year, role, permissions } = req.body;

    if (!db) return res.status(503).json({ success: false, message: "DB unavailable" });

    const docRef = db.collection("users").doc(id);
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).json({ success: false, message: "User not found" });

    const targetUser = doc.data();

    // 🛡️ MAIN ADMIN PROTECTED
    if (targetUser.email?.toLowerCase() === MAIN_ADMIN_EMAIL) {
      if (req.user?.email?.toLowerCase() !== MAIN_ADMIN_EMAIL) {
        return res.status(403).json({
          success: false,
          message: "PERMISSION DENIED: Main Admin (jnplotus@gmail.com) is permanently protected.",
        });
      }
    }

    const updateData = {
      updatedAt: new Date().toISOString(),
    };

    if (name !== undefined) updateData.name = name.trim();
    if (mobile !== undefined) updateData.mobile = mobile.trim();
    if (college !== undefined) updateData.college = college.trim();
    if (year !== undefined) updateData.year = year.trim();

    // Only allow role / permission updates if target is NOT main admin
    if (targetUser.email?.toLowerCase() !== MAIN_ADMIN_EMAIL) {
      if (role !== undefined) updateData.role = role;
      if (permissions !== undefined) updateData.permissions = permissions;
    }

    await docRef.update(updateData);
    return res.json({ success: true, message: "Student record updated successfully." });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * PATCH /api/admin/users/:id/block
 * Blocks or unblocks a student
 * 🛡️ IMMUNITY: Main Admin can NEVER be blocked
 */
router.patch("/users/:id/block", authenticateToken, checkAdminOrPermission("manage_users"), async (req, res) => {
  try {
    const { id } = req.params;
    const { isBlocked } = req.body;

    if (!db) return res.status(503).json({ success: false, message: "DB unavailable" });

    const docRef = db.collection("users").doc(id);
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).json({ success: false, message: "User not found" });

    const targetUser = doc.data();

    // 🛡️ IMMUNITY CHECK
    if (targetUser.email?.toLowerCase() === MAIN_ADMIN_EMAIL) {
      return res.status(403).json({
        success: false,
        message: "ILLEGAL ACTION: Main Administrator cannot be blocked.",
      });
    }

    await docRef.update({
      isBlocked: Boolean(isBlocked),
      updatedAt: new Date().toISOString(),
    });

    return res.json({
      success: true,
      message: `User ${isBlocked ? "blocked from platform" : "unblocked successfully"}.`,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * DELETE /api/admin/users/:id
 * Deletes a student from database
 * 🛡️ IMMUNITY: Main Admin can NEVER be deleted
 */
router.delete("/users/:id", authenticateToken, checkAdminOrPermission("manage_users"), async (req, res) => {
  try {
    const { id } = req.params;
    if (!db) return res.status(503).json({ success: false, message: "DB unavailable" });

    const docRef = db.collection("users").doc(id);
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).json({ success: false, message: "User not found" });

    const targetUser = doc.data();

    // 🛡️ IMMUNITY CHECK
    if (targetUser.email?.toLowerCase() === MAIN_ADMIN_EMAIL) {
      return res.status(403).json({
        success: false,
        message: "ILLEGAL ACTION: Main Administrator cannot be deleted under any circumstances.",
      });
    }

    await docRef.delete();
    return res.json({ success: true, message: "Student account deleted from database." });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/* ==========================================================================
   NOTES & VAULT CONTROLS
   ========================================================================== */

router.patch("/notes/:id/visibility", authenticateToken, checkAdminOrPermission("manage_notes"), async (req, res) => {
  try {
    const { id } = req.params;
    const { isVisible } = req.body;

    if (!db) return res.status(503).json({ success: false, message: "DB unavailable" });

    await db.collection("notes").doc(id).update({
      isVisible: Boolean(isVisible),
      updatedAt: new Date().toISOString(),
    });

    invalidateAllCache();
    return res.json({ success: true, message: "Note visibility updated." });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.delete("/notes/:id", authenticateToken, checkAdminOrPermission("manage_notes"), async (req, res) => {
  try {
    const { id } = req.params;
    if (!db) return res.status(503).json({ success: false, message: "DB unavailable" });

    await db.collection("notes").doc(id).delete();
    invalidateAllCache();

    return res.json({ success: true, message: "Note deleted from vault." });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
