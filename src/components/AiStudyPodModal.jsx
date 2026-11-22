import { useState, useEffect, useMemo, useRef } from "react";
import { Sparkles, Layers, Search, RotateCw, Clock, X, ChevronLeft, ChevronRight, CheckCircle2, Copy, Check, FileText, Shuffle, Filter, ShieldCheck, Eye, MessageSquare, Send, Trash2, Pencil, Image as ImageIcon, Share2 } from "lucide-react";
import { api } from "../api";
import {
  getStudySessionHistory,
  addStudySessionItem,
} from "../utils/studentSessionHistory";
import { saveIndexedDbCircleCache } from "../utils/circleSearchEngine";
import MathMarkdown from "./MathMarkdown";
import GeminiIcon from "./GeminiIcon";
import { useTechFlags } from "../utils/techFlagsStore";
import { shareOrDownloadRevisionCard } from "../utils/revisionCardCanvas";
import StudyTinderSwipeDeck from "./StudyTinderSwipeDeck";

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
  const VALID_TABS = ["chat", "flashcards", "mindmaps", "summary", "search_notes", "session_history"];
  const resolveDefaultTab = (tabProp) =>
    typeof tabProp === "string" && VALID_TABS.includes(tabProp) ? tabProp : "chat";

  const [activeTab, setActiveTab] = useState(() => resolveDefaultTab(initialTab));

  // Current Active Note State (can be switched via search)
  const [currentNoteId, setCurrentNoteId] = useState(noteId);
  const [currentTitle, setCurrentTitle] = useState(noteTitle);
  const [currentSubject, setCurrentSubject] = useState(subject);
  const { enableShareRevisionCard } = useTechFlags();
  const [sharingCardId, setSharingCardId] = useState(null);

  const handleExportRevisionCard = async (keyId, textContent, subtitleLabel) => {
    if (!textContent || sharingCardId) return;
    setSharingCardId(keyId);
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "https://freestudymaterial.pages.dev";
      const shareUrl = currentNoteId ? `${origin}/?note=${encodeURIComponent(currentNoteId)}` : origin;
      await shareOrDownloadRevisionCard({
        title: currentTitle || "Study Cheat-Sheet",
        subtitle: subtitleLabel || currentSubject || "AI Revision Card",
        badgeText: "⚡ 1-CLICK REVISION CARD",
        content: textContent,
        shareUrl,
      });
    } catch (err) {
      alert(`Could not generate Revision Card: ${err?.message || "Canvas error"}`);
    } finally {
      setSharingCardId(null);
    }
  };

  // 💬 AI Conversation Chatbox State (Opens FIRST by default!)
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatImage, setChatImage] = useState(null);
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [copiedChatId, setCopiedChatId] = useState(null);
  const chatEndRef = useRef(null);
  const chatFileInputRef = useRef(null);

  // Summary user-friendly filter states
  const [summarySectionFilter, setSummarySectionFilter] = useState("all");
  const [summaryKeywordSearch, setSummaryKeywordSearch] = useState("");

  // Notes Search & Filter state (Declared early to avoid any TDZ in handlers/effects)
  const [noteSearchQuery, setNoteSearchQuery] = useState("");
  const [fetchedNotes, setFetchedNotes] = useState(allNotes || []);

  // Session History (Scoped to active online login session)
  const [sessionHistory, setSessionHistory] = useState([]);

  // Sync initial tab and mode (Chatbox opens FIRST unless an explicit valid tab is requested)
  useEffect(() => {
    if (isOpen) {
      setActiveTab(resolveDefaultTab(initialTab));
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (activeTab === "chat" && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, isSendingChat, activeTab]);

  // Support Ctrl+V image paste inside AI Chat tab
  useEffect(() => {
    if (!isOpen || activeTab !== "chat") return;
    const onPaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => setChatImage(ev.target.result);
            reader.readAsDataURL(file);
          }
          break;
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [isOpen, activeTab]);

  const handleSendChatMessage = async (presetText = null) => {
    const cleanText = (typeof presetText === "string" ? presetText : chatInput).trim();
    if ((!cleanText && !chatImage) || isSendingChat) return;

    const attachedImage = chatImage;
    const userMsg = {
      id: `u_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      role: "user",
      content: cleanText || "📷 Explain & solve this attached image step-by-step",
      image: attachedImage || null,
      timestamp: Date.now(),
    };

    const historyBefore = chatMessages;
    setChatMessages((prev) => [...prev, userMsg]);
    if (typeof presetText !== "string") setChatInput("");
    setChatImage(null);
    setIsSendingChat(true);

    try {
      const selectedNoteObj = currentNoteId
        ? fetchedNotes.find((n) => (n.id || n.noteId) === currentNoteId)
        : null;
      const noteCtx = context || selectedNoteObj?.ocrText || "";
      const recentTurns = historyBefore
        .slice(-8)
        .map((m) => `${m.role === "user" ? "Student" : "AI Tutor"}: ${String(m.content || "").slice(0, 900)}`)
        .join("\n");

      let combinedContext = "";
      if (currentNoteId) {
        combinedContext += `Active Note: ${currentTitle}${currentSubject ? ` (${currentSubject})` : ""}\n${String(noteCtx).slice(0, 9000)}\n\n`;
      }
      if (recentTurns) {
        combinedContext += `[CONVERSATION_CONTEXT]\nRecent Conversation:\n${recentTurns}`;
      }

      const res = await api.askAiQuestion(
        cleanText || "Analyze, explain, and solve this image step-by-step.",
        combinedContext,
        currentNoteId || null,
        currentSubject || "",
        {
          skipCache: historyBefore.length > 0,
          ...(attachedImage
            ? {
                imageBase64: attachedImage.replace(/^data:image\/\w+;base64,/, ""),
                imageMimeType: attachedImage.includes("image/jpeg") ? "image/jpeg" : "image/png",
              }
            : {}),
        }
      );

      if (res?.disabled) {
        const disabledMsg = {
          id: `a_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          role: "assistant",
          content: "⚠️ **AI Study Engine is currently turned OFF by the Administrator.**\n\nAll AI engines are paused right now. Please study from your downloaded course notes or check back once the Administrator re-enables AI.",
          disabled: true,
          timestamp: Date.now(),
        };
        setChatMessages((prev) => [...prev, disabledMsg]);
        setIsSendingChat(false);
        return;
      }

      const aiAnswer = res?.answer || "No answer returned.";
      const aiMsg = {
        id: `a_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        role: "assistant",
        content: aiAnswer,
        cached: Boolean(res?.cached),
        provider: res?.provider || "AI Tutor",
        latencyMs: res?.latencyMs || 0,
        timestamp: Date.now(),
      };
      setChatMessages((prev) => [...prev, aiMsg]);

      const updatedHist = addStudySessionItem({
        type: "chat",
        title: currentNoteId ? currentTitle : "AI Study Chat",
        noteId: currentNoteId || "",
        query: cleanText.slice(0, 90) || "Image Question",
        data: [...historyBefore, userMsg, aiMsg],
        provider: res?.provider,
        model: res?.model,
        cached: res?.cached,
      });
      setSessionHistory(updatedHist);

      // 💾 Auto-save to Offline AI Vault for Profile -> Offline Storage
      const aiOfflineKey = `ai_chat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      saveIndexedDbCircleCache(aiOfflineKey, {
        key: aiOfflineKey,
        query: cleanText || (attachedImage ? "📷 Diagram / Formula Question" : "AI Study Tutor Question"),
        answer: aiAnswer,
        subject: currentSubject || (currentNoteId ? currentTitle : "AI Study Studio"),
        noteId: currentNoteId || "",
        provider: res?.provider || "AI Tutor",
        model: res?.model || "",
        type: "chat",
        savedAt: Date.now(),
        isPinned: true,
      }).catch(() => {});
    } catch (err) {
      const rawMsg = err.message || "Please try again.";
      const displayMsg = rawMsg.includes("port 5000")
        ? "AI Study Engine is reconnecting to high-speed cloud edge. Please retry in a moment."
        : rawMsg;
      setChatMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: "assistant",
          content: `⚠️ Could not process your message: ${displayMsg}`,
          provider: "error",
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsSendingChat(false);
    }
  };

  // Flashcards state
  const [flashcards, setFlashcards] = useState([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [loadingCards, setLoadingCards] = useState(false);
  const [cardSource, setCardSource] = useState(null);
  const [masteredCards, setMasteredCards] = useState(new Set());
  const [flashcardMode, setFlashcardMode] = useState("tinder"); // 'tinder' (Swipe-to-Revise) | 'classic' (Traditional 3D)

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

        // 💾 Auto-save Flashcard deck to Offline AI Vault
        const cardsKey = `ai_cards_${currentNoteId || Date.now()}`;
        const formattedCards = res.flashcards
          .map((c, idx) => `### 🗂️ Card ${idx + 1}: ${c.front || c.question}\n\n**Answer / Key Formula:**\n${c.back || c.answer}`)
          .join("\n\n---\n\n");
        saveIndexedDbCircleCache(cardsKey, {
          key: cardsKey,
          query: `🗂️ Flashcards: ${currentTitle || "Study Notes"} (${res.flashcards.length} cards)`,
          answer: formattedCards,
          subject: currentSubject || "Flashcard Deck",
          noteId: currentNoteId || "",
          provider: res.provider || "AI Study",
          model: res.model || "",
          type: "flashcard",
          data: res.flashcards,
          savedAt: Date.now(),
          isPinned: true,
        }).catch(() => {});
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

        // 💾 Auto-save Chapter Summary to Offline AI Vault
        const summaryKey = `ai_summary_${currentNoteId || Date.now()}`;
        const summaryText = typeof res.summary === "string" ? res.summary : JSON.stringify(res.summary);
        saveIndexedDbCircleCache(summaryKey, {
          key: summaryKey,
          query: `📌 Summary: ${currentTitle || "Chapter Overview"}`,
          answer: summaryText,
          subject: currentSubject || "AI Summary",
          noteId: currentNoteId || "",
          provider: res.provider || "AI Study",
          model: res.model || "",
          type: "summary",
          data: res.summary,
          savedAt: Date.now(),
          isPinned: true,
        }).catch(() => {});
      }
    } catch (err) {
      console.warn("[STUDY-POD] Summary generation notice:", err.message);
    } finally {
      setLoadingSummary(false);
    }
  };

  // 🗺️ Mind-Maps & Architecture Flowchart State
  const [mindmapCode, setMindmapCode] = useState("");
  const [loadingMindmap, setLoadingMindmap] = useState(false);
  const [mindmapSource, setMindmapSource] = useState(null);

  const handleGenerateMindmap = async (forceFresh = false) => {
    setLoadingMindmap(true);
    try {
      const selectedNoteObj = currentNoteId
        ? fetchedNotes.find((n) => (n.id || n.noteId) === currentNoteId)
        : null;
      const noteCtx = context || selectedNoteObj?.ocrText || "";
      const prompt = `Generate a detailed visual Mermaid.js mind-map / flowchart diagram (using \`\`\`mermaid graph TD ... \`\`\` or \`\`\`mermaid mindmap ... \`\`\`) visualizing the complete concept hierarchy, core formulas, and logical working flow of "${currentTitle}${currentSubject ? ` (${currentSubject})` : ""}". Return the diagram in a clean \`\`\`mermaid code block followed by brief, high-yield bullet explanations.`;

      const res = await api.askAiQuestion(
        prompt,
        `Active Note: ${currentTitle}\n${String(noteCtx).slice(0, 9000)}`,
        currentNoteId || null,
        currentSubject || "",
        { skipCache: forceFresh }
      );

      if (res?.answer) {
        setMindmapCode(res.answer);
        setMindmapSource({
          cached: Boolean(res?.cached),
          provider: res?.provider || "Cloud AI",
          latencyMs: res?.latencyMs || 0,
        });

        // Add to in-session history
        const updated = addStudySessionItem({
          type: "mindmap",
          title: currentTitle,
          noteId: currentNoteId || "",
          query: `🗺️ Mind-Map Diagram`,
          data: res.answer,
          provider: res.provider,
          model: res.model,
          cached: res.cached,
        });
        setSessionHistory(updated);
      }
    } catch (err) {
      console.warn("[STUDY-POD] Mindmap generation notice:", err.message);
    } finally {
      setLoadingMindmap(false);
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
        className="white-modal-surface ai-study-pod-surface"
        style={{
          width: "100%",
          maxWidth: "840px",
          height: "92vh",
          maxHeight: "860px",
          background: "#ffffff",
          border: "1.5px solid rgba(226, 232, 240, 0.95)",
          borderRadius: "26px",
          boxShadow: "0 30px 80px -15px rgba(15, 23, 42, 0.22), 0 0 0 1px rgba(255, 255, 255, 0.9) inset, 0 12px 36px -4px rgba(99, 102, 241, 0.16)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          color: "#0f172a",
          position: "relative",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top ambient rainbow sapphire glow accent strip */}
        <div
          style={{
            height: "4px",
            width: "100%",
            background: "linear-gradient(90deg, #6366f1 0%, #8b5cf6 35%, #ec4899 70%, #06b6d4 100%)",
            flexShrink: 0,
          }}
        />

        {/* ============================================================== */}
        {/* Header Bar (Pure Crystal White Luxury UI)                       */}
        {/* ============================================================== */}
        <div
          style={{
            padding: "16px 22px",
            borderBottom: "1px solid #f1f5f9",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
            backdropFilter: "blur(14px)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
            <div
              style={{
                width: "42px",
                height: "42px",
                borderRadius: "14px",
                background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #06b6d4 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 14px rgba(99, 102, 241, 0.35)",
                flexShrink: 0,
              }}
            >
              <Sparkles size={22} color="#fff" />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.3px", display: "flex", alignItems: "center", gap: "6px" }}>
                  <span>AI Study Studio</span>
                </h3>
                <span
                  style={{
                    fontSize: "0.68rem",
                    padding: "2px 8px",
                    borderRadius: "999px",
                    background: "#ecfdf5",
                    color: "#059669",
                    fontWeight: 700,
                    border: "1px solid #a7f3d0",
                    boxShadow: "0 1px 3px rgba(16, 185, 129, 0.1)",
                  }}
                >
                  ⚡ 0ms Edge Cache Active
                </span>
              </div>
              <p
                style={{
                  margin: "3px 0 0",
                  fontSize: "0.78rem",
                  color: "#64748b",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: "480px",
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
              background: "#f1f5f9",
              border: "1px solid #e2e8f0",
              color: "#64748b",
              cursor: "pointer",
              borderRadius: "50%",
              width: "36px",
              height: "36px",
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
        {/* Navigation Tabs (Apple / Linear Segmented Pill Bar)             */}
        {/* ============================================================== */}
        <div
          className="ai-study-tabs-scroll"
          style={{
            padding: "8px 18px",
            background: "#f8fafc",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            overflowX: "auto",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
        >
          {/* Segmented Wrapper for Apple/Linear Feel */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              background: "#e2e8f0",
              padding: "3px",
              borderRadius: "12px",
              gap: "3px",
              flexShrink: 0,
            }}
          >
            {/* 💬 TAB: AI Tutor Chat */}
            <button
              type="button"
              onClick={() => setActiveTab("chat")}
              style={{
                background: activeTab === "chat" ? "#ffffff" : "transparent",
                color: activeTab === "chat" ? "#4f46e5" : "#475569",
                border: "none",
                borderRadius: "9px",
                padding: "6px 14px",
                fontSize: "0.78rem",
                fontWeight: activeTab === "chat" ? 800 : 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                whiteSpace: "nowrap",
                boxShadow: activeTab === "chat" ? "0 2px 6px rgba(0,0,0,0.08)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              <MessageSquare size={14} />
              <span>💬 AI Tutor Chat</span>
            </button>

            {/* 🗂️ TAB: Flashcards */}
            <button
              type="button"
              onClick={() => setActiveTab("flashcards")}
              style={{
                background: activeTab === "flashcards" ? "#ffffff" : "transparent",
                color: activeTab === "flashcards" ? "#7c3aed" : "#475569",
                border: "none",
                borderRadius: "9px",
                padding: "6px 14px",
                fontSize: "0.78rem",
                fontWeight: activeTab === "flashcards" ? 800 : 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                whiteSpace: "nowrap",
                boxShadow: activeTab === "flashcards" ? "0 2px 6px rgba(0,0,0,0.08)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              <Layers size={14} />
              <span>🗂️ Flashcards{flashcards.length > 0 ? ` (${flashcards.length})` : ""}</span>
            </button>

            {/* 🗺️ TAB: Mind-Maps */}
            <button
              type="button"
              onClick={() => {
                setActiveTab("mindmaps");
                if (!mindmapCode && !loadingMindmap) {
                  handleGenerateMindmap();
                }
              }}
              style={{
                background: activeTab === "mindmaps" ? "#ffffff" : "transparent",
                color: activeTab === "mindmaps" ? "#0284c7" : "#475569",
                border: "none",
                borderRadius: "9px",
                padding: "6px 14px",
                fontSize: "0.78rem",
                fontWeight: activeTab === "mindmaps" ? 800 : 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                whiteSpace: "nowrap",
                boxShadow: activeTab === "mindmaps" ? "0 2px 6px rgba(0,0,0,0.08)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              <span>🗺️ Mind-Maps</span>
            </button>

            {/* 📝 TAB: 1-Page Summary */}
            <button
              type="button"
              onClick={() => setActiveTab("summary")}
              style={{
                background: activeTab === "summary" ? "#ffffff" : "transparent",
                color: activeTab === "summary" ? "#059669" : "#475569",
                border: "none",
                borderRadius: "9px",
                padding: "6px 14px",
                fontSize: "0.78rem",
                fontWeight: activeTab === "summary" ? 800 : 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                whiteSpace: "nowrap",
                boxShadow: activeTab === "summary" ? "0 2px 6px rgba(0,0,0,0.08)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              <FileText size={14} />
              <span>📝 1-Page Summary</span>
            </button>
          </div>

          {/* Secondary tabs */}
          {!isInsidePdf && (
            <button
              type="button"
              onClick={() => setActiveTab("search_notes")}
              style={{
                background: activeTab === "search_notes" ? "#fef3c7" : "transparent",
                color: activeTab === "search_notes" ? "#b45309" : "#64748b",
                border: activeTab === "search_notes" ? "1px solid #fde68a" : "1px solid transparent",
                borderRadius: "10px",
                padding: "6px 12px",
                fontSize: "0.76rem",
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                whiteSpace: "nowrap",
                transition: "all 0.15s ease",
                flexShrink: 0,
              }}
            >
              <Filter size={13} />
              <span>🔍 Notes ({fetchedNotes.length})</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTab("session_history")}
            style={{
              background: activeTab === "session_history" ? "#ecfdf5" : "transparent",
              color: activeTab === "session_history" ? "#059669" : "#64748b",
              border: activeTab === "session_history" ? "1px solid #a7f3d0" : "1px solid transparent",
              borderRadius: "10px",
              padding: "6px 12px",
              fontSize: "0.76rem",
              fontWeight: 700,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              whiteSpace: "nowrap",
              transition: "all 0.15s ease",
              flexShrink: 0,
            }}
          >
            <Clock size={13} />
            <span>🕒 History ({sessionHistory.length})</span>
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
                background: "#f0f9ff",
                color: "#0284c7",
                border: "1px solid #bae6fd",
                borderRadius: "10px",
                padding: "6px 12px",
                fontSize: "0.76rem",
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                whiteSpace: "nowrap",
                marginLeft: "auto",
                transition: "all 0.15s ease",
                flexShrink: 0,
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
        <div
          style={{
            flex: 1,
            overflowY: activeTab === "chat" ? "hidden" : "auto",
            overflowX: "hidden",
            padding: activeTab === "chat" ? "0" : "20px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* ============================================================ */}
          {/* TAB 0 (DEFAULT FIRST): 💬 AI STUDY CONVERSATION CHATBOX       */}
          {/* ============================================================ */}
          {activeTab === "chat" && (
            <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
              {/* Context & Quick Actions Sub-Bar */}
              <div
                style={{
                  padding: "8px 18px",
                  background: "#f8fafc",
                  borderBottom: "1px solid #e2e8f0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "8px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                  <span
                    style={{
                      fontSize: "0.73rem",
                      color: currentNoteId ? "#4f46e5" : "#64748b",
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      maxWidth: "360px",
                    }}
                  >
                    {currentNoteId
                      ? `📚 Context: ${currentTitle}${currentSubject ? ` (${currentSubject})` : ""}`
                      : "🌐 General Academic AI Tutor (Ask anything or pick a note)"}
                  </span>
                  {currentNoteId && !isInsidePdf && (
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentNoteId(null);
                        setCurrentTitle("General Study Chat");
                        setCurrentSubject("");
                      }}
                      style={{
                        background: "#e2e8f0",
                        border: "none",
                        color: "#475569",
                        borderRadius: "6px",
                        padding: "2px 7px",
                        fontSize: "0.68rem",
                        cursor: "pointer",
                      }}
                      title="Switch to general academic chat without note restriction"
                    >
                      ✕ Clear Note
                    </button>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  {onOpenCircleSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenCircleSearch();
                      }}
                      style={{
                        background: "#f0f9ff",
                        border: "1px solid #bae6fd",
                        color: "#0284c7",
                        borderRadius: "8px",
                        padding: "4px 10px",
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                      }}
                      title="Draw any structure or select on screen with Pencil"
                    >
                      <Pencil size={12} />
                      <span>✏️ Pencil Search</span>
                    </button>
                  )}
                  {chatMessages.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setChatMessages([])}
                      style={{
                        background: "#fff1f2",
                        border: "1px solid #fecdd3",
                        color: "#e11d48",
                        borderRadius: "8px",
                        padding: "4px 9px",
                        fontSize: "0.72rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <Trash2 size={12} />
                      <span>New Chat</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Scrollable Messages Area */}
              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: "18px 20px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                }}
              >
                {chatMessages.length === 0 ? (
                  <div
                    style={{
                      margin: "auto 0",
                      textAlign: "center",
                      padding: "24px 16px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "12px",
                    }}
                  >
                    <div
                      style={{
                        width: "52px",
                        height: "52px",
                        borderRadius: "16px",
                        background: "linear-gradient(135deg, #eef2ff, #f0fdf4)",
                        border: "1.5px solid #c7d2fe",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: "0 4px 12px rgba(99, 102, 241, 0.15)",
                      }}
                    >
                      <Sparkles size={26} color="#6366f1" />
                    </div>
                    <div>
                      <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#0f172a" }}>
                        Start Your AI Study Conversation
                      </div>
                      <p style={{ fontSize: "0.78rem", color: "#64748b", margin: "4px auto 0", maxWidth: "460px" }}>
                        Ask doubts in English or Hinglish, solve numericals step-by-step, paste diagrams, or have a continuous study discussion!
                      </p>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                        gap: "10px",
                        maxWidth: "620px",
                        width: "100%",
                        marginTop: "8px",
                      }}
                    >
                      {[
                        {
                          icon: "⚡",
                          title: "Formula Vault & Derivations",
                          prompt: currentNoteId
                            ? `Extract all critical formulas, mathematical laws & theorems from ${currentTitle}`
                            : "Derive Laplace transform of e^(2t) sin(3t) step-by-step with proofs",
                          accent: "#d97706",
                          border: "#fde68a",
                          bg: "linear-gradient(135deg, #fffbeb 0%, #ffffff 100%)",
                        },
                        {
                          icon: "🎯",
                          title: "Top 5 Exam Questions & Solutions",
                          prompt: currentNoteId
                            ? `What are the top 5 most recurring semester exam questions from ${currentTitle}? Provide complete answers.`
                            : "Solve Banker's Algorithm safe sequence with an actual 5-process university exam numerical",
                          accent: "#7c3aed",
                          border: "#e9d5ff",
                          bg: "linear-gradient(135deg, #faf5ff 0%, #ffffff 100%)",
                        },
                        {
                          icon: "🧠",
                          title: "Visual Mind Map & Flowchart",
                          prompt: currentNoteId
                            ? `Generate a crisp Mermaid architecture flowchart / mind-map diagram summarizing ${currentTitle}`
                            : "Draw a Mermaid architecture diagram explaining TCP 3-way handshake and connection teardown",
                          accent: "#0284c7",
                          border: "#bae6fd",
                          bg: "linear-gradient(135deg, #f0f9ff 0%, #ffffff 100%)",
                        },
                        {
                          icon: "💡",
                          title: "5-Min Rapid Revision in Hinglish",
                          prompt: currentNoteId
                            ? `Explain all core concepts of ${currentTitle} in crystal-clear simple Hinglish with practical analogies`
                            : "Explain Database Normalization (1NF to BCNF) in practical Hinglish with real table examples",
                          accent: "#059669",
                          border: "#a7f3d0",
                          bg: "linear-gradient(135deg, #ecfdf5 0%, #ffffff 100%)",
                        },
                      ].map((item, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleSendChatMessage(item.prompt)}
                          style={{
                            background: item.bg,
                            border: `1.5px solid ${item.border}`,
                            borderRadius: "14px",
                            padding: "12px 14px",
                            cursor: "pointer",
                            textAlign: "left",
                            display: "flex",
                            flexDirection: "column",
                            gap: "4px",
                            transition: "all 0.2s ease",
                            boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = "translateY(-2px)";
                            e.currentTarget.style.boxShadow = "0 6px 16px rgba(15, 23, 42, 0.08)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = "translateY(0)";
                            e.currentTarget.style.boxShadow = "0 2px 8px rgba(15, 23, 42, 0.04)";
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 750, fontSize: "0.82rem", color: item.accent }}>
                            <span>{item.icon}</span>
                            <span>{item.title}</span>
                          </div>
                          <span style={{ fontSize: "0.74rem", color: "#64748b", lineHeight: 1.4 }}>
                            {item.prompt.slice(0, 75)}...
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  chatMessages.map((msg) =>
                    msg.role === "user" ? (
                      <div key={msg.id} style={{ display: "flex", justifyContent: "flex-end" }}>
                        <div
                          style={{
                            maxWidth: "84%",
                            background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
                            borderRadius: "16px 16px 4px 16px",
                            padding: "10px 15px",
                            color: "#ffffff",
                            fontSize: "0.86rem",
                            lineHeight: 1.5,
                            boxShadow: "0 4px 14px rgba(99, 102, 241, 0.28)",
                          }}
                        >
                          {msg.image && (
                            <img
                              src={msg.image}
                              alt="Attached"
                              style={{
                                maxWidth: "200px",
                                maxHeight: "120px",
                                borderRadius: "8px",
                                display: "block",
                                marginBottom: "6px",
                                border: "1px solid rgba(255,255,255,0.4)",
                              }}
                            />
                          )}
                          <div style={{ whiteSpace: "pre-wrap" }}>{msg.content}</div>
                        </div>
                      </div>
                    ) : (
                      <div
                        key={msg.id}
                        style={{
                          background: "#ffffff",
                          border: "1.5px solid #e2e8f0",
                          borderRadius: "18px 18px 18px 4px",
                          padding: "16px 18px",
                          fontSize: "0.88rem",
                          lineHeight: 1.7,
                          color: "#0f172a",
                          boxShadow: "0 10px 30px -10px rgba(15, 23, 42, 0.08), 0 2px 8px rgba(0, 0, 0, 0.03)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: "10px",
                            paddingBottom: "8px",
                            borderBottom: "1px solid #f1f5f9",
                            gap: "8px",
                            flexWrap: "wrap",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <div
                              style={{
                                width: "22px",
                                height: "22px",
                                borderRadius: "6px",
                                background: "linear-gradient(135deg, #8b5cf6, #06b6d4)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "0.75rem",
                              }}
                            >
                              🤖
                            </div>
                            <span
                              style={{
                                fontSize: "0.72rem",
                                padding: "3px 9px",
                                borderRadius: "999px",
                                background: msg.cached ? "#ecfdf5" : "#f5f3ff",
                                color: msg.cached ? "#059669" : "#6d28d9",
                                fontWeight: 750,
                                border: `1px solid ${msg.cached ? "#a7f3d0" : "#ddd6fe"}`,
                              }}
                            >
                              {msg.cached
                                ? "⚡ 0ms Lightning Cache"
                                : `✨ Academic AI Mentor (${msg.provider || "Cloud Engine"}${msg.latencyMs ? ` • ${msg.latencyMs}ms` : ""})`}
                            </span>
                          </div>

                          <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                            {enableShareRevisionCard && (
                              <button
                                type="button"
                                onClick={() => handleExportRevisionCard(`chat_${msg.id}`, msg.content, currentSubject || "AI Answer Cheat-Sheet")}
                                disabled={sharingCardId === `chat_${msg.id}`}
                                title="Download or Share HD Revision Card (PNG)"
                                style={{
                                  background: "#f0f9ff",
                                  border: "1px solid #bae6fd",
                                  color: "#0284c7",
                                  borderRadius: "7px",
                                  padding: "4px 9px",
                                  fontSize: "0.72rem",
                                  fontWeight: 750,
                                  cursor: "pointer",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  transition: "all 0.15s ease",
                                }}
                              >
                                <Share2 size={12} />
                                <span>{sharingCardId === `chat_${msg.id}` ? "Saving..." : "📸 Card PNG"}</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(msg.content);
                                setCopiedChatId(msg.id);
                                setTimeout(() => setCopiedChatId(null), 1800);
                              }}
                              style={{
                                background: "#f8fafc",
                                border: "1px solid #e2e8f0",
                                color: copiedChatId === msg.id ? "#059669" : "#64748b",
                                borderRadius: "7px",
                                padding: "4px 9px",
                                fontSize: "0.72rem",
                                fontWeight: 600,
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                transition: "all 0.15s ease",
                              }}
                            >
                              {copiedChatId === msg.id ? <Check size={12} /> : <Copy size={12} />}
                              <span>{copiedChatId === msg.id ? "Copied" : "Copy"}</span>
                            </button>
                          </div>
                        </div>

                        <MathMarkdown content={msg.content} />

                        {/* ⚡ Smart Interactive 1-Click Follow-up Chips */}
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "6px",
                            marginTop: "14px",
                            paddingTop: "10px",
                            borderTop: "1px dashed #e2e8f0",
                            alignItems: "center",
                          }}
                        >
                          <span style={{ fontSize: "0.68rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px" }}>
                            ⚡ Follow-up:
                          </span>
                          {[
                            { icon: "💡", label: "Simpler Hinglish", prompt: "Explain the above answer in simpler, practical Hinglish with an everyday analogy." },
                            { icon: "⚡", label: "Formula Vault", prompt: "Extract all key formulas and mathematical laws from the above solution into a clean bullet list." },
                            { icon: "🧠", label: "Mind Map Diagram", prompt: "Generate a clean Mermaid flowchart / mind-map diagram for the concepts discussed above." },
                            { icon: "🎯", label: "Top 3 Exam Questions", prompt: "Give 3 most likely university exam numericals/questions on this topic with quick solving hints." },
                          ].map((chip, cIdx) => (
                            <button
                              key={cIdx}
                              type="button"
                              onClick={() => handleSendChatMessage(chip.prompt)}
                              disabled={isSendingChat}
                              style={{
                                background: "#f8fafc",
                                border: "1px solid #e2e8f0",
                                borderRadius: "999px",
                                padding: "3px 10px",
                                fontSize: "0.72rem",
                                color: "#4f46e5",
                                cursor: isSendingChat ? "not-allowed" : "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                fontWeight: 600,
                                transition: "all 0.15s ease",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = "#eef2ff";
                                e.currentTarget.style.borderColor = "#c7d2fe";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = "#f8fafc";
                                e.currentTarget.style.borderColor = "#e2e8f0";
                              }}
                            >
                              <span>{chip.icon}</span>
                              <span>{chip.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  )
                )}

                {isSendingChat && (
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "10px 14px",
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      borderRadius: "14px",
                      fontSize: "0.8rem",
                      color: "#4f46e5",
                      alignSelf: "flex-start",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                    }}
                  >
                    <RotateCw size={15} className="animate-spin" color="#6366f1" />
                    <span>AI Study Tutor is thinking...</span>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>

              {/* Pinned Chat Input Composer */}
              <div
                style={{
                  padding: "12px 18px",
                  borderTop: "1px solid #f1f5f9",
                  background: "#ffffff",
                }}
              >
                {chatImage && (
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "8px",
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      borderRadius: "10px",
                      padding: "5px 10px",
                      marginBottom: "8px",
                    }}
                  >
                    <img src={chatImage} alt="Preview" style={{ height: "38px", borderRadius: "6px" }} />
                    <span style={{ fontSize: "0.72rem", color: "#64748b" }}>Image attached</span>
                    <button
                      type="button"
                      onClick={() => setChatImage(null)}
                      style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer" }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}

                <input
                  ref={chatFileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => setChatImage(ev.target.result);
                    reader.readAsDataURL(file);
                    e.target.value = "";
                  }}
                />

                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <button
                    type="button"
                    onClick={() => chatFileInputRef.current?.click()}
                    style={{
                      background: "#f8fafc",
                      border: "1.5px solid #e2e8f0",
                      color: "#64748b",
                      borderRadius: "11px",
                      width: "40px",
                      height: "40px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                    title="Attach diagram or question image (or paste with Ctrl+V)"
                  >
                    <ImageIcon size={17} />
                  </button>

                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendChatMessage();
                      }
                    }}
                    placeholder="Ask any question, follow-up doubt, derivation, or paste image..."
                    style={{
                      flex: 1,
                      background: "#f8fafc",
                      border: "1.5px solid #cbd5e1",
                      borderRadius: "12px",
                      padding: "10px 14px",
                      color: "#0f172a",
                      fontSize: "0.86rem",
                      outline: "none",
                    }}
                  />

                  <button
                    type="button"
                    onClick={() => handleSendChatMessage()}
                    disabled={isSendingChat || (!chatInput.trim() && !chatImage)}
                    style={{
                      background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                      border: "none",
                      color: "#fff",
                      borderRadius: "12px",
                      padding: "10px 18px",
                      fontSize: "0.84rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      boxShadow: "0 4px 12px rgba(99, 102, 241, 0.3)",
                      opacity: isSendingChat || (!chatInput.trim() && !chatImage) ? 0.55 : 1,
                      flexShrink: 0,
                    }}
                  >
                    <Send size={15} />
                    <span>Send</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* TAB 1: 🗂️ REVISION FLASHCARDS (Pure White 3D View)            */}
          {/* ============================================================ */}
          {activeTab === "flashcards" && (
            <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: "16px", overflowX: "hidden" }}>
              {/* Card Header Sub-Bar */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
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
                        background: "#faf5ff",
                        border: "1px solid #e9d5ff",
                        color: "#7c3aed",
                      }}
                    >
                      {currentCard.category}
                    </span>
                  )}
                  {cardSource && (
                    <span
                      style={{
                        fontSize: "0.68rem",
                        color: cardSource.cached ? "#059669" : "#0284c7",
                        fontWeight: 600,
                      }}
                    >
                      {cardSource.cached ? "⚡ 0ms Turso Cache" : `⚡ Generated in ${cardSource.latencyMs}ms`}
                    </span>
                  )}
                </div>

                <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                  {/* 🃏 Tinder vs Classic Mode Switcher */}
                  <div
                    style={{
                      display: "inline-flex",
                      background: "#e2e8f0",
                      borderRadius: "8px",
                      padding: "2px",
                      gap: "2px",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setFlashcardMode("tinder")}
                      style={{
                        background: flashcardMode === "tinder" ? "#ffffff" : "transparent",
                        color: flashcardMode === "tinder" ? "#7c3aed" : "#64748b",
                        border: "none",
                        borderRadius: "6px",
                        padding: "4px 9px",
                        fontSize: "0.7rem",
                        fontWeight: 750,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        boxShadow: flashcardMode === "tinder" ? "0 2px 5px rgba(0,0,0,0.06)" : "none",
                      }}
                      title="Dopamine Swipe Mode: Swipe 👉 Master, 👈 Revise, 👆 Star"
                    >
                      <span>🃏 Swipe Tinder</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFlashcardMode("classic")}
                      style={{
                        background: flashcardMode === "classic" ? "#ffffff" : "transparent",
                        color: flashcardMode === "classic" ? "#7c3aed" : "#64748b",
                        border: "none",
                        borderRadius: "6px",
                        padding: "4px 9px",
                        fontSize: "0.7rem",
                        fontWeight: 750,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        boxShadow: flashcardMode === "classic" ? "0 2px 5px rgba(0,0,0,0.06)" : "none",
                      }}
                      title="Traditional 3D Flip Card View"
                    >
                      <span>🗂️ Classic 3D</span>
                    </button>
                  </div>

                  {onOpenNote && currentNoteId && (
                    <button
                      type="button"
                      onClick={() => {
                        const found = fetchedNotes.find((n) => (n.id || n.noteId) === currentNoteId);
                        if (found) onOpenNote(found);
                      }}
                      style={{
                        background: "#ecfdf5",
                        border: "1px solid #a7f3d0",
                        color: "#059669",
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
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      color: "#64748b",
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
                      background: "#faf5ff",
                      border: "1px solid #ddd6fe",
                      color: "#7c3aed",
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
                      background: "#f8fafc",
                      borderRadius: "16px",
                      border: "1.5px dashed #cbd5e1",
                    }}
                  >
                    <RotateCw size={28} className="animate-spin" color="#7c3aed" />
                    <div style={{ fontSize: "0.9rem", color: "#7c3aed", fontWeight: 700 }}>
                      Synthesizing High-Yield Exam Flashcards...
                    </div>
                    <div style={{ fontSize: "0.74rem", color: "#64748b" }}>
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
                      background: "#f8fafc",
                      borderRadius: "16px",
                      border: "1.5px dashed #cbd5e1",
                      padding: "30px",
                      textAlign: "center",
                    }}
                  >
                    <Layers size={36} color="#7c3aed" />
                    <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#0f172a" }}>
                      Ready to generate Revision Flashcards
                    </div>
                    <p style={{ fontSize: "0.78rem", color: "#64748b", maxWidth: "420px", margin: 0 }}>
                      Extract key definitions, formulas, and high-yield questions for <strong>{currentTitle}</strong> in one click.
                    </p>
                    <button
                      type="button"
                      onClick={handleGenerateFlashcards}
                      style={{
                        padding: "8px 18px",
                        fontSize: "0.82rem",
                        background: "linear-gradient(135deg, #8b5cf6, #6366f1)",
                        border: "none",
                        borderRadius: "10px",
                        color: "#fff",
                        fontWeight: 700,
                        cursor: "pointer",
                        boxShadow: "0 4px 14px rgba(139, 92, 246, 0.3)",
                      }}
                    >
                      ⚡ Generate 8 Flashcards
                    </button>
                  </div>
                ) : flashcardMode === "tinder" ? (
                  /* 🃏 Study Tinder Swipe-to-Revise Deck */
                  <StudyTinderSwipeDeck
                    cards={flashcards}
                    title={currentTitle}
                    subject={currentSubject}
                    onMasterCard={(card) => {
                      const idx = flashcards.findIndex((c) => (c.id || c.question) === (card.id || card.question));
                      if (idx !== -1) handleToggleMastered(idx);
                    }}
                    onBookmarkCard={(card) => {
                      const bookmarkKey = `ai_starred_${currentNoteId || Date.now()}`;
                      saveIndexedDbCircleCache(bookmarkKey, {
                        key: bookmarkKey,
                        query: `⭐ Exam Star: ${card.question || card.front || "Concept"}`,
                        answer: card.answer || card.back || "",
                        subject: currentSubject || "High-Yield",
                        noteId: currentNoteId || "",
                        type: "flashcard",
                        savedAt: Date.now(),
                        isPinned: true,
                      }).catch(() => {});
                    }}
                    onResetDeck={() => {
                      setCurrentCardIndex(0);
                    }}
                  />
                ) : (
                  <div
                    onClick={() => setIsFlipped(!isFlipped)}
                    className="ai-study-flashcard"
                    style={{
                      flex: 1,
                      borderRadius: "20px",
                      padding: "28px",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      position: "relative",
                      overflow: "hidden",
                      transition: "transform 0.25s ease, box-shadow 0.25s ease",
                      background: isFlipped
                        ? "linear-gradient(145deg, #f0fdf4 0%, #ffffff 100%)"
                        : "linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)",
                      border: isFlipped
                        ? "1.5px solid #86efac"
                        : "1.5px solid #c7d2fe",
                      boxShadow: isFlipped
                        ? "0 12px 35px rgba(16, 185, 129, 0.12)"
                        : "0 12px 35px rgba(99, 102, 241, 0.12)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span
                        style={{
                          fontSize: "0.72rem",
                          fontWeight: 700,
                          padding: "3px 9px",
                          borderRadius: "8px",
                          background: isFlipped ? "#ecfdf5" : "#faf5ff",
                          color: isFlipped ? "#059669" : "#7c3aed",
                          border: isFlipped ? "1px solid #a7f3d0" : "1px solid #e9d5ff",
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
                          background: isCardMastered ? "#ecfdf5" : "#f1f5f9",
                          border: isCardMastered ? "1px solid #a7f3d0" : "1px solid #e2e8f0",
                          color: isCardMastered ? "#059669" : "#64748b",
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

                    <div
                      className="ai-study-card-content"
                      style={{
                        margin: "auto 0",
                        padding: "16px 0",
                        maxHeight: "340px",
                        overflowY: "auto",
                        overflowX: "hidden",
                        scrollbarWidth: "none",
                        msOverflowStyle: "none",
                      }}
                    >
                      <div
                        style={{
                          fontSize: isFlipped ? "1.05rem" : "1.15rem",
                          fontWeight: isFlipped ? 500 : 700,
                          lineHeight: 1.6,
                          color: isFlipped ? "#065f46" : "#0f172a",
                          wordBreak: "break-word",
                          overflowWrap: "anywhere",
                        }}
                      >
                        <MathMarkdown content={isFlipped ? currentCard?.answer : currentCard?.question} />
                      </div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.72rem", color: "#64748b" }}>
                      <span>Tap card to {isFlipped ? "see question" : "reveal answer"}</span>
                      <span>(Spacebar / Click to flip)</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Classic Navigation Controls Bar */}
              {flashcards.length > 0 && flashcardMode === "classic" && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={handlePrevCard}
                    style={{
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      color: "#0f172a",
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

                  <div style={{ fontSize: "0.78rem", color: "#64748b" }}>
                    Mastered: <strong style={{ color: "#059669" }}>{masteredCards.size}</strong> / {flashcards.length}
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
                      boxShadow: "0 4px 14px rgba(139, 92, 246, 0.35)",
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
          {/* TAB 2: 🗺️ VISUAL MIND-MAPS & ARCHITECTURE FLOWCHARTS          */}
          {/* ============================================================ */}
          {activeTab === "mindmaps" && (
            <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: "14px", overflowY: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 800, color: "#0f172a" }}>
                    🗺️ Visual Concept Mind-Map &amp; Architecture
                  </h4>
                  <p style={{ margin: "2px 0 0", fontSize: "0.74rem", color: "#64748b" }}>
                    {mindmapSource?.cached ? "⚡ 0ms Lightning Cache Hit" : "AI Hierarchical Concept Graph &amp; Process Architecture"}
                  </p>
                </div>

                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <button
                    type="button"
                    onClick={() => handleGenerateMindmap(true)}
                    disabled={loadingMindmap}
                    style={{
                      background: "#f0f9ff",
                      border: "1px solid #bae6fd",
                      color: "#0284c7",
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
                    <RotateCw size={12} className={loadingMindmap ? "animate-spin" : ""} />
                    <span>Regenerate Mind-Map</span>
                  </button>
                </div>
              </div>

              {loadingMindmap ? (
                <div
                  style={{
                    flex: 1,
                    minHeight: "260px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "12px",
                    background: "#f8fafc",
                    borderRadius: "16px",
                    border: "1.5px dashed #cbd5e1",
                    padding: "30px",
                  }}
                >
                  <RotateCw size={28} className="animate-spin" color="#0284c7" />
                  <div style={{ fontSize: "0.9rem", color: "#0284c7", fontWeight: 700 }}>
                    Generating Hierarchical Concept Mind-Map...
                  </div>
                  <div style={{ fontSize: "0.74rem", color: "#64748b" }}>
                    Parsing document structure and synthesizing interactive Mermaid diagram
                  </div>
                </div>
              ) : !mindmapCode ? (
                <div
                  style={{
                    flex: 1,
                    minHeight: "260px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "14px",
                    background: "#f8fafc",
                    borderRadius: "16px",
                    border: "1.5px dashed #cbd5e1",
                    padding: "30px",
                    textAlign: "center",
                  }}
                >
                  <span style={{ fontSize: "2.4rem" }}>🗺️</span>
                  <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#0f172a" }}>
                    Synthesize Interactive Visual Mind-Map
                  </div>
                  <p style={{ fontSize: "0.78rem", color: "#64748b", maxWidth: "420px", margin: 0 }}>
                    Turn complex lecture topics from <strong>{currentTitle}</strong> into a clean, zoomable visual diagram and knowledge graph.
                  </p>
                  <button
                    type="button"
                    onClick={() => handleGenerateMindmap(false)}
                    style={{
                      padding: "8px 20px",
                      fontSize: "0.82rem",
                      background: "linear-gradient(135deg, #0284c7, #06b6d4)",
                      border: "none",
                      borderRadius: "10px",
                      color: "#fff",
                      fontWeight: 700,
                      cursor: "pointer",
                      boxShadow: "0 4px 14px rgba(2, 132, 199, 0.3)",
                    }}
                  >
                    ⚡ Generate Mind-Map
                  </button>
                </div>
              ) : (
                <div
                  style={{
                    flex: 1,
                    background: "#ffffff",
                    border: "1.5px solid #e2e8f0",
                    borderRadius: "16px",
                    padding: "20px",
                    boxShadow: "0 4px 16px rgba(15, 23, 42, 0.05)",
                  }}
                >
                  <MathMarkdown content={mindmapCode} />
                </div>
              )}
            </div>
          )}

          {/* ============================================================ */}
          {/* TAB 3: 📝 1-PAGE EXECUTIVE SUMMARY                            */}
          {/* ============================================================ */}
          {activeTab === "summary" && (
            <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 800, color: "#0f172a" }}>
                    📝 1-Page Executive Exam Summary
                  </h4>
                  <p style={{ margin: "2px 0 0", fontSize: "0.74rem", color: "#64748b" }}>
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
                        background: "#ecfdf5",
                        border: "1px solid #a7f3d0",
                        color: "#059669",
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
                  {summary && enableShareRevisionCard && (
                    <button
                      type="button"
                      onClick={() => handleExportRevisionCard("summary_card", displaySummary || summary, `${currentSubject || "Exam"} • Quick Revision Card`)}
                      disabled={sharingCardId === "summary_card"}
                      style={{
                        background: "#f0fdf4",
                        border: "1px solid #bbf7d0",
                        color: "#16a34a",
                        borderRadius: "8px",
                        padding: "6px 12px",
                        fontSize: "0.74rem",
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                      }}
                      title="Export 1-Click Shareable HD Cheat-Sheet Card (PNG with QR)"
                    >
                      <Share2 size={13} />
                      <span>{sharingCardId === "summary_card" ? "Generating PNG..." : "Share Card (PNG)"}</span>
                    </button>
                  )}
                  {summary && (
                    <button
                      type="button"
                      onClick={handleCopySummary}
                      style={{
                        background: copiedSummary ? "#ecfdf5" : "#f8fafc",
                        border: copiedSummary ? "1px solid #a7f3d0" : "1px solid #e2e8f0",
                        color: copiedSummary ? "#059669" : "#475569",
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
                      background: "#f0f9ff",
                      border: "1px solid #bae6fd",
                      color: "#0284c7",
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
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", background: "#f8fafc", padding: "10px 14px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
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
                          border: summarySectionFilter === sec.id ? "1px solid #0284c7" : "1px solid #e2e8f0",
                          background: summarySectionFilter === sec.id ? "#0284c7" : "#ffffff",
                          color: summarySectionFilter === sec.id ? "#ffffff" : "#64748b",
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
                        background: "#ffffff",
                        border: "1px solid #cbd5e1",
                        borderRadius: "6px",
                        color: "#0f172a",
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
                          color: "#64748b",
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
                    background: "#f8fafc",
                    borderRadius: "16px",
                    border: "1.5px dashed #cbd5e1",
                  }}
                >
                  <RotateCw size={28} className="animate-spin" color="#0284c7" />
                  <div style={{ fontSize: "0.9rem", color: "#0284c7", fontWeight: 700 }}>
                    Synthesizing Executive Exam Summary...
                  </div>
                  <div style={{ fontSize: "0.74rem", color: "#64748b" }}>
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
                    background: "#f8fafc",
                    borderRadius: "16px",
                    border: "1.5px dashed #cbd5e1",
                    padding: "30px",
                    textAlign: "center",
                  }}
                >
                  <FileText size={36} color="#0284c7" />
                  <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#0f172a" }}>
                    Generate Executive Summary
                  </div>
                  <p style={{ fontSize: "0.78rem", color: "#64748b", maxWidth: "420px", margin: 0 }}>
                    Get a concise, exam-focused synthesis of <strong>{currentTitle}</strong> highlighting key theorems and formulas.
                  </p>
                  <button
                    type="button"
                    onClick={handleGenerateSummary}
                    style={{
                      padding: "8px 18px",
                      fontSize: "0.82rem",
                      background: "linear-gradient(135deg, #0284c7, #06b6d4)",
                      border: "none",
                      borderRadius: "10px",
                      color: "#fff",
                      fontWeight: 700,
                      cursor: "pointer",
                      boxShadow: "0 4px 14px rgba(2, 132, 199, 0.3)",
                    }}
                  >
                    ⚡ Generate Summary
                  </button>
                </div>
              ) : (
                <div
                  style={{
                    flex: 1,
                    background: "#ffffff",
                    border: "1.5px solid #e2e8f0",
                    borderRadius: "16px",
                    padding: "20px",
                    boxShadow: "0 4px 16px rgba(15, 23, 42, 0.05)",
                    overflowY: "auto",
                  }}
                >
                  <MathMarkdown content={displaySummary} />
                </div>
              )}
            </div>
          )}

          {/* ============================================================ */}
          {/* TAB 4: 🔍 FILTER & SEARCH NOTES                                */}
          {/* ============================================================ */}
          {activeTab === "search_notes" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px", height: "100%" }}>
              {/* Search input */}
              <div style={{ position: "relative" }}>
                <Search size={16} style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "#64748b" }} />
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
                    border: "1.5px solid #cbd5e1",
                    background: "#f8fafc",
                    color: "#0f172a",
                  }}
                  autoFocus
                />
              </div>

              <div style={{ fontSize: "0.74rem", color: "#64748b" }}>
                Found <strong>{filteredNotes.length}</strong> matching notes: Click any note to instantly load its Flashcards &amp; Summary.
              </div>

              {/* Filtered Notes List */}
              <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
                {filteredNotes.length === 0 ? (
                  <div style={{ padding: "30px", textAlign: "center", color: "#64748b", fontSize: "0.82rem" }}>
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
                          background: isSelected ? "#fffbeb" : "#ffffff",
                          border: isSelected ? "1.5px solid #f59e0b" : "1px solid #e2e8f0",
                          cursor: "pointer",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          transition: "all 0.15s ease",
                          boxShadow: "0 2px 6px rgba(0,0,0,0.02)",
                        }}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: "0.86rem", color: isSelected ? "#b45309" : "#0f172a" }}>
                            📄 {n.title}
                          </div>
                          <div style={{ display: "flex", gap: "8px", fontSize: "0.7rem", color: "#64748b", marginTop: "3px" }}>
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
                              background: "#faf5ff",
                              border: "1px solid #e9d5ff",
                              color: "#7c3aed",
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
                              background: "#f0f9ff",
                              border: "1px solid #bae6fd",
                              color: "#0284c7",
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
                                background: "#ecfdf5",
                                border: "1px solid #a7f3d0",
                                color: "#059669",
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
          {/* TAB 5: 🕒 SESSION HISTORY (Online login session-scoped)        */}
          {/* ============================================================ */}
          {activeTab === "session_history" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", height: "100%" }}>
              <div
                style={{
                  padding: "10px 14px",
                  background: "#ecfdf5",
                  border: "1px solid #a7f3d0",
                  borderRadius: "10px",
                  fontSize: "0.74rem",
                  color: "#065f46",
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
                  <div style={{ padding: "40px", textAlign: "center", color: "#64748b", fontSize: "0.82rem" }}>
                    No AI queries or flashcards generated in this session yet. Generate cards, mind-maps, or summary above to see your session history here.
                  </div>
                ) : (
                  sessionHistory.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        padding: "12px 16px",
                        background: "#ffffff",
                        border: "1px solid #e2e8f0",
                        borderRadius: "12px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        boxShadow: "0 2px 6px rgba(0,0,0,0.02)",
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span
                            style={{
                              fontSize: "0.68rem",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              background: item.type === "flashcard" ? "#faf5ff" : (item.type === "mindmap" ? "#f0f9ff" : (item.type === "summary" ? "#ecfdf5" : "#fef3c7")),
                              color: item.type === "flashcard" ? "#7c3aed" : (item.type === "mindmap" ? "#0284c7" : (item.type === "summary" ? "#059669" : "#b45309")),
                              border: `1px solid ${item.type === "flashcard" ? "#e9d5ff" : (item.type === "mindmap" ? "#bae6fd" : (item.type === "summary" ? "#a7f3d0" : "#fde68a"))}`,
                              fontWeight: 700,
                            }}
                          >
                            {String(item.type).toUpperCase()}
                          </span>
                          <strong style={{ fontSize: "0.82rem", color: "#0f172a" }}>{item.title}</strong>
                        </div>
                        <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "3px" }}>
                          {item.query} • {new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          if (item.type === "chat" && Array.isArray(item.data)) {
                            setChatMessages(item.data);
                            setActiveTab("chat");
                          } else if (item.type === "flashcard" && Array.isArray(item.data)) {
                            setFlashcards(item.data);
                            setCurrentCardIndex(0);
                            setCurrentTitle(item.title);
                            setActiveTab("flashcards");
                          } else if (item.type === "mindmap" && typeof item.data === "string") {
                            setMindmapCode(item.data);
                            setCurrentTitle(item.title);
                            setActiveTab("mindmaps");
                          } else if (item.type === "summary" && typeof item.data === "string") {
                            setSummary(item.data);
                            setCurrentTitle(item.title);
                            setActiveTab("summary");
                          }
                        }}
                        style={{
                          background: "#f1f5f9",
                          color: "#0f172a",
                          border: "1px solid #e2e8f0",
                          borderRadius: "8px",
                          padding: "5px 12px",
                          fontSize: "0.72rem",
                          fontWeight: 700,
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

