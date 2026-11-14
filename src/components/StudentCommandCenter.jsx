import { useState, useEffect, useMemo, useRef } from "react";
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
  Calendar,
  Clock,
  Target,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  AlertCircle,
  HelpCircle,
  Check,
  Brain,
  Timer,
} from "lucide-react";
import { playPop, playSuccess } from "../utils/soundEffects";

// Offline Web Audio Synthesizer for Deep Study Focus (Pink Noise Gentle Rain)
function createAmbientAudio() {
  let ctx = null;
  let noiseSource = null;
  let gainNode = null;
  let isPlaying = false;

  return {
    start: () => {
      if (isPlaying) return;
      try {
        const AudioClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioClass) return;
        ctx = new AudioClass();
        const bufferSize = ctx.sampleRate * 2;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);

        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.96900 * b2 + white * 0.1538520;
          b3 = 0.86650 * b3 + white * 0.3104856;
          b4 = 0.55000 * b4 + white * 0.5329522;
          b5 = -0.76160 * b5 - white * 0.0168980;
          data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.04;
          b6 = white * 0.115926;
        }

        noiseSource = ctx.createBufferSource();
        noiseSource.buffer = buffer;
        noiseSource.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 820;

        gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(0.01, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.14, ctx.currentTime + 0.8);

        noiseSource.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(ctx.destination);

        noiseSource.start(0);
        isPlaying = true;
      } catch (_) {}
    },
    stop: () => {
      if (!isPlaying) return;
      try {
        if (gainNode && ctx) {
          gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
          setTimeout(() => {
            try { noiseSource?.stop(); } catch (_) {}
            try { noiseSource?.disconnect(); } catch (_) {}
            try { ctx?.close(); } catch (_) {}
            isPlaying = false;
          }, 400);
        } else {
          isPlaying = false;
        }
      } catch (_) {
        isPlaying = false;
      }
    },
    getIsPlaying: () => isPlaying,
  };
}

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

  // Pomodoro Focus Timer State
  const [pomoSeconds, setPomoSeconds] = useState(25 * 60);
  const [isPomoRunning, setIsPomoRunning] = useState(false);
  const [pomoMode, setPomoMode] = useState("focus"); // "focus" | "break"
  const [isAmbientSoundOn, setIsAmbientSoundOn] = useState(false);
  const ambientAudioRef = useRef(null);

  // Campus POTD State
  const [potdSelected, setPotdSelected] = useState(null);
  const [potdAnswered, setPotdAnswered] = useState(false);
  const [potdIsCorrect, setPotdIsCorrect] = useState(false);
  const [potdShowHint, setPotdShowHint] = useState(false);

  // Sync with localStorage
  useEffect(() => {
    try {
      const savedStreak = localStorage.getItem("fsm_swipe_streak");
      const savedXp = localStorage.getItem("fsm_swipe_xp");
      if (savedStreak) setStreakCount(parseInt(savedStreak, 10));
      if (savedXp) setXpPoints(parseInt(savedXp, 10));

      const savedPotd = localStorage.getItem("fsm_potd_deadlock_solved");
      if (savedPotd === "true") {
        setPotdAnswered(true);
        setPotdIsCorrect(true);
        setPotdSelected("B");
      }
    } catch (_) {}
  }, []);

  // Ambient Audio cleanup on unmount
  useEffect(() => {
    return () => {
      if (ambientAudioRef.current) {
        ambientAudioRef.current.stop();
      }
    };
  }, []);

  // Pomodoro Interval Timer
  useEffect(() => {
    let interval = null;
    if (isPomoRunning && pomoSeconds > 0) {
      interval = setInterval(() => {
        setPomoSeconds((prev) => prev - 1);
      }, 1000);
    } else if (pomoSeconds === 0 && isPomoRunning) {
      playSuccess();
      if (pomoMode === "focus") {
        setPomoMode("break");
        setPomoSeconds(5 * 60);
      } else {
        setPomoMode("focus");
        setPomoSeconds(25 * 60);
      }
      setIsPomoRunning(false);
    }
    return () => clearInterval(interval);
  }, [isPomoRunning, pomoSeconds, pomoMode]);

  const togglePomodoro = () => {
    playPop();
    setIsPomoRunning((prev) => !prev);
  };

  const resetPomodoro = () => {
    playPop();
    setIsPomoRunning(false);
    setPomoSeconds(pomoMode === "focus" ? 25 * 60 : 5 * 60);
  };

  const toggleAmbientSound = () => {
    playPop();
    if (!ambientAudioRef.current) {
      ambientAudioRef.current = createAmbientAudio();
    }
    if (isAmbientSoundOn) {
      ambientAudioRef.current.stop();
      setIsAmbientSoundOn(false);
    } else {
      ambientAudioRef.current.start();
      setIsAmbientSoundOn(true);
    }
  };

  // Format seconds to MM:SS
  const formatTime = (secs) => {
    const mins = Math.floor(secs / 60);
    const remSecs = secs % 60;
    return `${String(mins).padStart(2, "0")}:${String(remSecs).padStart(2, "0")}`;
  };

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
    return 74 + ((streakCount * 3) % 18);
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

  const handleSelectPotdOption = (optionId) => {
    if (potdAnswered) return;
    setPotdSelected(optionId);
    if (optionId === "B") {
      playSuccess();
      setPotdIsCorrect(true);
      setPotdAnswered(true);
      setPotdShowHint(false);
      setXpPoints((prev) => {
        const nextXp = prev + 50;
        try {
          localStorage.setItem("fsm_swipe_xp", String(nextXp));
          localStorage.setItem("fsm_potd_deadlock_solved", "true");
        } catch (_) {}
        return nextXp;
      });
    } else {
      playPop();
      setPotdIsCorrect(false);
      setPotdShowHint(true);
    }
  };

  const studentName = currentUser?.name?.split(" ")[0] || "Scholar";
  const studentCollege = currentUser?.college || "Academic Institute";
  const studentCourse = currentUser?.year || "B.Tech CSE • 5th Sem";

  return (
    <section className="student-command-center-section" style={{ position: "relative", overflow: "hidden", padding: "20px 0 32px" }}>
      {/* Ambient background glows */}
      <div className="ambient-aurora-mesh" aria-hidden="true" style={{ pointerEvents: "none" }}>
        <div className="aurora-orb aurora-orb-indigo" style={{ top: "-10%", left: "15%", opacity: 0.12 }} />
        <div className="aurora-orb aurora-orb-cyan" style={{ top: "10%", right: "10%", opacity: 0.1 }} />
        <div className="aurora-orb aurora-orb-emerald" style={{ bottom: "-10%", left: "40%", opacity: 0.08 }} />
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
            marginBottom: "22px",
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
                  AirDrop P2P Mesh • 0 KB Data
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
              title="Global Edge + 3-Node Triple Failover Active"
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
                  3-Node Global Edge
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
            marginBottom: "20px",
          }}
        >
          {/* COLUMN 1: CONTINUE LEARNING (Last Read Bookmark) */}
          <div
            className="command-center-card continue-reading-card"
            style={{
              background: "#ffffff",
              borderRadius: "24px",
              border: "1.5px solid #e2e8f0",
              padding: "22px",
              boxShadow: "0 10px 30px -8px rgba(15, 23, 42, 0.08), inset 0 1px 1px #ffffff",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              position: "relative",
              overflow: "hidden",
            }}
          >
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

              <h2 style={{ fontSize: "1.18rem", fontWeight: 900, color: "#0f172a", margin: "0 0 6px", lineHeight: 1.35 }}>
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
              padding: "22px",
              boxShadow: "0 10px 30px -8px rgba(245, 158, 11, 0.12), inset 0 1px 1px #ffffff",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              position: "relative",
              overflow: "hidden",
            }}
          >
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
                  💡 Desi Trick: &quot;M-H-N-C: Mera Hostel Nahi Chala&quot;
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

        {/* ROW 3: EXAM COUNTDOWN RADAR + HOSTEL FOCUS POMODORO POD */}
        <div
          className="command-radar-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
            gap: "20px",
            marginBottom: "20px",
          }}
        >
          {/* WIDGET 1: PARIKSHA RADAR & SYLLABUS COMPLETION */}
          <div
            className="command-center-card exam-radar-widget"
            style={{
              background: "#ffffff",
              borderRadius: "24px",
              border: "1.5px solid #cbd5e1",
              padding: "22px",
              boxShadow: "0 10px 30px -8px rgba(15, 23, 42, 0.08), inset 0 1px 1px #ffffff",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "4px", background: "linear-gradient(90deg, #ec4899, #8b5cf6, #3b82f6)" }} />

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
              <span
                style={{
                  background: "rgba(236, 72, 153, 0.1)",
                  border: "1px solid rgba(236, 72, 153, 0.25)",
                  color: "#be185d",
                  fontSize: "0.72rem",
                  fontWeight: 800,
                  padding: "3px 10px",
                  borderRadius: "999px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                }}
              >
                <Target size={13} color="#ec4899" />
                <span>EXAM RADAR • SEMESTER FINALS</span>
              </span>

              <span
                style={{
                  fontSize: "0.74rem",
                  fontWeight: 900,
                  color: "#e11d48",
                  background: "#ffe4e6",
                  padding: "3px 9px",
                  borderRadius: "999px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                }}
              >
                <Calendar size={12} />
                <span>14 Days Left</span>
              </span>
            </div>

            <h3 style={{ fontSize: "1.1rem", fontWeight: 900, color: "#0f172a", margin: "0 0 14px" }}>
              Target: 8.5+ CGPA Syllabus Tracker
            </h3>

            {/* Subject Completion Bars */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "16px" }}>
              {/* OS */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", fontWeight: 700, marginBottom: "4px" }}>
                  <span style={{ color: "#334155" }}>Operating Systems</span>
                  <span style={{ color: "#059669", fontWeight: 800 }}>84% • 🔥 On Track</span>
                </div>
                <div style={{ height: "6px", background: "#f1f5f9", borderRadius: "999px", overflow: "hidden" }}>
                  <div style={{ width: "84%", height: "100%", background: "#10b981", borderRadius: "999px" }} />
                </div>
              </div>

              {/* DBMS */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", fontWeight: 700, marginBottom: "4px" }}>
                  <span style={{ color: "#334155" }}>Database Management (DBMS)</span>
                  <span style={{ color: "#2563eb", fontWeight: 800 }}>72% • ⚡ Moderate</span>
                </div>
                <div style={{ height: "6px", background: "#f1f5f9", borderRadius: "999px", overflow: "hidden" }}>
                  <div style={{ width: "72%", height: "100%", background: "#3b82f6", borderRadius: "999px" }} />
                </div>
              </div>

              {/* CN */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", fontWeight: 700, marginBottom: "4px" }}>
                  <span style={{ color: "#334155" }}>Computer Networks</span>
                  <span style={{ color: "#dc2626", fontWeight: 900 }}>48% • ⚠️ Revision Due!</span>
                </div>
                <div style={{ height: "6px", background: "#f1f5f9", borderRadius: "999px", overflow: "hidden" }}>
                  <div style={{ width: "48%", height: "100%", background: "#ef4444", borderRadius: "999px" }} />
                </div>
              </div>
            </div>

            <button
              type="button"
              className="btn-download-3d"
              onClick={onBrowseMaterials}
              style={{
                width: "100%",
                padding: "10px 16px",
                fontSize: "0.82rem",
                justifyContent: "center",
                background: "linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)",
              }}
            >
              <span>🚀 1-Click Revise Computer Networks (Weak Subject)</span>
            </button>
          </div>

          {/* WIDGET 2: HOSTEL VIRTUAL STUDY ROOM & POMODORO TIMER */}
          <div
            className="command-center-card pomodoro-widget"
            style={{
              background: "#ffffff",
              borderRadius: "24px",
              border: "1.5px solid #c7d2fe",
              padding: "22px",
              boxShadow: "0 10px 30px -8px rgba(99, 102, 241, 0.12), inset 0 1px 1px #ffffff",
              position: "relative",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "4px", background: "linear-gradient(90deg, #6366f1, #06b6d4, #10b981)" }} />

            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                <span
                  style={{
                    background: "rgba(99, 102, 241, 0.1)",
                    border: "1px solid rgba(99, 102, 241, 0.25)",
                    color: "#4338ca",
                    fontSize: "0.72rem",
                    fontWeight: 800,
                    padding: "3px 10px",
                    borderRadius: "999px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                  }}
                >
                  <Timer size={13} color="#6366f1" />
                  <span>CAMPUS STUDY POD • 25M FOCUS</span>
                </span>

                {/* Social indicator */}
                <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#059669", background: "#ecfdf5", padding: "2px 8px", borderRadius: "999px" }}>
                  🟢 38 Peers Studying Now
                </span>
              </div>

              {/* Timer Display & Controls Row */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", margin: "14px 0" }}>
                <div>
                  <div style={{ fontSize: "2.3rem", fontWeight: 900, color: "#0f172a", fontFamily: "monospace", letterSpacing: "-0.04em", lineHeight: 1 }}>
                    {formatTime(pomoSeconds)}
                  </div>
                  <div style={{ fontSize: "0.76rem", color: "#64748b", fontWeight: 700, marginTop: "4px" }}>
                    {pomoMode === "focus" ? "🎯 Deep Work Interval" : "☕ Chill Break Interval"}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <button
                    type="button"
                    onClick={togglePomodoro}
                    className="btn-download-3d"
                    style={{
                      padding: "10px 16px",
                      fontSize: "0.85rem",
                      background: isPomoRunning ? "linear-gradient(135deg, #ef4444, #dc2626)" : "linear-gradient(135deg, #4f46e5, #06b6d4)",
                    }}
                  >
                    {isPomoRunning ? <Pause size={16} /> : <Play size={16} />}
                    <span>{isPomoRunning ? "Pause" : "Start"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={resetPomodoro}
                    title="Reset Timer"
                    style={{
                      width: "38px",
                      height: "38px",
                      borderRadius: "12px",
                      background: "#f8fafc",
                      border: "1.5px solid #e2e8f0",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                    }}
                  >
                    <RotateCcw size={15} color="#64748b" />
                  </button>
                </div>
              </div>
            </div>

            {/* Offline Ambient Sound Generator (Web Audio Soft Rain) */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                background: "#f8fafc",
                borderRadius: "14px",
                border: "1.5px solid #e2e8f0",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {isAmbientSoundOn ? <Volume2 size={16} color="#0284c7" /> : <VolumeX size={16} color="#94a3b8" />}
                <div>
                  <div style={{ fontSize: "0.78rem", fontWeight: 800, color: "#1e293b" }}>
                    🎧 Soft Rain Ambient Audio
                  </div>
                  <div style={{ fontSize: "0.68rem", color: "#64748b" }}>
                    Synthesized 100% Offline • 0 KB Data
                  </div>
                </div>
              </div>

              {/* Animated wave bars if playing */}
              {isAmbientSoundOn && (
                <div style={{ display: "flex", alignItems: "center", gap: "3px", height: "18px" }}>
                  <span className="audio-bar-anim" style={{ width: "3px", background: "#0284c7", borderRadius: "2px" }} />
                  <span className="audio-bar-anim" style={{ width: "3px", background: "#06b6d4", borderRadius: "2px", animationDelay: "0.2s" }} />
                  <span className="audio-bar-anim" style={{ width: "3px", background: "#3b82f6", borderRadius: "2px", animationDelay: "0.4s" }} />
                </div>
              )}

              <button
                type="button"
                onClick={toggleAmbientSound}
                style={{
                  padding: "5px 12px",
                  borderRadius: "999px",
                  fontSize: "0.74rem",
                  fontWeight: 800,
                  background: isAmbientSoundOn ? "#e0f2fe" : "#ffffff",
                  color: isAmbientSoundOn ? "#0369a1" : "#475569",
                  border: isAmbientSoundOn ? "1px solid #7dd3fc" : "1px solid #cbd5e1",
                  cursor: "pointer",
                }}
              >
                {isAmbientSoundOn ? "Sound On" : "Turn On"}
              </button>
            </div>
          </div>
        </div>

        {/* ROW 4: CAMPUS POTD (PROBLEM OF THE DAY - INTERACTIVE PYQ QUIZ) */}
        <div
          className="command-center-card potd-widget"
          style={{
            background: "#ffffff",
            borderRadius: "24px",
            border: "1.5px solid #fed7aa",
            padding: "22px",
            boxShadow: "0 10px 30px -8px rgba(249, 115, 22, 0.1), inset 0 1px 1px #ffffff",
            marginBottom: "20px",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "4px", background: "linear-gradient(90deg, #f97316, #eab308, #10b981)" }} />

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", marginBottom: "14px" }}>
            <span
              style={{
                background: "rgba(249, 115, 22, 0.1)",
                border: "1px solid rgba(249, 115, 22, 0.3)",
                color: "#c2410c",
                fontSize: "0.72rem",
                fontWeight: 800,
                padding: "3px 10px",
                borderRadius: "999px",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              <Brain size={13} color="#f97316" />
              <span>CAMPUS POTD • UNIVERSITY PYQ (2024, 2022)</span>
            </span>

            <span
              style={{
                fontSize: "0.74rem",
                fontWeight: 900,
                color: potdAnswered ? "#059669" : "#ea580c",
                background: potdAnswered ? "#ecfdf5" : "#fff7ed",
                padding: "3px 10px",
                borderRadius: "999px",
                border: potdAnswered ? "1px solid #a7f3d0" : "1px solid #fed7aa",
              }}
            >
              {potdAnswered ? "✅ +50 XP Claimed!" : "🎁 Reward: +50 XP"}
            </span>
          </div>

          <h3 style={{ fontSize: "1.05rem", fontWeight: 900, color: "#0f172a", margin: "0 0 12px", lineHeight: 1.4 }}>
            Q: Which of the following is NOT one of Coffman&apos;s 4 conditions required for Deadlock?
          </h3>

          {/* Interactive Options Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "10px", marginBottom: "14px" }}>
            {[
              { id: "A", text: "Mutual Exclusion" },
              { id: "B", text: "Preemption Allowed (Correct)" },
              { id: "C", text: "Hold and Wait" },
              { id: "D", text: "Circular Wait" },
            ].map((opt) => {
              const isSelected = potdSelected === opt.id;
              const isOptionCorrect = opt.id === "B";
              let btnBg = "#ffffff";
              let btnBorder = "#e2e8f0";
              let textColor = "#1e293b";

              if (potdAnswered && isOptionCorrect) {
                btnBg = "#ecfdf5";
                btnBorder = "#10b981";
                textColor = "#065f46";
              } else if (isSelected && !isOptionCorrect) {
                btnBg = "#fef2f2";
                btnBorder = "#ef4444";
                textColor = "#991b1b";
              }

              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleSelectPotdOption(opt.id)}
                  disabled={potdAnswered}
                  className="potd-option-btn"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "10px 14px",
                    borderRadius: "14px",
                    background: btnBg,
                    border: `1.5px solid ${btnBorder}`,
                    color: textColor,
                    fontSize: "0.86rem",
                    fontWeight: 700,
                    cursor: potdAnswered ? "default" : "pointer",
                    textAlign: "left",
                  }}
                >
                  <span
                    style={{
                      width: "24px",
                      height: "24px",
                      borderRadius: "8px",
                      background: isSelected ? (isOptionCorrect ? "#10b981" : "#ef4444") : "#f1f5f9",
                      color: isSelected ? "#ffffff" : "#475569",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "0.75rem",
                      fontWeight: 900,
                      flexShrink: 0,
                    }}
                  >
                    {opt.id}
                  </span>
                  <span style={{ flex: 1 }}>{opt.text}</span>
                  {potdAnswered && isOptionCorrect && <Check size={16} color="#10b981" />}
                </button>
              );
            })}
          </div>

          {/* Explanation Box */}
          {potdAnswered && (
            <div
              style={{
                background: "#f0fdf4",
                border: "1.5px solid #bbf7d0",
                borderRadius: "14px",
                padding: "12px 16px",
                fontSize: "0.82rem",
                color: "#166534",
                fontWeight: 600,
                display: "flex",
                alignItems: "flex-start",
                gap: "10px",
              }}
            >
              <CheckCircle2 size={18} color="#16a34a" style={{ flexShrink: 0, marginTop: "2px" }} />
              <div>
                <strong style={{ color: "#14532d" }}>Shabaash! Exactly Correct (+50 XP Added):</strong>
                <div style={{ marginTop: "3px" }}>
                  Deadlock requires <em>&quot;No Preemption&quot;</em> (resources cannot be forcibly taken). If the OS allows preemption, it can simply snatch the resource and prevent deadlock!
                </div>
              </div>
            </div>
          )}

          {potdShowHint && !potdAnswered && (
            <div
              style={{
                background: "#fffbeb",
                border: "1.5px solid #fde68a",
                borderRadius: "14px",
                padding: "10px 14px",
                fontSize: "0.8rem",
                color: "#92400e",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <AlertCircle size={16} color="#d97706" />
              <span>Hint: Coffman&apos;s 4 conditions yaad karo: M-H-N-C (&quot;No Preemption&quot; zaroori hota hai, &quot;Preemption Allowed&quot; nahi)! Try again.</span>
            </div>
          )}
        </div>

        {/* ROW 5: 3D AI STUDY COMPANION BAR */}
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
            marginBottom: "18px",
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
