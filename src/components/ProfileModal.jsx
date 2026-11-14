import { useState, useEffect } from "react";
import { X, User, Lock, CheckCircle2, AlertCircle, Key, Shield, Eye, EyeOff, Trash2, Database, HardDrive, RefreshCw, FileText, Clock, Pin, LogOut, ShieldAlert, Smartphone, Laptop, Activity, Sparkles, Copy, Check, MessageSquare, Layers, Zap } from "lucide-react";
import { api } from "../api";
import { registerDevicePasskey, isPasskeySupported } from "../utils/passkeyClient";
import { detectClientHardwareProfile } from "../utils/hardwareAdaptiveEngine";
import { getStorageUsage } from "../utils/p2pMesh";
import {
  getAllStoredOfflineNotes,
  deleteSingleOfflineNote,
  wipeAllDeviceOfflineStorage,
  getPinnedOfflineNotes,
  togglePinOfflineNote,
  getDeviceDynamicLRUCapacity,
  runOfflineVaultAutoMaintenance,
} from "../utils/offlineQueue";
import {
  getAllStoredCircleNotes,
  deleteSingleCircleNote,
  togglePinCircleNote,
  clearAllStoredCircleNotes,
  saveIndexedDbCircleCache,
} from "../utils/circleSearchEngine";
import { getStudySessionHistory } from "../utils/studentSessionHistory";
import GeminiIcon from "./GeminiIcon";
import MathMarkdown from "./MathMarkdown";

const RESERVED_NAMES = [
  "admin", "administrator", "root", "staff", "mod", "moderator",
  "fsm", "freestudymaterial", "fsmadmin", "fsm_admin", "official", "support",
  "helpdesk", "system", "security", "owner", "superuser", "founder",
  "coreconcepts", "bot", "ai", "team", "securitybot", "fsmchat"
];

export default function ProfileModal({ isOpen, onClose, currentUser, onProfileUpdated }) {
  const [tab, setTab] = useState("profile"); // 'profile' or 'password'

  // Profile fields
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [initialMobile, setInitialMobile] = useState("");
  const [college, setCollege] = useState("");
  const [year, setYear] = useState("1st Year");

  // Mobile change re-verification state
  const [mobileOtp, setMobileOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);

  // Password fields
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  // Passkey State (Old Firebase Storage)
  const [passkeys, setPasskeys] = useState([]);
  const [loadingPasskeys, setLoadingPasskeys] = useState(false);
  const [registeringPasskey, setRegisteringPasskey] = useState(false);
  const [deletingPasskeyId, setDeletingPasskeyId] = useState(null);
  const [supportsPasskey, setSupportsPasskey] = useState(true);
  const [storageInfo, setStorageInfo] = useState(null);
  const [clearingStorage, setClearingStorage] = useState(false);
  const [storedNotes, setStoredNotes] = useState([]);
  const [loadingStoredNotes, setLoadingStoredNotes] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState(null);
  const [refreshingStorage, setRefreshingStorage] = useState(false);
  const [refreshSuccess, setRefreshSuccess] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);
  const [pinnedIds, setPinnedIds] = useState([]);
  const [dynamicLRUCapacity, setDynamicLRUCapacity] = useState(5);
  const hwProfile = detectClientHardwareProfile();

  // Circle to Search Notes State (48h auto-expire default)
  const [storedCircleNotes, setStoredCircleNotes] = useState([]);
  const [loadingCircleNotes, setLoadingCircleNotes] = useState(false);
  const [deletingCircleKey, setDeletingCircleKey] = useState(null);
  const [viewingCircleAnswer, setViewingCircleAnswer] = useState(null);
  const [copiedCircleAnswer, setCopiedCircleAnswer] = useState(false);
  const [aiFilter, setAiFilter] = useState("all");

  const fetchStorageInfo = async () => {
    try {
      const info = await getStorageUsage();
      setStorageInfo(info);
    } catch (_) {}
  };

  const loadStoredNotes = async () => {
    try {
      setLoadingStoredNotes(true);
      // Run 48h auto-eviction & dynamic LRU check (protects pinned notes, keeps minimum 2)
      await runOfflineVaultAutoMaintenance();
      const notes = await getAllStoredOfflineNotes();
      setStoredNotes(notes || []);
      setPinnedIds(getPinnedOfflineNotes());
      setDynamicLRUCapacity(getDeviceDynamicLRUCapacity());
    } catch (_) {
      setStoredNotes([]);
    } finally {
      setLoadingStoredNotes(false);
    }
  };

  const loadStoredCircleNotes = async () => {
    try {
      setLoadingCircleNotes(true);
      // Auto-migrate any in-session AI items from sessionStorage into offline vault
      try {
        const sessionItems = getStudySessionHistory();
        for (const s of sessionItems) {
          if (s && s.id && (s.query || s.title)) {
            const key = `ai_session_${s.id}`;
            let ans = "";
            if (s.type === "chat" && Array.isArray(s.data)) {
              const lastAi = [...s.data].reverse().find((m) => m.role === "assistant");
              ans = lastAi ? lastAi.content : "";
            } else if (s.type === "flashcard" && Array.isArray(s.data)) {
              ans = s.data.map((c, i) => `### 🗂️ Card ${i + 1}: ${c.front || c.question}\n\n**Answer:**\n${c.back || c.answer}`).join("\n\n---\n\n");
            } else if (s.type === "summary") {
              ans = typeof s.data === "string" ? s.data : JSON.stringify(s.data);
            }
            if (ans) {
              await saveIndexedDbCircleCache(key, {
                key,
                query: s.query || s.title || "AI Study Item",
                answer: ans,
                subject: s.title || "Study Notes",
                noteId: s.noteId || "",
                provider: s.provider || "AI Engine",
                type: s.type || "chat",
                savedAt: s.timestamp || Date.now(),
                isPinned: true,
              });
            }
          }
        }
      } catch (_) {}

      const list = await getAllStoredCircleNotes();
      setStoredCircleNotes(list || []);
    } catch (_) {
      setStoredCircleNotes([]);
    } finally {
      setLoadingCircleNotes(false);
    }
  };

  const handleTogglePin = (noteId, noteTitle) => {
    const isNowPinned = togglePinOfflineNote(noteId);
    setPinnedIds(getPinnedOfflineNotes());
    setMsg({
      type: "success",
      text: isNowPinned
        ? `📌 "${noteTitle || 'Note'}" pinned! Kept forever and exempt from 48h auto-delete.`
        : `⏳ "${noteTitle || 'Note'}" unpinned. It will auto-expire in 48 hours to save device space.`,
    });
    setTimeout(() => setMsg(null), 4000);
  };

  const handleTogglePinCircle = async (key, queryTitle) => {
    try {
      const isNowPinned = await togglePinCircleNote(key);
      await loadStoredCircleNotes();
      setMsg({
        type: "success",
        text: isNowPinned
          ? `📌 "${(queryTitle || 'Circled question').slice(0, 32)}..." pinned! Kept forever and exempt from 48h auto-delete.`
          : `⏳ "${(queryTitle || 'Circled question').slice(0, 32)}..." unpinned. It will auto-expire in 48 hours.`,
      });
      setTimeout(() => setMsg(null), 4000);
    } catch (_) {}
  };

  const handleRefreshAllStorage = async () => {
    try {
      setRefreshingStorage(true);
      setRefreshSuccess(false);
      await Promise.all([fetchStorageInfo(), loadStoredNotes(), loadStoredCircleNotes()]);
      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setLastRefreshedAt(nowStr);
      setRefreshSuccess(true);
      setTimeout(() => setRefreshSuccess(false), 3500);
    } catch (_) {
    } finally {
      setTimeout(() => setRefreshingStorage(false), 600);
    }
  };

  useEffect(() => {
    if (tab === "storage" && isOpen) {
      fetchStorageInfo();
      loadStoredNotes();
      loadStoredCircleNotes();
    }
  }, [tab, isOpen]);

  // Lock background body scroll while ProfileModal is active
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  const handleDeleteSingleNote = async (noteId, noteTitle) => {
    if (!window.confirm(`Are you sure you want to delete "${noteTitle || 'this note'}" from offline storage?`)) return;
    try {
      setDeletingNoteId(noteId);
      await deleteSingleOfflineNote(noteId);
      setMsg({ type: "success", text: `Deleted "${noteTitle || noteId}" from local offline cache.` });
      await loadStoredNotes();
      await fetchStorageInfo();
    } catch (err) {
      setMsg({ type: "error", text: "Failed to delete offline note: " + err.message });
    } finally {
      setDeletingNoteId(null);
    }
  };

  const handleDeleteSingleCircleNote = async (key, queryTitle) => {
    if (!window.confirm(`Are you sure you want to delete this circled solution from local storage?`)) return;
    try {
      setDeletingCircleKey(key);
      await deleteSingleCircleNote(key);
      setMsg({ type: "success", text: "Deleted circled solution from storage." });
      await loadStoredCircleNotes();
      await fetchStorageInfo();
    } catch (err) {
      setMsg({ type: "error", text: "Failed to delete: " + err.message });
    } finally {
      setDeletingCircleKey(null);
    }
  };

  const handleWipeStorage = async () => {
    if (!window.confirm("Are you sure you want to delete all offline notes cached on this device? This will free up storage space.")) return;
    try {
      setClearingStorage(true);
      await Promise.all([wipeAllDeviceOfflineStorage(), clearAllStoredCircleNotes()]);
      setStoredNotes([]);
      setStoredCircleNotes([]);
      setMsg({ type: "success", text: "Offline notes and storage cache successfully cleared from this device!" });
      await fetchStorageInfo();
    } catch (err) {
      setMsg({ type: "error", text: "Failed to clear local device cache: " + err.message });
    } finally {
      setClearingStorage(false);
    }
  };

  useEffect(() => {
    if (isOpen && currentUser?.id && api.syncDeviceSpecs) {
      api.syncDeviceSpecs({
        cores: hwProfile.cores,
        memoryGB: hwProfile.memoryGB,
        tier: hwProfile.tier,
        label: hwProfile.label,
        isMobile: hwProfile.isMobile,
      }).catch(() => {});
    }
  }, [isOpen, currentUser?.id]);

  useEffect(() => {
    isPasskeySupported().then((sup) => setSupportsPasskey(sup));
  }, []);

  const loadPasskeys = async () => {
    try {
      setLoadingPasskeys(true);
      const res = await api.getPasskeysList();
      if (res && res.success) {
        setPasskeys(res.passkeys || []);
      }
    } catch (_) {
      setPasskeys([]);
    } finally {
      setLoadingPasskeys(false);
    }
  };

  useEffect(() => {
    if (tab === "passkey" && isOpen) {
      loadPasskeys();
    }
  }, [tab, isOpen]);

  const handleRegisterPasskey = async () => {
    try {
      setRegisteringPasskey(true);
      setMsg(null);
      const res = await registerDevicePasskey();
      setMsg({ type: "success", text: res.message || "Passkey registered successfully! Saved securely in Firebase." });
      await loadPasskeys();
    } catch (err) {
      if (err.message && !err.message.includes("cancelled")) {
        setMsg({ type: "error", text: err.message || "Failed to register passkey." });
      }
    } finally {
      setRegisteringPasskey(false);
    }
  };

  const handleDeletePasskey = async (id) => {
    if (!window.confirm("Remove this passkey from your account?")) return;
    try {
      setDeletingPasskeyId(id);
      await api.deletePasskey(id);
      setMsg({ type: "success", text: "Passkey removed from your account." });
      await loadPasskeys();
    } catch (err) {
      setMsg({ type: "error", text: err.message || "Failed to remove passkey." });
    } finally {
      setDeletingPasskeyId(null);
    }
  };

  useEffect(() => {
    if (currentUser) {
      setName(currentUser.name || "");
      setMobile(currentUser.mobile || "");
      setInitialMobile(currentUser.mobile || "");
      setCollege(currentUser.college || "");
      setYear(currentUser.year || "1st Year");
      setMobileOtp("");
      setOtpSent(false);
    }
    setMsg(null);
  }, [currentUser, isOpen]);

  if (!isOpen || !currentUser) return null;

  const isMobileChanged = mobile.trim() !== (initialMobile || "").trim();

  const handleSendMobileOtp = async () => {
    if (!mobile.trim() || mobile.trim().length !== 10) {
      return setMsg({ type: "error", text: "Please enter a valid 10-digit mobile number first." });
    }
    try {
      setSendingOtp(true);
      setMsg(null);
      const res = await api.requestProfileMobileOtp(mobile.trim());
      setOtpSent(true);
      setMsg({ type: "success", text: res.message || `Verification OTP sent to ${currentUser.email}!` });
    } catch (err) {
      setMsg({ type: "error", text: err.message || "Failed to send verification OTP." });
    } finally {
      setSendingOtp(false);
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    const normName = name.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    const isAdmin = currentUser.role === "admin" || currentUser.id === "admin-root";

    if (!isAdmin) {
      if (RESERVED_NAMES.some((r) => normName.includes(r))) {
        setLoading(false);
        return setMsg({
          type: "error",
          text: "Reserved keyword detected: Display names cannot contain administrative titles (Admin, FSM, Official, System, Staff, Support, Moderator). Please choose an academic nickname.",
        });
      }
    }

    if (isMobileChanged && !mobileOtp.trim()) {
      setLoading(false);
      return setMsg({
        type: "error",
        text: "Changing your mobile number requires Email verification. Please click 'Send OTP to Email' and enter the 6-digit code.",
      });
    }

    try {
      const res = await api.updateProfile({
        name: name.trim(),
        username: currentUser?.username || "",
        photoUrl: currentUser?.photoUrl || currentUser?.avatar || "",
        mobile: mobile.trim(),
        college: college.trim(),
        year: year.trim(),
        otp: mobileOtp.trim(),
      });

      setMsg({ type: "success", text: "Profile details updated successfully!" });
      setInitialMobile(mobile.trim());
      setMobileOtp("");
      setOtpSent(false);
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

  const [loggingOutAll, setLoggingOutAll] = useState(false);
  const [activeSessions, setActiveSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [terminatingSessionId, setTerminatingSessionId] = useState(null);
  const [terminatingAllOther, setTerminatingAllOther] = useState(false);
  const [securityLogs, setSecurityLogs] = useState([]);
  const [securityLogsLoading, setSecurityLogsLoading] = useState(false);
  const [showSecurityHistory, setShowSecurityHistory] = useState(true);

  const loadSessionsAndActivity = async () => {
    setSessionsLoading(true);
    setSecurityLogsLoading(true);
    try {
      const [sessRes, logsRes] = await Promise.all([
        api.getActiveSessions().catch(() => ({ success: false, sessions: [] })),
        api.getRecentSecurityActivity().catch(() => ({ success: false, logs: [] })),
      ]);
      if (sessRes?.sessions) setActiveSessions(sessRes.sessions);
      if (logsRes?.logs) setSecurityLogs(logsRes.logs);
    } catch (_) {}
    setSessionsLoading(false);
    setSecurityLogsLoading(false);
  };

  useEffect(() => {
    if (isOpen && tab === "password") {
      loadSessionsAndActivity();
    }
  }, [isOpen, tab]);

  const handleTerminateSingle = async (sessionId, deviceName, isCurrent = false) => {
    const promptMsg = isCurrent
      ? "Are you sure you want to log out from this current device? You will be logged out immediately."
      : `Are you sure you want to terminate the active session on "${deviceName}"? That device will be logged out immediately.`;

    if (!window.confirm(promptMsg)) {
      return;
    }
    setTerminatingSessionId(sessionId);
    try {
      const res = await api.terminateSession(sessionId);
      if (res?.success) {
        if (isCurrent || res?.isCurrentDevice) {
          setMsg({ type: "success", text: "Logged out from this device." });
          setTimeout(() => {
            if (onClose) onClose();
            window.location.reload();
          }, 350);
          return;
        }
        setMsg({ type: "success", text: `Session on "${deviceName}" terminated successfully.` });
        await loadSessionsAndActivity();
      } else {
        setMsg({ type: "error", text: res?.message || "Failed to terminate session." });
      }
    } catch (err) {
      setMsg({ type: "error", text: "Error terminating session: " + err.message });
    } finally {
      setTerminatingSessionId(null);
    }
  };

  const handleTerminateAllOther = async () => {
    if (!window.confirm("Are you sure you want to log out all other devices? You will remain logged in on this current device.")) {
      return;
    }
    setTerminatingAllOther(true);
    try {
      const res = await api.terminateOtherSessions();
      if (res?.success) {
        setMsg({ type: "success", text: "All other devices logged out successfully. This device remains active." });
        await loadSessionsAndActivity();
      } else {
        setMsg({ type: "error", text: res?.message || "Failed to terminate other devices." });
      }
    } catch (err) {
      setMsg({ type: "error", text: "Error: " + err.message });
    } finally {
      setTerminatingAllOther(false);
    }
  };

  const handleLogoutAllDevices = async () => {
    if (!window.confirm("Are you sure you want to log out from all devices? All other active sessions on other phones and computers will be revoked immediately.")) {
      return;
    }
    setLoggingOutAll(true);
    try {
      await api.logoutAllDevices();
      if (onClose) onClose();
      window.location.reload();
    } catch (err) {
      setMsg({ type: "error", text: "Failed to log out from all devices: " + (err.message || "Unknown error") });
      setLoggingOutAll(false);
    }
  };

  const totalNotesBytes = storedNotes.reduce((acc, n) => acc + (n.sizeBytes || 0), 0);
  const totalNotesMB = (totalNotesBytes / (1024 * 1024)).toFixed(2);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content profile-modal-content"
        style={{
          maxWidth: tab === "storage" ? "640px" : "540px",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "var(--radius-sm)",
                background: "#eef2ff",
                border: "1px solid #c7d2fe",
                color: "#3552c5",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <User size={20} />
            </div>
            <div>
              <div className="modal-title">My Account Settings</div>
              <div style={{ fontSize: "0.75rem", color: "#475569", fontWeight: 500 }}>
                {currentUser.email} • {currentUser.role?.toUpperCase()}
              </div>
            </div>
          </div>

          <button className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "18px", flexWrap: "wrap" }}>
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
          <button
            type="button"
            className={`filter-tab ${tab === "passkey" ? "active" : ""}`}
            onClick={() => { setTab("passkey"); setMsg(null); }}
          >
            <Key size={14} style={{ marginRight: "4px" }} />
            Passkey & Biometrics
          </button>
          <button
            type="button"
            className={`filter-tab ${tab === "storage" ? "active" : ""}`}
            onClick={() => { setTab("storage"); setMsg(null); }}
          >
            <Database size={14} style={{ marginRight: "4px" }} />
            Offline Storage Vault
          </button>
        </div>

        {msg && (
          <div
            style={{
              background: msg.type === "error" ? "#fff1f2" : "#ecfdf5",
              border: msg.type === "error" ? "1px solid #fda4af" : "1px solid #6ee7b7",
              color: msg.type === "error" ? "#be123c" : "#047857",
              padding: "10px 14px",
              borderRadius: "var(--radius-md)",
              marginBottom: "16px",
              fontSize: "0.85rem",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            {msg.type === "error" ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
            <span>{msg.text}</span>
          </div>
        )}

        {tab === "profile" && (
          <>
            {/* 🛡️ Adaptive Hardware Guard Card */}
            <div
              style={{
                background: "linear-gradient(135deg, #f0f9ff, #eef2ff)",
                border: "1px solid #bae6fd",
                borderRadius: "10px",
                padding: "12px 14px",
                marginBottom: "16px",
                display: "flex",
                flexDirection: "column",
                gap: "6px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "6px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700, fontSize: "0.84rem", color: "#0f172a" }}>
                  <Shield size={16} style={{ color: "#0284c7" }} />
                  <span>Adaptive Hardware Guard:</span>
                  <span style={{ fontSize: "0.7rem", color: "#047857", background: "#d1fae5", border: "1px solid #a7f3d0", padding: "1px 6px", borderRadius: "4px", fontWeight: 800 }}>ACTIVE</span>
                </div>
                <span style={{ fontSize: "0.72rem", color: "#0369a1", fontWeight: 700 }}>
                  ⚡ Mode: {hwProfile.tier === "workstation" || hwProfile.tier === "high" ? "High-Performance Engine" : "Safe Dynamic Mode"}
                </span>
              </div>
              <div style={{ fontSize: "0.76rem", color: "#475569", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                <span>📱 Hardware: <strong style={{ color: "#0f172a" }}>{hwProfile.cores} Cores • {hwProfile.memoryGB} GB RAM</strong></span>
                <span style={{ color: "#047857", fontWeight: 600 }}>(Auto-Clamping Enabled)</span>
              </div>
            </div>

            {/* Profile Details Form */}
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

            {/* Mobile Number Change Security Re-Verification Box */}
            {isMobileChanged && (
              <div
                style={{
                  background: "#eef2ff",
                  border: "1px solid #c7d2fe",
                  borderRadius: "10px",
                  padding: "14px",
                  marginBottom: "16px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", flexWrap: "wrap", gap: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <Shield size={16} style={{ color: "#0f766e" }} />
                    <span style={{ fontWeight: 700, color: "#0f766e", fontSize: "0.82rem" }}>
                      Security Verification Required
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleSendMobileOtp}
                    disabled={sendingOtp}
                    className="btn-secondary"
                    style={{ fontSize: "0.74rem", padding: "5px 12px", borderRadius: "6px" }}
                  >
                    {sendingOtp ? "Sending..." : otpSent ? "Resend OTP" : "Send OTP to Email"}
                  </button>
                </div>
                <p style={{ fontSize: "0.74rem", color: "#334155", margin: "0 0 10px 0", lineHeight: "1.4" }}>
                  To prevent unauthorized number hijacking, a 6-digit authorization code must be sent to your registered email (<strong style={{ color: "#0f172a" }}>{currentUser.email}</strong>).
                </p>
                <input
                  type="text"
                  className="form-input"
                  value={mobileOtp}
                  onChange={(e) => setMobileOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="Enter 6-Digit Email Verification Code"
                  maxLength={6}
                  style={{ letterSpacing: "3px", fontWeight: 700, textAlign: "center", fontSize: "0.95rem" }}
                  required={isMobileChanged}
                />
              </div>
            )}

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
              <label className="form-label">Registered Email</label>
              <input
                type="email"
                className="form-input"
                value={currentUser.email}
                readOnly
                style={{ background: "#f1f5f9", color: "#334155", cursor: "default" }}
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
          </>
        )}

        {tab === "password" && (
          <>
          {/* Change Password Form */}
          <form onSubmit={handleChangePassword}>
            <div className="form-group">
              <label className="form-label">Current Password *</label>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <input
                  type={showCurrentPassword ? "text" : "password"}
                  className="form-input"
                  style={{ width: "100%", paddingRight: "42px" }}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter your current password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  title={showCurrentPassword ? "Hide password" : "Show password"}
                  style={{
                    position: "absolute",
                    right: "12px",
                    background: "none",
                    border: "none",
                    padding: "4px",
                    color: showCurrentPassword ? "#4361ee" : "#475569",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  tabIndex={-1}
                >
                  {showCurrentPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">New Password * (Min 6 chars)</label>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <input
                  type={showNewPassword ? "text" : "password"}
                  className="form-input"
                  style={{ width: "100%", paddingRight: "42px" }}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  title={showNewPassword ? "Hide password" : "Show password"}
                  style={{
                    position: "absolute",
                    right: "12px",
                    background: "none",
                    border: "none",
                    padding: "4px",
                    color: showNewPassword ? "#4361ee" : "#475569",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  tabIndex={-1}
                >
                  {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Confirm New Password *</label>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  className="form-input"
                  style={{ width: "100%", paddingRight: "42px" }}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-type new password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  title={showConfirmPassword ? "Hide password" : "Show password"}
                  style={{
                    position: "absolute",
                    right: "12px",
                    background: "none",
                    border: "none",
                    padding: "4px",
                    color: showConfirmPassword ? "#4361ee" : "#475569",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  tabIndex={-1}
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
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

          {/* 🛡️ Multi-Device Active Session Management & Telemetry */}
          <div
            style={{
              marginTop: "20px",
              paddingTop: "16px",
              borderTop: "1px solid #e2e8f0",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <ShieldAlert size={16} color="#0284c7" />
                <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#0f172a" }}>
                  Active Devices &amp; Remote Session Control
                </span>
              </div>
              <button
                type="button"
                onClick={loadSessionsAndActivity}
                disabled={sessionsLoading}
                style={{
                  background: "#f0f9ff",
                  border: "1px solid #bae6fd",
                  borderRadius: "6px",
                  padding: "4px 9px",
                  color: "#0369a1",
                  fontSize: "0.74rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <RefreshCw size={12} className={sessionsLoading ? "spin" : ""} />
                <span>Refresh</span>
              </button>
            </div>
            <p style={{ fontSize: "0.75rem", color: "#475569", margin: "0 0 12px", lineHeight: "1.4" }}>
              Manage all phones, tablets, and computers currently logged into your account. You can terminate any individual session or revoke all devices remotely.
            </p>

            {/* List of Active Devices */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "14px" }}>
              {sessionsLoading && activeSessions.length === 0 ? (
                <div style={{ padding: "12px", textAlign: "center", fontSize: "0.78rem", color: "#475569" }}>
                  Loading active devices...
                </div>
              ) : activeSessions.length === 0 ? (
                <div style={{ padding: "12px", borderRadius: "8px", background: "#f8fafc", border: "1px solid #e2e8f0", fontSize: "0.78rem", color: "#475569", display: "flex", alignItems: "center", gap: "8px" }}>
                  <Smartphone size={16} color="#0284c7" />
                  <span>Current Device (Active session verified)</span>
                </div>
              ) : (
                activeSessions.map((sess) => {
                  const isCurrent = sess.isCurrentDevice;
                  const isTerminating = terminatingSessionId === sess.sessionId;
                  const diff = Date.now() - Number(sess.lastActiveAt);
                  const mins = Math.floor(diff / 60000);
                  const timeLabel = mins < 2 ? "Active now" : (mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ago`);

                  return (
                    <div
                      key={sess.sessionId}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 12px",
                        borderRadius: "8px",
                        background: isCurrent ? "#f0f9ff" : "#f8fafc",
                        border: isCurrent ? "1px solid #bae6fd" : "1px solid #e2e8f0",
                        gap: "10px",
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: "180px" }}>
                        <div
                          style={{
                            width: "32px",
                            height: "32px",
                            borderRadius: "6px",
                            background: isCurrent ? "#e0f2fe" : "#e2e8f0",
                            color: isCurrent ? "#0369a1" : "#475569",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          {sess.deviceType === "mobile" ? <Smartphone size={16} /> : <Laptop size={16} />}
                        </div>
                        <div>
                          <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#0f172a", display: "flex", alignItems: "center", gap: "6px" }}>
                            <span>{sess.deviceName}</span>
                            {isCurrent && (
                              <span style={{ fontSize: "0.68rem", padding: "1px 6px", borderRadius: "999px", background: "#d1fae5", color: "#047857", border: "1px solid #a7f3d0", fontWeight: 700 }}>
                                This Device
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: "0.72rem", color: "#475569", marginTop: "2px" }}>
                            <span>{sess.location || "India"}</span>
                            <span style={{ margin: "0 5px" }}>•</span>
                            <span style={{ color: isCurrent ? "#047857" : "#475569", fontWeight: isCurrent ? 600 : 400 }}>{timeLabel}</span>
                          </div>
                        </div>
                      </div>

                      {/* Action Button: Current Device Logout OR Remote Terminate */}
                      {isCurrent ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <button
                            type="button"
                            disabled={isTerminating}
                            onClick={() => handleTerminateSingle(sess.sessionId, sess.deviceName, true)}
                            style={{
                              padding: "5px 10px",
                              fontSize: "0.74rem",
                              borderRadius: "6px",
                              background: "#fff1f2",
                              border: "1px solid #fda4af",
                              color: "#be123c",
                              cursor: isTerminating ? "not-allowed" : "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              fontWeight: 600,
                              transition: "all 0.15s ease",
                            }}
                            title="Log out and close this current device session"
                          >
                            <LogOut size={12} className={isTerminating ? "spin" : ""} />
                            <span>{isTerminating ? "Logging out..." : "Log Out This Device"}</span>
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={isTerminating}
                          onClick={() => handleTerminateSingle(sess.sessionId, sess.deviceName, false)}
                          style={{
                            padding: "5px 10px",
                            fontSize: "0.74rem",
                            borderRadius: "6px",
                            background: "#fef2f2",
                            border: "1px solid #fca5a5",
                            color: "#b91c1c",
                            cursor: isTerminating ? "not-allowed" : "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            fontWeight: 600,
                            transition: "all 0.15s ease",
                          }}
                          title={`Terminate remote session on ${sess.deviceName}`}
                        >
                          <Trash2 size={12} className={isTerminating ? "spin" : ""} />
                          <span>{isTerminating ? "Terminating..." : "Terminate"}</span>
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Remote Session Control Buttons */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "14px" }}>
              <button
                type="button"
                disabled={terminatingAllOther || activeSessions.length <= 1}
                onClick={handleTerminateAllOther}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  padding: "9px 12px",
                  borderRadius: "8px",
                  background: "#fffbeb",
                  border: "1px solid #fcd34d",
                  color: "#b45309",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  cursor: (terminatingAllOther || activeSessions.length <= 1) ? "not-allowed" : "pointer",
                  opacity: activeSessions.length <= 1 ? 0.55 : 1,
                  transition: "all 0.2s ease",
                }}
                title="Log out all other devices while keeping this device active"
              >
                <LogOut size={14} />
                <span>{terminatingAllOther ? "Terminating..." : "Logout Other Devices"}</span>
              </button>

              <button
                type="button"
                disabled={loggingOutAll}
                onClick={handleLogoutAllDevices}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  padding: "9px 12px",
                  borderRadius: "8px",
                  background: "#fff1f2",
                  border: "1px solid #fda4af",
                  color: "#be123c",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  cursor: loggingOutAll ? "not-allowed" : "pointer",
                  transition: "all 0.2s ease",
                }}
                title="Log out everywhere across all phones and computers"
              >
                <ShieldAlert size={14} />
                <span>{loggingOutAll ? "Revoking..." : "Logout All Devices"}</span>
              </button>
            </div>

            {/* Last 10 Security & Login Activity Updates */}
            <div
              style={{
                borderRadius: "8px",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                padding: "10px 12px",
              }}
            >
              <div
                onClick={() => setShowSecurityHistory(!showSecurityHistory)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.78rem", fontWeight: 700, color: "#0f172a" }}>
                  <Activity size={14} color="#6d28d9" />
                  <span>Recent Security Activity (Last 15 Events)</span>
                </div>
                <span style={{ fontSize: "0.75rem", color: "#475569", fontWeight: 600 }}>
                  {showSecurityHistory ? "▲ Hide" : "▼ Show"}
                </span>
              </div>

              {showSecurityHistory && (
                <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "6px" }}>
                  {securityLogsLoading ? (
                    <div style={{ padding: "8px", textAlign: "center", fontSize: "0.74rem", color: "#475569" }}>
                      Loading recent activity...
                    </div>
                  ) : securityLogs.length === 0 ? (
                    <div style={{ padding: "8px", textAlign: "center", fontSize: "0.74rem", color: "#475569" }}>
                      No recent security activity recorded yet.
                    </div>
                  ) : (
                    securityLogs.slice(0, 15).map((log) => {
                      const diff = Date.now() - Number(log.createdAt);
                      const mins = Math.floor(diff / 60000);
                      const timeStr = mins < 2 ? "Just now" : (mins < 60 ? `${mins}m ago` : (mins < 1440 ? `${Math.floor(mins / 60)}h ago` : `${Math.floor(mins / 1440)}d ago`));

                      let badgeColor = "#0369a1";
                      let badgeBg = "#e0f2fe";
                      if (log.action.includes("TERMINATE") || log.action.includes("REVOKE")) {
                        badgeColor = "#b91c1c";
                        badgeBg = "#fee2e2";
                      } else if (log.action === "LOGIN") {
                        badgeColor = "#047857";
                        badgeBg = "#d1fae5";
                      } else if (log.action.includes("PASSWORD")) {
                        badgeColor = "#b45309";
                        badgeBg = "#fef3c7";
                      }

                      return (
                        <div
                          key={log.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "6px 8px",
                            borderRadius: "6px",
                            background: "#ffffff",
                            border: "1px solid #e2e8f0",
                            fontSize: "0.72rem",
                            gap: "8px",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0 }}>
                            <span style={{ padding: "2px 6px", borderRadius: "4px", background: badgeBg, color: badgeColor, fontWeight: 700, fontSize: "0.68rem", flexShrink: 0 }}>
                              {log.action}
                            </span>
                            <span style={{ color: "#334155", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                              {log.details || log.deviceName}
                            </span>
                          </div>
                          <span style={{ color: "#64748b", flexShrink: 0, fontSize: "0.68rem", fontWeight: 500 }}>
                            {timeStr}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>
          </>
        )}

        {tab === "passkey" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ textAlign: "center", padding: "12px 10px 8px" }}>
              <div
                style={{
                  width: "52px",
                  height: "52px",
                  borderRadius: "16px",
                  background: "linear-gradient(135deg, #e0f2fe, #eef2ff)",
                  border: "1px solid #bae6fd",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 10px",
                  color: "#0284c7",
                }}
              >
                <Key size={26} />
              </div>
              <h3 style={{ margin: "0 0 6px", fontSize: "1.1rem", fontWeight: 800, color: "#0f172a" }}>
                Passkey & Biometric Sign-In
              </h3>
              <p style={{ margin: 0, fontSize: "0.82rem", color: "#475569", lineHeight: 1.5 }}>
                Sign in to your account in 0ms using your device's built-in <strong style={{ color: "#0f172a" }}>Face ID</strong>, <strong style={{ color: "#0f172a" }}>Fingerprint</strong>, or <strong style={{ color: "#0f172a" }}>Windows Hello PIN</strong>.
              </p>
            </div>

            {/* Register Passkey Button */}
            <button
              type="button"
              onClick={handleRegisterPasskey}
              disabled={registeringPasskey}
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: "12px",
                background: "linear-gradient(135deg, #0284c7, #3b82f6)",
                border: "none",
                color: "#fff",
                fontWeight: 700,
                fontSize: "0.88rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                cursor: "pointer",
                boxShadow: "0 8px 20px -10px rgba(2, 132, 199, 0.5)",
              }}
            >
              <Key size={18} />
              <span>{registeringPasskey ? "Registering Biometric Device..." : "+ Register This Device as Passkey"}</span>
            </button>

            {/* Passkeys List */}
            <div>
              <div style={{ fontSize: "0.76rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>
                Registered Passkeys ({passkeys.length})
              </div>

              {loadingPasskeys ? (
                <div style={{ textAlign: "center", padding: "20px", color: "#475569", fontSize: "0.82rem" }}>
                  Loading passkeys from Firebase...
                </div>
              ) : passkeys.length === 0 ? (
                <div
                  style={{
                    background: "#f8fafc",
                    border: "1px dashed #cbd5e1",
                    borderRadius: "12px",
                    padding: "16px",
                    textAlign: "center",
                    color: "#475569",
                    fontSize: "0.82rem",
                  }}
                >
                  No passkeys registered on this account yet. Click above to add your device!
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {passkeys.map((p) => (
                    <div
                      key={p.id}
                      style={{
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: "12px",
                        padding: "12px 14px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div
                          style={{
                            width: "36px",
                            height: "36px",
                            borderRadius: "10px",
                            background: "#e0f2fe",
                            color: "#0284c7",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Shield size={18} />
                        </div>
                        <div>
                          <div style={{ fontSize: "0.86rem", fontWeight: 700, color: "#0f172a" }}>
                            {p.deviceName}
                          </div>
                          <div style={{ fontSize: "0.72rem", color: "#475569" }}>
                            Added: {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : "Active"} • Secure in Firebase
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeletePasskey(p.id)}
                        disabled={deletingPasskeyId === p.id}
                        style={{
                          background: "#fff1f2",
                          border: "1px solid #fecdd3",
                          borderRadius: "8px",
                          padding: "6px",
                          color: "#be123c",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                        title="Remove Passkey"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                background: "#ecfdf5",
                border: "1px solid #a7f3d0",
                borderRadius: "10px",
                padding: "10px 14px",
                fontSize: "0.75rem",
                color: "#065f46",
                lineHeight: 1.4,
              }}
            >
              <CheckCircle2 size={16} style={{ flexShrink: 0, color: "#059669" }} />
              <span>
                <strong>100% Phishing Resistant:</strong> Passkey private keys never leave your device sensor. Protected by Firebase Cloud Storage.
              </span>
            </div>
          </div>
        )}

        {/* Tab 4: Offline Storage Vault & Device Space Management */}
        {tab === "storage" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div
              style={{
                background: "#f0f9ff",
                border: "1px solid #bae6fd",
                borderRadius: "12px",
                padding: "16px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <HardDrive size={18} style={{ color: "#0284c7" }} />
                  <div>
                    <span style={{ fontWeight: 700, fontSize: "0.92rem", color: "#0f172a" }}>
                      Device Hardware Storage Meter
                    </span>
                    {lastRefreshedAt && (
                      <div style={{ fontSize: "0.68rem", color: refreshSuccess ? "#047857" : "#475569", display: "flex", alignItems: "center", gap: "4px", fontWeight: 600 }}>
                        {refreshSuccess ? <CheckCircle2 size={11} /> : <Clock size={11} />}
                        <span>{refreshSuccess ? `Audited successfully at ${lastRefreshedAt}` : `Last checked: ${lastRefreshedAt}`}</span>
                      </div>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleRefreshAllStorage}
                  disabled={refreshingStorage}
                  style={{
                    background: refreshingStorage ? "#e0f2fe" : refreshSuccess ? "#d1fae5" : "#ffffff",
                    border: `1px solid ${refreshingStorage ? "#7dd3fc" : refreshSuccess ? "#6ee7b7" : "#cbd5e1"}`,
                    borderRadius: "6px",
                    color: refreshingStorage ? "#0369a1" : refreshSuccess ? "#047857" : "#334155",
                    padding: "5px 12px",
                    fontSize: "0.72rem",
                    cursor: refreshingStorage ? "not-allowed" : "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    fontWeight: 600,
                    transition: "all 0.2s ease",
                  }}
                  title="Scan hardware storage meter, IndexedDB chunks, and stored notes"
                >
                  <RefreshCw
                    size={12}
                    className={refreshingStorage ? "spin" : ""}
                    style={{ animation: refreshingStorage ? "spin 0.8s linear infinite" : "none" }}
                  />
                  <span>{refreshingStorage ? "Auditing Vault..." : refreshSuccess ? "Storage Synced!" : "Refresh Meter"}</span>
                </button>
              </div>

              {/* Primary Metric: Stored Offline Notes Vault */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.82rem", marginBottom: "6px", flexWrap: "wrap", gap: "6px" }}>
                <span style={{ color: "#334155", fontWeight: 600 }}>📚 Stored Offline Notes Vault:</span>
                <span style={{ fontWeight: 800, color: totalNotesBytes > 0 ? "#0369a1" : "#047857", background: totalNotesBytes > 0 ? "#e0f2fe" : "#d1fae5", border: `1px solid ${totalNotesBytes > 0 ? "#7dd3fc" : "#6ee7b7"}`, padding: "2px 8px", borderRadius: "6px" }}>
                  {totalNotesMB} MB ({storedNotes.length} {storedNotes.length === 1 ? "Note" : "Notes"} Cached)
                </span>
              </div>

              {/* Secondary Metric: Total Browser Origin Quota */}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.74rem", color: "#475569", marginBottom: "4px" }}>
                <span>Browser PWA Engine, WASM &amp; Font Cache:</span>
                <span style={{ color: "#0f172a", fontWeight: 700 }}>
                  {storageInfo ? `${storageInfo.usageMB} MB` : "Calculating..."}
                </span>
              </div>
              <div style={{ fontSize: "0.68rem", color: "#475569", marginBottom: "8px", lineHeight: "1.4" }}>
                ℹ️ Required by Chrome for 0ms offline launch &amp; PDF reader canvas. Your saved offline study notes use {totalNotesMB} MB.
              </div>

              {/* Progress Bar */}
              <div style={{ height: "6px", background: "#dbeafe", borderRadius: "4px", overflow: "hidden", marginBottom: "8px" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${Math.min(100, Math.max(1, Number(storageInfo?.percentUsed || 0)))}%`,
                    background: "linear-gradient(90deg, #0284c7, #4361ee)",
                    borderRadius: "4px",
                  }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "#475569", fontWeight: 500 }}>
                <span>Available Browser Quota: {storageInfo ? `${(Number(storageInfo.quotaMB) / 1024).toFixed(1)} GB` : "Unlimited"}</span>
                <span>{storageInfo ? `${storageInfo.percentUsed}% Utilized` : "0.00% Utilized"}</span>
              </div>
            </div>

            {/* Stored Offline Notes Section */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "4px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.84rem", display: "flex", alignItems: "center", gap: "6px" }}>
                  <FileText size={15} style={{ color: "#0284c7" }} />
                  <span>Stored Offline Notes Vault ({storedNotes.length})</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      window.dispatchEvent(
                        new CustomEvent("open_campus_airdrop", {
                          detail: { initialMode: "qr" },
                        })
                      );
                    }}
                    style={{
                      background: "linear-gradient(135deg, #0284c7, #2563eb)",
                      border: "none",
                      borderRadius: "6px",
                      color: "#ffffff",
                      padding: "4px 10px",
                      cursor: "pointer",
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                      boxShadow: "0 2px 8px rgba(37, 99, 235, 0.25)",
                    }}
                    title="Open Hostel AirDrop to transfer or receive offline notes without internet"
                  >
                    <Zap size={12} />
                    <span>Hostel AirDrop</span>
                  </button>
                  <button
                    type="button"
                    onClick={loadStoredNotes}
                    disabled={loadingStoredNotes}
                    style={{
                      background: "#ffffff",
                      border: "1px solid #cbd5e1",
                      borderRadius: "6px",
                      color: "#334155",
                      padding: "4px 9px",
                      cursor: "pointer",
                      fontSize: "0.7rem",
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <RefreshCw size={11} className={loadingStoredNotes ? "spin" : ""} />
                    Refresh
                  </button>
                </div>
              </div>

              {/* Dynamic Device LRU & 48h Auto-Delete Banner */}
              <div
                style={{
                  background: "#f0f9ff",
                  border: "1px solid #bae6fd",
                  borderRadius: "8px",
                  padding: "8px 12px",
                  fontSize: "0.72rem",
                  color: "#0369a1",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "6px",
                  lineHeight: 1.4,
                }}
              >
                <span>⚡ <strong>Device Dynamic LRU:</strong> {dynamicLRUCapacity} Notes Cached Max (Min: 2 Guaranteed)</span>
                <span>🕒 <strong>48h Auto-Eviction:</strong> Active (Pinned notes are never deleted)</span>
              </div>

              {loadingStoredNotes ? (
                <div style={{ padding: "14px", textAlign: "center", color: "#475569", fontSize: "0.76rem" }}>
                  Scanning device IndexedDB for cached notes...
                </div>
              ) : storedNotes.length === 0 ? (
                <div
                  style={{
                    background: "#f8fafc",
                    border: "1px dashed #cbd5e1",
                    borderRadius: "10px",
                    padding: "16px",
                    textAlign: "center",
                    color: "#475569",
                    fontSize: "0.76rem",
                    lineHeight: 1.5,
                  }}
                >
                  <div style={{ fontSize: "1.2rem", marginBottom: "4px" }}>📭</div>
                  <div style={{ color: "#0f172a", fontWeight: 700, marginBottom: "2px" }}>No Offline Notes Stored</div>
                  <div>Open any note in the Virtual PDF Reader or click "Save Offline" on any card to read 100% without internet.</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {storedNotes.map((n) => {
                    const isPinned = pinnedIds.includes(String(n.id));
                    const ageHours = n.savedAt ? Math.floor((Date.now() - new Date(n.savedAt).getTime()) / (3600 * 1000)) : 0;
                    const remainingHours = Math.max(1, 48 - ageHours);

                    return (
                      <div
                        key={n.id}
                        style={{
                          background: isPinned ? "#ecfdf5" : "#f8fafc",
                          border: `1px solid ${isPinned ? "#a7f3d0" : "#e2e8f0"}`,
                          borderRadius: "8px",
                          padding: "10px 12px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: "10px",
                        }}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.8rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {n.title}
                          </div>
                          <div style={{ fontSize: "0.7rem", color: "#475569", display: "flex", gap: "8px", marginTop: "3px", flexWrap: "wrap", alignItems: "center" }}>
                            <span>📚 {n.subject}</span>
                            {n.branch && <span>• {n.branch}</span>}
                            {isPinned ? (
                              <span style={{ color: "#047857", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "3px", background: "#d1fae5", border: "1px solid #6ee7b7", padding: "1px 6px", borderRadius: "4px" }}>
                                <Pin size={10} /> Kept Forever
                              </span>
                            ) : (
                              <span style={{ color: "#b45309", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "3px", background: "#fef3c7", border: "1px solid #fcd34d", padding: "1px 6px", borderRadius: "4px" }}>
                                <Clock size={10} /> Auto-expires in {remainingHours}h
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                          <span style={{ fontSize: "0.7rem", color: "#0369a1", background: "#e0f2fe", border: "1px solid #bae6fd", padding: "2px 6px", borderRadius: "4px", fontWeight: 700 }}>
                            {n.sizeMB && Number(n.sizeMB) > 0 ? `${n.sizeMB} MB` : "Cached"}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              window.dispatchEvent(
                                new CustomEvent("open_campus_airdrop", {
                                  detail: { note: n, initialMode: "qr" },
                                })
                              );
                            }}
                            title="Hostel AirDrop: Beam this note directly to a classmate via 1-tap QR mesh without internet"
                            style={{
                              background: "#eff6ff",
                              border: "1px solid #93c5fd",
                              color: "#1d4ed8",
                              padding: "4px 8px",
                              borderRadius: "6px",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                              fontSize: "0.68rem",
                              fontWeight: 700,
                            }}
                          >
                            <Zap size={11} color="#2563eb" />
                            <span>AirDrop</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleTogglePin(n.id, n.title)}
                            title={isPinned ? "Click to set 48h auto-expire" : "Click to keep forever (exempt from 48h deletion and LRU)"}
                            style={{
                              background: isPinned ? "#d1fae5" : "#ffffff",
                              border: `1px solid ${isPinned ? "#6ee7b7" : "#cbd5e1"}`,
                              color: isPinned ? "#047857" : "#334155",
                              padding: "4px 8px",
                              borderRadius: "6px",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                              fontSize: "0.68rem",
                              fontWeight: 600,
                            }}
                          >
                            <Pin size={11} style={{ transform: isPinned ? "rotate(-45deg)" : "none" }} />
                            {isPinned ? "Pinned" : "Keep"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSingleNote(n.id, n.title)}
                            disabled={deletingNoteId === n.id}
                            title="Delete this note from device offline storage"
                            style={{
                              background: "#fff1f2",
                              border: "1px solid #fda4af",
                              color: "#be123c",
                              padding: "4px 8px",
                              borderRadius: "6px",
                              cursor: deletingNoteId === n.id ? "not-allowed" : "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                              fontSize: "0.68rem",
                              fontWeight: 600,
                            }}
                          >
                            <Trash2 size={11} />
                            {deletingNoteId === n.id ? "..." : "Delete"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 🤖 Stored Offline AI Study & Q&A Vault Section */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "6px" }}>
                <div style={{ fontWeight: 800, color: "#0f172a", fontSize: "0.88rem", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Sparkles size={16} style={{ color: "#6366f1" }} />
                  <span>Stored Offline AI Study &amp; Q&amp;A Vault ({storedCircleNotes.length})</span>
                </div>
                <button
                  type="button"
                  onClick={loadStoredCircleNotes}
                  disabled={loadingCircleNotes}
                  style={{
                    background: "#ffffff",
                    border: "1px solid #cbd5e1",
                    borderRadius: "6px",
                    color: "#334155",
                    padding: "4px 10px",
                    cursor: "pointer",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <RefreshCw size={11} className={loadingCircleNotes ? "spin" : ""} />
                  Refresh List
                </button>
              </div>

              {/* Quick AI Category Filter Pills */}
              {storedCircleNotes.length > 0 && (
                <div style={{ display: "flex", gap: "6px", overflowX: "auto", paddingBottom: "2px" }}>
                  {[
                    { id: "all", label: `All (${storedCircleNotes.length})` },
                    { id: "chat", label: `💬 AI Tutor (${storedCircleNotes.filter((c) => c.type === "chat").length})` },
                    { id: "circle", label: `⭕ Circle Solve (${storedCircleNotes.filter((c) => !c.type || c.type === "circle").length})` },
                    { id: "flashcard", label: `🗂️ Flashcards (${storedCircleNotes.filter((c) => c.type === "flashcard").length})` },
                    { id: "summary", label: `📌 Summaries (${storedCircleNotes.filter((c) => c.type === "summary").length})` },
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setAiFilter(f.id)}
                      style={{
                        padding: "3px 10px",
                        fontSize: "0.7rem",
                        fontWeight: 700,
                        borderRadius: "999px",
                        border: aiFilter === f.id ? "1px solid #6366f1" : "1px solid #e2e8f0",
                        background: aiFilter === f.id ? "#6366f1" : "#ffffff",
                        color: aiFilter === f.id ? "#ffffff" : "#475569",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              )}

              {/* 48h Default Auto-Expire / Pinned Retention Banner */}
              <div
                style={{
                  background: "linear-gradient(135deg, rgba(238, 242, 255, 0.9), rgba(240, 249, 255, 0.9))",
                  border: "1px solid #c7d2fe",
                  borderRadius: "10px",
                  padding: "9px 13px",
                  fontSize: "0.73rem",
                  color: "#3730a3",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "6px",
                  lineHeight: 1.45,
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <Sparkles size={14} style={{ color: "#6366f1" }} />
                  <span><strong>100% Offline AI Access:</strong> Study Tutor answers, Flashcards &amp; Circled solutions device par saved hain.</span>
                </span>
                <span style={{ fontSize: "0.69rem", color: "#4f46e5", fontWeight: 700 }}>
                  📌 Pinned notes never expire
                </span>
              </div>

              {loadingCircleNotes ? (
                <div style={{ padding: "16px", textAlign: "center", color: "#475569", fontSize: "0.78rem" }}>
                  Scanning device IndexedDB &amp; LocalStorage for offline AI solutions...
                </div>
              ) : storedCircleNotes.length === 0 ? (
                <div
                  style={{
                    background: "#f8fafc",
                    border: "1px dashed #cbd5e1",
                    borderRadius: "12px",
                    padding: "22px 16px",
                    textAlign: "center",
                    color: "#475569",
                    fontSize: "0.78rem",
                    lineHeight: 1.5,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "center", marginBottom: "8px" }}>
                    <div style={{ width: "44px", height: "44px", borderRadius: "14px", background: "linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(6, 182, 212, 0.15))", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Sparkles size={22} style={{ color: "#6366f1" }} />
                    </div>
                  </div>
                  <div style={{ color: "#0f172a", fontWeight: 800, fontSize: "0.9rem", marginBottom: "4px" }}>
                    No Offline AI Study Notes Saved Yet
                  </div>
                  <div style={{ maxWidth: "440px", margin: "0 auto", color: "#64748b", fontSize: "0.74rem" }}>
                    Jab aap <strong>AI Study Studio</strong> me sawal puchenge, <strong>Flashcards</strong> ya <strong>Summaries</strong> generate karenge, ya <strong>Circle to Search</strong> se formula solve karenge — wo sabhi yahan 100% offline access ke liye automatic save ho jayenge.
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {storedCircleNotes
                    .filter((cn) => {
                      if (aiFilter === "all") return true;
                      if (aiFilter === "circle") return !cn.type || cn.type === "circle";
                      return cn.type === aiFilter;
                    })
                    .map((cn) => {
                      const isPinned = Boolean(cn.isPinned);
                      const ageHours = cn.savedAt ? Math.floor((Date.now() - Number(cn.savedAt)) / (3600 * 1000)) : 0;
                      const remainingHours = Math.max(1, 48 - ageHours);

                      const itemType = cn.type || "circle";
                      const typeBadge =
                        itemType === "chat" ? (
                          <span style={{ fontSize: "0.68rem", fontWeight: 700, padding: "1px 7px", borderRadius: "999px", background: "#ede9fe", color: "#6d28d9", border: "1px solid #ddd6fe", display: "inline-flex", alignItems: "center", gap: "3px" }}>
                            <MessageSquare size={10} /> AI Tutor
                          </span>
                        ) : itemType === "flashcard" ? (
                          <span style={{ fontSize: "0.68rem", fontWeight: 700, padding: "1px 7px", borderRadius: "999px", background: "#e0f2fe", color: "#0369a1", border: "1px solid #bae6fd", display: "inline-flex", alignItems: "center", gap: "3px" }}>
                            <Layers size={10} /> Flashcards
                          </span>
                        ) : itemType === "summary" ? (
                          <span style={{ fontSize: "0.68rem", fontWeight: 700, padding: "1px 7px", borderRadius: "999px", background: "#d1fae5", color: "#047857", border: "1px solid #a7f3d0", display: "inline-flex", alignItems: "center", gap: "3px" }}>
                            <FileText size={10} /> Summary
                          </span>
                        ) : (
                          <span style={{ fontSize: "0.68rem", fontWeight: 700, padding: "1px 7px", borderRadius: "999px", background: "#e0f2fe", color: "#0284c7", border: "1px solid #bae6fd", display: "inline-flex", alignItems: "center", gap: "3px" }}>
                            <GeminiIcon size={11} withRing /> Circle Solve
                          </span>
                        );

                      return (
                        <div
                          key={cn.key}
                          style={{
                            background: isPinned ? "#fbfcfe" : "#f8fafc",
                            border: `1px solid ${isPinned ? "rgba(99, 102, 241, 0.35)" : "#e2e8f0"}`,
                            borderRadius: "10px",
                            padding: "11px 14px",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: "12px",
                            boxShadow: isPinned ? "0 2px 8px rgba(99, 102, 241, 0.08)" : "none",
                          }}
                        >
                          <div style={{ minWidth: 0, flex: 1, cursor: "pointer" }} onClick={() => setViewingCircleAnswer(cn)}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
                              {typeBadge}
                              <span style={{ fontWeight: 750, color: "#0f172a", fontSize: "0.82rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {cn.query ? (cn.query.length > 60 ? `${cn.query.slice(0, 60)}...` : cn.query) : "Offline AI Solution"}
                              </span>
                            </div>
                            <div style={{ fontSize: "0.7rem", color: "#475569", display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                              <span>📖 {cn.subject || "Study Notes"}</span>
                              {isPinned ? (
                                <span style={{ color: "#047857", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "3px", background: "#d1fae5", border: "1px solid #6ee7b7", padding: "1px 6px", borderRadius: "4px" }}>
                                  <Pin size={10} /> Kept Forever
                                </span>
                              ) : (
                                <span style={{ color: "#b45309", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "3px", background: "#fef3c7", border: "1px solid #fcd34d", padding: "1px 6px", borderRadius: "4px" }}>
                                  <Clock size={10} /> Auto-expires in {remainingHours}h
                                </span>
                              )}
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                            {cn.type === "flashcard" && (
                              <button
                                type="button"
                                onClick={() => {
                                  onClose();
                                  window.dispatchEvent(
                                    new CustomEvent("open_ai_study_pod", {
                                      detail: {
                                        note: { id: cn.noteId, title: cn.subject || "Study Notes" },
                                        tab: "flashcards",
                                      },
                                    })
                                  );
                                }}
                                title="Open in Study Tinder Swipe Mode"
                                style={{
                                  background: "linear-gradient(135deg, #8b5cf6, #6366f1)",
                                  border: "none",
                                  color: "#ffffff",
                                  padding: "5px 10px",
                                  borderRadius: "7px",
                                  cursor: "pointer",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  fontSize: "0.72rem",
                                  fontWeight: 700,
                                  boxShadow: "0 2px 6px rgba(139, 92, 246, 0.3)",
                                }}
                              >
                                <span>🃏 Tinder</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setViewingCircleAnswer(cn)}
                              title="View step-by-step AI solution"
                              style={{
                                background: "#ede9fe",
                                border: "1px solid #c4b5fd",
                                color: "#6d28d9",
                                padding: "5px 10px",
                                borderRadius: "7px",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                                fontSize: "0.72rem",
                                fontWeight: 700,
                              }}
                            >
                              <Eye size={12} />
                              View
                            </button>
                            <button
                              type="button"
                              onClick={() => handleTogglePinCircle(cn.key, cn.query)}
                              title={isPinned ? "Click to set 48h auto-expire" : "Click to keep forever (exempt from 48h deletion)"}
                              style={{
                                background: isPinned ? "#d1fae5" : "#ffffff",
                                border: `1px solid ${isPinned ? "#6ee7b7" : "#cbd5e1"}`,
                                color: isPinned ? "#047857" : "#334155",
                                padding: "5px 9px",
                                borderRadius: "7px",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                                fontSize: "0.72rem",
                                fontWeight: 700,
                              }}
                            >
                              <Pin size={12} style={{ transform: isPinned ? "rotate(-45deg)" : "none" }} />
                              {isPinned ? "Pinned" : "Keep"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSingleCircleNote(cn.key, cn.query)}
                              disabled={deletingCircleKey === cn.key}
                              title="Delete this solution from local storage"
                              style={{
                                background: "#fff1f2",
                                border: "1px solid #fda4af",
                                color: "#be123c",
                                padding: "5px 9px",
                                borderRadius: "7px",
                                cursor: deletingCircleKey === cn.key ? "not-allowed" : "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                                fontSize: "0.72rem",
                                fontWeight: 700,
                              }}
                            >
                              <Trash2 size={12} />
                              {deletingCircleKey === cn.key ? "..." : "Delete"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            {/* Clear Storage Action Button */}
            <div style={{ marginTop: "4px", display: "flex", flexDirection: "column", gap: "8px" }}>
              <button
                type="button"
                onClick={handleWipeStorage}
                disabled={clearingStorage}
                style={{
                  background: "#fff1f2",
                  border: "1px solid #fda4af",
                  color: "#be123c",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  fontWeight: 700,
                  fontSize: "0.82rem",
                  cursor: clearingStorage ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                }}
              >
                <Trash2 size={16} />
                {clearingStorage ? "Purging Device Storage..." : "Free Up Device Space (Clear All Cached Notes)"}
              </button>

              <div style={{ fontSize: "0.72rem", color: "#475569", lineHeight: 1.4 }}>
                💡 <em>Note: Clearing storage deletes local offline copies. You can always re-read or download them again when internet is available. Browsers also auto-prune oldest notes when device disk space is below 10%.</em>
              </div>
            </div>
          </div>
        )}

        {/* Circled AI Solution Viewer Popup */}
        {viewingCircleAnswer && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15, 23, 42, 0.55)",
              backdropFilter: "blur(5px)",
              zIndex: 10005,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "16px",
            }}
            onClick={() => setViewingCircleAnswer(null)}
          >
            <div
              style={{
                background: "#ffffff",
                border: "1px solid #cbd5e1",
                borderRadius: "14px",
                maxWidth: "540px",
                width: "100%",
                maxHeight: "85vh",
                display: "flex",
                flexDirection: "column",
                boxShadow: "0 24px 48px -12px rgba(15, 23, 42, 0.28)",
                overflow: "hidden",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "14px 18px",
                  borderBottom: "1px solid #e2e8f0",
                  background: "#f8fafc",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Sparkles size={18} style={{ color: "#0284c7" }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#0f172a" }}>
                      Circled AI Solution
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "#475569" }}>
                      {viewingCircleAnswer.subject || "Study Notes"} • {viewingCircleAnswer.provider ? `${String(viewingCircleAnswer.provider).toUpperCase()} AI` : "Cloud AI"}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setViewingCircleAnswer(null)}
                  style={{
                    background: "#ffffff",
                    border: "1px solid #e2e8f0",
                    borderRadius: "50%",
                    color: "#475569",
                    cursor: "pointer",
                    padding: "5px",
                    display: "flex",
                  }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Content Body */}
              <div style={{ padding: "16px 18px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "12px" }}>
                {/* Question Snippet */}
                <div
                  style={{
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    padding: "10px 12px",
                  }}
                >
                  <div style={{ fontSize: "0.7rem", color: "#475569", fontWeight: 700, marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    {viewingCircleAnswer.type === "chat"
                      ? "💬 AI Tutor Question:"
                      : viewingCircleAnswer.type === "flashcard"
                      ? "🗂️ Flashcards Topic:"
                      : viewingCircleAnswer.type === "summary"
                      ? "📌 Summary Topic:"
                      : "⭕ Circled Question / Topic:"}
                  </div>
                  <div style={{ fontSize: "0.84rem", color: "#0f172a", fontWeight: 700, lineHeight: 1.4 }}>
                    "{viewingCircleAnswer.query}"
                  </div>
                </div>

                {/* AI Answer */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <span style={{ fontSize: "0.74rem", color: "#4f46e5", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", display: "inline-flex", alignItems: "center", gap: "5px" }}>
                      <Sparkles size={13} style={{ color: "#6366f1" }} />
                      <span>
                        {viewingCircleAnswer.type === "chat"
                          ? "AI Tutor Explanation & Solution"
                          : viewingCircleAnswer.type === "flashcard"
                          ? "Flashcards Cards & Answers"
                          : viewingCircleAnswer.type === "summary"
                          ? "Executive Chapter Summary"
                          : "Step-by-Step AI Solution"}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (viewingCircleAnswer.answer) {
                          navigator.clipboard.writeText(viewingCircleAnswer.answer);
                          setCopiedCircleAnswer(true);
                          setTimeout(() => setCopiedCircleAnswer(false), 2000);
                        }
                      }}
                      style={{
                        background: copiedCircleAnswer ? "#d1fae5" : "#f8fafc",
                        border: `1px solid ${copiedCircleAnswer ? "#6ee7b7" : "#cbd5e1"}`,
                        borderRadius: "6px",
                        color: copiedCircleAnswer ? "#047857" : "#334155",
                        padding: "3px 8px",
                        fontSize: "0.68rem",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        fontWeight: 600,
                      }}
                    >
                      {copiedCircleAnswer ? <Check size={11} /> : <Copy size={11} />}
                      <span>{copiedCircleAnswer ? "Copied!" : "Copy"}</span>
                    </button>
                  </div>
                  <div
                    style={{
                      background: "radial-gradient(ellipse at top left, #121829 0%, #080c16 100%)",
                      border: "1px solid rgba(139, 92, 246, 0.35)",
                      borderRadius: "12px",
                      padding: "16px 18px",
                      fontSize: "0.86rem",
                      color: "#f8fafc",
                      lineHeight: 1.7,
                      maxHeight: "380px",
                      overflowY: "auto",
                      boxShadow: "inset 0 2px 10px rgba(0, 0, 0, 0.6)",
                    }}
                  >
                    <MathMarkdown content={viewingCircleAnswer.answer} />
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 18px",
                  borderTop: "1px solid #e2e8f0",
                  background: "#f8fafc",
                }}
              >
                <div style={{ fontSize: "0.7rem", color: viewingCircleAnswer.isPinned ? "#047857" : "#b45309", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
                  {viewingCircleAnswer.isPinned ? (
                    <>
                      <Pin size={11} />
                      <span>Pinned (Kept forever)</span>
                    </>
                  ) : (
                    <>
                      <Clock size={11} />
                      <span>Auto-expires after 48h from creation</span>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setViewingCircleAnswer(null)}
                  style={{
                    background: "#edf2ff",
                    border: "1px solid #c7d2fe",
                    color: "#3552c5",
                    borderRadius: "6px",
                    padding: "5px 14px",
                    fontSize: "0.76rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

