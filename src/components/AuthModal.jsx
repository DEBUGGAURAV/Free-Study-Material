import React, { useState } from "react";
import { X, UserPlus, LogIn, Mail, Lock, User, Phone, School, Calendar, AlertCircle } from "lucide-react";
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

  if (!isOpen) return null;

  const handleSignIn = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

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

    // Validation
    if (!name.trim()) return setError("Full Name is mandatory.");
    if (!mobile.trim() || mobile.trim().length < 10) return setError("Valid 10-digit Mobile Number is mandatory.");
    if (!email.trim() || !email.includes("@")) return setError("Valid Email Address is mandatory.");
    if (!college.trim()) return setError("College Name is mandatory.");
    if (!signUpPassword || signUpPassword.length < 6) return setError("Password must be at least 6 characters.");

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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: "480px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              className={`filter-tab ${tab === "signin" ? "active" : ""}`}
              onClick={() => { setTab("signin"); setError(null); }}
              type="button"
            >
              <LogIn size={15} style={{ marginRight: "4px" }} />
              Sign In
            </button>
            <button
              className={`filter-tab ${tab === "signup" ? "active" : ""}`}
              onClick={() => { setTab("signup"); setError(null); }}
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

        {error && (
          <div
            style={{
              background: "rgba(244, 63, 94, 0.12)",
              border: "1px solid rgba(244, 63, 94, 0.35)",
              color: "#f43f5e",
              padding: "10px 14px",
              borderRadius: "var(--radius-md)",
              marginBottom: "16px",
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

        {tab === "signin" ? (
          /* Sign In Form */
          <form onSubmit={handleSignIn}>
            <div className="form-group">
              <label className="form-label">Email or Admin Alias *</label>
              <div style={{ position: "relative" }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="student@college.edu or admin"
                  value={signInIdentifier}
                  onChange={(e) => setSignInIdentifier(e.target.value)}
                  required
                />
              </div>
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
                  <span>Sign In to Vault</span>
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
                placeholder="e.g. Rahul Sharma"
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
                <label className="form-label">Email Address *</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="student@college.edu"
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

