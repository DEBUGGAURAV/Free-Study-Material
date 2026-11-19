import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Search,
  X,
  FileText,
  Sparkles,
  CornerDownLeft,
  Flame,
  UploadCloud,
  CheckCircle2,
} from "lucide-react";

export default function SpotlightModal({
  isOpen,
  onClose,
  notes = [],
  onPreview,
  onOpenAiStudyPod,
  onOpenCircleSearch,
  onOpenSwipeToRevise,
  onOpenUpload,
  currentUser,
}) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Auto-focus input when opened & reset state
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 50);
    }
  }, [isOpen]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  // Instant in-memory search match
  const filteredNotes = useMemo(() => {
    if (!notes || notes.length === 0) return [];
    const q = query.trim().toLowerCase();
    if (!q) {
      // Top 5 recommended or newest notes when query is empty
      return notes.slice(0, 5);
    }
    return notes
      .filter((n) => {
        const title = (n.title || "").toLowerCase();
        const subject = (n.subject || "").toLowerCase();
        const branch = (n.branch || "").toLowerCase();
        const tags = Array.isArray(n.tags) ? n.tags.join(" ").toLowerCase() : "";
        const desc = (n.description || "").toLowerCase();
        return (
          title.includes(q) ||
          subject.includes(q) ||
          branch.includes(q) ||
          tags.includes(q) ||
          desc.includes(q)
        );
      })
      .slice(0, 8);
  }, [notes, query]);

  // Quick Action items when no query or matching AI
  const quickActions = useMemo(() => {
    const actions = [];
    if (query.trim()) {
      actions.push({
        id: "action-ai-query",
        type: "action",
        title: `✨ Ask AI Doubt Solver about "${query.trim()}"`,
        subtitle: "Instant AI derivation, step-by-step solution & explanation",
        icon: <Sparkles size={16} color="#9333ea" />,
        badge: "AI SOLVER",
        badgeColor: "#9333ea",
        run: () => {
          if (onOpenAiStudyPod) onOpenAiStudyPod("chat", null, query.trim());
          onClose();
        },
      });
    }

    if (!query.trim()) {
      actions.push({
        id: "action-swipe",
        type: "action",
        title: "🔥 Swipe to Revise (Interactive Flashcards)",
        subtitle: "Tinder-style quick swipe revision deck for your branch",
        icon: <Flame size={16} color="#f59e0b" />,
        badge: "REVISION",
        badgeColor: "#f59e0b",
        run: () => {
          if (onOpenSwipeToRevise) onOpenSwipeToRevise();
          onClose();
        },
      });
      actions.push({
        id: "action-circle",
        type: "action",
        title: "⭕ Circle to Search & Solve with Gemini",
        subtitle: "Circle any question or formula on screen for instant AI solution",
        icon: <Sparkles size={16} color="#0284c7" />,
        badge: "GEMINI AI",
        badgeColor: "#0284c7",
        run: () => {
          if (onOpenCircleSearch) onOpenCircleSearch();
          onClose();
        },
      });
      if (onOpenUpload) {
        actions.push({
          id: "action-upload",
          type: "action",
          title: "📤 Upload Notes & PYQs to Vault",
          subtitle: "Contribute study materials to the campus academic cloud",
          icon: <UploadCloud size={16} color="#10b981" />,
          badge: "UPLOAD",
          badgeColor: "#10b981",
          run: () => {
            onOpenUpload();
            onClose();
          },
        });
      }
    }
    return actions;
  }, [query, onOpenAiStudyPod, onOpenCircleSearch, onOpenSwipeToRevise, onOpenUpload, onClose]);

  // Combined selectable list: Notes + Actions
  const combinedItems = useMemo(() => {
    return [
      ...filteredNotes.map((n) => ({ ...n, _itemType: "note" })),
      ...quickActions.map((a) => ({ ...a, _itemType: "action" })),
    ];
  }, [filteredNotes, quickActions]);

  // Keep selected index in bounds when list changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Keyboard navigation: ArrowUp, ArrowDown, Enter, Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (combinedItems.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % combinedItems.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + combinedItems.length) % combinedItems.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const selected = combinedItems[selectedIndex];
        if (selected) {
          if (selected._itemType === "action" && typeof selected.run === "function") {
            selected.run();
          } else if (selected._itemType === "note") {
            if (onPreview) onPreview(selected);
            onClose();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, combinedItems, selectedIndex, onPreview, onClose]);

  // Scroll selected item into view smoothly
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.querySelector(".spotlight-item.active");
      if (activeEl) {
        activeEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div
      className="spotlight-overlay"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        zIndex: 999999,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "clamp(40px, 10vh, 100px)",
        paddingLeft: "14px",
        paddingRight: "14px",
        animation: "spotlightFadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      {/* Centered Floating Palette Modal Card */}
      <div
        className="spotlight-dialog"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "580px",
          background: "#ffffff",
          borderRadius: "20px",
          border: "1.5px solid rgba(226, 232, 240, 0.9)",
          boxShadow:
            "0 25px 60px -15px rgba(15, 23, 42, 0.35), 0 0 0 1px rgba(99, 102, 241, 0.12), 0 10px 24px -5px rgba(0, 0, 0, 0.08)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          maxHeight: "min(680px, 82vh)",
          animation: "spotlightScaleUp 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Search Header Bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "14px 18px",
            borderBottom: "1.5px solid #f1f5f9",
            background: "#ffffff",
          }}
        >
          <div
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "8px",
              background: "linear-gradient(135deg, #4f46e5, #06b6d4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
              flexShrink: 0,
              boxShadow: "0 2px 8px rgba(79, 70, 229, 0.3)",
            }}
          >
            <Search size={16} strokeWidth={2.4} />
          </div>

          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes, subjects, branch, PYQs..."
            style={{
              width: "100%",
              background: "transparent",
              border: "none",
              outline: "none",
              fontSize: "0.95rem",
              fontWeight: 600,
              color: "#0f172a",
            }}
          />

          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                if (inputRef.current) inputRef.current.focus();
              }}
              style={{
                background: "#f1f5f9",
                border: "none",
                borderRadius: "50%",
                width: "22px",
                height: "22px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#64748b",
                cursor: "pointer",
                flexShrink: 0,
              }}
              title="Clear search"
            >
              <X size={12} strokeWidth={2.5} />
            </button>
          )}

          <kbd
            onClick={onClose}
            title="Press Esc to close"
            style={{
              padding: "3px 7px",
              borderRadius: "6px",
              background: "#f1f5f9",
              border: "1px solid #cbd5e1",
              color: "#64748b",
              fontSize: "0.68rem",
              fontWeight: 800,
              fontFamily: "monospace",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            ESC
          </kbd>
        </div>

        {/* Results Body */}
        <div
          ref={listRef}
          style={{
            overflowY: "auto",
            padding: "10px",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          {/* Section Heading */}
          <div
            style={{
              padding: "4px 8px 8px",
              fontSize: "0.68rem",
              fontWeight: 800,
              letterSpacing: "0.08em",
              color: "#64748b",
              textTransform: "uppercase",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>
              {query.trim()
                ? `Search Results (${filteredNotes.length})`
                : "⚡ Recommended Study Materials"}
            </span>
            <span style={{ fontSize: "0.64rem", color: "#94a3b8", fontWeight: 600 }}>
              Use ↑ ↓ to navigate
            </span>
          </div>

          {/* Notes List */}
          {filteredNotes.map((note, index) => {
            const isSelected = selectedIndex === index;
            return (
              <div
                key={note.id || index}
                className={`spotlight-item ${isSelected ? "active" : ""}`}
                onClick={() => {
                  if (onPreview) onPreview(note);
                  onClose();
                }}
                onMouseEnter={() => setSelectedIndex(index)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                  padding: "10px 12px",
                  borderRadius: "12px",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  background: isSelected ? "rgba(99, 102, 241, 0.08)" : "#ffffff",
                  border: isSelected
                    ? "1px solid rgba(99, 102, 241, 0.35)"
                    : "1px solid transparent",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      width: "34px",
                      height: "34px",
                      borderRadius: "9px",
                      background: isSelected ? "#4f46e5" : "#eff6ff",
                      color: isSelected ? "#ffffff" : "#4f46e5",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      transition: "all 0.15s ease",
                    }}
                  >
                    <FileText size={17} strokeWidth={2.2} />
                  </div>

                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontWeight: 750,
                        fontSize: "0.85rem",
                        color: isSelected ? "#1e1b4b" : "#0f172a",
                        textOverflow: "ellipsis",
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {note.title}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        marginTop: "3px",
                        fontSize: "0.68rem",
                        flexWrap: "wrap",
                      }}
                    >
                      {note.subject && (
                        <span
                          style={{
                            background: isSelected ? "rgba(79, 70, 229, 0.15)" : "#eff6ff",
                            color: "#3730a3",
                            padding: "1px 6px",
                            borderRadius: "4px",
                            fontWeight: 700,
                          }}
                        >
                          {note.subject}
                        </span>
                      )}
                      {note.branch && (
                        <span style={{ color: "#64748b", fontWeight: 600 }}>• {note.branch}</span>
                      )}
                      {note.year && (
                        <span style={{ color: "#64748b" }}>• {note.year}</span>
                      )}
                      <span
                        style={{
                          color: "#059669",
                          fontWeight: 700,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "3px",
                        }}
                      >
                        <CheckCircle2 size={10} /> Verified PDF
                      </span>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    padding: "5px 10px",
                    borderRadius: "8px",
                    background: isSelected ? "#4f46e5" : "#f1f5f9",
                    color: isSelected ? "#ffffff" : "#475569",
                    fontSize: "0.72rem",
                    fontWeight: 750,
                    flexShrink: 0,
                    transition: "all 0.15s ease",
                    boxShadow: isSelected ? "0 2px 8px rgba(79, 70, 229, 0.3)" : "none",
                  }}
                >
                  <span>Open</span>
                  <CornerDownLeft size={11} strokeWidth={2.4} />
                </div>
              </div>
            );
          })}

          {filteredNotes.length === 0 && (
            <div
              style={{
                padding: "24px 16px",
                textAlign: "center",
                color: "#64748b",
                fontSize: "0.82rem",
              }}
            >
              No notes found matching "{query}". Try checking another branch or search term.
            </div>
          )}

          {/* Quick Actions / AI Section */}
          {quickActions.length > 0 && (
            <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1.5px solid #f1f5f9" }}>
              <div
                style={{
                  padding: "4px 8px 6px",
                  fontSize: "0.68rem",
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                  color: "#64748b",
                  textTransform: "uppercase",
                }}
              >
                Quick Actions & AI
              </div>

              {quickActions.map((action, aIdx) => {
                const itemIndex = filteredNotes.length + aIdx;
                const isSelected = selectedIndex === itemIndex;
                return (
                  <div
                    key={action.id}
                    className={`spotlight-item ${isSelected ? "active" : ""}`}
                    onClick={() => {
                      if (typeof action.run === "function") action.run();
                    }}
                    onMouseEnter={() => setSelectedIndex(itemIndex)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "10px",
                      padding: "10px 12px",
                      borderRadius: "12px",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      background: isSelected
                        ? "linear-gradient(135deg, rgba(147, 51, 234, 0.1), rgba(79, 70, 229, 0.08))"
                        : "#fbfbfe",
                      border: isSelected
                        ? "1px solid rgba(147, 51, 234, 0.4)"
                        : "1px solid #f1f5f9",
                      marginTop: "4px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          width: "32px",
                          height: "32px",
                          borderRadius: "8px",
                          background: "#f3e8ff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {action.icon}
                      </div>

                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontWeight: 750,
                            fontSize: "0.82rem",
                            color: isSelected ? "#581c87" : "#0f172a",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {action.title}
                        </div>
                        <div style={{ fontSize: "0.68rem", color: "#64748b", marginTop: "2px" }}>
                          {action.subtitle}
                        </div>
                      </div>
                    </div>

                    <span
                      style={{
                        padding: "3px 8px",
                        borderRadius: "6px",
                        background: action.badgeColor || "#9333ea",
                        color: "#ffffff",
                        fontSize: "0.65rem",
                        fontWeight: 800,
                        flexShrink: 0,
                      }}
                    >
                      {action.badge}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Shortcut Bar */}
        <div
          style={{
            padding: "8px 16px",
            background: "#f8fafc",
            borderTop: "1.5px solid #f1f5f9",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "0.7rem",
            color: "#64748b",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <kbd style={{ padding: "1px 5px", background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "4px", fontSize: "0.64rem", fontFamily: "monospace" }}>↑</kbd>
              <kbd style={{ padding: "1px 5px", background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "4px", fontSize: "0.64rem", fontFamily: "monospace" }}>↓</kbd>
              <span>navigate</span>
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <kbd style={{ padding: "1px 5px", background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "4px", fontSize: "0.64rem", fontFamily: "monospace" }}>↵</kbd>
              <span>open</span>
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <kbd style={{ padding: "1px 5px", background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "4px", fontSize: "0.64rem", fontFamily: "monospace" }}>esc</kbd>
              <span>close</span>
            </span>
          </div>

          <span style={{ fontSize: "0.66rem", color: "#94a3b8", fontWeight: 600 }}>
            ⚡ Instant Spotlight Search
          </span>
        </div>
      </div>
    </div>
  );
}
