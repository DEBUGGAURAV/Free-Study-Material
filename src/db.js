/**
 * ============================================================================
 * 🍃 DATABASE CLIENT (MONGODB ATLAS)
 * ============================================================================
 * - Backed 100% by MongoDB Atlas (M0 Shared Cluster: UNLIMITED Reads/Writes)
 * - Zero Quota Exhaustion limits
 * - Drop-in Firestore compatible API
 * ============================================================================
 */

const { mongoAdapter, MongoFirestoreAdapter, getMongoDbInstance, getDatabase } = require("./services/mongoDbAdapter");

module.exports = {
  db: mongoAdapter,
  mongoAdapter,
  MongoFirestoreAdapter,
  getMongoDbInstance,
  getDatabase: getMongoDbInstance,
};
