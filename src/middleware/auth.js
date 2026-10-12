const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "academic-vault-ultra-secret-key-2026";

function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    req.user = null;
    return next();
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      req.user = null;
    } else {
      req.user = user;
    }
    next();
  });
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "Authentication required." });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "Authentication required." });
  }

  const isAdmin =
    req.user.role === "admin" ||
    req.user.role === "half_admin" ||
    req.user.email?.toLowerCase() === "jnplotus@gmail.com";
  if (!isAdmin) {
    return res.status(403).json({ success: false, message: "Admin access required." });
  }

  next();
}

module.exports = {
  authenticateToken,
  requireAuth,
  requireAdmin,
  JWT_SECRET,
};

