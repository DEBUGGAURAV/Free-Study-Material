const admin = require("firebase-admin");

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

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey,
      }),
    });
    console.log("[FIREBASE] Initialized successfully.");
  } catch (err) {
    console.error("[FIREBASE] Initialization warning/error:", err.message);
  }
}

const db = admin.apps.length ? admin.firestore() : null;

module.exports = { admin, db };

