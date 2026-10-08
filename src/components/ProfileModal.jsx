import React, { useState, useEffect } from "react";
import { X, User, Lock, Key, Phone, School, Calendar, CheckCircle2, AlertCircle, Save } from "lucide-react";
import { api } from "../api";

export default function ProfileModal({ isOpen, onClose, currentUser, onProfileUpdated }) {
  const [tab, setTab] = useState("profile"); // 'profile' or 'password'

  // Profile fields
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [college, setCollege] = useState("");
  const [year, setYear] = useState("1st Year");

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
      setCollege(currentUser.college || "");
      setYear(currentUser.year || "1st Year");
    }
    setMsg(null);
  }, [currentUser, isOpen]);

  if (!isOpen || !currentUser) return null;

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    try {
      const res = await api.updateProfile({
        name: name.trim(),
        mobile: mobile.trim(),
        college: college.trim(),
        year: year.trim(),
      });

      setMsg({ type: "success", text: "Profile details updated successfully!" });
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
              <label className="form-label">Registered Gmail (Fixed)</label>
              <input
                type="email"
                className="form-input"
                value={currentUser.email}
                disabled
                style={{ opacity: 0.6, cursor: "not-allowed" }}
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

