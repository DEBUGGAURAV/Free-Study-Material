import React, { useState, useEffect } from "react";
import { X, User, Lock, CheckCircle2, AlertCircle, Save, Key, Shield, Eye, EyeOff, Trash2 } from "lucide-react";
import { api } from "../api";
import { registerDevicePasskey, isPasskeySupported } from "../utils/passkeyClient";

const RESERVED_NAMES = [
  "admin", "administrator", "root", "staff", "mod", "moderator",
  "fsm", "freestudymaterial", "fsmadmin", "fsm_admin", "official", "support",
  "helpdesk", "system", "security", "owner", "superuser", "founder",
  "coreconcepts", "bot", "ai", "team", "securitybot", "fsmchat"
];

export default function ProfileModal({ isOpen, onClose, currentUser, onProfileUpdated }) {
  const [tab, setTab] = useState("profile"); // 'profile' or 'password'

  // Profile fields
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [initialMobile, setInitialMobile] = useState("");
  const [college, setCollege] = useState("");
  const [year, setYear] = useState("1st Year");

  // Mobile change re-verification state
  const [mobileOtp, setMobileOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);

  // Password fields
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  // Passkey State (Old Firebase Storage)
  const [passkeys, setPasskeys] = useState([]);
  const [loadingPasskeys, setLoadingPasskeys] = useState(false);
  const [registeringPasskey, setRegisteringPasskey] = useState(false);
  const [deletingPasskeyId, setDeletingPasskeyId] = useState(null);
  const [supportsPasskey, setSupportsPasskey] = useState(true);

  useEffect(() => {
    isPasskeySupported().then((sup) => setSupportsPasskey(sup));
  }, []);

  const loadPasskeys = async () => {
    try {
      setLoadingPasskeys(true);
      const res = await api.getPasskeysList();
      if (res && res.success) {
        setPasskeys(res.passkeys || []);
      }
    } catch (_) {
      setPasskeys([]);
    } finally {
      setLoadingPasskeys(false);
    }
  };

  useEffect(() => {
    if (tab === "passkey" && isOpen) {
      loadPasskeys();
    }
  }, [tab, isOpen]);

  const handleRegisterPasskey = async () => {
    try {
      setRegisteringPasskey(true);
      setMsg(null);
      const res = await registerDevicePasskey();
      setMsg({ type: "success", text: res.message || "Passkey registered successfully! Saved securely in Firebase." });
      await loadPasskeys();
    } catch (err) {
      if (err.message && !err.message.includes("cancelled")) {
        setMsg({ type: "error", text: err.message || "Failed to register passkey." });
      }
    } finally {
      setRegisteringPasskey(false);
    }
  };

  const handleDeletePasskey = async (id) => {
    if (!window.confirm("Remove this passkey from your account?")) return;
    try {
      setDeletingPasskeyId(id);
      await api.deletePasskey(id);
      setMsg({ type: "success", text: "Passkey removed from your account." });
      await loadPasskeys();
    } catch (err) {
      setMsg({ type: "error", text: err.message || "Failed to remove passkey." });
    } finally {
      setDeletingPasskeyId(null);
    }
  };

  useEffect(() => {
    if (currentUser) {
      setName(currentUser.name || "");
      setMobile(currentUser.mobile || "");
      setInitialMobile(currentUser.mobile || "");
      setCollege(currentUser.college || "");
      setYear(currentUser.year || "1st Year");
      setMobileOtp("");
      setOtpSent(false);
    }
    setMsg(null);
  }, [currentUser, isOpen]);

  if (!isOpen || !currentUser) return null;

  const isMobileChanged = mobile.trim() !== (initialMobile || "").trim();

  const handleSendMobileOtp = async () => {
    if (!mobile.trim() || mobile.trim().length !== 10) {
      return setMsg({ type: "error", text: "Please enter a valid 10-digit mobile number first." });
    }
    try {
      setSendingOtp(true);
      setMsg(null);
      const res = await api.requestProfileMobileOtp(mobile.trim());
      setOtpSent(true);
      setMsg({ type: "success", text: res.message || `Verification OTP sent to ${currentUser.email}!` });
    } catch (err) {
      setMsg({ type: "error", text: err.message || "Failed to send verification OTP." });
    } finally {
      setSendingOtp(false);
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    const normName = name.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    const isAdmin = currentUser.role === "admin" || currentUser.id === "admin-root";

    if (!isAdmin) {
      if (RESERVED_NAMES.some((r) => normName.includes(r))) {
        setLoading(false);
        return setMsg({
          type: "error",
          text: "Reserved keyword detected: Display names cannot contain administrative titles (Admin, FSM, Official, System, Staff, Support, Moderator). Please choose an academic nickname.",
        });
      }
    }

    if (isMobileChanged && !mobileOtp.trim()) {
      setLoading(false);
      return setMsg({
        type: "error",
        text: "Changing your mobile number requires Email verification. Please click 'Send OTP to Email' and enter the 6-digit code.",
      });
    }

    try {
      const res = await api.updateProfile({
        name: name.trim(),
        username: currentUser?.username || "",
        photoUrl: currentUser?.photoUrl || currentUser?.avatar || "",
        mobile: mobile.trim(),
        college: college.trim(),
        year: year.trim(),
        otp: mobileOtp.trim(),
      });

      setMsg({ type: "success", text: "Profile details updated successfully!" });
      setInitialMobile(mobile.trim());
      setMobileOtp("");
      setOtpSent(false);
      if (onProfileUpdated) {
        onProfileUpdated(res.user);
      }
    } catch (err) {
      setMsg({ type: "error", text: err.message || "Failed to update profile." });
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    if (newPassword.length < 6) {
      setLoading(false);
      return setMsg({ type: "error", text: "New password must be at least 6 characters long." });
    }

    if (newPassword !== confirmPassword) {
      setLoading(false);
      return setMsg({ type: "error", text: "New passwords do not match." });
    }

    try {
      await api.changePassword({
        currentPassword,
        newPassword,
      });

      setMsg({ type: "success", text: "Password changed successfully! Keep it secure." });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setMsg({ type: "error", text: err.message || "Failed to change password." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: "520px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "var(--radius-sm)",
                background: "rgba(99, 102, 241, 0.15)",
                color: "var(--accent-indigo)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <User size={20} />
            </div>
            <div>
              <div className="modal-title">My Account Settings</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>
                {currentUser.email} • {currentUser.role?.toUpperCase()}
              </div>
            </div>
          </div>

          <button className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "18px", flexWrap: "wrap" }}>
          <button
            type="button"
            className={`filter-tab ${tab === "profile" ? "active" : ""}`}
            onClick={() => { setTab("profile"); setMsg(null); }}
          >
            <User size={14} style={{ marginRight: "4px" }} />
            Edit Profile Details
          </button>
          <button
            type="button"
            className={`filter-tab ${tab === "password" ? "active" : ""}`}
            onClick={() => { setTab("password"); setMsg(null); }}
          >
            <Lock size={14} style={{ marginRight: "4px" }} />
            Change Password
          </button>
          <button
            type="button"
            className={`filter-tab ${tab === "passkey" ? "active" : ""}`}
            onClick={() => { setTab("passkey"); setMsg(null); }}
          >
            <Key size={14} style={{ marginRight: "4px" }} />
            Passkey & Biometrics
          </button>
        </div>

        {msg && (
          <div
            style={{
              background: msg.type === "error" ? "rgba(244, 63, 94, 0.12)" : "rgba(16, 185, 129, 0.12)",
              border: msg.type === "error" ? "1px solid rgba(244, 63, 94, 0.35)" : "1px solid rgba(16, 185, 129, 0.35)",
              color: msg.type === "error" ? "#f43f5e" : "#10b981",
              padding: "10px 14px",
              borderRadius: "var(--radius-md)",
              marginBottom: "16px",
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            {msg.type === "error" ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
            <span>{msg.text}</span>
          </div>
        )}

        {tab === "profile" && (
          /* Profile Details Form */
          <form onSubmit={handleUpdateProfile}>
            <div className="form-group">
              <label className="form-label">Full Name *</label>
              <input
                type="text"
                className="form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
                required
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div className="form-group">
                <label className="form-label">Mobile Number</label>
                <input
                  type="tel"
                  className="form-input"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  placeholder="10-digit number"
                  maxLength={10}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Year of Study</label>
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
            </div>

            {/* Mobile Number Change Security Re-Verification Box */}
            {isMobileChanged && (
              <div
                style={{
                  background: "rgba(99, 102, 241, 0.08)",
                  border: "1px solid rgba(99, 102, 241, 0.28)",
                  borderRadius: "10px",
                  padding: "14px",
                  marginBottom: "16px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", flexWrap: "wrap", gap: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <Shield size={16} style={{ color: "var(--accent-cyan)" }} />
                    <span style={{ fontWeight: 700, color: "var(--accent-cyan)", fontSize: "0.82rem" }}>
                      Security Verification Required
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleSendMobileOtp}
                    disabled={sendingOtp}
                    className="btn-secondary"
                    style={{ fontSize: "0.74rem", padding: "5px 12px", borderRadius: "6px" }}
                  >
                    {sendingOtp ? "Sending..." : otpSent ? "Resend OTP" : "Send OTP to Email"}
                  </button>
                </div>
                <p style={{ fontSize: "0.74rem", color: "var(--text-dim)", margin: "0 0 10px 0", lineHeight: "1.4" }}>
                  To prevent unauthorized number hijacking, a 6-digit authorization code must be sent to your registered email (<strong>{currentUser.email}</strong>).
                </p>
                <input
                  type="text"
                  className="form-input"
                  value={mobileOtp}
                  onChange={(e) => setMobileOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="Enter 6-Digit Email Verification Code"
                  maxLength={6}
                  style={{ letterSpacing: "3px", fontWeight: 700, textAlign: "center", fontSize: "0.95rem" }}
                  required={isMobileChanged}
                />
              </div>
            )}

            <div className="form-group">
              <label className="form-label">College / University Name</label>
              <input
                type="text"
                className="form-input"
                value={college}
                onChange={(e) => setCollege(e.target.value)}
                placeholder="College name"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Registered Email</label>
              <input
                type="email"
                className="form-input"
                value={currentUser.email}
                readOnly
                style={{ opacity: 0.7 }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "18px" }}>
              <button type="button" className="btn-secondary" onClick={onClose}>
                Close
              </button>
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? "Saving..." : "Save Profile Details"}
              </button>
            </div>
          </form>
        )}

        {tab === "password" && (
          /* Change Password Form */
          <form onSubmit={handleChangePassword}>
            <div className="form-group">
              <label className="form-label">Current Password *</label>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <input
                  type={showCurrentPassword ? "text" : "password"}
                  className="form-input"
                  style={{ width: "100%", paddingRight: "42px" }}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter your current password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  title={showCurrentPassword ? "Hide password" : "Show password"}
                  style={{
                    position: "absolute",
                    right: "12px",
                    background: "none",
                    border: "none",
                    padding: "4px",
                    color: showCurrentPassword ? "#a78bfa" : "var(--text-dim)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  tabIndex={-1}
                >
                  {showCurrentPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">New Password * (Min 6 chars)</label>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <input
                  type={showNewPassword ? "text" : "password"}
                  className="form-input"
                  style={{ width: "100%", paddingRight: "42px" }}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  title={showNewPassword ? "Hide password" : "Show password"}
                  style={{
                    position: "absolute",
                    right: "12px",
                    background: "none",
                    border: "none",
                    padding: "4px",
                    color: showNewPassword ? "#a78bfa" : "var(--text-dim)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  tabIndex={-1}
                >
                  {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Confirm New Password *</label>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  className="form-input"
                  style={{ width: "100%", paddingRight: "42px" }}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-type new password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  title={showConfirmPassword ? "Hide password" : "Show password"}
                  style={{
                    position: "absolute",
                    right: "12px",
                    background: "none",
                    border: "none",
                    padding: "4px",
                    color: showConfirmPassword ? "#a78bfa" : "var(--text-dim)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  tabIndex={-1}
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "18px" }}>
              <button type="button" className="btn-secondary" onClick={onClose}>
                Close
              </button>
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? "Updating..." : "Update Password"}
              </button>
            </div>
          </form>
        )}

        {tab === "passkey" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ textAlign: "center", padding: "12px 10px 8px" }}>
              <div
                style={{
                  width: "52px",
                  height: "52px",
                  borderRadius: "16px",
                  background: "linear-gradient(135deg, rgba(6, 182, 212, 0.2), rgba(99, 102, 241, 0.2))",
                  border: "1px solid rgba(56, 189, 248, 0.4)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 10px",
                  color: "#38bdf8",
                }}
              >
                <Key size={26} />
              </div>
              <h3 style={{ margin: "0 0 6px", fontSize: "1.1rem", fontWeight: 800, color: "#fff" }}>
                Passkey & Biometric Sign-In
              </h3>
              <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-dim)", lineHeight: 1.5 }}>
                Sign in to your account in 0ms using your device's built-in <strong>Face ID</strong>, <strong>Fingerprint</strong>, or <strong>Windows Hello PIN</strong>.
              </p>
            </div>

            {/* Register Passkey Button */}
            <button
              type="button"
              onClick={handleRegisterPasskey}
              disabled={registeringPasskey}
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: "12px",
                background: "linear-gradient(135deg, #06b6d4, #3b82f6)",
                border: "none",
                color: "#fff",
                fontWeight: 700,
                fontSize: "0.88rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                cursor: "pointer",
                boxShadow: "0 6px 20px rgba(6, 182, 212, 0.3)",
              }}
            >
              <Key size={18} />
              <span>{registeringPasskey ? "Registering Biometric Device..." : "+ Register This Device as Passkey"}</span>
            </button>

            {/* Passkeys List */}
            <div>
              <div style={{ fontSize: "0.76rem", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>
                Registered Passkeys ({passkeys.length})
              </div>

              {loadingPasskeys ? (
                <div style={{ textAlign: "center", padding: "20px", color: "var(--text-dim)", fontSize: "0.82rem" }}>
                  Loading passkeys from Firebase...
                </div>
              ) : passkeys.length === 0 ? (
                <div
                  style={{
                    background: "rgba(255, 255, 255, 0.03)",
                    border: "1px dashed rgba(255, 255, 255, 0.1)",
                    borderRadius: "12px",
                    padding: "16px",
                    textAlign: "center",
                    color: "var(--text-dim)",
                    fontSize: "0.82rem",
                  }}
                >
                  No passkeys registered on this account yet. Click above to add your device!
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {passkeys.map((p) => (
                    <div
                      key={p.id}
                      style={{
                        background: "rgba(255, 255, 255, 0.04)",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        borderRadius: "12px",
                        padding: "12px 14px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div
                          style={{
                            width: "36px",
                            height: "36px",
                            borderRadius: "10px",
                            background: "rgba(56, 189, 248, 0.15)",
                            color: "#38bdf8",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Shield size={18} />
                        </div>
                        <div>
                          <div style={{ fontSize: "0.86rem", fontWeight: 700, color: "#fff" }}>
                            {p.deviceName}
                          </div>
                          <div style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>
                            Added: {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : "Active"} • Secure in Firebase
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeletePasskey(p.id)}
                        disabled={deletingPasskeyId === p.id}
                        style={{
                          background: "rgba(239, 68, 68, 0.15)",
                          border: "1px solid rgba(239, 68, 68, 0.3)",
                          borderRadius: "8px",
                          padding: "6px",
                          color: "#f87171",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                        title="Remove Passkey"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                background: "rgba(16, 185, 129, 0.08)",
                border: "1px solid rgba(16, 185, 129, 0.2)",
                borderRadius: "10px",
                padding: "10px 14px",
                fontSize: "0.75rem",
                color: "#6ee7b7",
                lineHeight: 1.4,
              }}
            >
              <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
              <span>
                <strong>100% Phishing Resistant:</strong> Passkey private keys never leave your device sensor. Protected by Firebase Cloud Storage.
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

