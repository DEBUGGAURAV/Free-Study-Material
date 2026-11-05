import React, { useState, useEffect } from "react";
import { X, Search, Sparkles, Copy, Check, ExternalLink, Zap, BookOpen, Layers } from "lucide-react";
import { solveCircleQuery } from "../utils/circleSearchEngine";

export default function CircleSearchModal({
  isOpen,
  onClose,
  circleData, // { text, source, croppedImage, bounds, noteId, subject }
  onOpenNote,
  allNotes = [],
}) {
  const [activeTab, setActiveTab] = useState("ai"); // 'ai' | 'notes'
  const [queryText, setQueryText] = useState("");
  const [isSolving, setIsSolving] = useState(false);
  const [solveStatus, setSolveStatus] = useState("");
  const [solution, setSolution] = useState(null);
  const [copied, setCopied] = useState(false);
  const [matchingNotes, setMatchingNotes] = useState([]);
  const [isEditingQuery, setIsEditingQuery] = useState(false);

  useEffect(() => {
    if (circleData && circleData.text) {
      setQueryText(circleData.text);
      setSolution(null);
      setIsEditingQuery(false);
      handleAutoSolve(circleData.text);
      findMatchingNotes(circleData.text);
    }
  }, [circleData]);

  const handleAutoSolve = async (textToSolve) => {
    if (!textToSolve || !textToSolve.trim()) return;
    setIsSolving(true);
    setSolveStatus("Analyzing circled question...");
    try {
      const res = await solveCircleQuery({
        query: textToSolve,
        context: circleData?.context || "",
        noteId: circleData?.noteId || "",
        subject: circleData?.subject || "",
        onProgress: (status) => setSolveStatus(status),
      });
      setSolution(res);
    } catch (err) {
      setSolution({
        answer: `⚠️ Could not generate automated solution: ${err.message}. You can search in your notes vault directly.`,
        provider: "error",
      });
    } finally {
      setIsSolving(false);
      setSolveStatus("");
    }
  };

  const findMatchingNotes = (text) => {
    if (!text || !Array.isArray(allNotes) || allNotes.length === 0) return;
    const words = text.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    if (words.length === 0) {
      setMatchingNotes(allNotes.slice(0, 5));
      return;
    }
    const scored = allNotes.map((n) => {
      let score = 0;
      const title = (n.title || "").toLowerCase();
      const subj = (n.subject || "").toLowerCase();
      const desc = (n.description || "").toLowerCase();
      const ocr = (n.ocrText || "").toLowerCase();

      words.forEach((w) => {
        if (title.includes(w)) score += 5;
        if (subj.includes(w)) score += 4;
        if (desc.includes(w)) score += 2;
        if (ocr.includes(w)) score += 3;
      });
      return { note: n, score };
    });

    const filtered = scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((s) => s.note);

    setMatchingNotes(filtered.length > 0 ? filtered : allNotes.slice(0, 4));
  };

  const handleCopy = () => {
    if (!solution?.answer) return;
    navigator.clipboard.writeText(solution.answer);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen || !circleData) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        background: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(8px)",
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
          maxWidth: "680px",
          maxHeight: "90vh",
          background: "#0f172a",
          border: "1.5px solid rgba(56, 189, 248, 0.4)",
          borderRadius: "20px",
          boxShadow: "0 25px 60px rgba(0,0,0,0.85), 0 0 35px rgba(56, 189, 248, 0.2)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          color: "#fff",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "linear-gradient(135deg, rgba(2, 132, 199, 0.15), rgba(99, 102, 241, 0.15))",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                background: "linear-gradient(135deg, #0284c7, #6366f1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 2px 10px rgba(2, 132, 199, 0.4)",
              }}
            >
              <Sparkles size={18} color="#fff" />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "#f8fafc", letterSpacing: "-0.2px" }}>
                Circle to Search &amp; Solve
              </div>
              <div style={{ fontSize: "0.74rem", color: "#94a3b8" }}>
                Zero-Load Visual AI • Turso Multi-Tier Cache
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255, 255, 255, 0.08)",
              border: "none",
              color: "#94a3b8",
              cursor: "pointer",
              borderRadius: "50%",
              width: "32px",
              height: "32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "0.2s",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Circled Region Snippet */}
        <div
          style={{
            padding: "14px 20px",
            background: "rgba(15, 23, 42, 0.6)",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            alignItems: "center",
            gap: "14px",
          }}
        >
          {circleData.croppedImage && (
            <div
              style={{
                width: "80px",
                height: "60px",
                borderRadius: "10px",
                overflow: "hidden",
                border: "1px solid rgba(56, 189, 248, 0.3)",
                background: "#fff",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <img
                src={circleData.croppedImage}
                alt="Circled Snippet"
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            </div>
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <span
                style={{
                  fontSize: "0.68rem",
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: "12px",
                  background:
                    circleData.source === "text-layer"
                      ? "rgba(16, 185, 129, 0.2)"
                      : "rgba(245, 158, 11, 0.2)",
                  color: circleData.source === "text-layer" ? "#34d399" : "#fbbf24",
                  border: `1px solid ${circleData.source === "text-layer" ? "rgba(16, 185, 129, 0.4)" : "rgba(245, 158, 11, 0.4)"}`,
                }}
              >
                {circleData.source === "text-layer" ? "⚡ 0ms Text Layer (Instant)" : "🔍 Client Tesseract WASM"}
              </span>
              <button
                onClick={() => setIsEditingQuery(!isEditingQuery)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#38bdf8",
                  fontSize: "0.72rem",
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                {isEditingQuery ? "Done" : "Edit Text"}
              </button>
            </div>

            {isEditingQuery ? (
              <div style={{ display: "flex", gap: "6px" }}>
                <input
                  type="text"
                  value={queryText}
                  onChange={(e) => setQueryText(e.target.value)}
                  style={{
                    flex: 1,
                    background: "rgba(0, 0, 0, 0.4)",
                    border: "1px solid rgba(56, 189, 248, 0.4)",
                    color: "#fff",
                    borderRadius: "6px",
                    padding: "4px 8px",
                    fontSize: "0.82rem",
                  }}
                />
                <button
                  onClick={() => {
                    setIsEditingQuery(false);
                    handleAutoSolve(queryText);
                    findMatchingNotes(queryText);
                  }}
                  style={{
                    background: "#0284c7",
                    border: "none",
                    color: "#fff",
                    borderRadius: "6px",
                    padding: "4px 10px",
                    fontSize: "0.75rem",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  Solve
                </button>
              </div>
            ) : (
              <div
                style={{
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  color: "#e2e8f0",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={queryText}
              >
                {queryText || "Recognizing text from circled region..."}
              </div>
            )}
          </div>
        </div>

        {/* Tab Switcher */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            background: "rgba(10, 15, 30, 0.5)",
          }}
        >
          <button
            onClick={() => setActiveTab("ai")}
            style={{
              flex: 1,
              padding: "10px",
              background: activeTab === "ai" ? "rgba(56, 189, 248, 0.12)" : "transparent",
              border: "none",
              borderBottom: activeTab === "ai" ? "2px solid #38bdf8" : "2px solid transparent",
              color: activeTab === "ai" ? "#38bdf8" : "#94a3b8",
              fontWeight: 700,
              fontSize: "0.84rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              transition: "0.2s",
            }}
          >
            <Sparkles size={15} />
            <span>AI Step-by-Step Solution</span>
          </button>
          <button
            onClick={() => setActiveTab("notes")}
            style={{
              flex: 1,
              padding: "10px",
              background: activeTab === "notes" ? "rgba(99, 102, 241, 0.12)" : "transparent",
              border: "none",
              borderBottom: activeTab === "notes" ? "2px solid #818cf8" : "2px solid transparent",
              color: activeTab === "notes" ? "#818cf8" : "#94a3b8",
              fontWeight: 700,
              fontSize: "0.84rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              transition: "0.2s",
            }}
          >
            <BookOpen size={15} />
            <span>Search in Notes Vault ({matchingNotes.length})</span>
          </button>
        </div>

        {/* Content Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px" }}>
          {activeTab === "ai" ? (
            <div>
              {isSolving ? (
                <div style={{ textAlign: "center", padding: "40px 20px" }}>
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      border: "3px solid rgba(56, 189, 248, 0.2)",
                      borderTop: "3px solid #38bdf8",
                      borderRadius: "50%",
                      animation: "spin 0.8s linear infinite",
                      margin: "0 auto 16px auto",
                    }}
                  />
                  <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#f8fafc" }}>
                    {solveStatus || "Formulating step-by-step academic solution..."}
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: "4px" }}>
                    Checking Turso AI Cache ➔ Dual Groq / Gemini Engine
                  </div>
                </div>
              ) : solution ? (
                <div>
                  {/* Cache Header Pill */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "12px",
                    }}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                        fontSize: "0.72rem",
                        padding: "3px 10px",
                        borderRadius: "14px",
                        background: solution.cached ? "rgba(16, 185, 129, 0.15)" : "rgba(56, 189, 248, 0.15)",
                        color: solution.cached ? "#34d399" : "#38bdf8",
                        fontWeight: 700,
                        border: `1px solid ${solution.cached ? "rgba(16, 185, 129, 0.3)" : "rgba(56, 189, 248, 0.3)"}`,
                      }}
                    >
                      <Zap size={11} />
                      {solution.cached
                        ? `⚡ ${solution.cacheTier || "Turso Cloud Cache"} (0ms Quota Saved • ${solution.hits || 1} hits)`
                        : `🌐 Fresh AI Answer (${solution.provider || "Gemini"} • ${solution.latencyMs || 0}ms)`}
                    </span>

                    <button
                      onClick={handleCopy}
                      style={{
                        background: "rgba(255, 255, 255, 0.08)",
                        border: "1px solid rgba(255, 255, 255, 0.15)",
                        borderRadius: "8px",
                        padding: "4px 10px",
                        color: copied ? "#34d399" : "#cbd5e1",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      {copied ? <Check size={12} /> : <Copy size={12} />}
                      <span>{copied ? "Copied" : "Copy"}</span>
                    </button>
                  </div>

                  {/* Solution Text */}
                  <div
                    style={{
                      background: "rgba(0, 0, 0, 0.25)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      borderRadius: "14px",
                      padding: "16px",
                      fontSize: "0.88rem",
                      lineHeight: "1.65",
                      color: "#f1f5f9",
                      whiteSpace: "pre-wrap",
                      fontFamily: "var(--font-sans, inherit)",
                    }}
                  >
                    {solution.answer}
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "30px", color: "#94a3b8" }}>
                  Circle any question, formula, or diagram on the PDF to solve.
                </div>
              )}
            </div>
          ) : (
            <div>
              <div style={{ fontSize: "0.82rem", color: "#94a3b8", marginBottom: "12px" }}>
                Related lecture notes covering this topic across your platform:
              </div>

              {matchingNotes.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {matchingNotes.map((note) => (
                    <div
                      key={note.id || note._id}
                      style={{
                        padding: "12px 14px",
                        background: "rgba(255, 255, 255, 0.04)",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        borderRadius: "12px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        cursor: "pointer",
                        transition: "all 0.2s",
                      }}
                      onClick={() => {
                        if (onOpenNote) onOpenNote(note);
                        onClose();
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1, paddingRight: "12px" }}>
                        <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#fff", marginBottom: "2px" }}>
                          {note.title || "Academic Notes"}
                        </div>
                        <div style={{ fontSize: "0.74rem", color: "#94a3b8", display: "flex", gap: "8px" }}>
                          <span>📚 {note.subject || "Subject"}</span>
                          {note.branch && <span>• 🏛️ {note.branch}</span>}
                        </div>
                      </div>
                      <ExternalLink size={16} color="#38bdf8" />
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "30px", color: "#94a3b8" }}>
                  No exact matching notes found in the vault. Try editing the search query above.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "rgba(10, 15, 30, 0.7)",
            fontSize: "0.75rem",
            color: "#64748b",
          }}
        >
          <span>⭕ Circle to Search • 0% Server CPU Architecture</span>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255, 255, 255, 0.08)",
              border: "none",
              color: "#e2e8f0",
              padding: "6px 14px",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Close
          </button>
        </div>
      </div>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

