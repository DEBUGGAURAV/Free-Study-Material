import React from "react";
import { Cloud, Search, UploadCloud, Shield, LogOut, Bell, UserPlus, LogIn, User } from "lucide-react";

export default function Navbar({
  searchTerm,
  setSearchTerm,
  onOpenUpload,
  onOpenAdmin,
  onOpenNotices,
  onOpenAuth,
  currentUser,
  onLogout,
  noticeCount = 0,
}) {
  const isAdminOrManager =
    currentUser?.role === "admin" ||
    currentUser?.email === "jnplotus@gmail.com" ||
    currentUser?.permissions?.includes("all") ||
    currentUser?.permissions?.includes("manage_notes");

  return (
    <header className="navbar-wrapper">
      <div className="navbar-content">
        {/* Brand */}
        <div className="brand-section" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
          <div className="brand-logo-glow">
            <Cloud size={24} />
          </div>
          <div>
            <div className="brand-title">Free Study Material</div>
            <div className="brand-status-tag">
              <span className="pulse-dot"></span>
              Academic Vault • CDN Ready
            </div>
          </div>
        </div>

        {/* Universal Search */}
        <div className="search-wrapper">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Search notes, subjects, branch, or keywords..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Actions */}
        <div className="nav-actions">
          {/* Notice Board Button */}
          <button
            className="btn-icon"
            onClick={onOpenNotices}
            title="Notice Board & Announcements"
            style={{ position: "relative" }}
          >
            <Bell size={18} />
            {noticeCount > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: "6px",
                  right: "6px",
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: "#06b6d4",
                  boxShadow: "0 0 6px #06b6d4",
                }}
              />
            )}
          </button>

          {/* Upload Button */}
          <button className="btn-primary" onClick={onOpenUpload}>
            <UploadCloud size={17} />
            <span>Upload Notes</span>
          </button>

          {/* Admin Studio Button (if authorized) */}
          {isAdminOrManager && (
            <button className="btn-secondary" onClick={onOpenAdmin}>
              <Shield size={16} />
              <span>Admin Studio</span>
            </button>
          )}

          {/* User Auth Info / Login */}
          {currentUser ? (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-full)",
                  padding: "6px 12px",
                }}
              >
                <div
                  style={{
                    width: "24px",
                    height: "24px",
                    borderRadius: "50%",
                    background: "rgba(99, 102, 241, 0.2)",
                    color: "var(--accent-indigo)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                  }}
                >
                  {currentUser.name ? currentUser.name[0].toUpperCase() : "U"}
                </div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#fff", lineHeight: 1.1 }}>
                    {currentUser.name?.split(" ")[0] || currentUser.email?.split("@")[0]}
                  </span>
                  <span style={{ fontSize: "0.65rem", color: "var(--text-dim)" }}>
                    {currentUser.role === "admin" ? "Admin" : currentUser.college ? currentUser.college.substring(0, 16) + "..." : "Student"}
                  </span>
                </div>
              </div>

              <button
                className="btn-icon"
                onClick={onLogout}
                title="Log Out"
                style={{ width: "36px", height: "36px" }}
              >
                <LogOut size={15} />
              </button>
            </div>
          ) : (
            <button className="btn-secondary" onClick={onOpenAuth}>
              <LogIn size={15} />
              <span>Sign In / Register</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
