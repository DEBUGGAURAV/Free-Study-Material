const rateLimit = require("express-rate-limit");

// Robust key generator: Identify by logged-in user ID, or client IP behind proxies
const keyByUserOrIp = (req) => {
  if (req.user && (req.user.uid || req.user.userId)) {
    return String(req.user.uid || req.user.userId);
  }
  return (
    req.ip ||
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "127.0.0.1"
  );
};

const make = ({ windowMs, max, message, keyGenerator, skipSuccessfulRequests = false }) =>
  rateLimit({
    windowMs,
    max,
    keyGenerator: keyGenerator || keyByUserOrIp,
    skipSuccessfulRequests,
    standardHeaders: true, // sends RateLimit-* headers
    legacyHeaders: false,
    validate: { xForwardedForHeader: false, default: true },
    handler: (req, res) =>
      res.status(429).json({ success: false, message }),
  });

// 1. Whole API limiter: Generous 1500 req / 15 min (protects against DDoS/scrapers without blocking college Wi-Fi)
const globalLimiter = make({
  windowMs: 15 * 60 * 1000,
  max: 1500,
  message: "Too many requests from this network. Please wait a moment and try again.",
});

// 2. Auth limiter: Only failed logins/signups count against limit
const authLimiter = make({
  windowMs: 15 * 60 * 1000,
  max: 25,
  skipSuccessfulRequests: true,
  message: "Too many sign-in attempts. Please try again in 15 minutes.",
});

// 3. OTP & verification email spam protection
const otpLimiter = make({
  windowMs: 10 * 60 * 1000,
  max: 6,
  message: "Too many verification requests. Please wait 10 minutes.",
});

// 4. Reading notes: 180 req / 1 min (3 req/sec per user, RAM cache handles this in ~1ms)
const readLimiter = make({
  windowMs: 60 * 1000,
  max: 180,
  message: "You are loading notes too quickly. Please slow down.",
});

// 5. Downloads: 120 req / 10 min (Accommodates multi-part parallel chunk downloaders like IDM/Chrome)
const downloadLimiter = make({
  windowMs: 10 * 60 * 1000,
  max: 120,
  message: "Download limit reached for this session. Please wait a few minutes.",
});

// 6. Admin writes: 240 actions / 10 min
const adminWriteLimiter = make({
  windowMs: 10 * 60 * 1000,
  max: 240,
  message: "Too many admin actions. Please wait a few minutes.",
});

// 7. Uploads: 80 uploads / hour
const uploadLimiter = make({
  windowMs: 60 * 60 * 1000,
  max: 80,
  message: "Upload limit reached for this hour. Please try again later.",
});

module.exports = {
  globalLimiter,
  authLimiter,
  otpLimiter,
  readLimiter,
  downloadLimiter,
  adminWriteLimiter,
  uploadLimiter,
};
