import React, { useState, useEffect, useRef } from "react";
import { Cloud, Search, UploadCloud, Shield, LogOut, Bell, UserPlus, LogIn, User, Smartphone, Mic, MicOff, MessageSquare, HelpCircle, Users } from "lucide-react";
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
  currentUser,
  onLogout,
  noticeCount = 0,
}) {
  const [installPrompt, setInstallPrompt] = useState(null);
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
        {/* Brand */}
        <div className="brand-section" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
          <div className="brand-logo-glow">
            <Cloud size={24} />
          </div>
          <div>
            <div className="brand-title">{SITE_NAME}</div>
            <div className="brand-status-tag">
              <span className="pulse-dot"></span>
              {SITE_TAGLINE} • CDN Ready
            </div>
          </div>
        </div>

        {/* Universal Search */}
        <div className="search-wrapper" style={{ position: "relative" }}>
          <Search size={18} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Search notes, subjects, branch, or keywords..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ paddingRight: "40px" }}
          />
          <button
            type="button"
            onClick={handleVoiceSearch}
            style={{
              position: "absolute",
              right: "10px",
              top: "50%",
              transform: "translateY(-50%)",
              background: isListening ? "rgba(239, 68, 68, 0.25)" : "transparent",
              border: isListening ? "1px solid #ef4444" : "none",
              borderRadius: "50%",
              width: "28px",
              height: "28px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: isListening ? "#ef4444" : "var(--text-dim, #94a3b8)",
              transition: "all 0.2s ease",
            }}
            title={isListening ? "Listening... Click to stop" : "Voice Search (Speak to search notes)"}
          >
            {isListening ? <MicOff size={16} /> : <Mic size={16} />}
          </button>
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

          {/* Collaborative Live Study Pod with Real-time Canvas */}
          <button
            className="btn-secondary"
            onClick={onOpenStudyPod}
            title="Collaborative Live Study Pod (Real-time P2P Canvas & Notes Sync)"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              background: "rgba(16, 185, 129, 0.12)",
              border: "1px solid rgba(16, 185, 129, 0.35)",
              color: "#34d399",
              fontWeight: 600,
              fontSize: "0.82rem",
            }}
          >
            <Users size={16} />
            <span>Study Pod</span>
            <span
              style={{
                fontSize: "0.65rem",
                background: "rgba(16, 185, 129, 0.25)",
                padding: "1px 5px",
                borderRadius: "8px",
                color: "#6ee7b7",
                fontWeight: 700,
              }}
            >
              P2P
            </span>
          </button>

          {/* Real-time Student Chat & Study Pods */}
          <button
            className="btn-secondary"
            onClick={onOpenChat}
            title="Student Hub & Study Pods (Live Chat)"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              background: "rgba(99, 102, 241, 0.12)",
              border: "1px solid rgba(99, 102, 241, 0.35)",
              color: "#a5b4fc",
              fontWeight: 600,
              fontSize: "0.82rem",
            }}
          >
            <MessageSquare size={16} />
            <span>Chat Hub</span>
          </button>

          {/* Help & Support Desk */}
          <button
            className="btn-secondary"
            onClick={onOpenHelp}
            title="Help Center, FAQs & 2-Way Admin Support"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              background: "rgba(56, 189, 248, 0.12)",
              border: "1px solid rgba(56, 189, 248, 0.35)",
              color: "#38bdf8",
              fontWeight: 600,
              fontSize: "0.82rem",
            }}
          >
            <HelpCircle size={16} />
            <span>Help Desk</span>
          </button>

          {/* Upload Button */}
          <button className="btn-primary" onClick={onOpenUpload}>
            <UploadCloud size={17} />
            <span>Upload Notes</span>
          </button>

          {/* PWA Install App Button */}
          {!isInstalled && (
            <button
              className="btn-secondary"
              onClick={handleInstallClick}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                background: "rgba(16, 185, 129, 0.12)",
                border: "1px solid rgba(16, 185, 129, 0.35)",
                color: "#34d399",
                fontWeight: 600,
                fontSize: "0.82rem",
              }}
              title={`Install ${SITE_NAME} as Desktop / Mobile App`}
            >
              <Smartphone size={16} />
              <span>📲 Install App</span>
            </button>
          )}

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
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
                onClick={onOpenProfile}
                title="Edit My Profile & Password"
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
                    {currentUser.role === "admin" ? "Admin" : currentUser.college ? currentUser.college.substring(0, 16) + "..." : "Student"} • Settings
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
