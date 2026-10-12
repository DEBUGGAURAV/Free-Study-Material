import React, { useState, useEffect } from "react";
import {
  X,
  UserPlus,
  LogIn,
  User,
  AlertCircle,
  CheckCircle2,
  Send,
  KeyRound,
  ShieldCheck,
  ArrowLeft,
  RefreshCw,
} from "lucide-react";
import { api } from "../api";

export default function AuthModal({ isOpen, onClose, onAuthSuccess, initialTab = "signin" }) {
  const [tab, setTab] = useState(initialTab); // 'signin', 'signup', or 'forgot'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setTab(initialTab);
      setError(null);
      setSuccessMsg(null);
      setLoginOtpStep(false);
      setForgotOtpStep(false);
      setSignUpOtpStep(false);
      setSignUpOtpCode("");
    }
  }, [isOpen, initialTab]);

  // Sign In Form State
  const [signInIdentifier, setSignInIdentifier] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [loginOtpStep, setLoginOtpStep] = useState(false);
  const [loginOtpCode, setLoginOtpCode] = useState("");
  const [loginTargetEmail, setLoginTargetEmail] = useState("");

  // Forgot Password State
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotOtpStep, setForgotOtpStep] = useState(false);
  const [forgotOtpCode, setForgotOtpCode] = useState("");
  const [forgotNewPassword, setForgotNewPassword] = useState("");

  // Sign Up Form State
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [college, setCollege] = useState("");
  const [year, setYear] = useState("1st Year");
  const [signUpPassword, setSignUpPassword] = useState("");
  const [signUpOtpStep, setSignUpOtpStep] = useState(false);
  const [signUpOtpCode, setSignUpOtpCode] = useState("");

  if (!isOpen) return null;

  const isGmail = (str) => {
    if (!str) return false;
    return str.trim().toLowerCase().endsWith("@gmail.com");
  };

  // 1. Direct Sign In (Email & Password - No OTP)
  const handleSignIn = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    const cleanInput = signInIdentifier.trim().toLowerCase();

    if (cleanInput.includes("@") && !isGmail(cleanInput)) {
      setLoading(false);
      return setError("Email must end with @gmail.com (e.g. yourname@gmail.com).");
    }

    try {
      const res = await api.login(signInIdentifier, signInPassword);
      onAuthSuccess(res.user);
      onClose();
    } catch (err) {
      setError(err.message || "Failed to sign in. Please verify your credentials.");
    } finally {
      setLoading(false);
    }
  };

  // 2. Forgot Password: Step 1 (Request Reset OTP)
  const handleRequestForgotOtp = async (e) => {
    e.preventDefault();
    const cleanEmail = forgotEmail.trim().toLowerCase();

    if (!cleanEmail || !isGmail(cleanEmail)) {
      return setError("Please enter a valid registered @gmail.com address.");
    }

    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await api.requestForgotPasswordOtp(cleanEmail);
      setForgotOtpStep(true);
      if (res.simulationOtp) {
        setForgotOtpCode(res.simulationOtp);
        setSuccessMsg(`${res.message || "Code dispatched!"} (Auto-Fill Code: ${res.simulationOtp})`);
      } else {
        setSuccessMsg(res.message || "Password recovery OTP code sent to your Gmail.");
      }
    } catch (err) {
      setError(err.message || "Failed to dispatch password recovery OTP.");
    } finally {
      setLoading(false);
    }
  };

  // 2. Forgot Password: Step 2 (Verify OTP & Reset Password)
  const handleVerifyForgotOtp = async (e) => {
    e.preventDefault();
    if (!forgotOtpCode.trim()) {
      return setError("Please enter the 6-digit recovery OTP code.");
    }
    if (!forgotNewPassword || forgotNewPassword.length < 6) {
      return setError("New password must be at least 6 characters long.");
    }

    setLoading(true);
    setError(null);

    try {
      const res = await api.verifyForgotPasswordOtp(
        forgotEmail.trim().toLowerCase(),
        forgotOtpCode.trim(),
        forgotNewPassword
      );
      setSuccessMsg(res.message || "Password reset successful! Please sign in with your new password.");
      setTimeout(() => {
        setTab("signin");
        setLoginOtpStep(false);
        setForgotOtpStep(false);
        setSignInIdentifier(forgotEmail);
        setSignInPassword("");
      }, 1500);
    } catch (err) {
      setError(err.message || "Failed to verify OTP or update password.");
    } finally {
      setLoading(false);
    }
  };

  // 3. Student Sign Up - Step 1: Request OTP
  const handleRequestSignUpOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

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
      const res = await api.requestRegisterOtp({
        name: name.trim(),
        mobile: mobile.trim(),
        email: email.trim().toLowerCase(),
        college: college.trim(),
        year: year.trim(),
        password: signUpPassword,
      });

      setSignUpOtpStep(true);
      if (res.simulationOtp) {
        setSignUpOtpCode(res.simulationOtp);
        setSuccessMsg(`${res.message || "Code dispatched!"} (Auto-Fill Code: ${res.simulationOtp})`);
      } else {
        setSuccessMsg(res.message || "Verification code sent to your Gmail.");
      }
    } catch (err) {
      setError(err.message || "Failed to dispatch registration OTP.");
    } finally {
      setLoading(false);
    }
  };

  // 3. Student Sign Up - Step 2: Verify OTP & Create Account
  const handleVerifySignUpOtp = async (e) => {
    e.preventDefault();
    if (!signUpOtpCode.trim() || signUpOtpCode.trim().length < 6) {
      return setError("Please enter the 6-digit verification OTP code.");
    }

    setLoading(true);
    setError(null);

    try {
      const res = await api.verifyRegisterOtp(email.trim().toLowerCase(), signUpOtpCode.trim());
      setSuccessMsg("Account verified & created successfully! Welcome to Academic Vault.");
      setTimeout(() => {
        onAuthSuccess(res.user);
        onClose();
      }, 800);
    } catch (err) {
      setError(err.message || "Failed to verify registration OTP.");
    } finally {
      setLoading(false);
    }
  };

  // 3. Student Sign Up - Resend OTP
  const handleResendSignUpOtp = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.requestRegisterOtp({
        name: name.trim(),
        mobile: mobile.trim(),
        email: email.trim().toLowerCase(),
        college: college.trim(),
        year: year.trim(),
        password: signUpPassword,
      });
      setSuccessMsg(res.message || "New OTP dispatched to your Gmail.");
    } catch (err) {
      setError(err.message || "Failed to resend registration OTP.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: "490px" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="modal-header">
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              className={`filter-tab ${tab === "signin" ? "active" : ""}`}
              onClick={() => {
                setTab("signin");
                setError(null);
                setSuccessMsg(null);
                setLoginOtpStep(false);
                setSignUpOtpStep(false);
              }}
              type="button"
            >
              <LogIn size={15} style={{ marginRight: "4px" }} />
              Sign In
            </button>
            <button
              className={`filter-tab ${tab === "signup" ? "active" : ""}`}
              onClick={() => {
                setTab("signup");
                setError(null);
                setSuccessMsg(null);
                setSignUpOtpStep(false);
                setSignUpOtpCode("");
              }}
              type="button"
            >
              <UserPlus size={15} style={{ marginRight: "4px" }} />
              Student Sign Up
            </button>
            {tab === "forgot" && (
              <button
                className="filter-tab active"
                style={{ background: "rgba(139, 92, 246, 0.2)", borderColor: "rgba(139, 92, 246, 0.4)", color: "#a78bfa" }}
                type="button"
              >
                <KeyRound size={15} style={{ marginRight: "4px" }} />
                Recovery
              </button>
            )}
          </div>

          <button className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Error Alert Box */}
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
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Success Alert Box */}
        {successMsg && (
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
            <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* ================= TAB 1: SIGN IN ================= */}
        {tab === "signin" && (
          <form onSubmit={handleSignIn}>
            <div className="form-group">
              <label className="form-label">Gmail Address or Admin Alias *</label>
              <input
                type="text"
                className="form-input"
                placeholder="yourname@gmail.com or admin"
                value={signInIdentifier}
                onChange={(e) => setSignInIdentifier(e.target.value)}
                autoFocus
                required
              />
              <span style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: "3px" }}>
                Must be an <strong>@gmail.com</strong> address (or admin alias).
              </span>
            </div>

            <div className="form-group">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label className="form-label">Password *</label>
                <span
                  style={{ fontSize: "0.74rem", color: "var(--accent-cyan)", cursor: "pointer", fontWeight: 600 }}
                  onClick={() => {
                    setTab("forgot");
                    setError(null);
                    setSuccessMsg(null);
                    setForgotEmail(signInIdentifier.includes("@") ? signInIdentifier : "");
                    setForgotOtpStep(false);
                  }}
                >
                  Forgot password?
                </span>
              </div>
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
                  <span>Sign In to Academic Vault</span>
                </>
              )}
            </button>

            <p style={{ textAlign: "center", fontSize: "0.8rem", color: "var(--text-dim)", marginTop: "16px" }}>
              New student?{" "}
              <span
                style={{ color: "var(--accent-cyan)", cursor: "pointer", fontWeight: 600 }}
                onClick={() => {
                  setTab("signup");
                  setError(null);
                  setSuccessMsg(null);
                }}
              >
                Create Account
              </span>
            </p>
          </form>
        )}

        {/* ================= TAB 2: FORGOT PASSWORD ================= */}
        {tab === "forgot" && (
          <>
            {!forgotOtpStep ? (
              /* Forgot Password Step 1: Enter Gmail */
              <form onSubmit={handleRequestForgotOtp}>
                <div style={{ marginBottom: "16px", textAlign: "center" }}>
                  <div style={{ width: "42px", height: "42px", borderRadius: "12px", background: "rgba(139, 92, 246, 0.15)", color: "#a78bfa", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: "8px" }}>
                    <KeyRound size={22} />
                  </div>
                  <h4 style={{ margin: "0 0 4px", color: "#fff", fontSize: "1rem" }}>Recover Vault Password</h4>
                  <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--text-dim)" }}>
                    Enter your registered Gmail address to receive a secure recovery passcode.
                  </p>
                </div>

                <div className="form-group">
                  <label className="form-label">Registered Gmail Address *</label>
                  <input
                    type="email"
                    className="form-input"
                    placeholder="yourname@gmail.com"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    required
                  />
                  <span style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: "3px" }}>
                    Only registered <strong>@gmail.com</strong> accounts can be recovered.
                  </span>
                </div>

                <button
                  type="submit"
                  className="btn-primary"
                  disabled={loading}
                  style={{ width: "100%", justifyContent: "center", marginTop: "16px", background: "linear-gradient(135deg, #8b5cf6, #3b82f6)" }}
                >
                  {loading ? (
                    <>
                      <div className="spinner"></div>
                      <span>Dispatching Reset Code...</span>
                    </>
                  ) : (
                    <>
                      <Send size={16} />
                      <span>Send Password Reset Passcode</span>
                    </>
                  )}
                </button>

                <div style={{ textAlign: "center", marginTop: "16px" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setTab("signin");
                      setError(null);
                      setSuccessMsg(null);
                    }}
                    style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: "0.8rem", display: "inline-flex", alignItems: "center", gap: "4px" }}
                  >
                    <ArrowLeft size={14} />
                    <span>Back to Sign In</span>
                  </button>
                </div>
              </form>
            ) : (
              /* Forgot Password Step 2: Enter OTP & New Password */
              <form onSubmit={handleVerifyForgotOtp}>
                <div className="form-group">
                  <label className="form-label" style={{ textAlign: "center", display: "block" }}>
                    6-Digit Recovery Passcode *
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    maxLength={6}
                    placeholder="• • • • • •"
                    value={forgotOtpCode}
                    onChange={(e) => setForgotOtpCode(e.target.value.replace(/\D/g, ""))}
                    style={{
                      textAlign: "center",
                      letterSpacing: "10px",
                      fontSize: "1.45rem",
                      fontWeight: 800,
                      fontFamily: "var(--font-mono)",
                      color: "#a78bfa",
                      padding: "12px",
                      background: "rgba(139, 92, 246, 0.08)",
                      border: "1.5px solid rgba(139, 92, 246, 0.4)",
                    }}
                    autoFocus
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">New Password * (Min 6 Characters)</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="Enter your new secure password"
                    value={forgotNewPassword}
                    onChange={(e) => setForgotNewPassword(e.target.value)}
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="btn-primary"
                  disabled={loading || forgotOtpCode.length < 6 || forgotNewPassword.length < 6}
                  style={{ width: "100%", justifyContent: "center", marginTop: "14px", background: "linear-gradient(135deg, #10b981, #06b6d4)" }}
                >
                  {loading ? (
                    <>
                      <div className="spinner"></div>
                      <span>Updating Password...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={16} />
                      <span>Authorize &amp; Set New Password</span>
                    </>
                  )}
                </button>

                <div style={{ textAlign: "center", marginTop: "14px" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotOtpStep(false);
                      setForgotOtpCode("");
                      setError(null);
                    }}
                    style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: "0.78rem", display: "inline-flex", alignItems: "center", gap: "4px" }}
                  >
                    <ArrowLeft size={13} />
                    <span>Change Recovery Email</span>
                  </button>
                </div>
              </form>
            )}
          </>
        )}

        {/* ================= TAB 3: SIGN UP ================= */}
        {tab === "signup" && (
          <>
            {!signUpOtpStep ? (
              /* Sign Up Step 1: Student Information */
              <form onSubmit={handleRequestSignUpOtp}>
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
                    <label className="form-label">Gmail Address * (@gmail.com)</label>
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
                    <label className="form-label">Password * (Min 6 chars)</label>
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
                      <span>Dispatching OTP...</span>
                    </>
                  ) : (
                    <>
                      <Send size={16} />
                      <span>Continue with Email OTP Verification</span>
                    </>
                  )}
                </button>

                <p style={{ textAlign: "center", fontSize: "0.8rem", color: "var(--text-dim)", marginTop: "14px" }}>
                  Already registered?{" "}
                  <span
                    style={{ color: "var(--accent-cyan)", cursor: "pointer", fontWeight: 600 }}
                    onClick={() => {
                      setTab("signin");
                      setError(null);
                      setSuccessMsg(null);
                      setLoginOtpStep(false);
                      setSignUpOtpStep(false);
                    }}
                  >
                    Sign In
                  </span>
                </p>
              </form>
            ) : (
              /* Sign Up Step 2: 6-Digit OTP Verification Screen */
              <form onSubmit={handleVerifySignUpOtp}>
                <div style={{ marginBottom: "16px", textAlign: "center" }}>
                  <div
                    style={{
                      width: "44px",
                      height: "44px",
                      borderRadius: "12px",
                      background: "rgba(56, 189, 248, 0.15)",
                      color: "#38bdf8",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: "8px",
                    }}
                  >
                    <ShieldCheck size={24} />
                  </div>
                  <h4 style={{ margin: "0 0 4px", color: "#fff", fontSize: "1.05rem" }}>
                    Verify Student Email
                  </h4>
                  <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--text-dim)" }}>
                    Enter the 6-digit verification code dispatched to{" "}
                    <strong style={{ color: "#38bdf8" }}>{email}</strong>
                  </p>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ textAlign: "center", display: "block" }}>
                    6-Digit Verification Passcode *
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    maxLength={6}
                    placeholder="• • • • • •"
                    value={signUpOtpCode}
                    onChange={(e) => setSignUpOtpCode(e.target.value.replace(/\D/g, ""))}
                    style={{
                      textAlign: "center",
                      letterSpacing: "10px",
                      fontSize: "1.45rem",
                      fontWeight: 800,
                      fontFamily: "var(--font-mono)",
                      color: "#38bdf8",
                      padding: "12px",
                      background: "rgba(56, 189, 248, 0.08)",
                      border: "1.5px solid rgba(56, 189, 248, 0.4)",
                    }}
                    autoFocus
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="btn-primary"
                  disabled={loading || signUpOtpCode.length < 6}
                  style={{
                    width: "100%",
                    justifyContent: "center",
                    marginTop: "14px",
                    background: "linear-gradient(135deg, #0284c7, #06b6d4)",
                  }}
                >
                  {loading ? (
                    <>
                      <div className="spinner"></div>
                      <span>Verifying &amp; Registering...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={16} />
                      <span>Verify OTP &amp; Complete Registration</span>
                    </>
                  )}
                </button>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: "16px",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSignUpOtpStep(false);
                      setSignUpOtpCode("");
                      setError(null);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--text-dim)",
                      cursor: "pointer",
                      fontSize: "0.78rem",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <ArrowLeft size={13} />
                    <span>Edit Details</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleResendSignUpOtp}
                    disabled={loading}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--accent-cyan)",
                      cursor: "pointer",
                      fontSize: "0.78rem",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      fontWeight: 600,
                    }}
                  >
                    <RefreshCw size={13} />
                    <span>Resend OTP</span>
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
