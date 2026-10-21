import React, { useState, useEffect, useRef, useCallback } from "react";
import Navbar from "./components/Navbar";
import HeroBanner from "./components/HeroBanner";
import CategoryFilter from "./components/CategoryFilter";
import NoteCard from "./components/NoteCard";
import UploadModal from "./components/UploadModal";
import PreviewModal from "./components/PreviewModal";
import AdminModal from "./components/AdminModal";
import NoticeBoardModal from "./components/NoticeBoardModal";
import AuthModal from "./components/AuthModal";
import ProfileModal from "./components/ProfileModal";
import StudentChatModal from "./components/StudentChatModal";
import GlobalErrorBoundary from "./components/GlobalErrorBoundary";
import QueueStatusPill from "./components/QueueStatusPill";
import { api, getCurrentUser } from "./api";
import { BookOpen, ChevronDown, ChevronUp, Bell, Lock, ShieldCheck, Zap, Share2, Sparkles, FileText, CheckCircle, ArrowRight, Cpu, Server, Database, X, Clock, MessageSquare } from "lucide-react";
import { startP2PBackgroundSeeder } from "./utils/p2pMesh";
import { formatFileSize } from "./utils/formatUtils";
import { initTabLeaderElection } from "./utils/tabLeaderLock";
import { syncStudentProfileContext } from "./utils/studentStudyContext";

export default function App() {
  const [notes, setNotes] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCourse, setSelectedCourse] = useState("All Courses");
  const [selectedYear, setSelectedYear] = useState("All Years");
  const [selectedBranch, setSelectedBranch] = useState("All");
  const [showAllNotes, setShowAllNotes] = useState(false);
  const [viewMode, setViewMode] = useState("grid"); // 'grid' or 'table'

  // Modals
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isNoticeBoardOpen, setIsNoticeBoardOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authInitialTab, setAuthInitialTab] = useState("signin");
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [previewNote, setPreviewNote] = useState(null);

  useEffect(() => {
    const handleOpenChat = () => setIsChatOpen(true);
    window.addEventListener("open_student_chat", handleOpenChat);

    // Auto-open chat if URL has chat or invite code parameter
    const params = new URLSearchParams(window.location.search);
    if (params.get("chat") || params.get("code") || params.get("chat_join")) {
      setIsChatOpen(true);
    }

    return () => window.removeEventListener("open_student_chat", handleOpenChat);
  }, []);

  // User & Notices
  const [currentUser, setCurrentUser] = useState(getCurrentUser());
  const [notices, setNotices] = useState([]);
  const [hideSecurityBanner, setHideSecurityBanner] = useState(false);

  // Inactivity Auto-Logout State (30 Minutes = 1,800,000 ms)
  const [autoLogoutNotice, setAutoLogoutNotice] = useState(null);
  const currentUserRef = useRef(currentUser);
  const lastActivityRef = useRef(Date.now());
  const lastStorageSyncRef = useRef(Date.now());

  // Active Background Upload Job
  const [activeJob, setActiveJob] = useState(null);

  // 📴 PWA & Village/2G Resilience Offline State
  const [isOffline, setIsOffline] = useState(typeof navigator !== "undefined" ? !navigator.onLine : false);

  // 🛠️ Platform Maintenance Mode State (Live Host Pause)
  const [maintenanceState, setMaintenanceState] = useState({
    active: false,
    title: "",
    message: "",
    estimatedEnd: "",
  });

  // 📥 Student Notes Download Master Control Flag
  const [allowNotesDownload, setAllowNotesDownload] = useState(true);
  const [downloadDisabledReason, setDownloadDisabledReason] = useState("");
  const [tableDownloads, setTableDownloads] = useState({});

  // 🛡️ Inactivity Session Guardian Setting ("auto", 15, 30, 60, 0)
  const [inactivityTimeoutSetting, setInactivityTimeoutSetting] = useState("auto");
  const inactivitySettingRef = useRef(inactivityTimeoutSetting);
  useEffect(() => {
    inactivitySettingRef.current = inactivityTimeoutSetting;
  }, [inactivityTimeoutSetting]);

  useEffect(() => {
    async function checkMaintenanceStatus() {
      try {
        const res = await api.getPublicTechFlags();
        if (res && res.flags) {
          if (res.flags.inactivityTimeoutMinutes !== undefined) {
            setInactivityTimeoutSetting(res.flags.inactivityTimeoutMinutes);
          }
          if (res.flags.allowNotesDownload !== undefined) {
            setAllowNotesDownload(Boolean(res.flags.allowNotesDownload));
          }
          if (res.flags.downloadDisabledReason) {
            setDownloadDisabledReason(res.flags.downloadDisabledReason);
          }

          if (res.flags.maintenanceMode) {
            setMaintenanceState({
              active: true,
              title: res.flags.maintenanceTitle || "Scheduled System Upgrade in Progress",
              message: res.flags.maintenanceMessage || "We are currently performing scheduled platform upgrades. Free Study Material will be back online shortly!",
              estimatedEnd: res.flags.maintenanceEstimatedEnd || "",
            });
          } else {
            setMaintenanceState((prev) => ({ ...prev, active: false }));
          }
        }
      } catch (err) {
        if (err.maintenance) {
          setMaintenanceState({
            active: true,
            title: err.title || "Scheduled System Upgrade in Progress",
            message: err.message || "We are currently performing scheduled platform upgrades.",
            estimatedEnd: err.estimatedEnd || "",
          });
        }
      }
    }
    checkMaintenanceStatus();
    const interval = setInterval(checkMaintenanceStatus, 20000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // 👑 Multi-Tab Leader Sync (Web Locks API + BroadcastChannel)
    initTabLeaderElection(() => {
      console.log("[FSM] 👑 Active tab elected as primary sync leader.");
    });

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // 📴 Active Network & PWA Standalone Connectivity Probe
    const probeConnectivity = async () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setIsOffline(true);
        return;
      }
      try {
        const res = await fetch("/api/health", { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(2500) });
        if (res.ok) {
          setIsOffline(false);
        } else {
          setIsOffline(true);
        }
      } catch (_) {
        setIsOffline(true);
      }
    };

    probeConnectivity();
    const probeTimer = setInterval(probeConnectivity, 6000);

    // 📡 Listen for Service Worker Offline broadcasts
    const handleSwMessage = (e) => {
      if (e.data && e.data.type === "FSM_NETWORK_STATUS") {
        setIsOffline(Boolean(e.data.isOffline));
      }
    };
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", handleSwMessage);
    }

    if (typeof window !== "undefined" && typeof window.cacheAllActiveResources === "function") {
      setTimeout(() => {
        window.cacheAllActiveResources();
      }, 2000);
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(probeTimer);
      if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", handleSwMessage);
      }
    };
  }, []);

  const openAuth = (tab = "signin") => {
    setAuthInitialTab(tab);
    setIsAuthOpen(true);
  };

  // Keep ref updated to avoid stale state in async timers
  useEffect(() => {
    currentUserRef.current = currentUser;
    if (currentUser) {
      lastActivityRef.current = Date.now();
      localStorage.setItem("vault_last_active", String(Date.now()));
      syncStudentProfileContext(currentUser);
    } else {
      localStorage.removeItem("vault_last_active");
    }
  }, [currentUser]);

  // 30-Minute Inactivity Auto-Logout Handler
  const triggerAutoLogout = useCallback(async () => {
    const userToLogout = currentUserRef.current;
    if (!userToLogout) return;

    // Immediately revoke local session
    setCurrentUser(null);
    setIsUploadOpen(false);
    setIsAdminOpen(false);
    setIsProfileOpen(false);
    setPreviewNote(null);
    localStorage.removeItem("vault_last_active");

    const timeString = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setAutoLogoutNotice({
      time: timeString,
      userEmail: userToLogout.email || "",
      userName: userToLogout.name || "Student",
    });

    // Notify backend to clear auth cookies and dispatch real-time Telegram security alert
    try {
      await api.logout("Auto-Logout (30 Min Inactivity)", userToLogout);
    } catch (e) {
      console.warn("[AUTO-LOGOUT] Logout dispatch notice:", e.message);
    }
  }, []);

  // Track Inactivity (30 min = 1,800,000 ms)
  useEffect(() => {
    if (!currentUser) return;

    const recordUserActivity = () => {
      const now = Date.now();
      lastActivityRef.current = now;
      if (now - lastStorageSyncRef.current > 5000) {
        lastStorageSyncRef.current = now;
        try {
          localStorage.setItem("vault_last_active", String(now));
        } catch (_) {}
      }
    };

    const checkInactivity = () => {
      if (!currentUserRef.current) return;
      const setting = inactivitySettingRef.current;
      if (setting === 0 || setting === "0") return; // Disabled

      const storedLast = parseInt(localStorage.getItem("vault_last_active") || "0", 10);
      const effectiveLastActive = Math.max(lastActivityRef.current, storedLast);

      let timeoutMs = 30 * 60 * 1000;
      if (setting === "auto" || !setting) {
        timeoutMs = 30 * 60 * 1000; // ⚡ 100% Strictly 30 Minutes for Auto Mode
      } else if (typeof setting === "number" && setting > 0) {
        timeoutMs = setting * 60 * 1000;
      } else if (typeof setting === "string" && !isNaN(parseInt(setting, 10)) && parseInt(setting, 10) > 0) {
        timeoutMs = parseInt(setting, 10) * 60 * 1000;
      }

      if (Date.now() - effectiveLastActive >= timeoutMs) {
        triggerAutoLogout();
      }
    };

    const activityEvents = ["mousedown", "mousemove", "keydown", "scroll", "touchstart", "click"];
    activityEvents.forEach((evt) => {
      window.addEventListener(evt, recordUserActivity, { passive: true });
    });

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkInactivity();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const intervalId = setInterval(checkInactivity, 10000);

    return () => {
      activityEvents.forEach((evt) => {
        window.removeEventListener(evt, recordUserActivity);
      });
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearInterval(intervalId);
    };
  }, [currentUser, triggerAutoLogout]);

  useEffect(() => {
    fetchBranches();
    fetchNotices();
    // Start WebRTC Peer-to-Peer Mesh Seeder on device
    startP2PBackgroundSeeder();

    // Check if redirected from restricted link gate
    const urlParams = new URLSearchParams(window.location.search);
    const authAction = urlParams.get("auth");
    if (authAction && !currentUser) {
      openAuth(authAction === "signup" ? "signup" : "signin");
    }

    // Verify session cookie via httpOnly cookie
    api.getMe().then((res) => {
      if (res && res.user) {
        // Check if session has exceeded 30-min inactivity from previous visit
        const storedLast = parseInt(localStorage.getItem("vault_last_active") || "0", 10);
        if (storedLast > 0 && Date.now() - storedLast >= 30 * 60 * 1000) {
          api.logout("Auto-Logout (30 Min Inactivity)", res.user);
          setCurrentUser(null);
          localStorage.removeItem("vault_last_active");
          setAutoLogoutNotice({
            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            userEmail: res.user.email || "",
            userName: res.user.name || "Student",
          });
          return;
        }
        setCurrentUser(res.user);
        lastActivityRef.current = Date.now();
        localStorage.setItem("vault_last_active", String(Date.now()));
      }
    }).catch((err) => {
      if (err.message && (err.message.includes("401") || err.message.includes("Not authenticated") || err.message.includes("Authentication required"))) {
        setCurrentUser(null);
        api.logout();
      }
    });
  }, []);

  useEffect(() => {
    if (currentUser) {
      fetchNotes();
    } else {
      setNotes([]);
      setLoading(false);
    }
  }, [currentUser, selectedCourse, selectedYear, selectedBranch, searchTerm]);

  const fetchBranches = async () => {
    try {
      const res = await api.getBranches();
      setBranches(res.branches || []);
    } catch {}
  };

  const fetchNotices = async () => {
    try {
      const res = await api.getNotices();
      setNotices(res.notices || []);
    } catch {}
  };

  const handleToggleNoteDownloadInState = (noteOrId, allowDownload, reason) => {
    const targetId = typeof noteOrId === "object" ? noteOrId?.id : noteOrId;
    const targetTitle = typeof noteOrId === "object" ? (noteOrId?.title || "").toLowerCase().trim() : "";
    const targetSubject = typeof noteOrId === "object" ? (noteOrId?.subject || "").toLowerCase().trim() : "";

    setNotes((prevNotes) =>
      prevNotes.map((n) => {
        const isMatch =
          n.id === targetId ||
          (targetTitle && (n.title || "").toLowerCase().trim() === targetTitle && (!targetSubject || (n.subject || "").toLowerCase().trim() === targetSubject));
        if (isMatch) {
          return {
            ...n,
            allowDownload: Boolean(allowDownload),
            downloadDisabledReason: allowDownload ? "" : (reason || n.downloadDisabledReason || ""),
          };
        }
        return n;
      })
    );
  };

  useEffect(() => {
    const handleNotesSynced = (e) => {
      if (e.detail && Array.isArray(e.detail) && e.detail.length > 0) {
        const getNoteTs = (n) => {
          if (!n) return 0;
          if (n._sortTimestamp) return n._sortTimestamp;
          const val = n.createdAt || n.updatedAt;
          if (!val) return 0;
          if (typeof val === "number") return val;
          if (val._seconds !== undefined) return val._seconds * 1000;
          const t = new Date(val).getTime();
          return isNaN(t) ? 0 : t;
        };
        const sorted = e.detail.slice().sort((a, b) => getNoteTs(b) - getNoteTs(a));
        if (sorted.length > 0) sorted[0].isLatest = true;
        setNotes(sorted);
      }
    };
    window.addEventListener("fsm:notes-synced", handleNotesSynced);
    return () => window.removeEventListener("fsm:notes-synced", handleNotesSynced);
  }, []);

  const fetchNotes = async (activeUser = null, forceBypass = false) => {
    const userToCheck = activeUser || currentUser;
    if (!userToCheck) {
      setNotes([]);
      setLoading(false);
      return;
    }
    try {
      if (notes.length === 0) {
        setLoading(true);
      }
      const res = await api.getNotes({
        branch: selectedBranch,
        course: selectedCourse,
        year: selectedYear,
        search: searchTerm,
        bypassCache: forceBypass,
      }, forceBypass);
      if (res && res.offline) {
        setIsOffline(true);
      } else if (res && Array.isArray(res.notes) && res.notes.length > 0) {
        setIsOffline(false);
      }
      const getNoteTs = (n) => {
        if (!n) return 0;
        if (n._sortTimestamp) return n._sortTimestamp;
        const val = n.createdAt || n.updatedAt;
        if (!val) return 0;
        if (typeof val === "number") return val;
        if (val._seconds !== undefined) return val._seconds * 1000;
        const t = new Date(val).getTime();
        return isNaN(t) ? 0 : t;
      };
      const sorted = (res.notes || []).slice().sort((a, b) => getNoteTs(b) - getNoteTs(a));
      if (sorted.length > 0) sorted[0].isLatest = true;
      setNotes(sorted);
    } catch (err) {
      console.error("[APP] Error fetching notes:", err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadQueued = (noteId, title) => {
    setActiveJob({ noteId, title });
    fetchNotes();
    fetchBranches();
    fetchNotices();
  };

  const handleQueueCompleted = (noteId) => {
    fetchNotes();
    fetchBranches();
  };

  const handleLogout = async () => {
    const user = currentUser;
    localStorage.removeItem("vault_last_active");
    setAutoLogoutNotice(null);
    setCurrentUser(null);
    await api.logout("Manual Session Logout", user);
  };

  const handleOpenNoteFromNotice = async (noteIdOrUrl) => {
    let noteId = noteIdOrUrl;
    const match = String(noteIdOrUrl).match(/\/api\/notes\/([^\/\?#]+)/);
    if (match) noteId = match[1];

    setIsNoticeBoardOpen(false);

    if (!currentUser) {
      openAuth("signup");
      return;
    }

    let found = notes.find((n) => n.id === noteId);
    if (!found) {
      try {
        const res = await api.getNoteById(noteId);
        if (res && res.note) found = res.note;
      } catch (err) {
        console.warn("[APP] Could not fetch note details:", err.message);
      }
    }

    if (found) {
      setPreviewNote(found);
    } else {
      alert("⚠️ Note not found: This document may have been deleted or moved to the Restore Vault by an administrator.");
    }
  };

  const handleTableDownload = async (note) => {
    if (!currentUser) {
      setAuthMode("signin");
      setIsAuthOpen(true);
      return;
    }
    const isSingleNoteDisabled = note.allowDownload === false || note.allowDownload === "false" || note.allowDownload === 0 || note.allowDownload === "0";
    const isNoteDownloadBlocked = Boolean(!allowNotesDownload || allowNotesDownload === "false" || isSingleNoteDisabled);
    if (isNoteDownloadBlocked) {
      const reasonMsg = note.downloadDisabledReason || downloadDisabledReason || (isSingleNoteDisabled ? "Downloads for this specific note have been disabled by the administrator. You can still read notes in the Online Reader." : "Notes download has been temporarily paused by the administrator. You can still read notes in the Online Reader.");
      alert(reasonMsg);
      return;
    }
    if (note.driveLink && !note.telegramMessageId) {
      window.open(note.driveLink, "_blank");
      return;
    }

    const rawClean = (note.originalName || note.title || "Free_Study_Material").replace(/[/\\?%*:|"<>]/g, "_").trim();
    const fileName = rawClean.toLowerCase().endsWith(".pdf") ? rawClean : `${rawClean}.pdf`;

    let fileHandle = null;
    if (typeof window !== "undefined" && "showSaveFilePicker" in window) {
      try {
        fileHandle = await window.showSaveFilePicker({
          suggestedName: fileName,
          types: [{ description: "PDF Document", accept: { "application/pdf": [".pdf"] } }],
        });
      } catch (pickerErr) {
        if (pickerErr.name === "AbortError") return;
      }
    }

    setTableDownloads((prev) => ({ ...prev, [note.id]: { percent: 5, speed: "Connecting..." } }));
    try {
      await api.downloadNoteWithProgress(
        note.id,
        fileName,
        (metrics) => {
          setTableDownloads((prev) => ({ ...prev, [note.id]: metrics }));
        },
        null,
        fileHandle
      );
    } catch (err) {
      console.warn("Table download error, fallback to direct url:", err.message);
      window.open(api.getDownloadUrl(note.id), "_blank");
    } finally {
      setTableDownloads((prev) => {
        const copy = { ...prev };
        delete copy[note.id];
        return copy;
      });
    }
  };

  // Rule: Display initial 15 notes, keep rest hidden until user clicks "Show All Notes"
  const displayedNotes = showAllNotes ? notes : notes.slice(0, 15);

  const isAdminUser = currentUser?.role === "admin" || currentUser?.role === "half_admin" || currentUser?.email === "jnplotus@gmail.com";
  const hasBypassParam =
    typeof window !== "undefined" &&
    (window.location.search.includes("admin_bypass") ||
      window.location.search.includes("bypass") ||
      (typeof sessionStorage !== "undefined" && Boolean(sessionStorage.getItem("admin_bypass"))));

  // 🛠️ Full-Screen Maintenance Curtain: Site remains 100% hosted, public access paused, admin portal accessible
  if (maintenanceState.active && !isAdminUser && !hasBypassParam) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "radial-gradient(ellipse at top, #0f172a 0%, #090d16 100%)",
          color: "#fff",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: "500px",
            height: "500px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(6, 182, 212, 0.12) 0%, transparent 70%)",
            filter: "blur(60px)",
            top: "20%",
            left: "50%",
            transform: "translateX(-50%)",
            pointerEvents: "none",
          }}
        />

        <div
          style={{
            maxWidth: "600px",
            width: "100%",
            background: "rgba(15, 23, 42, 0.65)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            borderRadius: "20px",
            padding: "36px 30px",
            textAlign: "center",
            boxShadow: "0 24px 64px rgba(0, 0, 0, 0.8)",
            backdropFilter: "blur(16px)",
            position: "relative",
            zIndex: 1,
            animation: "fadeIn 0.4s ease",
          }}
        >
          {/* Header Status Badge */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "6px 14px",
              borderRadius: "999px",
              background: "rgba(239, 68, 68, 0.15)",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              color: "#f87171",
              fontSize: "0.78rem",
              fontWeight: 700,
              marginBottom: "20px",
              letterSpacing: "0.5px",
              textTransform: "uppercase",
            }}
          >
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#ef4444" }} />
            <span>Platform Maintenance Mode Active</span>
          </div>

          <h2 style={{ fontSize: "1.75rem", fontWeight: 800, color: "#fff", marginBottom: "12px", letterSpacing: "-0.5px" }}>
            {maintenanceState.title || "Scheduled System Upgrade"}
          </h2>

          <p style={{ fontSize: "0.92rem", color: "var(--text-muted)", lineHeight: "1.6", marginBottom: "24px" }}>
            {maintenanceState.message || "We are currently performing scheduled platform upgrades to optimize performance, cloud CDN caching, and security. Free Study Material will be back online shortly!"}
          </p>

          {/* Estimated End Box */}
          {maintenanceState.estimatedEnd && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 16px",
                borderRadius: "8px",
                background: "rgba(6, 182, 212, 0.12)",
                border: "1px solid rgba(6, 182, 212, 0.3)",
                color: "var(--accent-cyan)",
                fontSize: "0.84rem",
                fontWeight: 600,
                marginBottom: "24px",
              }}
            >
              <Clock size={16} />
              <span>Estimated Return: {maintenanceState.estimatedEnd}</span>
            </div>
          )}

          {/* Status Checkpoints */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              textAlign: "left",
              padding: "16px",
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.06)",
              borderRadius: "12px",
              marginBottom: "28px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "0.82rem", color: "#34d399" }}>
              <CheckCircle size={15} style={{ flexShrink: 0 }} />
              <span>Server &amp; Cloudflare CDN Nodes 100% Online &amp; Hosted</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "0.82rem", color: "#34d399" }}>
              <CheckCircle size={15} style={{ flexShrink: 0 }} />
              <span>All Academic Notes &amp; Student Accounts 100% Preserved</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "0.82rem", color: "#34d399" }}>
              <CheckCircle size={15} style={{ flexShrink: 0 }} />
              <span>Upgrading Infrastructure &amp; Dynamic Network Adapters</span>
            </div>
          </div>

          {/* Admin Login Portal Button */}
          <div style={{ display: "flex", justifyContent: "center", gap: "12px", flexWrap: "wrap" }}>
            <button
              onClick={() => openAuth("signin")}
              className="btn-secondary"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "0.84rem",
                padding: "10px 20px",
                borderRadius: "8px",
                borderColor: "rgba(255, 255, 255, 0.2)",
              }}
            >
              <Lock size={15} color="var(--accent-cyan)" />
              <span>Administrator Portal Access</span>
            </button>
          </div>
        </div>

        {isAuthOpen && (
          <AuthModal
            initialTab={authInitialTab}
            onClose={() => setIsAuthOpen(false)}
            onLoginSuccess={(user) => {
              setCurrentUser(user);
              setIsAuthOpen(false);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Top Navbar */}
      <Navbar
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        onOpenUpload={() => {
          if (!currentUser) {
            openAuth("signup");
          } else {
            setIsUploadOpen(true);
          }
        }}
        onOpenAdmin={() => {
          if (!currentUser) {
            openAuth("signin");
          } else {
            setIsAdminOpen(true);
          }
        }}
        onOpenNotices={() => setIsNoticeBoardOpen(true)}
        onOpenChat={() => {
          if (!currentUser) {
            openAuth("signin");
          } else {
            setIsChatOpen(true);
          }
        }}
        onOpenAuth={() => openAuth("signin")}
        onOpenProfile={() => setIsProfileOpen(true)}
        currentUser={currentUser}
        onLogout={handleLogout}
        noticeCount={notices.length}
      />

      <main className="app-container" style={{ flex: 1 }}>
        {/* 30-Minute Inactivity Auto-Logout Alert Banner */}
        {autoLogoutNotice && (
          <div
            style={{
              margin: "16px 0 14px",
              padding: "14px 18px",
              background: "linear-gradient(135deg, rgba(239, 68, 68, 0.12) 0%, rgba(185, 28, 28, 0.08) 100%)",
              border: "1px solid rgba(239, 68, 68, 0.35)",
              borderRadius: "var(--radius-md)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "14px",
              boxShadow: "0 4px 20px rgba(239, 68, 68, 0.15)",
              backdropFilter: "blur(10px)",
              animation: "fadeIn 0.3s ease",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1, minWidth: 0 }}>
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  background: "rgba(239, 68, 68, 0.2)",
                  border: "1px solid rgba(239, 68, 68, 0.4)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Clock size={18} style={{ color: "#ef4444" }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "#fca5a5", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span>Session Auto-Terminated (30 Min Inactivity)</span>
                  <span style={{ fontSize: "0.7rem", background: "rgba(239, 68, 68, 0.25)", border: "1px solid rgba(239, 68, 68, 0.35)", padding: "1px 7px", borderRadius: "10px", color: "#fca5a5" }}>
                    Security Bot Notice Sent ⏱️
                  </span>
                </div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "3px" }}>
                  Logged out automatically at <strong>{autoLogoutNotice.time}</strong> due to 30 minutes of web inactivity. Your academic vault session and credentials remain safeguarded.
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
              <button
                className="btn-primary"
                onClick={() => {
                  setAutoLogoutNotice(null);
                  openAuth("signin");
                }}
                style={{
                  fontSize: "0.8rem",
                  padding: "7px 14px",
                  background: "linear-gradient(135deg, #ef4444, #dc2626)",
                  boxShadow: "0 2px 8px rgba(239, 68, 68, 0.3)",
                }}
              >
                Sign In Again
              </button>
              <button
                onClick={() => setAutoLogoutNotice(null)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  padding: "6px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "6px",
                }}
                title="Dismiss Alert"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Offline Mode Banner (Village / 2G Resilience) */}
        {isOffline && (
          <div
            style={{
              margin: "14px 0",
              background: "rgba(245, 158, 11, 0.12)",
              border: "1px solid rgba(245, 158, 11, 0.35)",
              borderRadius: "var(--radius-md)",
              padding: "10px 18px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "1.1rem" }}>📴</span>
              <span style={{ fontSize: "0.82rem", color: "#fbbf24", fontWeight: 700 }}>
                Offline Mode Active (PWA):
              </span>
              <span style={{ fontSize: "0.8rem", color: "#cbd5e1" }}>
                Reading cached notes from local device storage.
              </span>
            </div>
            <span className="tech-pill dedup" style={{ fontSize: "0.68rem" }}>
              ⚡ 100% Free Offline Vault
            </span>
          </div>
        )}

        {/* Notice Board Ticker Bar (if notices exist) */}
        {notices.length > 0 && (
          <div
            style={{
              margin: "16px 0 16px",
              background: "rgba(6, 182, 212, 0.08)",
              border: "1px solid rgba(6, 182, 212, 0.25)",
              borderRadius: "var(--radius-md)",
              padding: "10px 18px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              cursor: "pointer",
              position: "relative",
              zIndex: 1,
            }}
            onClick={() => setIsNoticeBoardOpen(true)}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", overflow: "hidden" }}>
              <Bell size={16} style={{ color: "var(--accent-cyan)", flexShrink: 0 }} />
              <span style={{ fontSize: "0.82rem", color: "#fff", fontWeight: 600 }}>
                Latest Notice:
              </span>
              <span style={{ fontSize: "0.82rem", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {notices[0].title}
              </span>
            </div>

            <span style={{ fontSize: "0.75rem", color: "var(--accent-cyan)", fontWeight: 700, flexShrink: 0 }}>
              View Notice Board &rarr;
            </span>
          </div>
        )}

        {!currentUser ? (
          <div style={{ padding: "20px 0 60px" }}>
            {/* Restricted Access Hero */}
            <div
              style={{
                background: "linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(10, 15, 30, 0.98) 100%)",
                border: "1px solid rgba(99, 102, 241, 0.35)",
                borderRadius: "var(--radius-xl)",
                padding: "48px 24px",
                textAlign: "center",
                boxShadow: "0 20px 60px rgba(0, 0, 0, 0.6), 0 0 40px rgba(99, 102, 241, 0.15)",
                position: "relative",
                overflow: "hidden",
                marginBottom: "36px",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: "-60px",
                  right: "-60px",
                  width: "240px",
                  height: "240px",
                  borderRadius: "50%",
                  background: "radial-gradient(circle, rgba(99, 102, 241, 0.25) 0%, transparent 70%)",
                  filter: "blur(40px)",
                  pointerEvents: "none",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  bottom: "-60px",
                  left: "-60px",
                  width: "240px",
                  height: "240px",
                  borderRadius: "50%",
                  background: "radial-gradient(circle, rgba(6, 182, 212, 0.2) 0%, transparent 70%)",
                  filter: "blur(40px)",
                  pointerEvents: "none",
                }}
              />

              {/* Lock Badge */}
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  background: "rgba(99, 102, 241, 0.15)",
                  border: "1px solid rgba(99, 102, 241, 0.4)",
                  borderRadius: "var(--radius-full)",
                  padding: "8px 18px",
                  fontSize: "0.82rem",
                  fontWeight: 700,
                  color: "var(--accent-indigo)",
                  marginBottom: "20px",
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                }}
              >
                <Lock size={15} />
                <span>Restricted Access • Registered Students Only</span>
              </div>

              <h1
                style={{
                  fontSize: "2.5rem",
                  fontWeight: 800,
                  letterSpacing: "-0.03em",
                  lineHeight: 1.2,
                  marginBottom: "16px",
                  background: "linear-gradient(135deg, #ffffff 30%, #a5b4fc 70%, #06b6d4 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  maxWidth: "850px",
                  margin: "0 auto 16px",
                }}
              >
                Free Study Material Vault
              </h1>

              <p
                style={{
                  color: "var(--text-muted)",
                  fontSize: "1.02rem",
                  lineHeight: 1.6,
                  maxWidth: "700px",
                  margin: "0 auto 30px",
                }}
              >
                Platform access is strictly restricted to verified college students. Sign up or sign in to unlock 10,000+ notes, instant high-speed downloads, Mozilla In-App PDF Reader &amp; P2P campus file sharing!
              </p>

              {/* Primary CTAs */}
              <div style={{ display: "flex", justifyContent: "center", gap: "16px", flexWrap: "wrap", marginBottom: "32px" }}>
                <button
                  className="btn-primary"
                  style={{ padding: "13px 30px", fontSize: "0.98rem", fontWeight: 700, borderRadius: "var(--radius-md)" }}
                  onClick={() => openAuth("signup")}
                >
                  <Sparkles size={18} />
                  <span>🎓 Sign Up</span>
                  <ArrowRight size={18} />
                </button>

                <button
                  className="btn-secondary"
                  style={{ padding: "13px 26px", fontSize: "0.98rem", fontWeight: 600, borderRadius: "var(--radius-md)" }}
                  onClick={() => openAuth("signin")}
                >
                  <Lock size={16} />
                  <span>⚡ Sign In</span>
                </button>
              </div>

              {/* Quick Trust Points */}
              <div style={{ display: "flex", justifyContent: "center", gap: "20px", flexWrap: "wrap", fontSize: "0.82rem", color: "var(--text-dim)" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <CheckCircle size={15} style={{ color: "#34d399" }} /> 100% Free Lifetime
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <CheckCircle size={15} style={{ color: "#34d399" }} /> Zero Ads &amp; Popups
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <CheckCircle size={15} style={{ color: "#34d399" }} /> High-Speed Distributed Cloud
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <CheckCircle size={15} style={{ color: "#34d399" }} /> All Engineering &amp; Degree Branches
                </span>
              </div>
            </div>

            {/* Platform Technology Highlights */}
            <div style={{ marginBottom: "36px" }}>
              <h3 style={{ fontSize: "1.15rem", fontWeight: 700, textAlign: "center", marginBottom: "20px", color: "#fff" }}>
                🚀 Exclusive Benefits Inside The Vault
              </h3>
              <div className="tech-hud-grid">
                <div className="vault-benefit-card">
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                    <Zap size={22} style={{ color: "var(--accent-cyan)" }} />
                    <strong style={{ fontSize: "0.95rem", color: "#fff" }}>Ultra-Fast Academic Cloud Engine</strong>
                  </div>
                  <p style={{ fontSize: "0.82rem", color: "var(--text-dim)", lineHeight: 1.5, margin: 0 }}>
                    Unlimited direct cloud streaming through High-Performance Academic Storage Nodes and Indian Edge CDN for 1ms cached downloads.
                  </p>
                </div>

                <div className="vault-benefit-card">
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                    <Share2 size={22} style={{ color: "var(--accent-indigo)" }} />
                    <strong style={{ fontSize: "0.95rem", color: "#fff" }}>WebRTC P2P Mesh Network</strong>
                  </div>
                  <p style={{ fontSize: "0.82rem", color: "var(--text-dim)", lineHeight: 1.5, margin: 0 }}>
                    Direct 100 MB/s peer-to-peer file transfer between students on the same hostel or campus Wi-Fi without server bandwidth limits.
                  </p>
                </div>

                <div className="vault-benefit-card">
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                    <FileText size={22} style={{ color: "#34d399" }} />
                    <strong style={{ fontSize: "0.95rem", color: "#fff" }}>Mozilla PDF.js Virtual Reader</strong>
                  </div>
                  <p style={{ fontSize: "0.82rem", color: "var(--text-dim)", lineHeight: 1.5, margin: 0 }}>
                    Read handwritten notes and textbooks instantly in your browser with Night Mode, page jump, and zero download waiting time.
                  </p>
                </div>

                <div className="vault-benefit-card">
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                    <ShieldCheck size={22} style={{ color: "#fbbf24" }} />
                    <strong style={{ fontSize: "0.95rem", color: "#fff" }}>Tesseract OCR Deep Search</strong>
                  </div>
                  <p style={{ fontSize: "0.82rem", color: "var(--text-dim)", lineHeight: 1.5, margin: 0 }}>
                    Universal search matches typed titles as well as handwritten formulas scanned directly inside students' handwritten PDF pages.
                  </p>
                </div>

                <div className="vault-benefit-card">
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                    <Cpu size={22} style={{ color: "#a855f7" }} />
                    <strong style={{ fontSize: "0.95rem", color: "#fff" }}>In-Memory LRU RAM &amp; Brotli Booster</strong>
                  </div>
                  <p style={{ fontSize: "0.82rem", color: "var(--text-dim)", lineHeight: 1.5, margin: 0 }}>
                    Dedicated 500 MB in-memory RAM cache pool delivering microsecond document streaming with dual Brotli &amp; Gzip compression for 25% extra bandwidth savings.
                  </p>
                </div>

                <div className="vault-benefit-card">
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                    <Database size={22} style={{ color: "#38bdf8" }} />
                    <strong style={{ fontSize: "0.95rem", color: "#fff" }}>Distributed Multi-Worker Vault &amp; Zero-Loss Archiving</strong>
                  </div>
                  <p style={{ fontSize: "0.82rem", color: "var(--text-dim)", lineHeight: 1.5, margin: 0 }}>
                    High-speed parallel multi-worker streaming engine with automated snapshot recovery, ensuring accident-proof note preservation and zero-loss cloud archiving.
                  </p>
                </div>

                <div className="vault-benefit-card">
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                    <ShieldCheck size={22} style={{ color: "#10b981" }} />
                    <strong style={{ fontSize: "0.95rem", color: "#fff" }}>Brevo SMTP &amp; Zero-Threat Security Shield</strong>
                  </div>
                  <p style={{ fontSize: "0.82rem", color: "var(--text-dim)", lineHeight: 1.5, margin: 0 }}>
                    Cryptographic 6-digit email OTP verification, 10-round bcrypt salted encryption, and multi-tiered DDoS protection for 100% student data safety.
                  </p>
                </div>

                <div className="vault-benefit-card">
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                    <Zap size={22} style={{ color: "#f59e0b" }} />
                    <strong style={{ fontSize: "0.95rem", color: "#fff" }}>Real-Time Bot Poller &amp; Fast Ingest</strong>
                  </div>
                  <p style={{ fontSize: "0.82rem", color: "var(--text-dim)", lineHeight: 1.5, margin: 0 }}>
                    Snappy 5s Telegram long-polling &amp; SHA-256 deduplication for instant study material publishing.
                  </p>
                </div>

                <div className="vault-benefit-card">
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                    <Lock size={22} style={{ color: "#ec4899" }} />
                    <strong style={{ fontSize: "0.95rem", color: "#fff" }}>100% Autonomous &amp; Zero Data Sharing</strong>
                  </div>
                  <p style={{ fontSize: "0.82rem", color: "var(--text-dim)", lineHeight: 1.5, margin: 0 }}>
                    This platform operates completely autonomously with zero human intervention. All student data, credentials, and activity logs are strictly private and will never be shared, sold, or tracked.
                  </p>
                </div>
              </div>
            </div>

            {/* Sample Locked Vault Teaser Cards */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h4 style={{ fontSize: "1rem", fontWeight: 700, color: "#fff", margin: 0 }}>
                  🔒 Locked Materials Preview (Register to Unlock Full Vault)
                </h4>
                <span style={{ fontSize: "0.78rem", color: "var(--accent-cyan)", cursor: "pointer", fontWeight: 600 }} onClick={() => openAuth("signup")}>
                  Create Free Account &rarr;
                </span>
              </div>

              <div className="tech-hud-grid">
                {[
                  { title: "Engineering Mathematics III", subject: "Linear Algebra & Transforms", branch: "CSE / IT", size: "18.4 MB" },
                  { title: "Operating Systems & Kernel Architecture", subject: "Process Sync & Memory Virtualization", branch: "CSE / BCA", size: "24.1 MB" },
                  { title: "Data Structures & Algorithms in C++", subject: "Trees, Graphs & Dynamic Programming", branch: "All Branches", size: "32.6 MB" },
                ].map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: "var(--bg-glass-card)",
                      border: "1px dashed rgba(255, 255, 255, 0.15)",
                      borderRadius: "var(--radius-md)",
                      padding: "18px",
                      opacity: 0.9,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                      <span className="tech-pill branch">{item.branch}</span>
                      <span style={{ fontSize: "0.75rem", color: "#f87171", display: "flex", alignItems: "center", gap: "4px", fontWeight: 600 }}>
                        <Lock size={12} /> Locked
                      </span>
                    </div>
                    <h4 style={{ fontSize: "0.95rem", fontWeight: 700, color: "#fff", marginBottom: "4px" }}>{item.title}</h4>
                    <p style={{ fontSize: "0.78rem", color: "var(--accent-cyan)", marginBottom: "14px" }}>{item.subject}</p>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid rgba(255, 255, 255, 0.05)", paddingTop: "10px" }}>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>{item.size} • Verified</span>
                      <button
                        className="btn-secondary"
                        style={{ fontSize: "0.75rem", padding: "6px 14px", fontWeight: 600 }}
                        onClick={() => openAuth("signup")}
                      >
                        ⚡ Unlock
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Account Lifecycle Security Policy Banner (Front Page After Login) */}
            {!hideSecurityBanner && (
              <div
                style={{
                  background: "linear-gradient(135deg, rgba(30, 41, 59, 0.75), rgba(15, 23, 42, 0.9))",
                  border: "1px solid rgba(56, 189, 248, 0.25)",
                  borderRadius: "12px",
                  padding: "14px 18px",
                  margin: "0 0 20px 0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "16px",
                  boxShadow: "0 4px 20px rgba(0, 0, 0, 0.25)",
                  backdropFilter: "blur(10px)",
                  flexWrap: "wrap",
                  position: "relative",
                  zIndex: 1,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1, minWidth: "260px" }}>
                  <div
                    style={{
                      width: "38px",
                      height: "38px",
                      borderRadius: "10px",
                      background: "rgba(56, 189, 248, 0.12)",
                      border: "1px solid rgba(56, 189, 248, 0.3)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "1.2rem",
                      flexShrink: 0,
                    }}
                  >
                    🛡️
                  </div>
                  <div>
                    <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: "8px" }}>
                      <span>Account Security Policy: Active Student Protection</span>
                      <span
                        style={{
                          fontSize: "0.68rem",
                          padding: "2px 8px",
                          borderRadius: "999px",
                          background: "rgba(16, 185, 129, 0.15)",
                          color: "#34d399",
                          fontWeight: 600,
                          border: "1px solid rgba(16, 185, 129, 0.3)",
                        }}
                      >
                        Active &amp; Safe
                      </span>
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginTop: "2px", lineHeight: "1.4" }}>
                      To protect student privacy and university resources, accounts that do not log in for <strong>90 consecutive days</strong> are automatically deleted. Simply sign in once every 90 days to keep your student account active.
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--accent-cyan)", fontWeight: 600 }}>
                    Logged in as {currentUser?.name || currentUser?.email}
                  </span>
                  <button
                    onClick={() => setHideSecurityBanner(true)}
                    style={{
                      background: "rgba(255, 255, 255, 0.05)",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      color: "var(--text-dim)",
                      borderRadius: "6px",
                      padding: "4px 8px",
                      cursor: "pointer",
                      fontSize: "0.72rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                    title="Dismiss notice"
                  >
                    <X size={13} />
                    <span>Dismiss</span>
                  </button>
                </div>
              </div>
            )}

            {/* Hero Banner with Tech Architecture */}
            <HeroBanner totalNotes={notes.length} />

            {/* Filter Bar (With Dynamic Custom Branches & View Switcher) */}
            <CategoryFilter
              selectedCourse={selectedCourse}
              setSelectedCourse={setSelectedCourse}
              selectedYear={selectedYear}
              setSelectedYear={setSelectedYear}
              selectedBranch={selectedBranch}
              setSelectedBranch={setSelectedBranch}
              branches={branches}
              totalCount={notes.length}
              viewMode={viewMode}
              setViewMode={setViewMode}
            />

            {/* Notes View (Grid or Compact List) */}
            {loading ? (
              <div style={{ textAlign: "center", padding: "60px 0" }}>
                <div className="spinner" style={{ width: "32px", height: "32px", margin: "0 auto 16px" }}></div>
                <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
                  Connecting to Indian Edge CDN & loading notes...
                </p>
              </div>
            ) : notes.length > 0 ? (
              <>
                {viewMode === "grid" ? (
                  <div className="notes-grid">
                    {displayedNotes.map((note) => (
                      <NoteCard
                        key={note.id}
                        note={note}
                        onPreview={(n) => setPreviewNote(n)}
                        currentUser={currentUser}
                        allowNotesDownload={allowNotesDownload}
                        downloadDisabledReason={downloadDisabledReason}
                        onRequireAuth={(mode) => {
                          setAuthMode(mode || "signin");
                          setIsAuthOpen(true);
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  /* Compact Table / List View */
                  <div style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", overflow: "hidden", background: "var(--bg-glass-card)" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                      <thead>
                        <tr style={{ background: "rgba(255, 255, 255, 0.03)", color: "var(--text-dim)", textAlign: "left" }}>
                          <th style={{ padding: "12px 16px" }}>Material Title & Subject</th>
                          <th style={{ padding: "12px 16px" }}>Program & Branch</th>
                          <th style={{ padding: "12px 16px" }}>File Size</th>
                          <th style={{ padding: "12px 16px" }}>Downloads</th>
                          <th style={{ padding: "12px 16px", textAlign: "right" }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayedNotes.map((note) => (
                          <tr key={note.id} style={{ borderTop: "1px solid rgba(255, 255, 255, 0.04)" }}>
                            <td style={{ padding: "12px 16px", color: "#fff", fontWeight: 600 }}>
                              <div>{note.title}</div>
                              <div style={{ fontSize: "0.75rem", color: "var(--accent-cyan)", fontWeight: 400 }}>{note.subject}</div>
                            </td>
                            <td style={{ padding: "12px 16px" }}>
                              <span className="tech-pill branch">{note.branch}</span> {note.course || "B.Tech"} • {note.year || note.semester || "All"}
                            </td>
                            <td style={{ padding: "12px 16px", color: "var(--text-dim)" }}>
                              {formatFileSize(note.compressedSize || note.fileSize)}
                              {note.savingsPercent > 0 && <span style={{ color: "#34d399", fontSize: "0.72rem", marginLeft: "6px" }}>(-{note.savingsPercent}%)</span>}
                            </td>
                            <td style={{ padding: "12px 16px", color: "var(--text-dim)" }}>
                              {note.downloadsCount || 0}
                            </td>
                            <td style={{ padding: "12px 16px", textAlign: "right" }}>
                              <div style={{ display: "inline-flex", gap: "6px" }}>
                                <button
                                  onClick={() => handleTableDownload(note)}
                                  className="btn-card-download"
                                  disabled={Boolean(tableDownloads[note.id])}
                                  style={{
                                    padding: "6px 12px",
                                    fontSize: "0.78rem",
                                    opacity: (!allowNotesDownload || allowNotesDownload === "false" || note.allowDownload === false || note.allowDownload === "false" || note.allowDownload === 0 || note.allowDownload === "0") ? 0.75 : 1,
                                    cursor: "pointer",
                                    background: (!allowNotesDownload || allowNotesDownload === "false" || note.allowDownload === false || note.allowDownload === "false" || note.allowDownload === 0 || note.allowDownload === "0") ? "rgba(239, 68, 68, 0.15)" : undefined,
                                    borderColor: (!allowNotesDownload || allowNotesDownload === "false" || note.allowDownload === false || note.allowDownload === "false" || note.allowDownload === 0 || note.allowDownload === "0") ? "rgba(239, 68, 68, 0.4)" : undefined,
                                    color: (!allowNotesDownload || allowNotesDownload === "false" || note.allowDownload === false || note.allowDownload === "false" || note.allowDownload === 0 || note.allowDownload === "0") ? "#fca5a5" : undefined,
                                  }}
                                  title={(!allowNotesDownload || allowNotesDownload === "false" || note.allowDownload === false || note.allowDownload === "false" || note.allowDownload === 0 || note.allowDownload === "0") ? ((note.allowDownload === false || note.allowDownload === "false" || note.allowDownload === 0 || note.allowDownload === "0") ? "Downloads disabled for this note. Online Reader active." : "Downloads paused by administrator. Online Reader active.") : "Download Document"}
                                >
                                  {(!allowNotesDownload || allowNotesDownload === "false" || note.allowDownload === false || note.allowDownload === "false" || note.allowDownload === 0 || note.allowDownload === "0") ? (
                                    (note.allowDownload === false || note.allowDownload === "false" || note.allowDownload === 0 || note.allowDownload === "0") ? "🔒 Disabled" : "🔒 Paused"
                                  ) : tableDownloads[note.id] ? (
                                    <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                                      <div className="spinner" style={{ width: "11px", height: "11px" }}></div>
                                      <span>{tableDownloads[note.id].percent}%</span>
                                    </span>
                                  ) : (
                                    "⚡ Download"
                                  )}
                                </button>
                                <button
                                  className="btn-card-preview"
                                  style={{ width: "32px", height: "32px" }}
                                  onClick={() => {
                                    if (!currentUser) {
                                      setAuthMode("signin");
                                      setIsAuthOpen(true);
                                      return;
                                    }
                                    setPreviewNote(note);
                                  }}
                                  title="Preview Document"
                                >
                                  👁️
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Show 15 notes rule: Expand / Collapse Button */}
                {notes.length > 15 && (
                  <div style={{ textAlign: "center", marginTop: "32px" }}>
                    <button
                      className="btn-secondary"
                      style={{ padding: "12px 28px", fontSize: "0.9rem", fontWeight: 600 }}
                      onClick={() => setShowAllNotes((prev) => !prev)}
                    >
                      {showAllNotes ? (
                        <>
                          <span>Show Less (Only 15 Notes)</span>
                          <ChevronUp size={16} />
                        </>
                      ) : (
                        <>
                          <span>Show All {notes.length} Notes (Showing 15 of {notes.length})</span>
                          <ChevronDown size={16} />
                        </>
                      )}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div
                style={{
                  textAlign: "center",
                  padding: "70px 20px",
                  background: "var(--bg-glass-card)",
                  border: "1px dashed var(--border-subtle)",
                  borderRadius: "var(--radius-lg)",
                }}
              >
                <BookOpen size={48} style={{ color: "var(--accent-indigo)", marginBottom: "16px", opacity: 0.8 }} />
                <h3 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "8px" }}>
                  No study notes found in this filter
                </h3>
                <p style={{ color: "var(--text-dim)", fontSize: "0.88rem", maxWidth: "400px", margin: "0 auto 20px" }}>
                  Be the first student to upload notes for {selectedBranch} ({selectedYear})!
                </p>
                <button className="btn-primary" onClick={() => setIsUploadOpen(true)}>
                  Upload First Note
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer
        style={{
          borderTop: "1px solid var(--border-subtle)",
          padding: "24px",
          textAlign: "center",
          fontSize: "0.8rem",
          color: "var(--text-dim)",
          background: "rgba(7, 10, 18, 0.95)",
        }}
      >
        <div style={{ maxWidth: "1380px", margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "14px" }}>
          <div>
            Free Study Material Vault • Domain: <strong>freestudymaterial.onrender.com</strong>
          </div>

          <div>
            100% Free Lifetime Academic Cloud • High-Speed Distributed Storage • Cloudflare CDN LRU
          </div>
        </div>
      </footer>

      {/* Modals & Overlays */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploadQueued={handleUploadQueued}
        existingBranches={branches}
      />

      <PreviewModal
        note={previewNote}
        onClose={() => setPreviewNote(null)}
        currentUser={currentUser}
        allowNotesDownload={allowNotesDownload}
        downloadDisabledReason={downloadDisabledReason}
        onOpenAuth={(mode) => {
          setPreviewNote(null);
          openAuth(mode || "signin");
        }}
      />

      <AdminModal
        isOpen={isAdminOpen}
        onClose={() => setIsAdminOpen(false)}
        currentUser={currentUser}
        onLoginSuccess={(user) => {
          setAutoLogoutNotice(null);
          setCurrentUser(user);
          localStorage.setItem("vault_last_active", String(Date.now()));
          fetchNotes(user);
        }}
        notes={notes}
        onRefreshNotes={() => fetchNotes(null, true)}
        branches={branches}
        allowNotesDownload={allowNotesDownload}
        onToggleDownloadAllowed={(val, reason) => {
          setAllowNotesDownload(Boolean(val));
          if (reason) setDownloadDisabledReason(reason);
        }}
        onToggleNoteDownload={handleToggleNoteDownloadInState}
      />

      <NoticeBoardModal
        isOpen={isNoticeBoardOpen}
        onClose={() => setIsNoticeBoardOpen(false)}
        currentUser={currentUser}
        onOpenNote={handleOpenNoteFromNotice}
        onOpenAuth={(mode) => {
          setIsNoticeBoardOpen(false);
          openAuth(mode || "signup");
        }}
      />

      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        initialTab={authInitialTab}
        onAuthSuccess={(user) => {
          setAutoLogoutNotice(null);
          setCurrentUser(user);
          localStorage.setItem("vault_last_active", String(Date.now()));
          fetchNotes(user);
        }}
      />

      <ProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        currentUser={currentUser}
        onProfileUpdated={(updated) => {
          setCurrentUser(updated);
        }}
      />

      <GlobalErrorBoundary>
        <StudentChatModal
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
          currentUser={currentUser}
          onPreviewNote={(note) => setPreviewNote(note)}
          onOpenAuth={(mode) => openAuth(mode || "signin")}
        />
      </GlobalErrorBoundary>

      {/* Floating Instant Chat Hub Trigger (WhatsApp / Instagram Style) */}
      {!isChatOpen && (
        <button
          onClick={() => {
            if (!currentUser) {
              openAuth("signin");
            } else {
              setIsChatOpen(true);
            }
          }}
          className="floating-chat-trigger"
          title="Open Live Student Chat Hub & Study Pods"
          style={{
            position: "fixed",
            bottom: activeJob ? "82px" : "24px",
            right: "20px",
            zIndex: 140,
            background: "linear-gradient(135deg, #0284c7 0%, #3b82f6 50%, #6366f1 100%)",
            color: "#fff",
            border: "1px solid rgba(255, 255, 255, 0.25)",
            borderRadius: "999px",
            padding: "10px 18px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            boxShadow: "0 10px 28px rgba(2, 132, 199, 0.4), 0 0 20px rgba(99, 102, 241, 0.25)",
            cursor: "pointer",
            fontWeight: 700,
            fontSize: "0.85rem",
            transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          <span style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <MessageSquare size={18} />
            <span
              style={{
                position: "absolute",
                top: "-2px",
                right: "-2px",
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: "#10b981",
                boxShadow: "0 0 6px #10b981",
              }}
            />
          </span>
          <span className="floating-chat-text">Chat Hub</span>
        </button>
      )}

      <QueueStatusPill
        activeJob={activeJob}
        onCompleted={handleQueueCompleted}
        onDismiss={() => setActiveJob(null)}
      />
    </div>
  );
}
