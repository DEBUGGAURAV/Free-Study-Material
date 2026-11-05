import React, { useState, useEffect, useRef } from "react";
import {
  Cloud,
  Search,
  UploadCloud,
  Shield,
  LogOut,
  Bell,
  LogIn,
  Smartphone,
  Mic,
  MicOff,
  MessageSquare,
  HelpCircle,
  Users,
  Zap,
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
  onOpenAiStudyPod,
  currentUser,
  onLogout,
  noticeCount = 0,
}) {
  const [installPrompt, setInstallPrompt] = useState(null);
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
      alert("📲 To Install FreeStudyMaterial App:\n\n1. Tap the browser menu (3 dots or share button).\n2. Select 'Add to Home screen' or 'Install App'.\n\nEnjoy instant 0ms offline access!");
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
      try {
        if (recognitionRef.current) recognitionRef.current.stop();
      } catch (_) {}
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = "en-IN";
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => setIsListening(true);
      recognition.onresult = (event) => {
        setIsListening(false);
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
    <>
      {/* ══════════════════════════════════════════════════════════════════════
          DUAL-DECK HOLOGRAPHIC COMMAND LAUNCHPAD
          • Deck 1: Brand Identity + Full-Width Spotlight Search + Upload & Auth
          • Deck 2: Centered Floating Feature Ribbon (Icon + Clear Text Labels)
          • Zero Hidden Dropdowns • Zero Overlapping • Zero Mystery Icons
          ══════════════════════════════════════════════════════════════════════ */}
      <header className="navbar-wrapper">
        {/* DECK 1: PRIMARY COMMAND CAPSULE */}
        <div className="navbar-content">
          {/* Top Row on Mobile / Left Section on Desktop: Brand Identity */}
          <div className="nav-brand-row">
            <div
              className="brand-section"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              title="Scroll to Top • Free Study Material Cloud"
            >
              <div className="brand-logo-glow">
                <Cloud size={20} />
              </div>
              <div className="brand-text-block">
                <div className="brand-title">{SITE_NAME}</div>
                <div className="brand-status-tag">
                  <span className="pulse-dot"></span>
                  <span>{SITE_TAGLINE}</span>
                </div>
              </div>
            </div>

            {/* Mobile Compact Right Cluster (Upload + Profile + Logout / Sign In) */}
            <div className="mobile-header-actions">
              <button
                type="button"
                className="btn-upload-mobile-compact"
                onClick={onOpenUpload}
                title="Upload Notes"
              >
                <UploadCloud size={14} />
                <span>Upload</span>
              </button>

              {currentUser ? (
                <div className="mobile-user-cluster">
                  <button
                    type="button"
                    className="mobile-profile-pill"
                    onClick={onOpenProfile}
                    title="My Profile"
                  >
                    <span className="nav-avatar-circle" style={{ width: "22px", height: "22px", fontSize: "0.68rem" }}>
                      {currentUser.name ? currentUser.name[0].toUpperCase() : "U"}
                    </span>
                    <span className="mobile-profile-name">
                      {currentUser.name?.split(" ")[0] || "Profile"}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="mobile-logout-pill"
                    onClick={onLogout}
                    title="Log Out"
                  >
                    <LogOut size={13} />
                    <span>Exit</span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn-signin-nav"
                  onClick={onOpenAuth}
                  style={{ padding: "5px 11px", fontSize: "0.74rem" }}
                >
                  <LogIn size={13} />
                  <span>Sign In</span>
                </button>
              )}
            </div>
          </div>

          {/* Center Section: Wide Universal Spotlight Search (Never Crushed!) */}
          <div className="search-wrapper">
            <Search size={15} className="search-icon" />
            <input
              ref={searchInputRef}
              type="text"
              className="search-input"
              placeholder="Search notes, subjects, branch, PYQs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <div className="search-right-tools">
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="search-clear-btn"
                  title="Clear search"
                >
                  ✕
                </button>
              )}
              <button
                type="button"
                onClick={handleVoiceSearch}
                className={`search-mic-btn ${isListening ? "listening" : ""}`}
                title={isListening ? "Listening... Click to stop" : "Voice Search (Speak to search notes)"}
              >
                {isListening ? <MicOff size={14} /> : <Mic size={14} />}
              </button>

              {/* ✨ AI Search & Notes Filter Button */}
              <button
                type="button"
                onClick={onOpenAiStudyPod}
                style={{
                  background: "linear-gradient(135deg, rgba(139, 92, 246, 0.28), rgba(6, 182, 212, 0.28))",
                  border: "1px solid rgba(139, 92, 246, 0.5)",
                  color: "#c4b5fd",
                  borderRadius: "6px",
                  padding: "2px 7px",
                  fontSize: "0.72rem",
                  fontWeight: 800,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "3px",
                  marginLeft: "2px",
                }}
                title="✨ AI Study Pod: Search & Filter Notes with Flashcards & Summary"
              >
                <Sparkles size={11} color="#a78bfa" />
                <span>AI</span>
              </button>

              <kbd className="search-kbd-shortcut">⌘K</kbd>
            </div>
          </div>

          {/* Right Section (Desktop): Core Publish, Admin & User Identity */}
          <div className="nav-core-right">
            <button
              type="button"
              className="btn-upload-notes"
              onClick={onOpenUpload}
              title="Upload Notes, PYQs or Solutions to Cloud Vault"
            >
              <UploadCloud size={15} />
              <span>Upload Notes</span>
            </button>

            {isAdminOrManager && (
              <button
                type="button"
                className="nav-capsule-btn btn-admin"
                onClick={onOpenAdmin}
                title="Admin Security Studio: Notes, Telemetry & Vault Management"
              >
                <Shield size={14} />
                <span>Admin Studio</span>
              </button>
            )}

            {currentUser ? (
              <div className="nav-user-profile-cluster">
                <div
                  className="nav-user-chip"
                  onClick={onOpenProfile}
                  title="Edit My Profile & Account Settings"
                >
                  <div className="nav-avatar-circle">
                    {currentUser.name ? currentUser.name[0].toUpperCase() : "U"}
                  </div>
                  <div className="nav-user-meta">
                    <span className="nav-user-name">
                      {currentUser.name?.split(" ")[0] || currentUser.email?.split("@")[0]}
                    </span>
                    <span className="nav-user-role">
                      {currentUser.role === "admin" ? "Admin" : "Student"}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="nav-capsule-btn btn-logout-pill"
                  onClick={onLogout}
                  title="Log Out from Cloud Vault"
                >
                  <LogOut size={13} />
                  <span>Logout</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn-signin-nav"
                onClick={onOpenAuth}
                title="Sign In / Register as Student"
              >
                <LogIn size={15} />
                <span>Sign In</span>
              </button>
            )}
          </div>
        </div>

        {/* DECK 2: SUSPENDED HOLOGRAPHIC FEATURE LAUNCHPAD (Desktop & Tablet)
            Every feature shows BOTH Icon + Explicit Label — super easy to find! */}
        <nav className="nav-feature-launchpad" aria-label="Academic Tools & Live Features">
          {/* ✨ AI Study Pod & Smart Filter */}
          <button
            type="button"
            className="launchpad-pill pill-ai-studypod"
            onClick={onOpenAiStudyPod}
            style={{
              background: "linear-gradient(135deg, rgba(139, 92, 246, 0.22), rgba(6, 182, 212, 0.22))",
              border: "1.5px solid rgba(139, 92, 246, 0.5)",
              color: "#c4b5fd",
              boxShadow: "0 0 12px rgba(139, 92, 246, 0.25)",
            }}
            title="✨ AI Study Pod: Search & Filter Notes with Instant Flashcards & Summary"
          >
            <Sparkles size={14} color="#a78bfa" />
            <span>AI Study Pod</span>
            <span className="live-pill" style={{ background: "linear-gradient(135deg, #8b5cf6, #06b6d4)", color: "#fff" }}>AI</span>
          </button>

          <span className="launchpad-divider" aria-hidden="true" />

          <button
            type="button"
            className="launchpad-pill pill-airdrop"
            onClick={onOpenAirDrop}
            title="Campus AirDrop: Peer-to-Peer offline note transfer via QR Mesh"
          >
            <Zap size={14} />
            <span>AirDrop</span>
          </button>

          <span className="launchpad-divider" aria-hidden="true" />

          <button
            type="button"
            className="launchpad-pill pill-chat"
            onClick={onOpenChat}
            title="Student Chat Hub & Live Study Discussions"
          >
            <MessageSquare size={14} />
            <span>Chat Hub</span>
          </button>

          <button
            type="button"
            className="launchpad-pill pill-studypod"
            onClick={onOpenStudyPod}
            title="Collaborative Live Study Pod"
          >
            <Users size={14} />
            <span>Study Pod</span>
            <span className="live-pill">LIVE</span>
          </button>

          <span className="launchpad-divider" aria-hidden="true" />

          <button
            type="button"
            className="launchpad-pill pill-notices"
            onClick={onOpenNotices}
            title="University Notice Board & Announcements"
          >
            <Bell size={14} />
            <span>Notices</span>
            {noticeCount > 0 && (
              <span className="launchpad-count-badge">
                {noticeCount > 9 ? "9+" : noticeCount}
              </span>
            )}
          </button>

          <button
            type="button"
            className="launchpad-pill pill-help"
            onClick={onOpenHelp}
            title="24/7 Student Help & Support Desk"
          >
            <HelpCircle size={14} />
            <span>Help Desk</span>
          </button>

          {!isInstalled && (
            <button
              type="button"
              className="launchpad-pill pill-install"
              onClick={handleInstallClick}
              title="Install Free Study Material App (PWA) for fast offline access"
            >
              <Smartphone size={14} />
              <span>Install App</span>
            </button>
          )}
        </nav>
      </header>

      {/* ══════════════════════════════════════════════════════════════════════
          MOBILE FLOATING BOTTOM DOCK (1-Tap Thumb Reach with Clear Labels)
          ══════════════════════════════════════════════════════════════════════ */}
      <nav className="mobile-floating-island-dock" aria-label="Mobile Quick Tools">
        <button
          type="button"
          className="dock-item dock-airdrop"
          onClick={onOpenAirDrop}
        >
          <Zap size={17} />
          <span>AirDrop</span>
        </button>

        <button
          type="button"
          className="dock-item dock-chat"
          onClick={onOpenChat}
        >
          <MessageSquare size={17} />
          <span>Chat</span>
        </button>

        <button
          type="button"
          className="dock-item dock-pod"
          onClick={onOpenStudyPod}
        >
          <Users size={17} />
          <span>Pod</span>
        </button>

        <button
          type="button"
          className="dock-item dock-notice"
          onClick={onOpenNotices}
        >
          <div style={{ position: "relative", display: "inline-flex" }}>
            <Bell size={17} />
            {noticeCount > 0 && (
              <span className="dock-notice-dot">{noticeCount > 9 ? "9+" : noticeCount}</span>
            )}
          </div>
          <span>Notices</span>
        </button>

        <button
          type="button"
          className="dock-item dock-help"
          onClick={onOpenHelp}
        >
          <HelpCircle size={17} />
          <span>Help</span>
        </button>

        {isAdminOrManager && (
          <button
            type="button"
            className="dock-item dock-admin"
            onClick={onOpenAdmin}
          >
            <Shield size={17} />
            <span>Admin</span>
          </button>
        )}

        {!isInstalled && (
          <button
            type="button"
            className="dock-item dock-install"
            onClick={handleInstallClick}
          >
            <Smartphone size={17} />
            <span>Install</span>
          </button>
        )}
      </nav>
    </>
  );
}
