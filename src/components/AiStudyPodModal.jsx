import React, { useState, useEffect, useMemo } from "react";
import {
  Sparkles,
  Layers,
  BookOpen,
  Search,
  RotateCw,
  Clock,
  X,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Copy,
  Check,
  FileText,
  Zap,
  Shuffle,
  Filter,
  ExternalLink,
  ShieldCheck,
  HelpCircle,
  Eye,
} from "lucide-react";
import { api } from "../api";
import {
  getStudySessionHistory,
  addStudySessionItem,
} from "../utils/studentSessionHistory";
import MathMarkdown from "./MathMarkdown";
import GeminiIcon from "./GeminiIcon";

export default function AiStudyPodModal({
  isOpen,
  onClose,
  noteId,
  noteTitle = "Lecture Notes",
  subject = "",
  context = "",
  allNotes = [],
  onSelectNote,
  onOpenNote,
  isInsidePdf = false,
  isHomePage = false,
  initialTab = null,
  onOpenCircleSearch,
}) {
  const [activeTab, setActiveTab] = useState(
    initialTab || (isInsidePdf ? "flashcards" : (noteId ? "flashcards" : "search_notes"))
  );

  // Current Active Note State (can be switched via search)
  const [currentNoteId, setCurrentNoteId] = useState(noteId);
  const [currentTitle, setCurrentTitle] = useState(noteTitle);
  const [currentSubject, setCurrentSubject] = useState(subject);

  // Summary user-friendly filter states
  const [summarySectionFilter, setSummarySectionFilter] = useState("all");
  const [summaryKeywordSearch, setSummaryKeywordSearch] = useState("");

  // Sync initial tab and mode
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    } else if (isInsidePdf) {
      setActiveTab("flashcards");
    } else if (noteId) {
      setActiveTab("flashcards");
    } else {
      setActiveTab("search_notes");
    }
  }, [isOpen, initialTab, isInsidePdf, noteId]);

  // Flashcards state
  const [flashcards, setFlashcards] = useState([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [loadingCards, setLoadingCards] = useState(false);
  const [cardSource, setCardSource] = useState(null);
  const [masteredCards, setMasteredCards] = useState(new Set());

  // Summary state
  const [summary, setSummary] = useState("");
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summarySource, setSummarySource] = useState(null);
  const [copiedSummary, setCopiedSummary] = useState(false);

  // User-Friendly Filtered Summary Computation
  const displaySummary = useMemo(() => {
    if (!summary) return "";
    let content = summary;

    if (summarySectionFilter !== "all") {
      const sectionKeywords = {
        blueprint: ["blueprint", "chapter", "topic blueprint", "1."],
        concepts: ["core concepts", "crucial definitions", "definitions", "2."],
        formulas: ["formulas", "theorems", "laws", "3."],
        principles: ["mechanisms", "working principles", "principles", "4."],
        exam: ["semester exam", "exam questions", "top 5", "5."],
        cheatsheet: ["cheat-sheet", "rapid revision", "cheat sheet", "6."],
      };
      const targets = sectionKeywords[summarySectionFilter] || [];
      const sections = content.split(/(?=###\s+)/g);
      const matched = sections.filter((sec) =>
        targets.some((kw) => sec.toLowerCase().includes(kw))
      );
      if (matched.length > 0) {
        content = matched.join("\n\n");
      }
    }

    if (summaryKeywordSearch && summaryKeywordSearch.trim()) {
      const q = summaryKeywordSearch.trim().toLowerCase();
      const lines = content.split("\n");
      const matchedLines = lines.filter((line) =>
        line.toLowerCase().includes(q) || line.startsWith("###") || line.startsWith("**")
      );
      if (matchedLines.length > 0) {
        content = matchedLines.join("\n");
      }
    }

    return content;
  }, [summary, summarySectionFilter, summaryKeywordSearch]);

  // Notes Search & Filter state
  const [noteSearchQuery, setNoteSearchQuery] = useState("");
  const [fetchedNotes, setFetchedNotes] = useState(allNotes || []);

  // Session History (Scoped to active online login session)
  const [sessionHistory, setSessionHistory] = useState([]);

  // Sync props when note changes
  useEffect(() => {
    if (noteId) setCurrentNoteId(noteId);
    if (noteTitle) setCurrentTitle(noteTitle);
    if (subject) setCurrentSubject(subject);
  }, [noteId, noteTitle, subject]);

  // Load session history on mount & tab switch
  useEffect(() => {
    setSessionHistory(getStudySessionHistory());
  }, [isOpen, activeTab]);

  // Fetch all notes if not provided
  useEffect(() => {
    if (!allNotes || allNotes.length === 0) {
      api.getNotes?.()
        .then((res) => {
          if (Array.isArray(res)) setFetchedNotes(res);
          else if (res?.notes && Array.isArray(res.notes)) setFetchedNotes(res.notes);
        })
        .catch(() => {});
    } else {
      setFetchedNotes(allNotes);
    }
  }, [allNotes]);

  // Keyboard navigation for flashcards
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose();
      } else if (activeTab === "flashcards" && flashcards.length > 0) {
        if (e.key === "ArrowRight") handleNextCard();
        if (e.key === "ArrowLeft") handlePrevCard();
        if (e.key === " " && e.target.tagName !== "INPUT") {
          e.preventDefault();
          setIsFlipped((f) => !f);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, activeTab, flashcards.length]);

  // Auto-load flashcards when tab opens if not loaded
  useEffect(() => {
    if (isOpen && activeTab === "flashcards" && flashcards.length === 0 && !loadingCards) {
      handleGenerateFlashcards();
    }
    if (isOpen && activeTab === "summary" && !summary && !loadingSummary) {
      handleGenerateSummary();
    }
  }, [isOpen, activeTab, currentNoteId]);

  // Generate / Fetch Flashcards
  const handleGenerateFlashcards = async (forceFresh = false) => {
    setLoadingCards(true);
    setIsFlipped(false);
    try {
      const res = await api.getNoteFlashcards({
        noteId: currentNoteId,
        title: currentTitle,
        context,
        subject: currentSubject,
        forceFresh,
      });
      if (res && res.success && Array.isArray(res.flashcards)) {
        setFlashcards(res.flashcards);
        setCurrentCardIndex(0);
        setCardSource({
          cached: res.cached,
          provider: res.provider,
          model: res.model,
          latencyMs: res.latencyMs,
        });

        // Add to in-session history
        const updated = addStudySessionItem({
          type: "flashcard",
          title: currentTitle,
          noteId: currentNoteId,
          query: `Flashcards (${res.flashcards.length} cards)`,
          data: res.flashcards,
          provider: res.provider,
          model: res.model,
          cached: res.cached,
        });
        setSessionHistory(updated);
      }
    } catch (err) {
      console.warn("[STUDY-POD] Flashcard generation notice:", err.message);
    } finally {
      setLoadingCards(false);
    }
  };

  // Generate / Fetch Summary
  const handleGenerateSummary = async (forceFresh = false) => {
    setLoadingSummary(true);
    try {
      const res = await api.getNoteSummary({
        noteId: currentNoteId,
        title: currentTitle,
        context,
        subject: currentSubject,
        forceFresh,
      });
      if (res && res.success && res.summary) {
        setSummary(res.summary);
        setSummarySource({
          cached: res.cached,
          provider: res.provider,
          model: res.model,
          latencyMs: res.latencyMs,
        });

        // Add to in-session history
        const updated = addStudySessionItem({
          type: "summary",
          title: currentTitle,
          noteId: currentNoteId,
          query: "Executive Summary",
          data: res.summary,
          provider: res.provider,
          model: res.model,
          cached: res.cached,
        });
        setSessionHistory(updated);
      }
    } catch (err) {
      console.warn("[STUDY-POD] Summary generation notice:", err.message);
    } finally {
      setLoadingSummary(false);
    }
  };

  const handleNextCard = () => {
    if (flashcards.length === 0) return;
    setIsFlipped(false);
    setCurrentCardIndex((i) => (i + 1) % flashcards.length);
  };

  const handlePrevCard = () => {
    if (flashcards.length === 0) return;
    setIsFlipped(false);
    setCurrentCardIndex((i) => (i - 1 + flashcards.length) % flashcards.length);
  };

  const handleShuffleCards = () => {
    if (flashcards.length <= 1) return;
    const shuffled = [...flashcards].sort(() => Math.random() - 0.5);
    setFlashcards(shuffled);
    setCurrentCardIndex(0);
    setIsFlipped(false);
  };

  const handleToggleMastered = (idx) => {
    setMasteredCards((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleCopySummary = () => {
    if (!summary) return;
    navigator.clipboard.writeText(summary);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
  };

  // Filter notes in real time
  const filteredNotes = useMemo(() => {
    if (!noteSearchQuery.trim()) return fetchedNotes.slice(0, 30);
    const q = noteSearchQuery.toLowerCase().trim();
    return fetchedNotes
      .filter((n) => {
        const titleMatch = (n.title || "").toLowerCase().includes(q);
        const subjMatch = (n.subject || "").toLowerCase().includes(q);
        const branchMatch = (n.branch || "").toLowerCase().includes(q);
        const descMatch = (n.description || "").toLowerCase().includes(q);
        return titleMatch || subjMatch || branchMatch || descMatch;
      })
      .slice(0, 30);
  }, [fetchedNotes, noteSearchQuery]);

  // Switch context to a filtered note
  const handleSelectNoteFromSearch = (selected) => {
    if (!selected) return;
    setCurrentNoteId(selected.id || selected.noteId);
    setCurrentTitle(selected.title || "Selected Note");
    setCurrentSubject(selected.subject || "");
    setFlashcards([]);
    setSummary("");
    setCardSource(null);
    setSummarySource(null);
    setActiveTab("flashcards");
    if (onSelectNote) onSelectNote(selected);
  };

  if (!isOpen) return null;

  const currentCard = flashcards[currentCardIndex] || null;
  const isCardMastered = masteredCards.has(currentCardIndex);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 999999,
        background: "rgba(3, 7, 18, 0.78)",
        backdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "760px",
          height: "90vh",
          maxHeight: "820px",
          background: "#0b0f19",
          border: "1.5px solid rgba(139, 92, 246, 0.4)",
          borderRadius: "24px",
          boxShadow: "0 25px 60px rgba(0,0,0,0.9), 0 0 35px rgba(139, 92, 246, 0.25)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          color: "#fff",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ============================================================== */}
        {/* Header Bar                                                     */}
        {/* ============================================================== */}
        <div
          style={{
            padding: "16px 22px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "linear-gradient(135deg, rgba(139, 92, 246, 0.18), rgba(6, 182, 212, 0.12))",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "12px",
                background: "linear-gradient(135deg, #8b5cf6, #06b6d4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 14px rgba(139, 92, 246, 0.4)",
                flexShrink: 0,
              }}
            >
              <Sparkles size={20} color="#fff" />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#fff", letterSpacing: "-0.2px" }}>
                  AI Study Pod
                </h3>
                <span
                  style={{
                    fontSize: "0.68rem",
                    padding: "2px 7px",
                    borderRadius: "999px",
                    background: "rgba(52, 211, 153, 0.18)",
                    color: "#34d399",
                    fontWeight: 700,
                    border: "1px solid rgba(52, 211, 153, 0.3)",
                  }}
                >
                  ⚡ 0ms Turso Cache Active
                </span>
              </div>
              <p
                style={{
                  margin: "2px 0 0",
                  fontSize: "0.76rem",
                  color: "#94a3b8",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: "460px",
                }}
                title={currentTitle}
              >
                📄 {currentTitle} {currentSubject ? `• [${currentSubject}]` : ""}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: "rgba(255, 255, 255, 0.08)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              color: "#94a3b8",
              cursor: "pointer",
              borderRadius: "50%",
              width: "34px",
              height: "34px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s ease",
            }}
            title="Close popup"
          >
            <X size={18} />
          </button>
        </div>

        {/* ============================================================== */}
        {/* Navigation Tabs Pill Bar                                       */}
        {/* ============================================================== */}
        <div
          style={{
            padding: "10px 20px",
            background: "rgba(15, 23, 42, 0.7)",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            gap: "8px",
            overflowX: "auto",
          }}
        >
          {/* 🔍 Search & Filter Notes Tab (Shown on Home Page, Hidden inside PDF Reader) */}
          {!isInsidePdf && (
            <button
              type="button"
              onClick={() => setActiveTab("search_notes")}
              style={{
                background: activeTab === "search_notes" ? "linear-gradient(135deg, #f59e0b, #d97706)" : "rgba(255, 255, 255, 0.05)",
                color: activeTab === "search_notes" ? "#fff" : "var(--text-dim)",
                border: "none",
                borderRadius: "10px",
                padding: "7px 14px",
                fontSize: "0.78rem",
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                whiteSpace: "nowrap",
                transition: "all 0.2s ease",
              }}
            >
              <Filter size={14} />
              <span>🔍 Filter Notes ({fetchedNotes.length})</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTab("flashcards")}
            style={{
              background: activeTab === "flashcards" ? "linear-gradient(135deg, #8b5cf6, #6366f1)" : "rgba(255, 255, 255, 0.05)",
              color: activeTab === "flashcards" ? "#fff" : "var(--text-dim)",
              border: "none",
              borderRadius: "10px",
              padding: "7px 14px",
              fontSize: "0.78rem",
              fontWeight: 700,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              whiteSpace: "nowrap",
              transition: "all 0.2s ease",
            }}
          >
            <Layers size={14} />
            <span>🗂️ Flashcards ({flashcards.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("summary")}
            style={{
              background: activeTab === "summary" ? "linear-gradient(135deg, #0284c7, #06b6d4)" : "rgba(255, 255, 255, 0.05)",
              color: activeTab === "summary" ? "#fff" : "var(--text-dim)",
              border: "none",
              borderRadius: "10px",
              padding: "7px 14px",
              fontSize: "0.78rem",
              fontWeight: 700,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              whiteSpace: "nowrap",
              transition: "all 0.2s ease",
            }}
          >
            <FileText size={14} />
            <span>📄 Executive Summary</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("session_history")}
            style={{
              background: activeTab === "session_history" ? "linear-gradient(135deg, #10b981, #059669)" : "rgba(255, 255, 255, 0.05)",
              color: activeTab === "session_history" ? "#fff" : "var(--text-dim)",
              border: "none",
              borderRadius: "10px",
              padding: "7px 14px",
              fontSize: "0.78rem",
              fontWeight: 700,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              whiteSpace: "nowrap",
              transition: "all 0.2s ease",
            }}
          >
            <Clock size={14} />
            <span>🕒 Session History ({sessionHistory.length})</span>
          </button>

          {/* ⭕ Circle to Search & Visual AI Quick Launch */}
          {onOpenCircleSearch && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenCircleSearch();
              }}
              style={{
                background: "linear-gradient(135deg, rgba(2, 132, 199, 0.22), rgba(99, 102, 241, 0.22))",
                color: "#38bdf8",
                border: "1px solid rgba(56, 189, 248, 0.45)",
                borderRadius: "10px",
                padding: "7px 14px",
                fontSize: "0.78rem",
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                whiteSpace: "nowrap",
                transition: "all 0.2s ease",
              }}
              title="Open Circle to Search: Ask Question or Diagram with Gemini AI"
            >
              <GeminiIcon size={14} withRing />
              <span>Circle to Search</span>
            </button>
          )}
        </div>

        {/* ============================================================== */}
        {/* Tab Content Body                                               */}
        {/* ============================================================== */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
          {/* ============================================================ */}
          {/* TAB 1: 🗂️ REVISION FLASHCARDS                                  */}
          {/* ============================================================ */}
          {activeTab === "flashcards" && (
            <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: "16px" }}>
              {/* Card Header Sub-Bar */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
                    Card <strong>{flashcards.length > 0 ? currentCardIndex + 1 : 0}</strong> of{" "}
                    <strong>{flashcards.length}</strong>
                  </span>
                  {currentCard?.category && (
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: "6px",
                        fontSize: "0.68rem",
                        fontWeight: 700,
                        background: "rgba(139, 92, 246, 0.2)",
                        color: "#c4b5fd",
                      }}
                    >
                      {currentCard.category}
                    </span>
                  )}
                  {cardSource && (
                    <span
                      style={{
                        fontSize: "0.68rem",
                        color: cardSource.cached ? "#34d399" : "#38bdf8",
                        fontWeight: 600,
                      }}
                    >
                      {cardSource.cached ? "⚡ 0ms Turso Cache" : `⚡ Generated in ${cardSource.latencyMs}ms`}
                    </span>
                  )}
                </div>

                <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                  {onOpenNote && currentNoteId && (
                    <button
                      type="button"
                      onClick={() => {
                        const found = fetchedNotes.find((n) => (n.id || n.noteId) === currentNoteId);
                        if (found) onOpenNote(found);
                      }}
                      style={{
                        background: "rgba(16, 185, 129, 0.15)",
                        border: "1px solid rgba(16, 185, 129, 0.4)",
                        color: "#34d399",
                        borderRadius: "8px",
                        padding: "5px 10px",
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                      title="Open complete document in full Virtual PDF Reader"
                    >
                      <Eye size={12} />
                      <span>Read PDF</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleShuffleCards}
                    disabled={flashcards.length <= 1}
                    style={{
                      background: "rgba(255, 255, 255, 0.05)",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      color: "#94a3b8",
                      borderRadius: "8px",
                      padding: "5px 10px",
                      fontSize: "0.72rem",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <Shuffle size={12} />
                    <span>Shuffle</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleGenerateFlashcards(true)}
                    disabled={loadingCards}
                    style={{
                      background: "rgba(139, 92, 246, 0.15)",
                      border: "1px solid rgba(139, 92, 246, 0.35)",
                      color: "#c4b5fd",
                      borderRadius: "8px",
                      padding: "5px 10px",
                      fontSize: "0.72rem",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <RotateCw size={12} className={loadingCards ? "animate-spin" : ""} />
                    <span>Regenerate</span>
                  </button>
                </div>
              </div>

              {/* Main 3D Interactive Card View */}
              <div style={{ flex: 1, minHeight: "280px", display: "flex", flexDirection: "column" }}>
                {loadingCards ? (
                  <div
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "12px",
                      background: "rgba(15, 23, 42, 0.4)",
                      borderRadius: "16px",
                      border: "1px dashed rgba(255, 255, 255, 0.15)",
                    }}
                  >
                    <RotateCw size={28} className="animate-spin" color="#a78bfa" />
                    <div style={{ fontSize: "0.9rem", color: "#c4b5fd", fontWeight: 600 }}>
                      Synthesizing High-Yield Exam Flashcards...
                    </div>
                    <div style={{ fontSize: "0.74rem", color: "#94a3b8" }}>
                      Checking Turso 0ms Cache • Formatting Definitions &amp; Formulas
                    </div>
                  </div>
                ) : flashcards.length === 0 ? (
                  <div
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "14px",
                      background: "rgba(15, 23, 42, 0.4)",
                      borderRadius: "16px",
                      border: "1px dashed rgba(255, 255, 255, 0.15)",
                      padding: "30px",
                      textAlign: "center",
                    }}
                  >
                    <Layers size={36} color="#8b5cf6" />
                    <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#fff" }}>
                      Ready to generate Revision Flashcards
                    </div>
                    <p style={{ fontSize: "0.78rem", color: "#94a3b8", maxWidth: "420px", margin: 0 }}>
                      Extract key definitions, formulas, and high-yield questions for <strong>{currentTitle}</strong> in one click.
                    </p>
                    <button
                      type="button"
                      onClick={handleGenerateFlashcards}
                      className="btn-primary"
                      style={{
                        padding: "8px 18px",
                        fontSize: "0.82rem",
                        background: "linear-gradient(135deg, #8b5cf6, #6366f1)",
                        border: "none",
                        borderRadius: "10px",
                        color: "#fff",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      ⚡ Generate 8 Flashcards
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => setIsFlipped(!isFlipped)}
                    style={{
                      flex: 1,
                      borderRadius: "20px",
                      padding: "28px",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      position: "relative",
                      transition: "transform 0.25s ease, box-shadow 0.25s ease",
                      background: isFlipped
                        ? "linear-gradient(145deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.95))"
                        : "linear-gradient(145deg, rgba(88, 28, 135, 0.25), rgba(15, 23, 42, 0.95))",
                      border: isFlipped
                        ? "1.5px solid rgba(52, 211, 153, 0.5)"
                        : "1.5px solid rgba(139, 92, 246, 0.45)",
                      boxShadow: isFlipped
                        ? "0 12px 35px rgba(52, 211, 153, 0.15)"
                        : "0 12px 35px rgba(139, 92, 246, 0.15)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span
                        style={{
                          fontSize: "0.72rem",
                          fontWeight: 700,
                          padding: "3px 9px",
                          borderRadius: "8px",
                          background: isFlipped ? "rgba(52, 211, 153, 0.18)" : "rgba(139, 92, 246, 0.2)",
                          color: isFlipped ? "#34d399" : "#c4b5fd",
                        }}
                      >
                        {isFlipped ? "💡 SOLUTION / EXPLANATION" : "❓ EXAM CONCEPT / QUESTION"}
                      </span>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleMastered(currentCardIndex);
                        }}
                        style={{
                          background: isCardMastered ? "rgba(52, 211, 153, 0.2)" : "rgba(255, 255, 255, 0.05)",
                          border: isCardMastered ? "1px solid rgba(52, 211, 153, 0.4)" : "1px solid rgba(255, 255, 255, 0.1)",
                          color: isCardMastered ? "#34d399" : "#94a3b8",
                          borderRadius: "999px",
                          padding: "3px 10px",
                          fontSize: "0.7rem",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <CheckCircle2 size={12} />
                        <span>{isCardMastered ? "Mastered" : "Mark Mastered"}</span>
                      </button>
                    </div>

                    <div style={{ margin: "auto 0", padding: "16px 0", maxHeight: "300px", overflowY: "auto" }}>
                      <div
                        style={{
                          fontSize: isFlipped ? "1.05rem" : "1.15rem",
                          fontWeight: isFlipped ? 500 : 700,
                          lineHeight: 1.6,
                          color: isFlipped ? "#f1f5f9" : "#fff",
                        }}
                      >
                        <MathMarkdown content={isFlipped ? currentCard?.answer : currentCard?.question} />
                      </div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.72rem", color: "#94a3b8" }}>
                      <span>Tap card to {isFlipped ? "see question" : "reveal answer"}</span>
                      <span>(Spacebar / Click to flip)</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Navigation Controls Bar */}
              {flashcards.length > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={handlePrevCard}
                    style={{
                      background: "rgba(255, 255, 255, 0.08)",
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                      color: "#fff",
                      borderRadius: "12px",
                      padding: "10px 18px",
                      fontSize: "0.82rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <ChevronLeft size={16} />
                    <span>Previous</span>
                  </button>

                  <div style={{ fontSize: "0.78rem", color: "#94a3b8" }}>
                    Mastered: <strong style={{ color: "#34d399" }}>{masteredCards.size}</strong> / {flashcards.length}
                  </div>

                  <button
                    type="button"
                    onClick={handleNextCard}
                    style={{
                      background: "linear-gradient(135deg, #8b5cf6, #6366f1)",
                      border: "none",
                      color: "#fff",
                      borderRadius: "12px",
                      padding: "10px 22px",
                      fontSize: "0.82rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      boxShadow: "0 4px 14px rgba(139, 92, 246, 0.4)",
                    }}
                  >
                    <span>Next Card</span>
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ============================================================ */}
          {/* TAB 2: 📄 EXECUTIVE SUMMARY                                    */}
          {/* ============================================================ */}
          {activeTab === "summary" && (
            <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "#fff" }}>
                    Executive Exam Summary
                  </h4>
                  <p style={{ margin: "2px 0 0", fontSize: "0.74rem", color: "#94a3b8" }}>
                    {summarySource?.cached ? "⚡ 0ms Turso Cache Hit (0 Tokens Burned)" : "Cloud AI Synthesized from Full PDF OCR"}
                  </p>
                </div>

                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {onOpenNote && currentNoteId && (
                    <button
                      type="button"
                      onClick={() => {
                        const found = fetchedNotes.find((n) => (n.id || n.noteId) === currentNoteId);
                        if (found) onOpenNote(found);
                      }}
                      style={{
                        background: "rgba(16, 185, 129, 0.15)",
                        border: "1px solid rgba(16, 185, 129, 0.4)",
                        color: "#34d399",
                        borderRadius: "8px",
                        padding: "6px 12px",
                        fontSize: "0.74rem",
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                      }}
                    >
                      <Eye size={13} />
                      <span>Read PDF</span>
                    </button>
                  )}
                  {summary && (
                    <button
                      type="button"
                      onClick={handleCopySummary}
                      style={{
                        background: copiedSummary ? "rgba(52, 211, 153, 0.2)" : "rgba(255, 255, 255, 0.06)",
                        border: copiedSummary ? "1px solid rgba(52, 211, 153, 0.4)" : "1px solid rgba(255, 255, 255, 0.12)",
                        color: copiedSummary ? "#34d399" : "#fff",
                        borderRadius: "8px",
                        padding: "6px 12px",
                        fontSize: "0.74rem",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                      }}
                    >
                      {copiedSummary ? <Check size={13} /> : <Copy size={13} />}
                      <span>{copiedSummary ? "Copied!" : "Copy Summary"}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleGenerateSummary(true)}
                    disabled={loadingSummary}
                    style={{
                      background: "rgba(2, 132, 199, 0.15)",
                      border: "1px solid rgba(2, 132, 199, 0.35)",
                      color: "#38bdf8",
                      borderRadius: "8px",
                      padding: "6px 12px",
                      fontSize: "0.74rem",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <RotateCw size={12} className={loadingSummary ? "animate-spin" : ""} />
                    <span>Regenerate</span>
                  </button>
                </div>
              </div>

              {/* 🌟 User-Friendly Interactive Sub-Toolbar for Summary */}
              {summary && !loadingSummary && (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", background: "rgba(0, 0, 0, 0.25)", padding: "10px 14px", borderRadius: "12px", border: "1px solid rgba(255, 255, 255, 0.06)" }}>
                  <div style={{ display: "flex", gap: "6px", overflowX: "auto", paddingBottom: "2px" }}>
                    {[
                      { id: "all", label: "🌟 All Sections" },
                      { id: "blueprint", label: "🎯 1. Blueprint" },
                      { id: "concepts", label: "📌 2. Core Concepts" },
                      { id: "formulas", label: "⚡ 3. Formulas & Laws" },
                      { id: "principles", label: "📝 4. Principles" },
                      { id: "exam", label: "🏆 5. Top 5 Exam Qs" },
                      { id: "cheatsheet", label: "💡 6. Rapid Cheat-Sheet" },
                    ].map((sec) => (
                      <button
                        key={sec.id}
                        type="button"
                        onClick={() => setSummarySectionFilter(sec.id)}
                        style={{
                          padding: "4px 10px",
                          borderRadius: "999px",
                          fontSize: "0.72rem",
                          fontWeight: 700,
                          border: summarySectionFilter === sec.id ? "1px solid #38bdf8" : "1px solid rgba(255, 255, 255, 0.1)",
                          background: summarySectionFilter === sec.id ? "rgba(56, 189, 248, 0.2)" : "rgba(255, 255, 255, 0.04)",
                          color: summarySectionFilter === sec.id ? "#38bdf8" : "#94a3b8",
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                          transition: "all 0.15s ease",
                        }}
                      >
                        {sec.label}
                      </button>
                    ))}
                  </div>

                  {/* Quick keyword filter inside summary */}
                  <div style={{ position: "relative" }}>
                    <Search size={13} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#64748b" }} />
                    <input
                      type="text"
                      value={summaryKeywordSearch}
                      onChange={(e) => setSummaryKeywordSearch(e.target.value)}
                      placeholder="Quick filter within summary (e.g. 'voltage', 'Bernoulli', 'formula')..."
                      style={{
                        width: "100%",
                        padding: "5px 10px 5px 30px",
                        fontSize: "0.75rem",
                        background: "rgba(0, 0, 0, 0.3)",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        borderRadius: "6px",
                        color: "#fff",
                      }}
                    />
                    {summaryKeywordSearch && (
                      <button
                        type="button"
                        onClick={() => setSummaryKeywordSearch("")}
                        style={{
                          position: "absolute",
                          right: "8px",
                          top: "50%",
                          transform: "translateY(-50%)",
                          background: "none",
                          border: "none",
                          color: "#94a3b8",
                          cursor: "pointer",
                          fontSize: "0.75rem",
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              )}

              {loadingSummary ? (
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "12px",
                    background: "rgba(15, 23, 42, 0.4)",
                    borderRadius: "16px",
                    border: "1px dashed rgba(255, 255, 255, 0.15)",
                  }}
                >
                  <RotateCw size={28} className="animate-spin" color="#38bdf8" />
                  <div style={{ fontSize: "0.9rem", color: "#38bdf8", fontWeight: 600 }}>
                    Synthesizing Executive Exam Summary...
                  </div>
                  <div style={{ fontSize: "0.74rem", color: "#94a3b8" }}>
                    Extracting Core Bullet Points, Theorems &amp; Formulas
                  </div>
                </div>
              ) : !summary ? (
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "14px",
                    background: "rgba(15, 23, 42, 0.4)",
                    borderRadius: "16px",
                    border: "1px dashed rgba(255, 255, 255, 0.15)",
                    padding: "30px",
                    textAlign: "center",
                  }}
                >
                  <FileText size={36} color="#0284c7" />
                  <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#fff" }}>
                    Generate Executive Summary
                  </div>
                  <p style={{ fontSize: "0.78rem", color: "#94a3b8", maxWidth: "420px", margin: 0 }}>
                    Get a concise, exam-focused synthesis of <strong>{currentTitle}</strong> highlighting key theorems and formulas.
                  </p>
                  <button
                    type="button"
                    onClick={handleGenerateSummary}
                    className="btn-primary"
                    style={{
                      padding: "8px 18px",
                      fontSize: "0.82rem",
                      background: "linear-gradient(135deg, #0284c7, #06b6d4)",
                      border: "none",
                      borderRadius: "10px",
                      color: "#fff",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    ⚡ Generate Summary
                  </button>
                </div>
              ) : (
                <div
                  style={{
                    flex: 1,
                    background: "rgba(15, 23, 42, 0.6)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: "16px",
                    padding: "20px",
                    overflowY: "auto",
                  }}
                >
                  <MathMarkdown content={displaySummary} />
                </div>
              )}
            </div>
          )}

          {/* ============================================================ */}
          {/* TAB 3: 🔍 FILTER & SEARCH NOTES                                */}
          {/* ============================================================ */}
          {activeTab === "search_notes" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px", height: "100%" }}>
              {/* Search input */}
              <div style={{ position: "relative" }}>
                <Search size={16} style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)" }} />
                <input
                  type="text"
                  value={noteSearchQuery}
                  onChange={(e) => setNoteSearchQuery(e.target.value)}
                  placeholder="Type to filter notes by title, subject, branch, or keywords..."
                  style={{
                    width: "100%",
                    padding: "10px 14px 10px 40px",
                    fontSize: "0.82rem",
                    borderRadius: "12px",
                    border: "1px solid rgba(245, 158, 11, 0.3)",
                    background: "rgba(0, 0, 0, 0.35)",
                    color: "#fff",
                  }}
                  autoFocus
                />
              </div>

              <div style={{ fontSize: "0.74rem", color: "#94a3b8" }}>
                Found <strong>{filteredNotes.length}</strong> matching notes: Click any note to instantly load its Flashcards &amp; Summary.
              </div>

              {/* Filtered Notes List */}
              <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
                {filteredNotes.length === 0 ? (
                  <div style={{ padding: "30px", textAlign: "center", color: "#94a3b8", fontSize: "0.82rem" }}>
                    No notes matched your search query. Try another keyword.
                  </div>
                ) : (
                  filteredNotes.map((n) => {
                    const isSelected = (n.id || n.noteId) === currentNoteId;
                    return (
                      <div
                        key={n.id || n.noteId}
                        onClick={() => handleSelectNoteFromSearch(n)}
                        style={{
                          padding: "12px 16px",
                          borderRadius: "12px",
                          background: isSelected ? "rgba(245, 158, 11, 0.15)" : "rgba(255, 255, 255, 0.03)",
                          border: isSelected ? "1.5px solid #f59e0b" : "1px solid rgba(255, 255, 255, 0.06)",
                          cursor: "pointer",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: "0.86rem", color: isSelected ? "#fbbf24" : "#f8fafc" }}>
                            📄 {n.title}
                          </div>
                          <div style={{ display: "flex", gap: "8px", fontSize: "0.7rem", color: "#94a3b8", marginTop: "3px" }}>
                            {n.subject && <span>📚 {n.subject}</span>}
                            {n.branch && <span>🎓 {n.branch}</span>}
                            {n.semester && <span>Sem {n.semester}</span>}
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: "6px", flexShrink: 0, flexWrap: "wrap", alignItems: "center" }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectNoteFromSearch(n);
                              setActiveTab("flashcards");
                            }}
                            style={{
                              background: "rgba(139, 92, 246, 0.2)",
                              border: "1px solid rgba(139, 92, 246, 0.45)",
                              color: "#c4b5fd",
                              borderRadius: "8px",
                              padding: "6px 10px",
                              fontSize: "0.72rem",
                              fontWeight: 700,
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                            title="Generate & view instant exam flashcards for this note"
                          >
                            <Layers size={12} />
                            <span>Flashcards</span>
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectNoteFromSearch(n);
                              setActiveTab("summary");
                            }}
                            style={{
                              background: "rgba(2, 132, 199, 0.2)",
                              border: "1px solid rgba(2, 132, 199, 0.45)",
                              color: "#38bdf8",
                              borderRadius: "8px",
                              padding: "6px 10px",
                              fontSize: "0.72rem",
                              fontWeight: 700,
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                            title="Generate & view full structured executive summary for this note"
                          >
                            <FileText size={12} />
                            <span>Summary</span>
                          </button>

                          {onOpenNote && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenNote(n);
                              }}
                              style={{
                                background: "rgba(16, 185, 129, 0.18)",
                                border: "1px solid rgba(16, 185, 129, 0.45)",
                                color: "#34d399",
                                borderRadius: "8px",
                                padding: "6px 10px",
                                fontSize: "0.72rem",
                                fontWeight: 700,
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                              title="Open this complete document in the full Virtual PDF Reader"
                            >
                              <Eye size={12} />
                              <span>Read PDF</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* TAB 4: 🕒 SESSION HISTORY (Online login session-scoped)        */}
          {/* ============================================================ */}
          {activeTab === "session_history" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", height: "100%" }}>
              <div
                style={{
                  padding: "10px 14px",
                  background: "rgba(16, 185, 129, 0.1)",
                  border: "1px solid rgba(16, 185, 129, 0.25)",
                  borderRadius: "10px",
                  fontSize: "0.74rem",
                  color: "#34d399",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <ShieldCheck size={16} />
                <span>
                  <strong>Active Session Scoped:</strong> History is preserved only while you are logged in. Logging out or logging in on a new session automatically resets this history.
                </span>
              </div>

              <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
                {sessionHistory.length === 0 ? (
                  <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8", fontSize: "0.82rem" }}>
                    No AI queries or flashcards generated in this session yet. Generate cards or summary above to see your session history here.
                  </div>
                ) : (
                  sessionHistory.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        padding: "12px 16px",
                        background: "rgba(255, 255, 255, 0.03)",
                        border: "1px solid rgba(255, 255, 255, 0.06)",
                        borderRadius: "12px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span
                            style={{
                              fontSize: "0.68rem",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              background: item.type === "flashcard" ? "rgba(139, 92, 246, 0.2)" : (item.type === "summary" ? "rgba(2, 132, 199, 0.2)" : "rgba(245, 158, 11, 0.2)"),
                              color: item.type === "flashcard" ? "#c4b5fd" : (item.type === "summary" ? "#38bdf8" : "#fbbf24"),
                              fontWeight: 700,
                            }}
                          >
                            {String(item.type).toUpperCase()}
                          </span>
                          <strong style={{ fontSize: "0.82rem", color: "#f8fafc" }}>{item.title}</strong>
                        </div>
                        <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: "3px" }}>
                          {item.query} • {new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          if (item.type === "flashcard" && Array.isArray(item.data)) {
                            setFlashcards(item.data);
                            setCurrentCardIndex(0);
                            setCurrentTitle(item.title);
                            setActiveTab("flashcards");
                          } else if (item.type === "summary" && typeof item.data === "string") {
                            setSummary(item.data);
                            setCurrentTitle(item.title);
                            setActiveTab("summary");
                          }
                        }}
                        style={{
                          background: "rgba(255, 255, 255, 0.08)",
                          color: "#fff",
                          border: "none",
                          borderRadius: "8px",
                          padding: "5px 12px",
                          fontSize: "0.72rem",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Reopen
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

