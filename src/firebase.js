/**
 * ============================================================================
 * 🍃 PRIMARY DATABASE EXPORT (MONGODB ATLAS)
 * ============================================================================
 * - Firebase Firestore completely removed.
 * - Backed 100% by MongoDB Atlas (M0 Shared Cluster: UNLIMITED Reads/Writes).
 * - Provides drop-in collection/doc/query/batch API for seamless backwards-compatibility.
 * ============================================================================
 */

const { mongoAdapter, MongoFirestoreAdapter, getMongoDbInstance } = require("./services/mongoDbAdapter");

const db = mongoAdapter;

module.exports = {
  db,
  mongoAdapter,
  MongoFirestoreAdapter,
  getMongoDbInstance,
  admin: {
    firestore: () => mongoAdapter,
    auth: () => ({
      verifyIdToken: async () => {
        throw new Error("Firebase Auth has been deprecated. Use native JWT auth.");
      },
    }),
  },
};
