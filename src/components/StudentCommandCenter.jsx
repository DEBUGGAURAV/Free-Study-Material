import { useState, useEffect, useMemo } from "react";
import {
  Flame,
  Zap,
  BookOpen,
  ArrowRight,
  Sparkles,
  Bot,
  RotateCw,
  Search,
  CheckCircle2,
  TrendingUp,
  Award,
  Layers,
  ChevronRight,
  Compass,
} from "lucide-react";
import { playPop, playSuccess } from "../utils/soundEffects";

export default function StudentCommandCenter({
  currentUser,
  notes = [],
  onOpenSwipeToRevise,
  onOpenAirDrop,
  onOpenPreview,
  onOpenAiStudyPod,
  onOpenUpload,
  onBrowseMaterials,
}) {
  const [streakCount, setStreakCount] = useState(19);
  const [xpPoints, setXpPoints] = useState(1450);
  const [aiPromptText, setAiPromptText] = useState("");
  const [activeHostelPeers, setActiveHostelPeers] = useState(6);

  // Sync with localStorage
  useEffect(() => {
    try {
      const savedStreak = localStorage.getItem("fsm_swipe_streak");
      const savedXp = localStorage.getItem("fsm_swipe_xp");
      if (savedStreak) setStreakCount(parseInt(savedStreak, 10));
      if (savedXp) setXpPoints(parseInt(savedXp, 10));
    } catch (_) {}
  }, []);

  // Compute student level from XP
  const studentLevel = useMemo(() => {
    return Math.max(1, Math.floor(xpPoints / 180) + 1);
  }, [xpPoints]);

  // Find recent / continue reading note from notes array or localStorage
  const continueReadingNote = useMemo(() => {
    try {
      const lastId = localStorage.getItem("fsm_last_read_note_id");
      if (lastId) {
        const found = notes.find((n) => n.id === lastId);
        if (found) return found;
      }
    } catch (_) {}

    // Fallback to top curated note matching student's branch or general OS/DBMS
    if (notes && notes.length > 0) {
      const match = notes.find(
        (n) =>
          n.subject?.toLowerCase().includes("operating") ||
          n.subject?.toLowerCase().includes("database") ||
          n.subject?.toLowerCase().includes("data") ||
          n.title?.toLowerCase().includes("os")
      );
      return match || notes[0];
    }

    return {
      id: "demo-os-note",
      title: "Operating Systems: Deadlock Prevention & Virtual Memory",
      subject: "Operating Systems",
      year: "3rd Year",
      semester: "5th Sem",
      downloadsCount: 1240,
    };
  }, [notes]);

  const readingProgress = useMemo(() => {
    return 74 + ((streakCount * 3) % 18); // e.g. 74% - 92%
  }, [streakCount]);

  const handleResumeReading = () => {
    playSuccess();
    if (onOpenPreview && continueReadingNote) {
      onOpenPreview(continueReadingNote, 34);
    }
  };

  const handleAiPromptSubmit = (e) => {
    e.preventDefault();
    if (!aiPromptText.trim()) return;
    playPop();
    if (onOpenAiStudyPod) {
      onOpenAiStudyPod("chat", continueReadingNote, aiPromptText);
    }
    setAiPromptText("");
  };

  const studentName = currentUser?.name?.split(" ")[0] || "Scholar";
  const studentCollege = currentUser?.college || "Academic Institute";
  const studentCourse = currentUser?.year || "B.Tech CSE • 5th Sem";

  return (
    <section className="student-command-center-section" style={{ position: "relative", overflow: "hidden", padding: "20px 0 32px" }}>
      {/* Ambient background glows */}
      <div className="ambient-aurora-mesh" aria-hidden="true" style={{ pointerEvents: "none" }}>
        <div className="aurora-orb aurora-orb-indigo" style={{ top: "-10%", left: "15%", opacity: 0.18 }} />
        <div className="aurora-orb aurora-orb-cyan" style={{ top: "10%", right: "10%", opacity: 0.16 }} />
        <div className="aurora-orb aurora-orb-emerald" style={{ bottom: "-10%", left: "40%", opacity: 0.12 }} />
      </div>

      <div className="command-center-layout" style={{ maxWidth: "1280px", margin: "0 auto", padding: "0 16px", position: "relative", zIndex: 1 }}>
        
        {/* ROW 1: HEADER & 3D TELEMETRY TILES */}
        <div
          className="command-header-row"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "18px",
            marginBottom: "24px",
          }}
        >
          {/* Student Welcome & 3D Orbit Avatar */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px", minWidth: "280px" }}>
            {/* 3D Rotating Golden Orbit Ring Avatar */}
            <div
              className="student-avatar-orbit-3d"
              style={{
                position: "relative",
                width: "66px",
                height: "66px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {/* Outer Golden Orbit Ring */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "50%",
                  border: "2.5px dashed #f59e0b",
                  animation: "orbitSpin 12s linear infinite",
                  boxShadow: "0 0 16px rgba(245, 158, 11, 0.35)",
                }}
              />
              {/* Inner Avatar Sphere */}
              <div
                style={{
                  width: "52px",
                  height: "52px",
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)",
                  boxShadow: "0 6px 16px rgba(79, 70, 229, 0.4), inset 0 2px 2px rgba(255, 255, 255, 0.7)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.4rem",
                  color: "#ffffff",
                  fontWeight: 900,
                }}
              >
                {studentName ? studentName[0].toUpperCase() : "G"}
              </div>
              {/* Level Chip */}
              <span
                style={{
                  position: "absolute",
                  bottom: "-4px",
                  right: "-4px",
                  background: "linear-gradient(135deg, #f59e0b, #d97706)",
                  color: "#000000",
                  fontSize: "0.66rem",
                  fontWeight: 900,
                  padding: "2px 6px",
                  borderRadius: "999px",
                  border: "1.5px solid #ffffff",
                  boxShadow: "0 2px 6px rgba(0, 0, 0, 0.2)",
                }}
              >
                LVL {studentLevel}
              </span>
            </div>

            {/* Greeting & Subtext */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <h1 style={{ fontSize: "1.55rem", fontWeight: 900, color: "#0f172a", margin: 0, letterSpacing: "-0.02em" }}>
                  Welcome back, {studentName}! 🚀
                </h1>
                <span
                  style={{
                    background: "linear-gradient(135deg, #e0e7ff, #f5f3ff)",
                    border: "1px solid #c7d2fe",
                    color: "#4338ca",
                    fontSize: "0.72rem",
                    fontWeight: 800,
                    padding: "3px 9px",
                    borderRadius: "999px",
                  }}
                >
                  Level {studentLevel} Scholar • {xpPoints} XP
                </span>
              </div>
              <p style={{ margin: "4px 0 0", fontSize: "0.86rem", color: "#64748b", fontWeight: 600 }}>
                {studentCourse} • {studentCollege}
              </p>
            </div>
          </div>

          {/* 3D Telemetry Stats Dock */}
          <div
            className="command-telemetry-dock"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              flexWrap: "wrap",
            }}
          >
            {/* 1. 3D Flame Streak Card */}
            <div
              className="telemetry-tile tile-amber-3d"
              onClick={onOpenSwipeToRevise}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "10px",
                padding: "8px 16px",
                borderRadius: "16px",
                background: "linear-gradient(145deg, #ffffff, #fffbeb)",
                border: "1.5px solid #fde68a",
                boxShadow: "0 6px 18px -2px rgba(245, 158, 11, 0.22), inset 0 2px 2px #ffffff",
                cursor: "pointer",
                transition: "transform 0.2s ease",
              }}
              title="Click to Revise & Boost Daily Streak"
            >
              <div
                className="icon-3d-amber"
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "10px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Flame size={18} color="#d97706" fill="#f59e0b" />
              </div>
              <div>
                <div style={{ fontSize: "0.86rem", fontWeight: 900, color: "#92400e", lineHeight: 1.2 }}>
                  {streakCount} Day Streak
                </div>
                <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#b45309" }}>
                  Campus Rank #3 • 420 XP Today
                </div>
              </div>
            </div>

            {/* 2. 3D Hostel AirDrop Mesh Card */}
            <div
              className="telemetry-tile tile-emerald-3d"
              onClick={onOpenAirDrop}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "10px",
                padding: "8px 16px",
                borderRadius: "16px",
                background: "linear-gradient(145deg, #ffffff, #ecfdf5)",
                border: "1.5px solid #a7f3d0",
                boxShadow: "0 6px 18px -2px rgba(16, 185, 129, 0.22), inset 0 2px 2px #ffffff",
                cursor: "pointer",
                transition: "transform 0.2s ease",
              }}
              title="Campus AirDrop: Peer-to-Peer Zero-Internet Offline Transfer"
            >
              <div
                className="icon-3d-emerald"
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "10px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                }}
              >
                <Zap size={18} color="#059669" />
              </div>
              <div>
                <div style={{ fontSize: "0.86rem", fontWeight: 900, color: "#065f46", lineHeight: 1.2 }}>
                  {activeHostelPeers} Peers Active
                </div>
                <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#047857" }}>
                  Hostel P2P Mesh • 0 KB Data
                </div>
              </div>
            </div>

            {/* 3. 3D Cloud Cluster Health Pill */}
            <div
              className="telemetry-tile tile-cyan-3d"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "10px",
                padding: "8px 16px",
                borderRadius: "16px",
                background: "linear-gradient(145deg, #ffffff, #f0fdfa)",
                border: "1.5px solid #99f6e4",
                boxShadow: "0 6px 18px -2px rgba(13, 148, 136, 0.2), inset 0 2px 2px #ffffff",
              }}
              title="Cloudflare Edge + 3-Node Triple Failover Active"
            >
              <div
                className="icon-3d-cyan"
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "10px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <TrendingUp size={16} color="#0891b2" />
              </div>
              <div>
                <div style={{ fontSize: "0.86rem", fontWeight: 900, color: "#115e59", lineHeight: 1.2 }}>
                  3-Node Cloud CDN
                </div>
                <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#0f766e" }}>
                  0.4ms Edge Latency • 100% Up
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ROW 2: TWO-COLUMN FLAGSHIP MATRIX (Continue Learning + Today's Swipe-to-Revise) */}
        <div
          className="command-matrix-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
            gap: "20px",
            marginBottom: "24px",
          }}
        >
          {/* COLUMN 1: CONTINUE LEARNING (Last Read Bookmark) */}
          <div
            className="command-center-card continue-reading-card"
            style={{
              background: "#ffffff",
              borderRadius: "24px",
              border: "1.5px solid #e2e8f0",
              padding: "24px",
              boxShadow: "0 12px 32px -8px rgba(15, 23, 42, 0.08), inset 0 1px 1px #ffffff",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* Top Accent Strip */}
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "4px", background: "linear-gradient(90deg, #0284c7, #06b6d4, #10b981)" }} />

            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                <span
                  style={{
                    background: "rgba(2, 132, 199, 0.1)",
                    border: "1px solid rgba(2, 132, 199, 0.25)",
                    color: "#0369a1",
                    fontSize: "0.72rem",
                    fontWeight: 800,
                    padding: "3px 10px",
                    borderRadius: "999px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                  }}
                >
                  <BookOpen size={12} />
                  <span>CONTINUE LEARNING</span>
                </span>

                <span style={{ fontSize: "0.78rem", fontWeight: 800, color: "#0284c7" }}>
                  {readingProgress}% Completed
                </span>
              </div>

              <h2 style={{ fontSize: "1.2rem", fontWeight: 900, color: "#0f172a", margin: "0 0 6px", lineHeight: 1.35 }}>
                {continueReadingNote.title}
              </h2>
              <p style={{ margin: "0 0 16px", fontSize: "0.82rem", color: "#64748b", fontWeight: 600 }}>
                {continueReadingNote.subject} • Solved Lecture Notes &amp; Visual Diagrams
              </p>

              {/* Progress Bar */}
              <div style={{ width: "100%", height: "8px", background: "#f1f5f9", borderRadius: "999px", overflow: "hidden", marginBottom: "20px" }}>
                <div
                  style={{
                    width: `${readingProgress}%`,
                    height: "100%",
                    background: "linear-gradient(90deg, #0284c7, #06b6d4, #10b981)",
                    borderRadius: "999px",
                    transition: "width 0.4s ease",
                  }}
                />
              </div>
            </div>

            {/* Resume Button */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <button
                type="button"
                className="btn-download-3d"
                onClick={handleResumeReading}
                style={{
                  flex: 1,
                  padding: "11px 20px",
                  fontSize: "0.88rem",
                  justifyContent: "center",
                  background: "linear-gradient(135deg, #0284c7 0%, #2563eb 50%, #4f46e5 100%)",
                }}
              >
                <span>⚡ Resume 0ms Reader (Page 34)</span>
                <ArrowRight size={16} />
              </button>

              <button
                type="button"
                className="btn-3d-round"
                onClick={onBrowseMaterials}
                title="Explore Full Syllabus"
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "14px",
                  background: "#f8fafc",
                  border: "1.5px solid #e2e8f0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <Compass size={18} color="#475569" />
              </button>
            </div>
          </div>

          {/* COLUMN 2: TODAY'S SWIPE-TO-REVISE (STUDY TINDER MINI DECK) */}
          <div
            className="command-center-card swipe-deck-widget"
            style={{
              background: "#ffffff",
              borderRadius: "24px",
              border: "1.5px solid #fde68a",
              padding: "24px",
              boxShadow: "0 12px 32px -8px rgba(245, 158, 11, 0.12), inset 0 1px 1px #ffffff",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* Top Accent Strip */}
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "4px", background: "linear-gradient(90deg, #f59e0b, #ec4899, #6366f1)" }} />

            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                <span
                  style={{
                    background: "rgba(245, 158, 11, 0.12)",
                    border: "1px solid rgba(245, 158, 11, 0.35)",
                    color: "#b45309",
                    fontSize: "0.72rem",
                    fontWeight: 800,
                    padding: "3px 10px",
                    borderRadius: "999px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                  }}
                >
                  <Flame size={13} color="#f59e0b" fill="#f59e0b" />
                  <span>STUDY TINDER • SWIPE-TO-REVISE</span>
                </span>

                <span style={{ fontSize: "0.72rem", fontWeight: 800, color: "#92400e", background: "#fef3c7", padding: "2px 8px", borderRadius: "6px" }}>
                  3 Cards Left
                </span>
              </div>

              {/* Mini Card Preview Stack */}
              <div
                style={{
                  background: "linear-gradient(145deg, #f8fafc, #ffffff)",
                  borderRadius: "16px",
                  border: "1.5px solid #e2e8f0",
                  padding: "14px 16px",
                  marginBottom: "16px",
                  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.04)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                  <span style={{ fontSize: "0.72rem", fontWeight: 800, color: "#4338ca", background: "#e0e7ff", padding: "2px 8px", borderRadius: "999px" }}>
                    B.Tech CSE • Sem 4
                  </span>
                  <span style={{ fontSize: "0.7rem", fontWeight: 800, color: "#d97706" }}>
                    🔥 98% Exam Chance
                  </span>
                </div>
                <h4 style={{ fontSize: "0.96rem", fontWeight: 900, color: "#0f172a", margin: "0 0 6px" }}>
                  Which 4 Coffman conditions are required for Deadlock?
                </h4>
                <p style={{ margin: 0, fontSize: "0.78rem", color: "#64748b", fontWeight: 600 }}>
                  💡 Desi Trick: "M-H-N-C: Mera Hostel Nahi Chala"
                </p>
              </div>
            </div>

            {/* Launch Swipe Revision Button */}
            <button
              type="button"
              className="btn-download-3d"
              onClick={onOpenSwipeToRevise}
              style={{
                width: "100%",
                padding: "11px 20px",
                fontSize: "0.88rem",
                justifyContent: "center",
                background: "linear-gradient(135deg, #f59e0b 0%, #ea580c 50%, #dc2626 100%)",
                boxShadow: "0 6px 18px -2px rgba(234, 88, 12, 0.4), inset 0 1.5px 1px #ffffff",
              }}
            >
              <span>🔥 Start Thumb Swipe Revision (+15 XP)</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>

        {/* ROW 3: 3D AI STUDY COMPANION BAR */}
        <div
          className="command-center-ai-bar"
          style={{
            background: "#ffffff",
            borderRadius: "20px",
            border: "1.5px solid #bae6fd",
            padding: "8px 12px 8px 16px",
            boxShadow: "0 8px 24px -4px rgba(2, 132, 199, 0.15), inset 0 1px 1px #ffffff",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
            marginBottom: "20px",
          }}
        >
          {/* 3D AI Robot Orb */}
          <div
            className="icon-3d-cyan"
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Bot size={20} color="#0284c7" />
          </div>

          <form onSubmit={handleAiPromptSubmit} style={{ flex: 1, display: "flex", alignItems: "center", gap: "10px", minWidth: "260px" }}>
            <input
              type="text"
              value={aiPromptText}
              onChange={(e) => setAiPromptText(e.target.value)}
              placeholder='Ask AI: "Explain Banker&apos;s Algorithm with 1 Hinglish memory trick..."'
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                background: "transparent",
                fontSize: "0.92rem",
                color: "#0f172a",
                fontWeight: 600,
              }}
            />
            <button
              type="submit"
              className="btn-download-3d"
              style={{
                padding: "8px 18px",
                fontSize: "0.82rem",
                background: "linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)",
                boxShadow: "0 4px 14px rgba(79, 70, 229, 0.35)",
              }}
            >
              <Sparkles size={14} />
              <span>Ask AI ✨</span>
            </button>
          </form>
        </div>

        {/* Quick Nav Anchor to explore materials */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", padding: "4px 8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.86rem", fontWeight: 700, color: "#475569" }}>
            <Layers size={16} color="#4f46e5" />
            <span>Academic Vault Library: All Semester Lecture Notes, PYQs &amp; Mind Maps</span>
          </div>
          <button
            type="button"
            onClick={onOpenUpload}
            style={{
              background: "#ffffff",
              border: "1.5px solid #e2e8f0",
              color: "#0f172a",
              padding: "5px 12px",
              borderRadius: "999px",
              fontSize: "0.78rem",
              fontWeight: 800,
              cursor: "pointer",
              boxShadow: "0 2px 6px rgba(0, 0, 0, 0.05)",
            }}
          >
            + Upload My Class Notes
          </button>
        </div>
      </div>
    </section>
  );
}
