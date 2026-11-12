import { useState, useEffect, useRef } from "react";
import {
  Cloud,
  Search,
  UploadCloud,
  Shield,
  LogOut,
  Bell,
  BellRing,
  LogIn,
  Smartphone,
  Mic,
  MicOff,
  MessageSquare,
  HelpCircle,
  Users,
  Zap,
  Sparkles,
} from "lucide-react";
import { SITE_NAME, SITE_TAGLINE } from "../config/clientConfig";
import GeminiIcon from "./GeminiIcon";
import { useTechFlags } from "../utils/techFlagsStore";
import { getWebPushStatus, subscribeWebPush, unsubscribeWebPush } from "../utils/webPushClient";

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
  onOpenCircleSearch,
  currentUser,
  onLogout,
  noticeCount = 0,
}) {
  const [installPrompt, setInstallPrompt] = useState(null);
  const searchInputRef = useRef(null);
  const { enableWebPush } = useTechFlags();
  const [pushStatus, setPushStatus] = useState({ supported: false, subscribed: false });
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    getWebPushStatus().then((st) => {
      if (mounted) setPushStatus(st);
    }).catch(() => {});
    return () => { mounted = false; };
  }, [currentUser]);

  const handleToggleWebPush = async () => {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      if (pushStatus.subscribed) {
        await unsubscribeWebPush();
        setPushStatus((prev) => ({ ...prev, subscribed: false }));
      } else {
        await subscribeWebPush();
        setPushStatus((prev) => ({ ...prev, subscribed: true, permission: "granted" }));
      }
    } catch (err) {
      alert(`🔔 Notification Setup:\n${err?.message || "Could not update push notifications."}`);
    } finally {
      setPushBusy(false);
    }
  };

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

            {/* Mobile Compact Right Cluster (Admin + Upload + Profile + Logout / Sign In) */}
            <div className="mobile-header-actions">
              {isAdminOrManager && (
                <button
                  type="button"
                  className="btn-admin-mobile-header"
                  onClick={onOpenAdmin}
                  style={{
                    background: "linear-gradient(135deg, rgba(99, 102, 241, 0.35), rgba(6, 182, 212, 0.35))",
                    border: "1.5px solid rgba(56, 189, 248, 0.6)",
                    color: "#38bdf8",
                    borderRadius: "999px",
                    padding: "4px 9px",
                    fontSize: "0.72rem",
                    fontWeight: 800,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    cursor: "pointer",
                    boxShadow: "0 0 12px rgba(56, 189, 248, 0.35)",
                    flexShrink: 0,
                  }}
                  title="Admin Studio Control Panel"
                >
                  <Shield size={13} color="#38bdf8" />
                  <span>Admin</span>
                </button>
              )}

              {currentUser && (
                <button
                  type="button"
                  className="btn-upload-mobile-compact"
                  onClick={onOpenUpload}
                  title="Upload Notes"
                >
                  <UploadCloud size={14} />
                  <span>Upload</span>
                </button>
              )}

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
                <div className="nav-auth-actions nav-auth-actions-mobile">
                  <button type="button" className="btn-signup-nav" onClick={() => onOpenAuth("signup")}>
                    Sign Up
                  </button>
                  <button type="button" className="btn-signin-nav" onClick={() => onOpenAuth("signin")}>
                    <LogIn size={13} />
                    <span>Sign In</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Center Section: Wide Universal Spotlight Search (Never Crushed!) */}
          {currentUser && <div className="search-wrapper">
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

              {/* ♊ Circle to Search Button */}
              <button
                type="button"
                className="search-circle-btn"
                onClick={() => onOpenCircleSearch && onOpenCircleSearch()}
                style={{
                  background: "linear-gradient(135deg, rgba(2, 132, 199, 0.28), rgba(99, 102, 241, 0.28))",
                  border: "1px solid rgba(56, 189, 248, 0.45)",
                  color: "#38bdf8",
                  borderRadius: "6px",
                  padding: "2px 7px",
                  fontSize: "0.72rem",
                  fontWeight: 800,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  marginLeft: "2px",
                }}
                title="Circle to Search: Circle any question or diagram to solve with Gemini AI"
              >
                <GeminiIcon size={14} withRing ringColor="#3552c5" color="#0f8b7e" />
                <span>Circle</span>
              </button>

              {/* ✨ AI Study Pod Popup Button */}
              <button
                type="button"
                className="search-ai-btn"
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
                title="✨ AI Study: Flashcards, Summary & Smart Note Filter"
              >
                <Sparkles size={11} color="#3d59c5" />
                <span>AI</span>
              </button>

              <kbd className="search-kbd-shortcut">⌘K</kbd>
            </div>
          </div>}

          {/* Right Section (Desktop): Core Publish, Admin & User Identity */}
          <div className="nav-core-right">
            {currentUser && (
              <button
                type="button"
                className="btn-upload-notes"
                onClick={onOpenUpload}
                title="Upload Notes, PYQs or Solutions to Cloud Vault"
              >
                <UploadCloud size={15} />
                <span>Upload Notes</span>
              </button>
            )}

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
              <div className="nav-auth-actions">
                <button type="button" className="btn-signup-nav" onClick={() => onOpenAuth("signup")}>
                  Sign Up
                </button>
                <button
                  type="button"
                  className="btn-signin-nav"
                  onClick={() => onOpenAuth("signin")}
                  title="Sign In as Student"
                >
                  <LogIn size={15} />
                  <span>Sign In</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* DECK 2: SUSPENDED HOLOGRAPHIC FEATURE LAUNCHPAD (Desktop & Tablet)
            Every feature shows BOTH Icon + Explicit Label — super easy to find! */}
        {currentUser && <nav className="nav-feature-launchpad" aria-label="Academic Tools & Live Features">
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

          {enableWebPush && pushStatus.supported && (
            <button
              type="button"
              className="launchpad-pill"
              onClick={handleToggleWebPush}
              disabled={pushBusy}
              style={{
                borderColor: pushStatus.subscribed ? "rgba(52, 211, 153, 0.45)" : "rgba(56, 189, 248, 0.4)",
                color: pushStatus.subscribed ? "#34d399" : "#38bdf8",
                background: pushStatus.subscribed ? "rgba(16, 185, 129, 0.14)" : "rgba(56, 189, 248, 0.1)",
              }}
              title={pushStatus.subscribed ? "Web Push Alerts Active (Click to mute)" : "Get instant browser notifications for new PYQs, notes & notices"}
            >
              <BellRing size={14} />
              <span>{pushBusy ? "Saving..." : pushStatus.subscribed ? "Alerts On" : "Push Alerts"}</span>
            </button>
          )}

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
        </nav>}
      </header>

      {/* ══════════════════════════════════════════════════════════════════════
          MOBILE FLOATING BOTTOM DOCK (1-Tap Thumb Reach with Clear Labels)
          ══════════════════════════════════════════════════════════════════════ */}
      {currentUser && <nav className="mobile-floating-island-dock" aria-label="Mobile Quick Tools">
        {/* ✨ AI Study Popup */}
        <button
          type="button"
          className="dock-item dock-ai"
          onClick={onOpenAiStudyPod}
          style={{ color: "#5846b8" }}
          title="AI Study (Flashcards, Summary, Notes Filter)"
        >
          <Sparkles size={17} color="#5846b8" />
          <span>AI Study</span>
        </button>

        {/* ♊ Circle to Search & Solve */}
        <button
          type="button"
          className="dock-item dock-circle"
          onClick={() => onOpenCircleSearch && onOpenCircleSearch()}
          style={{ color: "#3552c5" }}
          title="Circle to Search: Ask Question or Diagram with Gemini AI"
        >
          <GeminiIcon size={17} withRing ringColor="#3552c5" color="#0f8b7e" />
          <span>Circle</span>
        </button>

        {isAdminOrManager && (
          <button
            type="button"
            className="dock-item dock-admin"
            onClick={onOpenAdmin}
            style={{
              color: "#3552c5",
              background: "#edf2ff",
              border: "1px solid #dce5fa",
              borderRadius: "12px",
            }}
            title="Admin Studio Control Panel"
          >
            <Shield size={17} color="#3552c5" />
            <span style={{ color: "#3552c5", fontWeight: 800 }}>Admin</span>
          </button>
        )}

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
      </nav>}
    </>
  );
}
