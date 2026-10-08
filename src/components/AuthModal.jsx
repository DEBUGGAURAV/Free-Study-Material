import React, { useState } from "react";
import { X, UserPlus, LogIn, Mail, Lock, User, Phone, School, Calendar, AlertCircle, CheckCircle2, Send } from "lucide-react";
import { api } from "../api";

export default function AuthModal({ isOpen, onClose, onAuthSuccess, initialTab = "signin" }) {
  const [tab, setTab] = useState(initialTab); // 'signin' or 'signup'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Sign In Form
  const [signInIdentifier, setSignInIdentifier] = useState("");
  const [signInPassword, setSignInPassword] = useState("");

  // Sign Up Form (All Mandatory except Year)
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [college, setCollege] = useState("");
  const [year, setYear] = useState("1st Year");
  const [signUpPassword, setSignUpPassword] = useState("");

  // OTP State (Prepared for user's future mailer integration)
  const [otpSent, setOtpSent] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpMessage, setOtpMessage] = useState(null);

  if (!isOpen) return null;

  const isGmail = (str) => {
    if (!str) return false;
    return str.trim().toLowerCase().endsWith("@gmail.com");
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const cleanInput = signInIdentifier.trim().toLowerCase();

    // Check @gmail.com if standard email is entered (exempt admin alias)
    if (cleanInput.includes("@") && !isGmail(cleanInput)) {
      setLoading(false);
      return setError("Email must end with @gmail.com (e.g. yourname@gmail.com).");
    }

    try {
      const res = await api.login(signInIdentifier, signInPassword);
      onAuthSuccess(res.user);
      onClose();
    } catch (err) {
      setError(err.message || "Failed to sign in.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Strict Validations
    if (!name.trim()) {
      setLoading(false);
      return setError("Full Name is mandatory.");
    }
    if (!mobile.trim() || mobile.trim().length < 10) {
      setLoading(false);
      return setError("Valid 10-digit Mobile Number is mandatory.");
    }
    if (!email.trim() || !isGmail(email)) {
      setLoading(false);
      return setError("Email MUST end with @gmail.com (Required for OTP verification).");
    }
    if (!college.trim()) {
      setLoading(false);
      return setError("College Name is mandatory.");
    }
    if (!signUpPassword || signUpPassword.length < 6) {
      setLoading(false);
      return setError("Password must be at least 6 characters.");
    }

    try {
      const res = await api.register({
        name: name.trim(),
        mobile: mobile.trim(),
        email: email.trim(),
        college: college.trim(),
        year: year.trim(),
        password: signUpPassword,
      });

      onAuthSuccess(res.user);
      onClose();
    } catch (err) {
      setError(err.message || "Failed to create account.");
    } finally {
      setLoading(false);
    }
  };

  const handleRequestOtp = async (targetEmail) => {
    if (!targetEmail || !isGmail(targetEmail)) {
      setError("Please enter a valid @gmail.com address to request OTP.");
      return;
    }

    setOtpLoading(true);
    setError(null);

    try {
      const res = await api.sendOtp(targetEmail);
      setOtpSent(true);
      setOtpMessage(res.message);
    } catch (err) {
      setError(err.message || "Failed to dispatch OTP.");
    } finally {
      setOtpLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: "490px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              className={`filter-tab ${tab === "signin" ? "active" : ""}`}
              onClick={() => { setTab("signin"); setError(null); setOtpMessage(null); }}
              type="button"
            >
              <LogIn size={15} style={{ marginRight: "4px" }} />
              Sign In
            </button>
            <button
              className={`filter-tab ${tab === "signup" ? "active" : ""}`}
              onClick={() => { setTab("signup"); setError(null); setOtpMessage(null); }}
              type="button"
            >
              <UserPlus size={15} style={{ marginRight: "4px" }} />
              Student Sign Up
            </button>
          </div>

          <button className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Gmail OTP Notice Badge */}
        <div
          style={{
            background: "rgba(6, 182, 212, 0.08)",
            border: "1px solid rgba(6, 182, 212, 0.25)",
            borderRadius: "var(--radius-sm)",
            padding: "8px 12px",
            marginBottom: "14px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "0.78rem",
            color: "var(--accent-cyan)",
          }}
        >
          <Mail size={15} style={{ flexShrink: 0 }} />
          <span><strong>Gmail Verification:</strong> Email field me <strong>@gmail.com</strong> zaroori hai.</span>
        </div>

        {error && (
          <div
            style={{
              background: "rgba(244, 63, 94, 0.12)",
              border: "1px solid rgba(244, 63, 94, 0.35)",
              color: "#f43f5e",
              padding: "10px 14px",
              borderRadius: "var(--radius-md)",
              marginBottom: "14px",
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {otpMessage && (
          <div
            style={{
              background: "rgba(16, 185, 129, 0.12)",
              border: "1px solid rgba(16, 185, 129, 0.35)",
              color: "#10b981",
              padding: "10px 14px",
              borderRadius: "var(--radius-md)",
              marginBottom: "14px",
              fontSize: "0.82rem",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <CheckCircle2 size={16} />
            <span>{otpMessage}</span>
          </div>
        )}

        {tab === "signin" ? (
          /* Sign In Form */
          <form onSubmit={handleSignIn}>
            <div className="form-group">
              <label className="form-label">Gmail Address or Admin Alias *</label>
              <input
                type="text"
                className="form-input"
                placeholder="yourname@gmail.com or admin"
                value={signInIdentifier}
                onChange={(e) => setSignInIdentifier(e.target.value)}
                required
              />
              <span style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: "3px" }}>
                Must be an <strong>@gmail.com</strong> address (or admin alias).
              </span>
            </div>

            <div className="form-group">
              <label className="form-label">Password *</label>
              <input
                type="password"
                className="form-input"
                placeholder="Enter your password"
                value={signInPassword}
                onChange={(e) => setSignInPassword(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="btn-primary"
              disabled={loading}
              style={{ width: "100%", justifyContent: "center", marginTop: "16px" }}
            >
              {loading ? (
                <>
                  <div className="spinner"></div>
                  <span>Signing In...</span>
                </>
              ) : (
                <>
                  <LogIn size={16} />
                  <span>Sign In to Free Study Material</span>
                </>
              )}
            </button>

            <p style={{ textAlign: "center", fontSize: "0.8rem", color: "var(--text-dim)", marginTop: "16px" }}>
              New student?{" "}
              <span
                style={{ color: "var(--accent-cyan)", cursor: "pointer", fontWeight: 600 }}
                onClick={() => setTab("signup")}
              >
                Create Account
              </span>
            </p>
          </form>
        ) : (
          /* Sign Up Form (All mandatory except year) */
          <form onSubmit={handleSignUp}>
            <div className="form-group">
              <label className="form-label">Full Name *</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Rahul Yadav"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div className="form-group">
                <label className="form-label">Mobile Number *</label>
                <input
                  type="tel"
                  className="form-input"
                  placeholder="10-digit number"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  maxLength={10}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Gmail Address * (@gmail.com must)</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="name@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">College / University Name *</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Delhi Technological University"
                value={college}
                onChange={(e) => setCollege(e.target.value)}
                required
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div className="form-group">
                <label className="form-label">Current Year (Optional)</label>
                <select
                  className="form-select"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                >
                  <option value="1st Year">1st Year</option>
                  <option value="2nd Year">2nd Year</option>
                  <option value="3rd Year">3rd Year</option>
                  <option value="4th Year">4th Year</option>
                  <option value="Post Graduate">Post Graduate / M.Tech</option>
                  <option value="Faculty / Other">Faculty / Other</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Password *</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="Min 6 characters"
                  value={signUpPassword}
                  onChange={(e) => setSignUpPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              className="btn-primary"
              disabled={loading}
              style={{ width: "100%", justifyContent: "center", marginTop: "16px" }}
            >
              {loading ? (
                <>
                  <div className="spinner"></div>
                  <span>Creating Account...</span>
                </>
              ) : (
                <>
                  <UserPlus size={16} />
                  <span>Register & Join Vault</span>
                </>
              )}
            </button>

            <p style={{ textAlign: "center", fontSize: "0.8rem", color: "var(--text-dim)", marginTop: "14px" }}>
              Already registered?{" "}
              <span
                style={{ color: "var(--accent-cyan)", cursor: "pointer", fontWeight: 600 }}
                onClick={() => setTab("signin")}
              >
                Sign In
              </span>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
