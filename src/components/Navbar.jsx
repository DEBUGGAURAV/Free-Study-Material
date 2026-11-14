import { useState, useEffect, useRef } from "react";
import {
  Cloud,
  Search,
  UploadCloud,
  Shield,
  ShieldCheck,
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
  BookOpen,
  LayoutGrid,
  X,
  Flame,
} from "lucide-react";
import { SITE_NAME, SITE_TAGLINE } from "../config/clientConfig";
import GeminiIcon from "./GeminiIcon";
import { useTechFlags } from "../utils/techFlagsStore";
import { getWebPushStatus, subscribeWebPush, unsubscribeWebPush } from "../utils/webPushClient";
import { getCampusContributionTier } from "../utils/studentStudyContext";

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
  onOpenSwipeToRevise,
  onOpenAiStudyPod,
  onOpenCircleSearch,
  currentUser,
  onLogout,
  noticeCount = 0,
}) {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showMobileMoreSheet, setShowMobileMoreSheet] = useState(false);
  const [contributionTier, setContributionTier] = useState(() => getCampusContributionTier());
  const searchInputRef = useRef(null);

  useEffect(() => {
    const handleTierUpdate = () => {
      setContributionTier(getCampusContributionTier());
    };
    window.addEventListener("fsm:campus-contributions-updated", handleTierUpdate);
    return () => window.removeEventListener("fsm:campus-contributions-updated", handleTierUpdate);
  }, []);
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
                    background: "linear-gradient(#ffffff, #ffffff) padding-box, linear-gradient(135deg, #6366f1, #a855f7, #ec4899) border-box",
                    border: "1.5px solid transparent",
                    color: "#0f172a",
                    borderRadius: "999px",
                    padding: "4px 11px",
                    fontSize: "0.74rem",
                    fontWeight: 800,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    cursor: "pointer",
                    boxShadow: "0 3px 12px rgba(124, 58, 237, 0.25)",
                    flexShrink: 0,
                  }}
                  title="Admin Studio Control Panel"
                >
                  <ShieldCheck size={15} color="#7c3aed" strokeWidth={2.25} />
                  <span style={{ color: "#0f172a" }}>Admin</span>
                </button>
              )}

              <button
                type="button"
                className="btn-swipe-mobile-compact"
                onClick={onOpenSwipeToRevise}
                style={{
                  background: "linear-gradient(135deg, #fffbeb, #fef3c7)",
                  border: "1.5px solid #fde68a",
                  color: "#92400e",
                  borderRadius: "999px",
                  padding: "4px 10px",
                  fontSize: "0.74rem",
                  fontWeight: 800,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  cursor: "pointer",
                  boxShadow: "0 3px 12px rgba(245, 158, 11, 0.28)",
                  flexShrink: 0,
                }}
                title="Study Tinder: Swipe-to-Revise"
              >
                <Flame size={14} color="#f59e0b" fill="#f59e0b" />
                <span>Revise</span>
              </button>

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
                  background: "linear-gradient(135deg, rgba(99, 102, 241, 0.38), rgba(6, 182, 212, 0.38))",
                  border: "1px solid rgba(139, 92, 246, 0.55)",
                  color: "#ffffff",
                  borderRadius: "8px",
                  padding: "3px 9px",
                  fontSize: "0.74rem",
                  fontWeight: 800,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  marginLeft: "4px",
                  boxShadow: "0 0 12px rgba(139, 92, 246, 0.35)",
                }}
                title="AI Study: Conversational Tutor, Flashcards & Summary"
              >
                <Sparkles size={12} color="#38bdf8" />
                <span>AI Study</span>
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
                style={{
                  background: "linear-gradient(#ffffff, #ffffff) padding-box, linear-gradient(135deg, #6366f1, #a855f7, #ec4899) border-box",
                  border: "1.5px solid transparent",
                  color: "#0f172a",
                  boxShadow: "0 4px 16px -2px rgba(124, 58, 237, 0.28), 0 2px 6px -1px rgba(0, 0, 0, 0.05)",
                  fontWeight: 800,
                  borderRadius: "999px",
                }}
                title="Admin Security Studio: Notes, Telemetry & Vault Management"
              >
                <ShieldCheck size={16} color="#7c3aed" strokeWidth={2.25} />
                <span style={{ color: "#0f172a" }}>Admin Studio</span>
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
                      {currentUser.role === "admin" ? "Admin" : contributionTier?.badge || "Student"}
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
          {/* 3D Swipe-to-Revise (Study Tinder) Pill */}
          <button
            type="button"
            className="launchpad-pill pill-3d-swipe"
            onClick={onOpenSwipeToRevise}
            style={{
              background: "linear-gradient(135deg, #fffbeb, #ffffff) padding-box, linear-gradient(135deg, #f59e0b, #ec4899, #6366f1) border-box",
              border: "1.5px solid transparent",
              color: "#0f172a",
              boxShadow: "0 6px 18px -2px rgba(245, 158, 11, 0.3), 0 2px 5px rgba(0, 0, 0, 0.05)",
              fontWeight: 800,
              borderRadius: "999px",
            }}
            title="Study Tinder: Swipe-to-Revise Dopamine Flashcards"
          >
            <div className="icon-3d-amber" style={{ width: "22px", height: "22px", borderRadius: "8px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <Flame size={14} color="#d97706" fill="#f59e0b" />
            </div>
            <span>Swipe Revise</span>
            <span style={{ fontSize: "0.65rem", fontWeight: 800, background: "linear-gradient(135deg, #f59e0b, #ef4444)", color: "#ffffff", padding: "1px 6px", borderRadius: "999px", boxShadow: "0 2px 6px rgba(239, 68, 68, 0.35)" }}>
              HOT
            </span>
          </button>

          <button
            type="button"
            className="launchpad-pill pill-airdrop"
            onClick={onOpenAirDrop}
            style={{
              background: "#ffffff",
              border: "1.5px solid #bae6fd",
              color: "#0369a1",
              boxShadow: "0 4px 14px -2px rgba(2, 132, 199, 0.22)",
              fontWeight: 800,
              borderRadius: "999px",
            }}
            title="Campus AirDrop: Peer-to-Peer offline note transfer via QR Mesh"
          >
            <div className="icon-3d-cyan" style={{ width: "22px", height: "22px", borderRadius: "8px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <Zap size={14} color="#0284c7" />
            </div>
            <span>Campus AirDrop</span>
          </button>

          <span className="launchpad-divider" aria-hidden="true" />

          <button
            type="button"
            className="launchpad-pill pill-chat"
            onClick={onOpenChat}
            style={{
              background: "linear-gradient(#ffffff, #ffffff) padding-box, linear-gradient(135deg, #0284c7, #2563eb, #6366f1) border-box",
              border: "1.5px solid transparent",
              color: "#0f172a",
              boxShadow: "0 4px 16px -2px rgba(37, 99, 235, 0.25), 0 2px 6px -1px rgba(0, 0, 0, 0.05)",
              fontWeight: 800,
              borderRadius: "999px",
            }}
            title="Student Chat & Live Study Discussions"
          >
            <div className="icon-3d-indigo" style={{ width: "22px", height: "22px", borderRadius: "8px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <MessageSquare size={14} color="#2563eb" />
            </div>
            <span style={{ color: "#0f172a" }}>Chat</span>
            <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "linear-gradient(135deg, #10b981, #06b6d4)", boxShadow: "0 0 10px #10b981", display: "inline-block" }} />
          </button>

          <button
            type="button"
            className="launchpad-pill pill-studypod"
            onClick={onOpenStudyPod}
            style={{
              background: "#ffffff",
              border: "1.5px solid #ddd6fe",
              color: "#5b21b6",
              boxShadow: "0 4px 14px -2px rgba(124, 58, 237, 0.2)",
              fontWeight: 800,
              borderRadius: "999px",
            }}
            title="Collaborative Live Study Pod"
          >
            <div className="icon-3d-violet" style={{ width: "22px", height: "22px", borderRadius: "8px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <Users size={14} color="#7c3aed" />
            </div>
            <span>Study Pod</span>
            <span className="live-pill">LIVE</span>
          </button>

          <span className="launchpad-divider" aria-hidden="true" />

          <button
            type="button"
            className="launchpad-pill pill-notices"
            onClick={onOpenNotices}
            style={{
              background: "#ffffff",
              border: "1.5px solid #fde68a",
              color: "#92400e",
              boxShadow: "0 4px 14px -2px rgba(245, 158, 11, 0.2)",
              fontWeight: 800,
              borderRadius: "999px",
            }}
            title="University Notice Board & Announcements"
          >
            <div className="icon-3d-amber" style={{ width: "22px", height: "22px", borderRadius: "8px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <Bell size={14} color="#d97706" />
            </div>
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
            style={{
              background: "linear-gradient(#ffffff, #ffffff) padding-box, linear-gradient(135deg, #059669, #10b981, #06b6d4) border-box",
              border: "1.5px solid transparent",
              color: "#0f172a",
              boxShadow: "0 4px 16px -2px rgba(16, 185, 129, 0.25), 0 2px 6px -1px rgba(0, 0, 0, 0.05)",
              fontWeight: 800,
              borderRadius: "999px",
            }}
            title="24/7 Student Help & Support Desk"
          >
            <div className="icon-3d-emerald" style={{ width: "22px", height: "22px", borderRadius: "8px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <HelpCircle size={14} color="#059669" />
            </div>
            <span style={{ color: "#0f172a" }}>Help Desk</span>
            <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "linear-gradient(135deg, #10b981, #06b6d4)", boxShadow: "0 0 10px #10b981", display: "inline-block" }} />
          </button>

          {enableWebPush && pushStatus.supported && (
            <button
              type="button"
              className="launchpad-pill"
              onClick={handleToggleWebPush}
              disabled={pushBusy}
              style={{
                borderColor: pushStatus.subscribed ? "#a7f3d0" : "#bfdbfe",
                color: pushStatus.subscribed ? "#065f46" : "#1d4ed8",
                background: pushStatus.subscribed ? "#d1fae5" : "#eff6ff",
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
          MOBILE FLOATING BOTTOM DOCK (Streamlined 5-Tab Golden Ratio)
          ══════════════════════════════════════════════════════════════════════ */}
      {currentUser && (
        <>
          <nav className="mobile-floating-island-dock" aria-label="Mobile Quick Navigation">
            {/* 1. 📚 Notes / Home */}
            <button
              type="button"
              className="dock-item dock-notes"
              onClick={() => {
                const el = document.getElementById("study-materials");
                if (el) {
                  el.scrollIntoView({ behavior: "smooth" });
                } else {
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }
              }}
              title="Explore Study Notes & Papers"
            >
              <BookOpen size={18} />
              <span>Notes</span>
            </button>

            {/* 2. ✨ AI Study */}
            <button
              type="button"
              className="dock-item dock-ai"
              onClick={onOpenAiStudyPod}
              style={{ color: "#a855f7" }}
              title="AI Study (Flashcards, Summary, Notes Filter)"
            >
              <Sparkles size={18} color="#a855f7" style={{ filter: "drop-shadow(0 0 6px rgba(168, 85, 247, 0.6))" }} />
              <span style={{ fontWeight: 750, color: "#e0e7ff" }}>AI Study</span>
            </button>

            {/* 3. ♊ Circle to Search & Solve (Elevated Center Hub) */}
            <button
              type="button"
              className="dock-item dock-circle dock-center-circle"
              onClick={() => onOpenCircleSearch && onOpenCircleSearch()}
              style={{ color: "#3552c5" }}
              title="Circle to Search: Ask Question or Diagram with Gemini AI"
            >
              <div className="dock-gemini-orb">
                <GeminiIcon size={18} withRing ringColor="#3552c5" color="#0f8b7e" />
              </div>
              <span style={{ fontWeight: 750 }}>Circle</span>
            </button>

            {/* 4. 💬 Student Chat */}
            <button
              type="button"
              className="dock-item dock-chat"
              onClick={onOpenChat}
              title="Student Study Chat"
            >
              <MessageSquare size={18} />
              <span>Chat</span>
            </button>

            {/* 5. ⚡ More Hub (Drawer) */}
            <button
              type="button"
              className="dock-item dock-more"
              onClick={() => setShowMobileMoreSheet(true)}
              title="More Academic Tools (AirDrop, Pod, Notices, Admin)"
            >
              <div style={{ position: "relative", display: "inline-flex" }}>
                <LayoutGrid size={18} />
                {noticeCount > 0 && (
                  <span className="dock-notice-dot">{noticeCount > 9 ? "9+" : noticeCount}</span>
                )}
              </div>
              <span>More</span>
            </button>
          </nav>

          {/* ══════════════════════════════════════════════════════════════════════
              MOBILE 'MORE' ACTION DRAWER / SHEET
              ══════════════════════════════════════════════════════════════════════ */}
          {showMobileMoreSheet && (
            <div
              className="mobile-more-backdrop"
              onClick={() => setShowMobileMoreSheet(false)}
            >
              <div
                className="mobile-more-sheet"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mobile-sheet-drag-handle" />
                <div className="mobile-sheet-header">
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <LayoutGrid size={17} color="#0284c7" />
                    <span style={{ fontWeight: 800, fontSize: "0.96rem", color: "#1e293b" }}>
                      Academic Studio &amp; Tools
                    </span>
                  </div>
                  <button
                    type="button"
                    className="mobile-sheet-close"
                    onClick={() => setShowMobileMoreSheet(false)}
                    title="Close"
                  >
                    <X size={17} />
                  </button>
                </div>

                <div className="mobile-more-grid">
                  {/* Swipe to Revise */}
                  <button
                    type="button"
                    className="mobile-more-card"
                    onClick={() => {
                      setShowMobileMoreSheet(false);
                      onOpenSwipeToRevise();
                    }}
                    style={{
                      background: "linear-gradient(135deg, #fffbeb, #ffffff)",
                      border: "1.5px solid #fde68a",
                    }}
                  >
                    <div className="icon-3d-amber" style={{ width: "36px", height: "36px", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Flame size={20} color="#d97706" fill="#f59e0b" />
                    </div>
                    <div className="more-card-info">
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <strong style={{ color: "#92400e" }}>Swipe-to-Revise</strong>
                        <span style={{ fontSize: "0.62rem", padding: "1px 6px", borderRadius: "999px", background: "linear-gradient(135deg, #f59e0b, #ef4444)", color: "#ffffff", fontWeight: 800 }}>HOT</span>
                      </div>
                      <small>Study Tinder dopamine flashcards</small>
                    </div>
                  </button>

                  {/* AirDrop */}
                  <button
                    type="button"
                    className="mobile-more-card"
                    onClick={() => {
                      setShowMobileMoreSheet(false);
                      onOpenAirDrop();
                    }}
                  >
                    <div className="more-card-icon" style={{ background: "rgba(56, 189, 248, 0.12)", color: "#0284c7" }}>
                      <Zap size={20} />
                    </div>
                    <div className="more-card-info">
                      <strong>Campus AirDrop</strong>
                      <small>Offline P2P QR Mesh note transfer</small>
                    </div>
                  </button>

                  {/* Study Pod */}
                  <button
                    type="button"
                    className="mobile-more-card"
                    onClick={() => {
                      setShowMobileMoreSheet(false);
                      onOpenStudyPod();
                    }}
                  >
                    <div className="more-card-icon" style={{ background: "rgba(99, 102, 241, 0.12)", color: "#6366f1" }}>
                      <Users size={20} />
                    </div>
                    <div className="more-card-info">
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <strong>Live Study Pod</strong>
                        <span className="live-pill" style={{ fontSize: "0.62rem", padding: "1px 5px" }}>LIVE</span>
                      </div>
                      <small>Study room with peers</small>
                    </div>
                  </button>

                  {/* Notices */}
                  <button
                    type="button"
                    className="mobile-more-card"
                    onClick={() => {
                      setShowMobileMoreSheet(false);
                      onOpenNotices();
                    }}
                  >
                    <div className="more-card-icon" style={{ background: "rgba(245, 158, 11, 0.12)", color: "#d97706" }}>
                      <Bell size={20} />
                    </div>
                    <div className="more-card-info">
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <strong>University Notices</strong>
                        {noticeCount > 0 && (
                          <span className="launchpad-count-badge" style={{ position: "static" }}>
                            {noticeCount > 9 ? "9+" : noticeCount}
                          </span>
                        )}
                      </div>
                      <small>Exam dates, timetables &amp; announcements</small>
                    </div>
                  </button>

                  {/* Admin Studio */}
                  {isAdminOrManager && (
                    <button
                      type="button"
                      className="mobile-more-card"
                      onClick={() => {
                        setShowMobileMoreSheet(false);
                        onOpenAdmin();
                      }}
                      style={{ background: "#ffffff", border: "1.5px solid #e0e7ff", boxShadow: "0 4px 14px rgba(79, 70, 229, 0.08)" }}
                    >
                      <div className="more-card-icon" style={{ background: "rgba(79, 70, 229, 0.12)", color: "#4f46e5" }}>
                        <ShieldCheck size={20} />
                      </div>
                      <div className="more-card-info">
                        <strong style={{ color: "#1e293b" }}>Admin Studio</strong>
                        <small>Security, notes, vault &amp; telemetry</small>
                      </div>
                    </button>
                  )}

                  {/* Help Desk */}
                  <button
                    type="button"
                    className="mobile-more-card"
                    onClick={() => {
                      setShowMobileMoreSheet(false);
                      onOpenHelp();
                    }}
                    style={{ background: "#ffffff", border: "1.5px solid #d1fae5", boxShadow: "0 4px 14px rgba(16, 185, 129, 0.08)" }}
                  >
                    <div className="more-card-icon" style={{ background: "rgba(16, 185, 129, 0.12)", color: "#059669" }}>
                      <HelpCircle size={20} />
                    </div>
                    <div className="more-card-info">
                      <strong style={{ color: "#1e293b" }}>Student Help Desk</strong>
                      <small>24/7 technical &amp; syllabus assistance</small>
                    </div>
                  </button>

                  {/* Install App */}
                  {!isInstalled && (
                    <button
                      type="button"
                      className="mobile-more-card"
                      onClick={() => {
                        setShowMobileMoreSheet(false);
                        handleInstallClick();
                      }}
                    >
                      <div className="more-card-icon" style={{ background: "rgba(139, 92, 246, 0.12)", color: "#7c3aed" }}>
                        <Smartphone size={20} />
                      </div>
                      <div className="more-card-info">
                        <strong>Install Offline App</strong>
                        <small>Add PWA to home screen for 0ms launch</small>
                      </div>
                    </button>
                  )}

                  {/* Push Alerts */}
                  {enableWebPush && pushStatus.supported && (
                    <button
                      type="button"
                      className="mobile-more-card"
                      onClick={() => {
                        handleToggleWebPush();
                      }}
                      disabled={pushBusy}
                    >
                      <div className="more-card-icon" style={{ background: pushStatus.subscribed ? "rgba(16, 185, 129, 0.12)" : "rgba(100, 116, 139, 0.12)", color: pushStatus.subscribed ? "#059669" : "#475569" }}>
                        <BellRing size={20} />
                      </div>
                      <div className="more-card-info">
                        <strong>Push Notifications</strong>
                        <small>{pushBusy ? "Updating..." : pushStatus.subscribed ? "Alerts Active (Tap to mute)" : "Tap to enable exam alerts"}</small>
                      </div>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
