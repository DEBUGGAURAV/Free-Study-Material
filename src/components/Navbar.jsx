import React from "react";
import { Cloud, Search, UploadCloud, Shield, LogOut, UserCheck } from "lucide-react";

export default function Navbar({
  searchTerm,
  setSearchTerm,
  onOpenUpload,
  onOpenAdmin,
  currentUser,
  onLogout,
}) {
  return (
    <header className="navbar-wrapper">
      <div className="navbar-content">
        {/* Brand */}
        <div className="brand-section" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
          <div className="brand-logo-glow">
            <Cloud size={24} />
          </div>
          <div>
            <div className="brand-title">Academic Vault</div>
            <div className="brand-status-tag">
              <span className="pulse-dot"></span>
              MTProto 2GB • CDN Ready
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="search-wrapper">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Search notes, subjects, codes, or tags..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Actions */}
        <div className="nav-actions">
          <button className="btn-primary" onClick={onOpenUpload}>
            <UploadCloud size={18} />
            <span>Upload Notes</span>
          </button>

          <button className="btn-secondary" onClick={onOpenAdmin}>
            <Shield size={16} />
            <span>{currentUser?.role === "admin" ? "Admin Studio" : "Admin Login"}</span>
          </button>

          {currentUser && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span
                style={{
                  fontSize: "0.8rem",
                  color: "var(--accent-cyan)",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <UserCheck size={14} />
                {currentUser.name || currentUser.email}
              </span>
              <button
                className="btn-icon"
                onClick={onLogout}
                title="Log Out"
                style={{ width: "34px", height: "34px" }}
              >
                <LogOut size={15} />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
