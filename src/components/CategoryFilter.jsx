import { useState, useRef, useEffect } from "react";
import { LayoutGrid, List, GraduationCap, Calendar, Layers, Search, Mic, MicOff, Sparkles } from "lucide-react";
import GeminiIcon from "./GeminiIcon";

const COURSES = [
  "All Courses",
  "B.Tech",
  "BCA",
  "MCA",
  "Diploma",
  "M.Tech",
  "B.Sc",
  "Handwritten Notes",
  "Question Papers",
];

const YEARS = ["All Years", "1st Year", "2nd Year", "3rd Year", "4th Year"];

export default function CategoryFilter({
  selectedCourse = "All Courses",
  setSelectedCourse,
  selectedYear = "All Years",
  setSelectedYear,
  selectedBranch = "All",
  setSelectedBranch,
  branches = [],
  totalCount,
  viewMode = "grid",
  setViewMode,
  sortBy = "recent",
  setSortBy,
  searchTerm = "",
  setSearchTerm,
  onOpenCircleSearch,
  onOpenAiStudyPod,
  showOnlyOffline = false,
  setShowOnlyOffline,
  offlineCount = 0,
}) {
  const branchList = ["All", ...(branches.length > 0 ? branches : ["CSE", "IT", "ECE", "ME", "Civil", "BCA", "MCA", "AI/ML"])];

  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);
  const searchInputRef = useRef(null);

  // Global Keyboard Shortcut: ⌘K or Ctrl+K focuses the Universal Spotlight Search at Explore study materials
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (searchInputRef.current) {
          searchInputRef.current.focus();
          searchInputRef.current.select();
        }
        const el = document.getElementById("study-materials");
        if (el) el.scrollIntoView({ behavior: "smooth" });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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
        if (transcript && setSearchTerm) {
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
    <section id="study-materials" className="control-bar-wrapper">
      <div className="library-heading" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px", marginBottom: "16px" }}>
        <div style={{ flex: "1 1 240px", minWidth: "220px" }}>
          <p style={{ margin: 0, color: "#4361bb", fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.12em" }}>THE LIBRARY</p>
          <h2 style={{ margin: "2px 0 4px", fontSize: "clamp(1.3rem, 2.4vw, 1.7rem)", fontWeight: 800, color: "#172338", letterSpacing: "-0.03em" }}>Explore study materials</h2>
          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", display: "block" }}>Filter by course, year, or branch to find the right resources.</span>
        </div>

        {/* 🔍 Universal Spotlight Search Bar (Shifted to Explore Study Materials) */}
        <div style={{ flex: "1 1 360px", maxWidth: "620px", minWidth: "260px" }}>
          <div className="search-wrapper" style={{ width: "100%", maxWidth: "100%", margin: 0 }}>
            <Search size={15} className="search-icon" />
            <input
              ref={searchInputRef}
              type="text"
              className="search-input"
              style={{ paddingRight: "215px" }}
              placeholder="Search notes, subjects, branch, PYQs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm && setSearchTerm(e.target.value)}
            />
            <div className="search-right-tools">
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm && setSearchTerm("")}
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
              {onOpenCircleSearch && (
                <button
                  type="button"
                  className="search-circle-btn"
                  onClick={onOpenCircleSearch}
                  style={{
                    background: "linear-gradient(135deg, rgba(2, 132, 199, 0.12), rgba(99, 102, 241, 0.12))",
                    border: "1px solid rgba(56, 189, 248, 0.45)",
                    color: "#0284c7",
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
                  <span className="search-tool-label">Circle</span>
                </button>
              )}

              {/* ✨ AI Study Pod Popup Button */}
              {onOpenAiStudyPod && (
                <button
                  type="button"
                  className="search-ai-btn"
                  onClick={() => onOpenAiStudyPod("chat")}
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
                  <span className="search-tool-label">AI Study</span>
                </button>
              )}

              <kbd className="search-kbd-shortcut">⌘K</kbd>
            </div>
          </div>
        </div>
      </div>
      {/* Dynamic Course & Program Filter Bar (Replaced rigid Semester Scene) */}
      <div className="semester-tabs" style={{ display: "flex", alignItems: "center", gap: "8px", overflowX: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--accent-cyan)", fontSize: "0.78rem", fontWeight: 700, paddingRight: "4px", flexShrink: 0 }}>
          <GraduationCap size={15} />
          <span>Course:</span>
        </div>

        {/* 📴 Luxury Offline Notes Filter Tab */}
        <button
          type="button"
          className={`filter-tab offline-filter-pill ${showOnlyOffline ? "active" : ""}`}
          onClick={() => {
            if (setShowOnlyOffline) {
              setShowOnlyOffline(!showOnlyOffline);
            }
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            background: showOnlyOffline
              ? "linear-gradient(135deg, #059669, #10b981)"
              : "linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(6, 182, 212, 0.08))",
            color: showOnlyOffline ? "#ffffff" : "#059669",
            border: showOnlyOffline ? "1.5px solid #059669" : "1px solid rgba(16, 185, 129, 0.35)",
            fontWeight: 750,
            boxShadow: showOnlyOffline ? "0 4px 14px rgba(16, 185, 129, 0.35)" : "none",
            flexShrink: 0,
            cursor: "pointer",
            transition: "all 0.2s ease",
          }}
          title={showOnlyOffline ? "Click to show all notes" : "Click to view notes saved offline on this device (0 MB internet needed)"}
        >
          <span style={{ fontSize: "0.95rem" }}>📴</span>
          <span>Offline Notes</span>
          <span
            style={{
              fontSize: "0.72rem",
              padding: "1px 6px",
              borderRadius: "999px",
              background: showOnlyOffline ? "rgba(255, 255, 255, 0.28)" : "rgba(16, 185, 129, 0.16)",
              color: showOnlyOffline ? "#ffffff" : "#047857",
              fontWeight: 800,
            }}
          >
            {offlineCount}
          </span>
        </button>

        {COURSES.map((course) => (
          <button
            key={course}
            className={`filter-tab ${selectedCourse === course && !showOnlyOffline ? "active" : ""}`}
            onClick={() => {
              if (showOnlyOffline && setShowOnlyOffline) setShowOnlyOffline(false);
              setSelectedCourse(course);
            }}
          >
            {course}
          </button>
        ))}
      </div>

      {/* Year / Level Quick Bar */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 14px", borderBottom: "1px solid #e2e8f0", overflowX: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-muted)", fontSize: "0.75rem", fontWeight: 700, paddingRight: "4px", flexShrink: 0 }}>
          <Calendar size={13} />
          <span>Year / Level:</span>
        </div>
        {YEARS.map((yr) => (
          <button
            key={yr}
            onClick={() => setSelectedYear(yr)}
            style={{
              padding: "4px 10px",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.75rem",
              fontWeight: 600,
              background: selectedYear === yr ? "rgba(99, 102, 241, 0.2)" : "transparent",
              color: selectedYear === yr ? "var(--accent-indigo)" : "var(--text-dim)",
              border: selectedYear === yr ? "1px solid rgba(99, 102, 241, 0.4)" : "1px solid transparent",
              cursor: "pointer",
              transition: "all 0.15s ease",
              whiteSpace: "nowrap",
            }}
          >
            {yr}
          </button>
        ))}
      </div>

      {/* Dynamic Branch / Department Chips & View Mode Switcher */}
      <div className="branch-chips-bar">
        <div className="branch-chips-list">
          <div style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: "var(--text-muted)", fontSize: "0.75rem", fontWeight: 600, marginRight: "4px" }}>
            <Layers size={13} />
            <span>Branch:</span>
          </div>
          {branchList.map((branch) => (
            <button
              key={branch}
              className={`branch-chip ${selectedBranch === branch ? "active" : ""}`}
              onClick={() => setSelectedBranch(branch)}
            >
              {branch}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
          {/* View Mode Switcher */}
          {setViewMode && (
            <div
              style={{
                display: "flex",
                background: "#f1f5f9",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-sm)",
                padding: "2px",
                gap: "2px",
              }}
            >
              <button
                className={`btn-icon ${viewMode === "grid" ? "active" : ""}`}
                style={{
                  width: "30px",
                  height: "30px",
                  borderRadius: "6px",
                  background: viewMode === "grid" ? "rgba(99, 102, 241, 0.25)" : "transparent",
                  color: viewMode === "grid" ? "var(--accent-indigo)" : "var(--text-dim)",
                }}
                onClick={() => setViewMode("grid")}
                title="Cards Grid View"
              >
                <LayoutGrid size={15} />
              </button>
              <button
                className={`btn-icon ${viewMode === "table" ? "active" : ""}`}
                style={{
                  width: "30px",
                  height: "30px",
                  borderRadius: "6px",
                  background: viewMode === "table" ? "rgba(6, 182, 212, 0.25)" : "transparent",
                  color: viewMode === "table" ? "var(--accent-cyan)" : "var(--text-dim)",
                }}
                onClick={() => setViewMode("table")}
                title="Compact List View"
              >
                <List size={15} />
              </button>
            </div>
          )}

          {/* ⚡ Client-Side Instant Sort (0 Server Load) */}
          {setSortBy && (
            <div style={{ display: "flex", alignItems: "center" }}>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                style={{
                  height: "30px",
                  padding: "0 8px",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  borderRadius: "var(--radius-sm)",
                  border: "1.5px solid #cbd5e1",
                  background: "#ffffff",
                  color: "#334155",
                  cursor: "pointer",
                  outline: "none",
                }}
                title="Sort Notes (100% Instant Client-Side)"
              >
                <option value="recent">⚡ Recently Added</option>
                <option value="popular">🔥 Most Downloaded</option>
                <option value="size">📦 Smallest Size</option>
                <option value="title">🔤 Title (A-Z)</option>
              </select>
            </div>
          )}

          <div style={{ fontSize: "0.82rem", color: "var(--text-dim)", fontWeight: 600 }}>
            {showOnlyOffline ? (
              <span style={{ color: "#059669", fontWeight: 700 }}>
                Showing <span style={{ color: "var(--text-main)", fontWeight: 800 }}>{totalCount}</span> offline saved notes (0 KB Data)
              </span>
            ) : (
              <>Showing <span style={{ color: "var(--text-main)", fontWeight: 800 }}>{totalCount}</span> notes</>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
