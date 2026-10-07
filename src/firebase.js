const admin = require("firebase-admin");

if (!admin.apps.length) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (privateKey) {
    privateKey = privateKey.replace(/\\n/g, "\n");
  }

  if (projectId && clientEmail && privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
    console.log(`[Firebase] Initialized Firestore for project: ${projectId}`);
  } else if (projectId) {
    admin.initializeApp({ projectId });
    console.log(`[Firebase] Initialized with application defaults: ${projectId}`);
  } else {
    console.warn("[Firebase] Warning: Credentials not found, running in unauthenticated mode");
    admin.initializeApp();
  }
}

const db = admin.firestore();

module.exports = {
  admin,
  db,
};

