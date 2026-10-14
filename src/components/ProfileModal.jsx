import React, { useState, useEffect } from "react";
import { X, User, Lock, CheckCircle2, AlertCircle, Save, Key, Shield } from "lucide-react";
import { api } from "../api";

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

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

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
        <div style={{ display: "flex", gap: "8px", marginBottom: "18px" }}>
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

        {tab === "profile" ? (
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
        ) : (
          /* Change Password Form */
          <form onSubmit={handleChangePassword}>
            <div className="form-group">
              <label className="form-label">Current Password *</label>
              <input
                type="password"
                className="form-input"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter your current password"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">New Password * (Min 6 chars)</label>
              <input
                type="password"
                className="form-input"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Confirm New Password *</label>
              <input
                type="password"
                className="form-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-type new password"
                required
              />
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
      </div>
    </div>
  );
}

