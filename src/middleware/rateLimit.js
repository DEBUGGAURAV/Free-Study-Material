const rateLimit = require("express-rate-limit");

// Key by logged-in user when we know them, otherwise by IP.
const keyByUserOrIp = (req) => (req.user && req.user.uid) || req.ip;

const make = ({ windowMs, max, message, keyGenerator, skipSuccessfulRequests = false }) =>
  rateLimit({
    windowMs,
    max,
    keyGenerator,
    skipSuccessfulRequests,
    standardHeaders: true,   // sends RateLimit-* headers
    legacyHeaders: false,
    // The React app shows body.message, so keep the JSON shape.
    handler: (req, res) =>
      res.status(429).json({ success: false, message }),
  });

// Whole API, per IP. Stops scrapers and accidental request loops.
const globalLimiter = make({
  windowMs: 15 * 60 * 1000, max: 300,
  message: "Too many requests. Please wait a few minutes and try again.",
});

// Sign in / sign up / reset: only failed attempts count, so real users are not punished.
const authLimiter = make({
  windowMs: 15 * 60 * 1000, max: 10, skipSuccessfulRequests: true,
  message: "Too many sign-in attempts. Try again in 15 minutes.",
});

// Anything that sends an email or OTP (cost + spam protection).
const otpLimiter = make({
  windowMs: 10 * 60 * 1000, max: 3,
  message: "Too many verification emails requested. Try again in 10 minutes.",
});

// Reading the notes list hits Firestore, so cap it per user.
const readLimiter = make({
  windowMs: 60 * 1000, max: 60, keyGenerator: keyByUserOrIp,
  message: "You are loading notes too quickly. Please slow down.",
});

// Downloads stream big files through your server.
const downloadLimiter = make({
  windowMs: 10 * 60 * 1000, max: 30, keyGenerator: keyByUserOrIp,
  message: "Download limit reached. Try again in a few minutes.",
});

// Admin writes (upload, edit, delete, block).
const adminWriteLimiter = make({
  windowMs: 10 * 60 * 1000, max: 120, keyGenerator: keyByUserOrIp,
  message: "Too many admin actions. Please wait a few minutes.",
});

const uploadLimiter = make({
  windowMs: 60 * 60 * 1000, max: 40, keyGenerator: keyByUserOrIp,
  message: "Upload limit reached for this hour.",
});

module.exports = { globalLimiter, authLimiter, otpLimiter, readLimiter, downloadLimiter, adminWriteLimiter, uploadLimiter };
