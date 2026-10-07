const express = require("express");
const router = express.Router();
const { db, admin } = require("../firebase");
const { auth } = require("../middleware/auth");

// Middleware: ensure user is admin
function adminOnly(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ success: false, message: "Admin access required" });
  }
  next();
}

// GET /api/admin/notes - Get all notes for administration
router.get("/notes", auth, adminOnly, async (req, res) => {
  try {
    const snap = await db.collection("notes").get();
    const notes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json(notes);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/users
router.get("/users", auth, adminOnly, async (req, res) => {
  try {
    const snap = await db.collection("users").get();
    const users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json(users);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/admin/users - Delete all non-admin users
router.delete("/users", auth, adminOnly, async (req, res) => {
  try {
    const snap = await db.collection("users").where("role", "!=", "admin").get();
    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    res.json({ success: true, deletedCount: snap.size });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/users/:id
router.get("/users/:id", auth, adminOnly, async (req, res) => {
  try {
    const doc = await db.collection("users").doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ success: false, message: "User not found" });
    
    // Fetch user activity logs if available
    let activity = [];
    try {
      const actSnap = await db.collection("users").doc(req.params.id).collection("activity").limit(50).get();
      activity = actSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) { activity = []; }

    res.json({ user: { id: doc.id, ...doc.data() }, activity });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/admin/users/:userId/activity/:logId
router.delete("/users/:userId/activity/:logId", auth, adminOnly, async (req, res) => {
  try {
    await db.collection("users").doc(req.params.userId).collection("activity").doc(req.params.logId).delete();
    res.json({ success: true, message: "Log deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/admin/users/:userId/activity
router.delete("/users/:userId/activity", auth, adminOnly, async (req, res) => {
  try {
    const snap = await db.collection("users").doc(req.params.userId).collection("activity").get();
    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    res.json({ success: true, message: "All activity logs cleared" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/admin/users/:id
router.patch("/users/:id", auth, adminOnly, async (req, res) => {
  try {
    await db.collection("users").doc(req.params.id).update(req.body);
    res.json({ success: true, message: "User updated" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/admin/users/:id/block
router.patch("/users/:id/block", auth, adminOnly, async (req, res) => {
  try {
    await db.collection("users").doc(req.params.id).update({ blocked: Boolean(req.body.blocked) });
    res.json({ success: true, message: "User status updated" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/admin/users/:id/permissions
router.patch("/users/:id/permissions", auth, adminOnly, async (req, res) => {
  try {
    const { permissions, fullAdmin } = req.body;
    const update = fullAdmin ? { role: 'admin', permissions: {} } : { permissions: permissions || {} };
    await db.collection("users").doc(req.params.id).update(update);
    res.json({ success: true, message: "Permissions updated" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/admin/users/:id
router.delete("/users/:id", auth, adminOnly, async (req, res) => {
  try {
    await db.collection("users").doc(req.params.id).delete();
    res.json({ success: true, message: "User deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/admin-requests
router.get("/admin-requests", auth, adminOnly, async (req, res) => {
  try {
    const snap = await db.collection("adminRequests").get();
    const requests = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ canApprove: true, requests });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/admin-requests/:id/decision
router.post("/admin-requests/:id/decision", auth, adminOnly, async (req, res) => {
  try {
    const { decision } = req.body;
    const reqDoc = await db.collection("adminRequests").doc(req.params.id).get();
    if (!reqDoc.exists) return res.status(404).json({ success: false, message: "Request not found" });
    const requestData = reqDoc.data();
    
    if (decision === "approved" && requestData.targetUserId) {
      await db.collection("users").doc(requestData.targetUserId).update({ role: "admin" });
    }
    await db.collection("adminRequests").doc(req.params.id).delete();
    res.json({ success: true, status: decision, targetUserId: requestData.targetUserId });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/collections - Return collection list with document counts for DatabaseAdminPanel
router.get("/collections", auth, adminOnly, async (req, res) => {
  try {
    const defaultCols = ["deletedData", "notes", "folders", "users", "notices", "adminRequests"];
    const results = await Promise.all(defaultCols.map(async (name) => {
      try {
        const snap = await db.collection(name).get();
        return { name, count: snap.size };
      } catch (e) {
        return { name, count: 0 };
      }
    }));
    res.json(results);
  } catch (err) {
    res.json([
      { name: "deletedData", count: 0 },
      { name: "notes", count: 0 },
      { name: "folders", count: 0 },
      { name: "users", count: 0 },
      { name: "notices", count: 0 }
    ]);
  }
});

// GET /api/admin/collections/:name
router.get("/collections/:name", auth, adminOnly, async (req, res) => {
  try {
    const snap = await db.collection(req.params.name).limit(100).get();
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json(docs);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/collections/restore/:id - Restore single item from deletedData
router.post("/collections/restore/:id", auth, adminOnly, async (req, res) => {
  try {
    const trashRef = db.collection("deletedData").doc(req.params.id);
    const trashSnap = await trashRef.get();
    if (!trashSnap.exists) return res.status(404).json({ success: false, message: "Document not found in trash" });
    
    const docData = trashSnap.data();
    if (docData.originalCollection && docData.originalId) {
      await db.collection(docData.originalCollection).doc(docData.originalId).set(docData.data || {});
    }
    await trashRef.delete();
    res.json({ success: true, message: "Document restored" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/collections/restore-all - Restore all deleted items
router.post("/collections/restore-all", auth, adminOnly, async (req, res) => {
  try {
    const snap = await db.collection("deletedData").get();
    const batch = db.batch();
    snap.docs.forEach((doc) => {
      const data = doc.data();
      if (data.originalCollection && data.originalId) {
        batch.set(db.collection(data.originalCollection).doc(data.originalId), data.data || {});
      }
      batch.delete(doc.ref);
    });
    await batch.commit();
    res.json({ success: true, count: snap.size });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/collections/restore-category/:category - Restore by category
router.post("/collections/restore-category/:category", auth, adminOnly, async (req, res) => {
  try {
    const snap = await db.collection("deletedData").where("originalCollection", "==", req.params.category).get();
    const batch = db.batch();
    snap.docs.forEach((doc) => {
      const data = doc.data();
      if (data.originalCollection && data.originalId) {
        batch.set(db.collection(data.originalCollection).doc(data.originalId), data.data || {});
      }
      batch.delete(doc.ref);
    });
    await batch.commit();
    res.json({ success: true, count: snap.size });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/admin/collections/:name/:id - Move to deletedData or permanently delete
router.delete("/collections/:name/:id", auth, adminOnly, async (req, res) => {
  try {
    const { name, id } = req.params;
    if (name === "deletedData") {
      await db.collection("deletedData").doc(id).delete();
      return res.json({ success: true, message: "Item permanently deleted" });
    }
    
    const docRef = db.collection(name).doc(id);
    const snap = await docRef.get();
    if (snap.exists) {
      await db.collection("deletedData").doc(`${name}_${id}`).set({
        originalCollection: name,
        originalId: id,
        data: snap.data(),
        deletedAt: admin.firestore.FieldValue.serverTimestamp(),
        expireAt: new Date(Date.now() + 48 * 60 * 60 * 1000)
      });
      await docRef.delete();
    }
    res.json({ success: true, message: "Item moved to Reverse Store" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/admin/collections/:name - Empty collection or empty trash
router.delete("/collections/:name", auth, adminOnly, async (req, res) => {
  try {
    const { name } = req.params;
    const snap = await db.collection(name).get();
    if (name === "deletedData") {
      const batch = db.batch();
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      return res.json({ success: true, count: snap.size });
    }

    const batch = db.batch();
    snap.docs.forEach(d => {
      const trashRef = db.collection("deletedData").doc(`${name}_${d.id}`);
      batch.set(trashRef, {
        originalCollection: name,
        originalId: d.id,
        data: d.data(),
        deletedAt: admin.firestore.FieldValue.serverTimestamp(),
        expireAt: new Date(Date.now() + 48 * 60 * 60 * 1000)
      });
      batch.delete(d.ref);
    });
    await batch.commit();
    res.json({ success: true, count: snap.size });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/export - Export workbook
router.get("/export", auth, adminOnly, async (req, res) => {
  try {
    const usersSnap = await db.collection("users").get();
    const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.setHeader("Content-Disposition", "attachment; filename=tech-titan-admin-export.json");
    res.setHeader("Content-Type", "application/json");
    res.send(JSON.stringify(users, null, 2));
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
