import React, { useState, useEffect } from "react";
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
import QueueStatusPill from "./components/QueueStatusPill";
import { api, getCurrentUser } from "./api";
import { BookOpen, ChevronDown, ChevronUp, Bell, Lock, ShieldCheck, Zap, Share2, Sparkles, FileText, CheckCircle, ArrowRight, Cpu, Server, Database } from "lucide-react";
import { startP2PBackgroundSeeder } from "./utils/p2pMesh";

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
  const [previewNote, setPreviewNote] = useState(null);

  // User & Notices
  const [currentUser, setCurrentUser] = useState(getCurrentUser());
  const [notices, setNotices] = useState([]);

  // Active Background Upload Job
  const [activeJob, setActiveJob] = useState(null);

  const openAuth = (tab = "signin") => {
    setAuthInitialTab(tab);
    setIsAuthOpen(true);
  };

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

  const fetchNotes = async () => {
    if (!currentUser) {
      setNotes([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await api.getNotes({
        branch: selectedBranch,
        course: selectedCourse,
        year: selectedYear,
        search: searchTerm,
      });
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
    await api.logout();
    setCurrentUser(null);
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

  // Rule: Display initial 15 notes, keep rest hidden until user clicks "Show All Notes"
  const displayedNotes = showAllNotes ? notes : notes.slice(0, 15);

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
        onOpenAuth={() => openAuth("signin")}
        onOpenProfile={() => setIsProfileOpen(true)}
        currentUser={currentUser}
        onLogout={handleLogout}
        noticeCount={notices.length}
      />

      <main className="app-container" style={{ flex: 1 }}>
        {/* Notice Board Ticker Bar (if notices exist) */}
        {notices.length > 0 && (
          <div
            style={{
              margin: "16px 0 -8px",
              background: "rgba(6, 182, 212, 0.08)",
              border: "1px solid rgba(6, 182, 212, 0.25)",
              borderRadius: "var(--radius-md)",
              padding: "10px 18px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              cursor: "pointer",
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
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px" }}>
                <div style={{ background: "var(--bg-glass-card)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                    <Zap size={22} style={{ color: "var(--accent-cyan)" }} />
                    <strong style={{ fontSize: "0.95rem", color: "#fff" }}>Ultra-Fast Academic Cloud Engine</strong>
                  </div>
                  <p style={{ fontSize: "0.82rem", color: "var(--text-dim)", lineHeight: 1.5, margin: 0 }}>
                    Unlimited direct cloud streaming through High-Performance Academic Storage Nodes and Indian Edge CDN for 1ms cached downloads.
                  </p>
                </div>

                <div style={{ background: "var(--bg-glass-card)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                    <Share2 size={22} style={{ color: "var(--accent-indigo)" }} />
                    <strong style={{ fontSize: "0.95rem", color: "#fff" }}>WebRTC P2P Mesh Network</strong>
                  </div>
                  <p style={{ fontSize: "0.82rem", color: "var(--text-dim)", lineHeight: 1.5, margin: 0 }}>
                    Direct 100 MB/s peer-to-peer file transfer between students on the same hostel or campus Wi-Fi without server bandwidth limits.
                  </p>
                </div>

                <div style={{ background: "var(--bg-glass-card)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                    <FileText size={22} style={{ color: "#34d399" }} />
                    <strong style={{ fontSize: "0.95rem", color: "#fff" }}>Mozilla PDF.js Virtual Reader</strong>
                  </div>
                  <p style={{ fontSize: "0.82rem", color: "var(--text-dim)", lineHeight: 1.5, margin: 0 }}>
                    Read handwritten notes and textbooks instantly in your browser with Night Mode, page jump, and zero download waiting time.
                  </p>
                </div>

                <div style={{ background: "var(--bg-glass-card)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                    <ShieldCheck size={22} style={{ color: "#fbbf24" }} />
                    <strong style={{ fontSize: "0.95rem", color: "#fff" }}>Tesseract OCR Deep Search</strong>
                  </div>
                  <p style={{ fontSize: "0.82rem", color: "var(--text-dim)", lineHeight: 1.5, margin: 0 }}>
                    Universal search matches typed titles as well as handwritten formulas scanned directly inside students' handwritten PDF pages.
                  </p>
                </div>

                <div style={{ background: "var(--bg-glass-card)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                    <Cpu size={22} style={{ color: "#a855f7" }} />
                    <strong style={{ fontSize: "0.95rem", color: "#fff" }}>In-Memory LRU RAM &amp; Brotli Booster</strong>
                  </div>
                  <p style={{ fontSize: "0.82rem", color: "var(--text-dim)", lineHeight: 1.5, margin: 0 }}>
                    Dedicated 500 MB in-memory RAM cache pool delivering microsecond document streaming with dual Brotli &amp; Gzip compression for 25% extra bandwidth savings.
                  </p>
                </div>

                <div style={{ background: "var(--bg-glass-card)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                    <Database size={22} style={{ color: "#38bdf8" }} />
                    <strong style={{ fontSize: "0.95rem", color: "#fff" }}>Distributed Multi-Worker Vault &amp; Zero-Loss Archiving</strong>
                  </div>
                  <p style={{ fontSize: "0.82rem", color: "var(--text-dim)", lineHeight: 1.5, margin: 0 }}>
                    High-speed parallel multi-worker streaming engine with automated snapshot recovery, ensuring accident-proof note preservation and zero-loss cloud archiving.
                  </p>
                </div>

                <div style={{ background: "var(--bg-glass-card)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                    <ShieldCheck size={22} style={{ color: "#10b981" }} />
                    <strong style={{ fontSize: "0.95rem", color: "#fff" }}>Brevo SMTP &amp; Zero-Threat Security Shield</strong>
                  </div>
                  <p style={{ fontSize: "0.82rem", color: "var(--text-dim)", lineHeight: 1.5, margin: 0 }}>
                    Cryptographic 6-digit email OTP verification, 10-round bcrypt salted encryption, and multi-tiered DDoS protection for 100% student data safety.
                  </p>
                </div>

                <div style={{ background: "var(--bg-glass-card)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                    <Zap size={22} style={{ color: "#f59e0b" }} />
                    <strong style={{ fontSize: "0.95rem", color: "#fff" }}>Real-Time Bot Poller &amp; Fast Ingest</strong>
                  </div>
                  <p style={{ fontSize: "0.82rem", color: "var(--text-dim)", lineHeight: 1.5, margin: 0 }}>
                    Snappy 5s Telegram long-polling &amp; SHA-256 deduplication for instant study material publishing.
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

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
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
                              {(note.compressedSize ? note.compressedSize / (1024 * 1024) : (note.fileSize / (1024 * 1024))).toFixed(1)} MB
                              {note.savingsPercent > 0 && <span style={{ color: "#34d399", fontSize: "0.72rem", marginLeft: "6px" }}>(-{note.savingsPercent}%)</span>}
                            </td>
                            <td style={{ padding: "12px 16px", color: "var(--text-dim)" }}>
                              {note.downloadsCount || 0}
                            </td>
                            <td style={{ padding: "12px 16px", textAlign: "right" }}>
                              <div style={{ display: "inline-flex", gap: "6px" }}>
                                <button
                                  onClick={() => {
                                    if (!currentUser) {
                                      setAuthMode("signin");
                                      setIsAuthOpen(true);
                                      return;
                                    }
                                    if (note.driveLink && !note.telegramMessageId) {
                                      window.open(note.driveLink, "_blank");
                                      return;
                                    }
                                    window.open(api.getDownloadUrl(note.id), "_blank");
                                  }}
                                  className="btn-card-download"
                                  style={{ padding: "6px 12px", fontSize: "0.78rem" }}
                                >
                                  ⚡ Download
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
        <div style={{ maxWidth: "1380px", margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
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
          setCurrentUser(user);
          fetchNotes();
        }}
        notes={notes}
        onRefreshNotes={fetchNotes}
        branches={branches}
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
          setCurrentUser(user);
          fetchNotes();
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

      <QueueStatusPill
        activeJob={activeJob}
        onCompleted={handleQueueCompleted}
        onDismiss={() => setActiveJob(null)}
      />
    </div>
  );
}
