import React, { useState, useEffect, useRef } from "react";
import {
  Cloud,
  Search,
  UploadCloud,
  Shield,
  LogOut,
  Bell,
  UserPlus,
  LogIn,
  User,
  Smartphone,
  Mic,
  MicOff,
  MessageSquare,
  HelpCircle,
  Users,
  Zap,
  ChevronDown
} from "lucide-react";
import { SITE_NAME, SITE_TAGLINE } from "../config/clientConfig";

export default function Navbar({
  searchTerm,
  setSearchTerm,
  onOpenUpload,
  onOpenAdmin,
  onOpenNotices,
  onOpenAuth,
  onOpenProfile,
  onOpenChat,
  onOpenHelp,
  onOpenStudyPod,
  onOpenAirDrop,
  currentUser,
  onLogout,
  noticeCount = 0,
}) {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const toolsRef = useRef(null);
  const searchInputRef = useRef(null);

  const [isInstalled, setIsInstalled] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const isStandaloneMedia = window.matchMedia ? window.matchMedia("(display-mode: standalone)")?.matches : false;
      const isNavStandalone = window.navigator?.standalone === true;
      const isAndroidApp = typeof document !== "undefined" && Boolean(document.referrer?.includes("android-app://"));
      return Boolean(isStandaloneMedia || isNavStandalone || isAndroidApp);
    } catch (_) {
      return false;
    }
  });

  // Close tools dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (toolsRef.current && !toolsRef.current.contains(event.target)) {
        setIsToolsOpen(false);
      }
    };
    if (isToolsOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isToolsOpen]);

  // Global Keyboard Shortcut: ⌘K or Ctrl+K focuses the Universal Spotlight Search
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (searchInputRef.current) {
          searchInputRef.current.focus();
          searchInputRef.current.select();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const checkStandalone = () => {
      try {
        const isStandaloneMedia = window.matchMedia ? window.matchMedia("(display-mode: standalone)")?.matches : false;
        const isNavStandalone = window.navigator?.standalone === true;
        const isAndroidApp = typeof document !== "undefined" && Boolean(document.referrer?.includes("android-app://"));
        if (isStandaloneMedia || isNavStandalone || isAndroidApp) {
          setIsInstalled(true);
        }
      } catch (_) {}
    };
    checkStandalone();
    let mediaQuery = null;
    try {
      mediaQuery = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(display-mode: standalone)") : null;
      if (mediaQuery && mediaQuery.addEventListener) {
        mediaQuery.addEventListener("change", checkStandalone);
      }
    } catch (_) {}
    const handler = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    });
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      if (mediaQuery && mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener("change", checkStandalone);
      }
    };
  }, []);

  const handleInstallClick = async () => {
    if (installPrompt) {
      installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice?.outcome === "accepted") {
        setIsInstalled(true);
      }
      setInstallPrompt(null);
    } else {
      alert("📲 To Install FreeStudyMaterial App on Edge/Chrome:\n\n1. Look at Edge top-right: Click the 3 dots (...) menu.\n2. Click 'Apps' -> 'Install this site as an app'.\n\nOn Mobile: Tap 3 dots -> 'Add to Home screen'!");
    }
  };

  const isAdminOrManager = Boolean(
    currentUser?.isMainAdmin ||
    currentUser?.isAdmin ||
    currentUser?.role === "admin" ||
    currentUser?.role === "half_admin" ||
    currentUser?.role === "sub_admin" ||
    (Array.isArray(currentUser?.permissions) && (
      currentUser.permissions.includes("all") ||
      currentUser.permissions.includes("manage_notes") ||
      currentUser.permissions.includes("manage_users") ||
      currentUser.permissions.includes("manage_chat") ||
      currentUser.permissions.includes("delete_records")
    ))
  );

  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);

  const handleVoiceSearch = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("🎙️ Voice search is not supported in this browser. Please use Chrome or Edge.");
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (_) {}
      }
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = "en-IN";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => setIsListening(true);
      recognition.onresult = (event) => {
        const transcript = event?.results?.[0]?.[0]?.transcript;
        if (transcript) {
          setSearchTerm(transcript);
        }
      };
      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);

      recognitionRef.current = recognition;
      recognition.start();
    } catch (_) {
      setIsListening(false);
    }
  };

  return (
    <header className="navbar-wrapper">
      <div className="navbar-content">
        {/* 1. Brand Section */}
        <div className="brand-section" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} title="Scroll to Top">
          <div className="brand-logo-glow">
            <Cloud size={22} />
          </div>
          <div>
            <div className="brand-title">{SITE_NAME}</div>
            <div className="brand-status-tag">
              <span className="pulse-dot"></span>
              {SITE_TAGLINE} • CDN Ready
            </div>
          </div>
        </div>

        {/* 2. Universal Spotlight Search with Voice & ⌘K */}
        <div className="search-wrapper">
          <Search size={16} className="search-icon" />
          <input
            ref={searchInputRef}
            type="text"
            className="search-input"
            placeholder="Search notes, subjects, branch, PYQs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <button
            type="button"
            onClick={handleVoiceSearch}
            style={{
              position: "absolute",
              right: "44px",
              top: "50%",
              transform: "translateY(-50%)",
              background: isListening ? "rgba(239, 68, 68, 0.25)" : "transparent",
              border: isListening ? "1px solid #ef4444" : "none",
              borderRadius: "50%",
              width: "26px",
              height: "26px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: isListening ? "#ef4444" : "var(--text-dim, #94a3b8)",
              transition: "all 0.2s ease",
            }}
            title={isListening ? "Listening... Click to stop" : "Voice Search (Speak to search notes)"}
          >
            {isListening ? <MicOff size={15} /> : <Mic size={15} />}
          </button>
          <kbd className="search-kbd-shortcut">⌘K</kbd>
        </div>

        {/* 3. Floating Action Matrix (ALL 11 ELEMENTS ACCOMMODATED CLEANLY) */}
        <div className="nav-actions">
          {/* ⚡ Campus AirDrop (0 KB Offline Peer Mesh) */}
          <button
            className="btn-secondary"
            onClick={onOpenAirDrop}
            title="⚡ Campus AirDrop: Send or Receive notes offline with 0 KB internet via 1-Tap QR Mesh"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              background: "rgba(168, 85, 247, 0.14)",
              border: "1px solid rgba(168, 85, 247, 0.38)",
              color: "#c084fc",
              fontWeight: 700,
              fontSize: "0.8rem",
              padding: "7px 12px",
            }}
          >
            <Zap size={14} />
            <span>AirDrop</span>
            <span
              style={{
                fontSize: "0.62rem",
                background: "rgba(168, 85, 247, 0.25)",
                padding: "1px 5px",
                borderRadius: "6px",
                color: "#e9d5ff",
                fontWeight: 700,
              }}
            >
              0 KB
            </span>
          </button>

          {/* 💬 Student Chat Hub */}
          <button
            className="btn-secondary"
            onClick={onOpenChat}
            title="Student Hub & Live Discussion"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              background: "rgba(99, 102, 241, 0.12)",
              border: "1px solid rgba(99, 102, 241, 0.35)",
              color: "#a5b4fc",
              fontWeight: 600,
              fontSize: "0.8rem",
              padding: "7px 12px",
            }}
          >
            <MessageSquare size={14} />
            <span>Chat Hub</span>
          </button>

          {/* 🔔 Notice Board Bell */}
          <button
            className="btn-icon"
            onClick={onOpenNotices}
            title="Notice Board & Announcements"
            style={{ position: "relative", width: "36px", height: "36px" }}
          >
            <Bell size={16} />
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
                  boxShadow: "0 0 8px #06b6d4",
                }}
              />
            )}
          </button>

          {/* 🛠️ Floating Tools Island (Houses Study Pod, Help Desk, Install App & Admin Portal) */}
          <div className="nav-tools-container" ref={toolsRef}>
            <button
              type="button"
              className="nav-tools-btn"
              onClick={() => setIsToolsOpen(!isToolsOpen)}
              title="More Academic Tools & Services"
            >
              <Users size={14} style={{ color: "#38bdf8" }} />
              <span>Tools</span>
              <ChevronDown
                size={13}
                style={{
                  transform: isToolsOpen ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.2s ease",
                  opacity: 0.7,
                }}
              />
            </button>

            {/* Floating Dropdown Island */}
            {isToolsOpen && (
              <div className="nav-tools-dropdown">
                {/* 1. Collaborative Live Study Pod */}
                <button
                  type="button"
                  className="nav-tools-item"
                  onClick={() => {
                    setIsToolsOpen(false);
                    onOpenStudyPod();
                  }}
                >
                  <Users size={15} style={{ color: "#34d399" }} />
                  <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                    <span>Collaborative Study Pod</span>
                    <span style={{ fontSize: "0.65rem", color: "var(--text-dim)" }}>Real-time Canvas & Sync</span>
                  </div>
                  <span
                    style={{
                      fontSize: "0.62rem",
                      background: "rgba(16, 185, 129, 0.2)",
                      color: "#6ee7b7",
                      padding: "1px 5px",
                      borderRadius: "6px",
                      fontWeight: 700,
                    }}
                  >
                    P2P
                  </span>
                </button>

                {/* 2. Help & Support Desk */}
                <button
                  type="button"
                  className="nav-tools-item"
                  onClick={() => {
                    setIsToolsOpen(false);
                    onOpenHelp();
                  }}
                >
                  <HelpCircle size={15} style={{ color: "#38bdf8" }} />
                  <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                    <span>Help &amp; Support Desk</span>
                    <span style={{ fontSize: "0.65rem", color: "var(--text-dim)" }}>FAQs &amp; 24/7 Queries</span>
                  </div>
                </button>

                {/* 3. Install App (PWA) */}
                {!isInstalled && (
                  <button
                    type="button"
                    className="nav-tools-item"
                    onClick={() => {
                      setIsToolsOpen(false);
                      handleInstallClick();
                    }}
                  >
                    <Smartphone size={15} style={{ color: "#a855f7" }} />
                    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                      <span>Install App (PWA)</span>
                      <span style={{ fontSize: "0.65rem", color: "var(--text-dim)" }}>Fast Offline Desktop/Mobile</span>
                    </div>
                  </button>
                )}

                {/* 4. Admin Studio Portal (if authorized) */}
                {isAdminOrManager && (
                  <button
                    type="button"
                    className="nav-tools-item"
                    onClick={() => {
                      setIsToolsOpen(false);
                      onOpenAdmin();
                    }}
                    style={{
                      borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                      paddingTop: "10px",
                    }}
                  >
                    <Shield size={15} style={{ color: "#f59e0b" }} />
                    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                      <span style={{ color: "#fbbf24" }}>Admin Security Studio</span>
                      <span style={{ fontSize: "0.65rem", color: "var(--text-dim)" }}>Notes, Logs &amp; Access</span>
                    </div>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 🚀 Primary CTA: Upload Notes */}
          <button className="btn-primary" onClick={onOpenUpload} style={{ padding: "8px 16px", fontSize: "0.82rem" }}>
            <UploadCloud size={16} />
            <span>Upload Notes</span>
          </button>

          {/* 👤 User Auth Info / Profile Chip */}
          {currentUser ? (
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "7px",
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-full)",
                  padding: "5px 12px 5px 6px",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
                onClick={onOpenProfile}
                title="Edit My Profile & Password"
              >
                <div
                  style={{
                    width: "26px",
                    height: "26px",
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, var(--accent-indigo), var(--accent-cyan))",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.75rem",
                    fontWeight: 800,
                    boxShadow: "0 0 10px rgba(6, 182, 212, 0.35)",
                  }}
                >
                  {currentUser.name ? currentUser.name[0].toUpperCase() : "U"}
                </div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#fff", lineHeight: 1.1 }}>
                    {currentUser.name?.split(" ")[0] || currentUser.email?.split("@")[0]}
                  </span>
                  <span style={{ fontSize: "0.62rem", color: "var(--text-dim)" }}>
                    {currentUser.role === "admin" ? "Admin" : currentUser.college ? currentUser.college.substring(0, 14) + "..." : "Student"}
                  </span>
                </div>
              </div>

              <button
                className="btn-icon"
                onClick={onLogout}
                title="Log Out"
                style={{ width: "34px", height: "34px" }}
              >
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <button className="btn-secondary" onClick={onOpenAuth} style={{ padding: "7px 14px", fontSize: "0.8rem" }}>
              <LogIn size={14} />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
