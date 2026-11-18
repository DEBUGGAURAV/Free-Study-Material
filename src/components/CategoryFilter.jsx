import { useState, useRef, useEffect, useMemo } from "react";
import { LayoutGrid, List, GraduationCap, Calendar, Layers, Search, Mic, MicOff, Sparkles, FileText, ArrowUpRight } from "lucide-react";
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

const QUICK_SEARCH_PILLS = [
  { label: "🔥 PYQs & Solved Papers", term: "PYQ" },
  { label: "⚡ Formula Derivations", term: "Formula" },
  { label: "📝 Handwritten Notes", term: "Handwritten" },
  { label: "🎯 Most Downloaded", term: "most_downloaded", isSort: true },
  { label: "📚 Unit-Wise Notes", term: "Unit" },
  { label: "🧪 Lab Manuals & VIVA", term: "Lab" },
];

export default function CategoryFilter({
  selectedCourse = "All Courses",
  setSelectedCourse,
  selectedYear = "All Years",
  setSelectedYear,
  selectedBranch = "All",
  setSelectedBranch,
  branches = [],
  totalCount,
  notes = [],
  onPreview,
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
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const recognitionRef = useRef(null);
  const searchInputRef = useRef(null);
  const searchContainerRef = useRef(null);

  // Instant 0ms In-Memory Search Autocomplete (0 Server Load)
  const liveSuggestions = useMemo(() => {
    if (!searchTerm || searchTerm.trim().length === 0) {
      return (notes || []).slice(0, 4);
    }
    const query = searchTerm.toLowerCase().trim();
    return (notes || [])
      .filter((n) => {
        const t = (n.title || "").toLowerCase();
        const s = (n.subject || "").toLowerCase();
        const b = (n.branch || "").toLowerCase();
        return t.includes(query) || s.includes(query) || b.includes(query);
      })
      .slice(0, 5);
  }, [notes, searchTerm]);

  // Click outside listener to safely close spotlight dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Global Keyboard Shortcut: ⌘K or Ctrl+K focuses the Universal Spotlight Search at Explore study materials
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (searchInputRef.current) {
          searchInputRef.current.focus();
          searchInputRef.current.select();
          setIsSearchFocused(true);
        }
        const el = document.getElementById("study-materials");
        if (el) el.scrollIntoView({ behavior: "smooth" });
      }
      if (e.key === "Escape") {
        setIsSearchFocused(false);
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
          setIsSearchFocused(true);
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
      <div className="library-heading" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px", marginBottom: "14px" }}>
        <div style={{ flex: "1 1 240px", minWidth: "220px" }}>
          <p style={{ margin: 0, color: "#4361bb", fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.12em" }}>THE LIBRARY</p>
          <h2 style={{ margin: "2px 0 4px", fontSize: "clamp(1.3rem, 2.4vw, 1.7rem)", fontWeight: 800, color: "#172338", letterSpacing: "-0.03em" }}>Explore study materials</h2>
          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", display: "block", textAlign: "left" }}>Filter by course, year, or branch to find the right resources.</span>
        </div>

        {/* 🔍 Universal Spotlight Search Bar (Pure White Linear Style with Ambient Glow - Pixel Perfect Match) */}
        <div ref={searchContainerRef} style={{ flex: "1 1 360px", maxWidth: "620px", minWidth: "260px", position: "relative" }}>
          <div className="search-wrapper" style={{ width: "100%", maxWidth: "100%", margin: 0, position: "relative" }}>
            <input
              ref={searchInputRef}
              type="text"
              className="search-input library-search-input"
              placeholder="Search notes, subjects, branch, PYQs..."
              value={searchTerm}
              onFocus={() => setIsSearchFocused(true)}
              onChange={(e) => {
                if (setSearchTerm) setSearchTerm(e.target.value);
                setIsSearchFocused(true);
              }}
              style={{
                width: "100%",
                background: "#ffffff",
                border: isSearchFocused ? "1.5px solid #6366f1" : "1.5px solid #cbd5e1",
                borderRadius: "9999px",
                padding: "10px 230px 10px 20px",
                fontSize: "0.86rem",
                color: "#0f172a",
                outline: "none",
                boxShadow: isSearchFocused
                  ? "0 0 0 4px rgba(99, 102, 241, 0.25), 0 12px 32px -4px rgba(99, 102, 241, 0.24), 0 0 20px rgba(6, 182, 212, 0.18)"
                  : "0 2px 10px -2px rgba(15, 23, 42, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04)",
                transition: "all 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
                boxSizing: "border-box",
              }}
            />
            <div
              className="search-right-tools"
              style={{
                position: "absolute",
                right: "8px",
                top: "50%",
                transform: "translateY(-50%)",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                pointerEvents: "auto",
              }}
            >
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => {
                    if (setSearchTerm) setSearchTerm("");
                    setIsSearchFocused(false);
                  }}
                  className="search-clear-btn"
                  title="Clear search"
                  style={{
                    background: "#f1f5f9",
                    border: "none",
                    color: "#64748b",
                    width: "20px",
                    height: "20px",
                    borderRadius: "50%",
                    fontSize: "0.7rem",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 0,
                  }}
                >
                  ✕
                </button>
              )}
              <button
                type="button"
                onClick={handleVoiceSearch}
                className={`search-mic-btn ${isListening ? "listening" : ""}`}
                title={isListening ? "Listening... Click to stop" : "Voice Search (Speak to search notes)"}
                style={{
                  background: isListening ? "rgba(239, 68, 68, 0.15)" : "transparent",
                  border: isListening ? "1px solid #ef4444" : "none",
                  borderRadius: "50%",
                  width: "26px",
                  height: "26px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  color: isListening ? "#ef4444" : "#94a3b8",
                  transition: "all 0.18s ease",
                  padding: 0,
                }}
              >
                {isListening ? <MicOff size={15} /> : <Mic size={15} />}
              </button>

              {/* ♊ Circle to Search Button (Mint Light Pill with Ring Icon) */}
              {onOpenCircleSearch && (
                <button
                  type="button"
                  className="search-circle-btn"
                  onClick={onOpenCircleSearch}
                  style={{
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    color: "#047857",
                    borderRadius: "7px",
                    padding: "3.5px 10px",
                    fontSize: "0.76rem",
                    fontWeight: 800,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    transition: "all 0.18s ease",
                    boxShadow: "0 1px 2px rgba(0, 0, 0, 0.03)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#dcfce7";
                    e.currentTarget.style.borderColor = "#86efac";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#f0fdf4";
                    e.currentTarget.style.borderColor = "#bbf7d0";
                  }}
                  title="Circle to Search: Circle any question or diagram to solve with Gemini AI"
                >
                  <GeminiIcon size={14} withRing ringColor="#10b981" color="#059669" />
                  <span className="search-tool-label">Circle</span>
                </button>
              )}

              {/* ✨ AI Study Pod Popup Button (Sky/Indigo Light Pill with Sparkles) */}
              {onOpenAiStudyPod && (
                <button
                  type="button"
                  className="search-ai-btn"
                  onClick={() => onOpenAiStudyPod("chat")}
                  style={{
                    background: "#eff6ff",
                    border: "1px solid #bfdbfe",
                    color: "#2563eb",
                    borderRadius: "7px",
                    padding: "3.5px 11px",
                    fontSize: "0.76rem",
                    fontWeight: 800,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    transition: "all 0.18s ease",
                    boxShadow: "0 1px 2px rgba(0, 0, 0, 0.03)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#dbeafe";
                    e.currentTarget.style.borderColor = "#93c5fd";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#eff6ff";
                    e.currentTarget.style.borderColor = "#bfdbfe";
                  }}
                  title="AI Study: Conversational Tutor, Flashcards & Summary"
                >
                  <Sparkles size={13} color="#2563eb" />
                  <span className="search-tool-label">AI Study</span>
                </button>
              )}

              <kbd
                className="search-kbd-shortcut"
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  color: "#64748b",
                  borderRadius: "5px",
                  padding: "2.5px 7px",
                  fontSize: "0.68rem",
                  fontWeight: 700,
                  fontFamily: "inherit",
                  lineHeight: 1,
                  pointerEvents: "none",
                }}
              >
                ⌘K
              </kbd>
            </div>
          </div>

          {/* ⚡ Live Search Spotlight Floating Dropdown (High-Contrast White Theme with 0ms Instant Results) */}
          {isSearchFocused && liveSuggestions.length > 0 && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 10px)",
                left: 0,
                right: 0,
                background: "#ffffff",
                border: "1.5px solid #cbd5e1",
                borderRadius: "16px",
                boxShadow: "0 24px 56px -12px rgba(15, 23, 42, 0.28), 0 4px 16px rgba(99, 102, 241, 0.16), 0 0 0 1px rgba(99, 102, 241, 0.15)",
                padding: "10px",
                zIndex: 1050,
                animation: "fadeIn 0.15s ease-out",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px 8px", borderBottom: "1.5px solid #f1f5f9", marginBottom: "6px" }}>
                <span style={{ fontSize: "0.72rem", fontWeight: 800, color: "#4f46e5", letterSpacing: "0.06em", textTransform: "uppercase", display: "inline-flex", alignItems: "center", gap: "5px" }}>
                  <span>⚡ {searchTerm ? `Live Search Results (${liveSuggestions.length})` : "🔥 Recommended Study Materials"}</span>
                </span>
                <span style={{ fontSize: "0.68rem", color: "#64748b", fontWeight: 600 }}>
                  Instant 0ms Reader
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                {liveSuggestions.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (onPreview) onPreview(item);
                      setIsSearchFocused(false);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "10px",
                      padding: "8px 12px",
                      borderRadius: "10px",
                      cursor: "pointer",
                      transition: "all 0.16s ease",
                      background: "#ffffff",
                      border: "1px solid transparent",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#f0f4ff";
                      e.currentTarget.style.borderColor = "#c7d2fe";
                      e.currentTarget.style.transform = "translateX(4px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "#ffffff";
                      e.currentTarget.style.borderColor = "transparent";
                      e.currentTarget.style.transform = "none";
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          width: "32px",
                          height: "32px",
                          borderRadius: "8px",
                          background: "#eff6ff",
                          border: "1px solid #bfdbfe",
                          color: "#4f46e5",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <FileText size={17} color="#4f46e5" />
                      </div>

                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 800, color: "#0f172a", fontSize: "0.84rem", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                          {item.title}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "2px", flexWrap: "wrap", fontSize: "0.7rem" }}>
                          {item.subject && (
                            <span style={{ background: "#eff6ff", color: "#1e40af", border: "1px solid #bfdbfe", padding: "1px 7px", borderRadius: "4px", fontWeight: 700 }}>
                              {item.subject}
                            </span>
                          )}
                          {item.branch && (
                            <span style={{ color: "#475569", fontWeight: 600 }}>• {item.branch}</span>
                          )}
                          {item.year && (
                            <span style={{ color: "#64748b" }}>• {item.year}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      style={{
                        padding: "5px 12px",
                        fontSize: "0.74rem",
                        fontWeight: 750,
                        borderRadius: "7px",
                        background: "linear-gradient(135deg, #4f46e5, #06b6d4)",
                        color: "#ffffff",
                        border: "none",
                        cursor: "pointer",
                        flexShrink: 0,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        boxShadow: "0 2px 8px rgba(79, 70, 229, 0.35)",
                      }}
                    >
                      <span>Read</span>
                      <ArrowUpRight size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 🏷️ 1-Click Quick Filter Pills (High-Contrast White Theme Luxury Buttons) */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", overflowX: "auto", padding: "2px 0 12px", borderBottom: "1.5px solid #f1f5f9", marginBottom: "12px" }}>
        <span style={{ fontSize: "0.72rem", fontWeight: 800, color: "#64748b", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "5px", letterSpacing: "0.04em", textTransform: "uppercase" }}>
          <span>Quick Find:</span>
        </span>
        {QUICK_SEARCH_PILLS.map((pill) => {
          const isActive = pill.isSort ? sortBy === "downloads" : searchTerm === pill.term;
          return (
            <button
              key={pill.term}
              type="button"
              onClick={() => {
                if (pill.isSort) {
                  if (isActive) {
                    if (setSortBy) setSortBy("recent");
                  } else {
                    if (setSortBy) setSortBy("downloads");
                  }
                } else {
                  if (isActive) {
                    if (setSearchTerm) setSearchTerm("");
                  } else {
                    if (setSearchTerm) setSearchTerm(pill.term);
                  }
                }
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 14px",
                fontSize: "0.76rem",
                fontWeight: isActive ? 800 : 700,
                borderRadius: "999px",
                background: isActive ? "linear-gradient(135deg, #4f46e5, #06b6d4)" : "#ffffff",
                border: isActive ? "1.5px solid transparent" : "1.5px solid #cbd5e1",
                color: isActive ? "#ffffff" : "#334155",
                boxShadow: isActive ? "0 4px 16px rgba(79, 70, 229, 0.38)" : "0 2px 6px rgba(15, 23, 42, 0.05)",
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "all 0.18s cubic-bezier(0.16, 1, 0.3, 1)",
                transform: isActive ? "translateY(-1px)" : "none",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.borderColor = "#6366f1";
                  e.currentTarget.style.background = "#f8faff";
                  e.currentTarget.style.color = "#4338ca";
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow = "0 6px 16px -2px rgba(99, 102, 241, 0.2)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.borderColor = "#cbd5e1";
                  e.currentTarget.style.background = "#ffffff";
                  e.currentTarget.style.color = "#334155";
                  e.currentTarget.style.transform = "none";
                  e.currentTarget.style.boxShadow = "0 2px 6px rgba(15, 23, 42, 0.05)";
                }
              }}
            >
              <span>{pill.label}</span>
            </button>
          );
        })}
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
