const admin = require("firebase-admin");
const { mongoAdapter } = require("./services/mongoDbAdapter");

if (!admin.apps.length) {
  try {
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;
    if (privateKey) {
      privateKey = privateKey.replace(/\\n/g, "\n");
      // Strip potential extra wrapping quotes
      if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
        privateKey = privateKey.slice(1, -1);
      }
    }

    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && privateKey) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey,
        }),
      });
      console.log("[FIREBASE] Initialized successfully.");
    }
  } catch (err) {
    console.error("[FIREBASE] Initialization warning/error:", err.message);
  }
}

const firestoreDb = admin.apps.length ? admin.firestore() : null;
if (firestoreDb) {
  try {
    firestoreDb.settings({ ignoreUndefinedProperties: true });
  } catch (e) {
    // Already initialized or setting not supported
  }
}

// 🍃 Primary Database Routing:
// When MONGODB_URI is provided, route all reads & writes to MongoDB Atlas (M0 Shared Cluster: UNLIMITED Reads/Writes).
// This permanently eliminates Firebase 50k reads/day RESOURCE_EXHAUSTED quota limits!
const db = process.env.MONGODB_URI ? mongoAdapter : firestoreDb;

module.exports = { admin, db, firestoreDb };
