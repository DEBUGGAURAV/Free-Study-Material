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
  Volume2,
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
  onOpenSoundDrop,
  currentUser,
  onLogout,
  noticeCount = 0,
}) {
  const [installPrompt, setInstallPrompt] = useState(null);
  const searchInputRef = useRef(null);
  const mobileSearchInputRef = useRef(null);

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
        } else if (mobileSearchInputRef.current) {
          mobileSearchInputRef.current.focus();
          mobileSearchInputRef.current.select();
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
      {/* ══════════════════════════════════════════════════════════════════
          1. TOP FLOATING APP BAR (Clean & Slim on Desktop and Mobile)
          ══════════════════════════════════════════════════════════════════ */}
      <header className="navbar-wrapper">
        <div className="navbar-content">
          {/* Brand Identity */}
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

          {/* Universal Spotlight Search (Voice & ⌘K) */}
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
              <button
                type="button"
                onClick={handleVoiceSearch}
                className={`search-mic-btn ${isListening ? "listening" : ""}`}
                title={isListening ? "Listening... Click to stop" : "Voice Search (Speak to search notes)"}
              >
                {isListening ? <MicOff size={13} /> : <Mic size={13} />}
              </button>
              <kbd className="search-kbd-shortcut">⌘K</kbd>
            </div>
          </div>

          {/* DESKTOP SEGMENTED ACTION MATRIX (All elements shown directly - NO tools dropdown!) */}
          <div className="desktop-nav-matrix">
            {/* Segment 1: Offline Mesh Beam */}
            <div className="nav-segment-group">
              <button
                className="nav-capsule-btn btn-airdrop"
                onClick={onOpenAirDrop}
                title="Campus AirDrop: Peer-to-Peer offline note exchange"
              >
                <Zap size={14} className="capsule-icon" />
                <span>AirDrop</span>
              </button>
              <button
                className="nav-capsule-btn btn-sounddrop"
                onClick={onOpenSoundDrop}
                title="Sound-Drop: Beam notes via ultrasonic sound waves"
              >
                <Volume2 size={14} className="capsule-icon" />
                <span>Sound-Drop</span>
              </button>
            </div>

            {/* Segment 2: Interactive Community */}
            <div className="nav-segment-group">
              <button
                className="nav-capsule-btn btn-chat"
                onClick={onOpenChat}
                title="Student Chat Hub & Community Discussions"
              >
                <MessageSquare size={14} className="capsule-icon" />
                <span>Chat Hub</span>
              </button>
              <button
                className="nav-capsule-btn btn-studypod"
                onClick={onOpenStudyPod}
                title="Study Pod: Real-time collaborative audio & notes"
              >
                <Users size={14} className="capsule-icon" />
                <span>Study Pod</span>
                <span className="live-pill">LIVE</span>
              </button>
            </div>

            {/* Segment 3: Notices & Help */}
            <div className="nav-segment-group">
              <button
                className="nav-icon-btn btn-notice"
                onClick={onOpenNotices}
                title="Notice Board & Exam Circulars"
              >
                <Bell size={16} />
                {noticeCount > 0 && (
                  <span className="nav-notice-badge">{noticeCount > 9 ? "9+" : noticeCount}</span>
                )}
              </button>
              <button
                className="nav-icon-btn btn-help"
                onClick={onOpenHelp}
                title="Help & Academic Support Desk"
              >
                <HelpCircle size={16} />
              </button>
              {!isInstalled && (
                <button
                  className="nav-capsule-btn btn-install"
                  onClick={handleInstallClick}
                  title="Install Free Study Material App (PWA) for 0ms fast access"
                >
                  <Smartphone size={14} className="capsule-icon" />
                  <span>Install</span>
                </button>
              )}
              {isAdminOrManager && (
                <button
                  className="nav-capsule-btn btn-admin"
                  onClick={onOpenAdmin}
                  title="Admin Security Studio: Notes, Telemetry & Vault Management"
                >
                  <Shield size={14} className="capsule-icon" />
                  <span>Admin</span>
                </button>
              )}
            </div>

            {/* Segment 4: Primary Action & Profile */}
            <div className="nav-segment-group" style={{ gap: "10px" }}>
              <button
                className="btn-upload-notes"
                onClick={onOpenUpload}
                title="Upload Notes, PYQs or Solutions to Cloud Vault"
              >
                <UploadCloud size={16} />
                <span>Upload Notes</span>
              </button>

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
                    className="nav-icon-btn btn-logout"
                    onClick={onLogout}
                    title="Log Out from Cloud Vault"
                  >
                    <LogOut size={14} />
                  </button>
                </div>
              ) : (
                <button
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

          {/* MOBILE HEADER COMPACT QUICK ACTIONS (Upload + Avatar/Auth) */}
          <div className="mobile-header-actions">
            <button
              className="btn-upload-mobile-compact"
              onClick={onOpenUpload}
              title="Upload Notes"
            >
              <UploadCloud size={16} />
              <span>Upload</span>
            </button>

            {currentUser ? (
              <div
                className="nav-avatar-circle"
                onClick={onOpenProfile}
                title="Open Profile"
              >
                {currentUser.name ? currentUser.name[0].toUpperCase() : "U"}
              </div>
            ) : (
              <button
                className="mobile-auth-icon-btn"
                onClick={onOpenAuth}
                title="Sign In"
              >
                <LogIn size={16} />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════════════════
          2. MOBILE FLOATING DYNAMIC ISLAND DOCK (Fixed at Bottom)
          1-Tap Thumb Ergonomics • Zero Dropdown • All Elements Visible
          ══════════════════════════════════════════════════════════════════ */}
      <nav className="mobile-floating-island-dock" aria-label="Mobile Navigation Dock">
        <button
          type="button"
          className="dock-item dock-airdrop"
          onClick={onOpenAirDrop}
          title="Campus AirDrop"
        >
          <Zap size={18} />
          <span>AirDrop</span>
        </button>

        <button
          type="button"
          className="dock-item dock-sounddrop"
          onClick={onOpenSoundDrop}
          title="Sound-Drop"
        >
          <Volume2 size={18} />
          <span>Sound</span>
        </button>

        <button
          type="button"
          className="dock-item dock-chat"
          onClick={onOpenChat}
          title="Student Chat Hub"
        >
          <MessageSquare size={18} />
          <span>Chat</span>
        </button>

        <button
          type="button"
          className="dock-item dock-pod"
          onClick={onOpenStudyPod}
          title="Collaborative Study Pod"
        >
          <Users size={18} />
          <span>Pod</span>
        </button>

        <button
          type="button"
          className="dock-item dock-notice"
          onClick={onOpenNotices}
          title="Notice Board"
        >
          <div style={{ position: "relative", display: "inline-flex" }}>
            <Bell size={18} />
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
          title="Help & Support Desk"
        >
          <HelpCircle size={18} />
          <span>Help</span>
        </button>

        {isAdminOrManager && (
          <button
            type="button"
            className="dock-item dock-admin"
            onClick={onOpenAdmin}
            title="Admin Studio"
          >
            <Shield size={18} />
            <span>Admin</span>
          </button>
        )}

        {!isInstalled && !isAdminOrManager && (
          <button
            type="button"
            className="dock-item dock-install"
            onClick={handleInstallClick}
            title="Install App (PWA)"
          >
            <Smartphone size={18} />
            <span>Install</span>
          </button>
        )}
      </nav>
    </>
  );
}
