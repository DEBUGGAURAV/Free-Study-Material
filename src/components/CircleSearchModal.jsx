import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Search,
  Sparkles,
  Copy,
  Check,
  ExternalLink,
  Zap,
  BookOpen,
  Upload,
  Image as ImageIcon,
  RotateCcw,
  Crop,
  CheckCircle2,
} from "lucide-react";
import { solveCircleQuery } from "../utils/circleSearchEngine";
import MathMarkdown from "./MathMarkdown";

export default function CircleSearchModal({
  isOpen,
  onClose,
  circleData = null, // { text, source, croppedImage, bounds, noteId, subject }
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

  // Standalone Image Upload & Interactive Circle/Crop State (when opened from Home)
  const [uploadedImageSrc, setUploadedImageSrc] = useState(circleData?.croppedImage || null);
  const [activeInputMode, setActiveInputMode] = useState(circleData?.croppedImage ? "image" : "text"); // 'text' | 'image'
  const [cropBox, setCropBox] = useState(null); // { x, y, width, height } in percentage or px
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const imageContainerRef = useRef(null);
  const fileInputRef = useRef(null);

  // Quick Suggestion Chips for Students
  const SUGGESTED_QUERIES = [
    "Solve Laplace transform of $e^{2t} \\sin(3t)$",
    "Banker's Algorithm safe state conditions in OS",
    "Dijkstra Shortest Path algorithm with time complexity",
    "Derive Maxwell's 4 electromagnetic equations",
    "Explain ACID properties with real-world examples",
  ];

  // Sync when circleData changes (e.g. from VirtualPdfReader)
  useEffect(() => {
    if (circleData) {
      if (circleData.text) {
        setQueryText(circleData.text);
        setSolution(null);
        setIsEditingQuery(false);
        handleAutoSolve(circleData.text, circleData.croppedImage);
        findMatchingNotes(circleData.text);
      }
      if (circleData.croppedImage) {
        setUploadedImageSrc(circleData.croppedImage);
        setActiveInputMode("image");
      }
    } else {
      // Standalone mode from Home / Navbar
      setQueryText("");
      setSolution(null);
      setUploadedImageSrc(null);
      setCropBox(null);
      setActiveInputMode("text");
    }
  }, [circleData, isOpen]);

  // Handle global paste (Ctrl+V) of images or questions
  useEffect(() => {
    if (!isOpen) return;
    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
              setUploadedImageSrc(event.target.result);
              setActiveInputMode("image");
              setCropBox(null);
            };
            reader.readAsDataURL(file);
          }
          break;
        }
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [isOpen]);

  const handleAutoSolve = async (textToSolve, imageToSolve = null) => {
    const cleanText = (textToSolve || "").trim();
    if (!cleanText && !imageToSolve) return;

    setIsSolving(true);
    setSolveStatus(imageToSolve ? "Analyzing diagram & handwriting with Gemini Vision..." : "Formulating step-by-step solution...");
    try {
      const res = await solveCircleQuery({
        query: cleanText,
        imageBase64: imageToSolve ? imageToSolve.replace(/^data:image\/\w+;base64,/, "") : null,
        imageMimeType: imageToSolve?.includes("image/jpeg") ? "image/jpeg" : "image/png",
        context: circleData?.context || "",
        noteId: circleData?.noteId || "",
        subject: circleData?.subject || "",
        onProgress: (status) => setSolveStatus(status),
      });
      setSolution(res);
      if (cleanText) findMatchingNotes(cleanText);
    } catch (err) {
      setSolution({
        answer: `⚠️ Could not generate automated solution: ${err.message}. You can try rephrasing or searching in the notes vault directly.`,
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

  // Handle Image File Upload from Computer / Mobile Camera
  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setUploadedImageSrc(event.target.result);
      setActiveInputMode("image");
      setCropBox(null);
    };
    reader.readAsDataURL(file);
  };

  // Interactive Drag & Circle Selection on Uploaded Image
  const handlePointerDownImage = (e) => {
    if (!imageContainerRef.current) return;
    const rect = imageContainerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    setIsDraggingCrop(true);
    setDragStart({ x, y });
    setCropBox({ x, y, width: 0, height: 0 });
  };

  const handlePointerMoveImage = (e) => {
    if (!isDraggingCrop || !dragStart || !imageContainerRef.current) return;
    const rect = imageContainerRef.current.getBoundingClientRect();
    const currentX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const currentY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

    const x = Math.min(dragStart.x, currentX);
    const y = Math.min(dragStart.y, currentY);
    const width = Math.abs(currentX - dragStart.x);
    const height = Math.abs(currentY - dragStart.y);

    setCropBox({ x, y, width, height });
  };

  const handlePointerUpImage = () => {
    setIsDraggingCrop(false);
  };

  // Crop the selected region from the image and solve
  const handleSolveCroppedRegion = () => {
    if (!uploadedImageSrc) return;

    if (!cropBox || cropBox.width < 15 || cropBox.height < 15) {
      // If no crop drawn, solve the whole image directly
      handleAutoSolve(queryText, uploadedImageSrc);
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!imageContainerRef.current) return;
      const rect = imageContainerRef.current.getBoundingClientRect();
      const scaleX = img.naturalWidth / rect.width;
      const scaleY = img.naturalHeight / rect.height;

      const cropCanvas = document.createElement("canvas");
      const cropW = Math.max(1, Math.round(cropBox.width * scaleX));
      const cropH = Math.max(1, Math.round(cropBox.height * scaleY));
      cropCanvas.width = cropW;
      cropCanvas.height = cropH;

      const ctx = cropCanvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(
          img,
          Math.round(cropBox.x * scaleX),
          Math.round(cropBox.y * scaleY),
          cropW,
          cropH,
          0,
          0,
          cropW,
          cropH
        );
        const croppedDataUrl = cropCanvas.toDataURL("image/png");
        handleAutoSolve(queryText || "Solve circled diagram / equation step-by-step", croppedDataUrl);
      }
    };
    img.src = uploadedImageSrc;
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        background: "rgba(0, 0, 0, 0.78)",
        backdropFilter: "blur(10px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "14px",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "740px",
          maxHeight: "92vh",
          background: "linear-gradient(180deg, #0f172a 0%, #090d16 100%)",
          border: "1.5px solid rgba(56, 189, 248, 0.4)",
          borderRadius: "22px",
          boxShadow: "0 25px 60px rgba(0,0,0,0.9), 0 0 40px rgba(56, 189, 248, 0.2)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          color: "#fff",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "linear-gradient(135deg, rgba(2, 132, 199, 0.18), rgba(99, 102, 241, 0.18))",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "38px",
                height: "38px",
                borderRadius: "50%",
                background: "linear-gradient(135deg, #0284c7, #6366f1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 2px 12px rgba(2, 132, 199, 0.45)",
                fontSize: "1.1rem",
              }}
            >
              ⭕
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: "1.08rem", color: "#f8fafc", letterSpacing: "-0.2px" }}>
                Circle to Search &amp; Visual AI
              </div>
              <div style={{ fontSize: "0.74rem", color: "#94a3b8" }}>
                Draw, Upload Diagram, or Ask Any Academic Question • Gemini 2.0 Flash + Groq LPU
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
            title="Close (ESC)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Input Switcher (Text Query vs Diagram/Image Upload) */}
        <div
          style={{
            padding: "12px 20px 8px",
            background: "rgba(15, 23, 42, 0.65)",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
            <button
              type="button"
              onClick={() => setActiveInputMode("text")}
              style={{
                padding: "6px 14px",
                borderRadius: "8px",
                fontSize: "0.78rem",
                fontWeight: 700,
                cursor: "pointer",
                background: activeInputMode === "text" ? "rgba(56, 189, 248, 0.2)" : "rgba(255, 255, 255, 0.05)",
                color: activeInputMode === "text" ? "#38bdf8" : "var(--text-dim)",
                border: activeInputMode === "text" ? "1px solid rgba(56, 189, 248, 0.45)" : "1px solid transparent",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              <span>✍️ Ask Question / Formula</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveInputMode("image");
                if (!uploadedImageSrc && fileInputRef.current) {
                  fileInputRef.current.click();
                }
              }}
              style={{
                padding: "6px 14px",
                borderRadius: "8px",
                fontSize: "0.78rem",
                fontWeight: 700,
                cursor: "pointer",
                background: activeInputMode === "image" ? "rgba(99, 102, 241, 0.2)" : "rgba(255, 255, 255, 0.05)",
                color: activeInputMode === "image" ? "#a5b4fc" : "var(--text-dim)",
                border: activeInputMode === "image" ? "1px solid rgba(99, 102, 241, 0.45)" : "1px solid transparent",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              <Crop size={13} />
              <span>📸 Circle on Diagram / Photo</span>
              {uploadedImageSrc && <span style={{ color: "#34d399", fontSize: "0.7rem" }}>● Active</span>}
            </button>
          </div>

          {activeInputMode === "text" ? (
            <div>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="text"
                  placeholder="Type or paste any question or formula (e.g. Solve Laplace of sin(3t), Banker's Algo)..."
                  value={queryText}
                  onChange={(e) => setQueryText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleAutoSolve(queryText);
                    }
                  }}
                  style={{
                    flex: 1,
                    background: "rgba(0, 0, 0, 0.4)",
                    border: "1px solid rgba(56, 189, 248, 0.35)",
                    color: "#fff",
                    borderRadius: "10px",
                    padding: "10px 14px",
                    fontSize: "0.85rem",
                    outline: "none",
                  }}
                />
                <button
                  type="button"
                  onClick={() => handleAutoSolve(queryText)}
                  disabled={isSolving || !queryText.trim()}
                  className="btn-primary"
                  style={{
                    padding: "0 18px",
                    borderRadius: "10px",
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <Sparkles size={14} />
                  <span>{isSolving ? "Solving..." : "Solve"}</span>
                </button>
              </div>

              {/* Quick suggestion chips */}
              {!solution && (
                <div style={{ display: "flex", gap: "6px", overflowX: "auto", padding: "8px 0 4px", scrollbarWidth: "none" }}>
                  <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", alignSelf: "center", flexShrink: 0 }}>
                    Try:
                  </span>
                  {SUGGESTED_QUERIES.map((q, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setQueryText(q);
                        handleAutoSolve(q);
                      }}
                      style={{
                        background: "rgba(255, 255, 255, 0.04)",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        borderRadius: "14px",
                        padding: "3px 10px",
                        fontSize: "0.72rem",
                        color: "#94a3b8",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                      }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div>
              {/* Diagram / Photo Upload & Interactive Circle Tool */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleImageUpload}
              />

              {!uploadedImageSrc ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: "2px dashed rgba(99, 102, 241, 0.4)",
                    borderRadius: "12px",
                    padding: "24px 16px",
                    textAlign: "center",
                    cursor: "pointer",
                    background: "rgba(99, 102, 241, 0.05)",
                    transition: "all 0.2s ease",
                  }}
                >
                  <Upload size={28} color="#818cf8" style={{ margin: "0 auto 8px" }} />
                  <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "#fff" }}>
                    Click to Upload or Paste (Ctrl+V) Diagram / Question Photo
                  </div>
                  <div style={{ fontSize: "0.74rem", color: "#94a3b8", marginTop: "4px" }}>
                    Works with handwritten math, circuit diagrams, physics derivations, and PYQ crops
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <span style={{ fontSize: "0.75rem", color: "#38bdf8", fontWeight: 600 }}>
                      ⭕ Click &amp; drag mouse or finger over the diagram/formula to circle it:
                    </span>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        type="button"
                        onClick={() => {
                          setUploadedImageSrc(null);
                          setCropBox(null);
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#f87171",
                          fontSize: "0.72rem",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "3px",
                        }}
                      >
                        <RotateCcw size={11} />
                        <span>Change Image</span>
                      </button>
                    </div>
                  </div>

                  {/* Interactive Image Canvas Area */}
                  <div
                    ref={imageContainerRef}
                    onPointerDown={handlePointerDownImage}
                    onPointerMove={handlePointerMoveImage}
                    onPointerUp={handlePointerUpImage}
                    style={{
                      position: "relative",
                      maxHeight: "220px",
                      overflow: "hidden",
                      borderRadius: "10px",
                      border: "1.5px solid rgba(56, 189, 248, 0.35)",
                      background: "#020617",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "crosshair",
                      userSelect: "none",
                      touchAction: "none",
                    }}
                  >
                    <img
                      src={uploadedImageSrc}
                      alt="Uploaded Crop"
                      style={{
                        maxWidth: "100%",
                        maxHeight: "220px",
                        objectFit: "contain",
                        pointerEvents: "none",
                      }}
                    />

                    {/* Glowing Selection Rectangle / Circle */}
                    {cropBox && (
                      <div
                        style={{
                          position: "absolute",
                          left: `${cropBox.x}px`,
                          top: `${cropBox.y}px`,
                          width: `${cropBox.width}px`,
                          height: `${cropBox.height}px`,
                          border: "2.5px solid #38bdf8",
                          borderRadius: "12px",
                          boxShadow: "0 0 15px rgba(56, 189, 248, 0.6), inset 0 0 12px rgba(56, 189, 248, 0.25)",
                          background: "radial-gradient(circle, rgba(56, 189, 248, 0.2) 0%, transparent 100%)",
                          pointerEvents: "none",
                        }}
                      />
                    )}
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px" }}>
                    <span style={{ fontSize: "0.72rem", color: "#94a3b8" }}>
                      {cropBox && cropBox.width > 15 ? `⭕ Circled: ${cropBox.width}×${cropBox.height}px` : "No crop selected (will analyze full image)"}
                    </span>
                    <button
                      type="button"
                      onClick={handleSolveCroppedRegion}
                      disabled={isSolving}
                      className="btn-primary"
                      style={{
                        padding: "6px 16px",
                        borderRadius: "8px",
                        fontSize: "0.78rem",
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <Sparkles size={13} />
                      <span>{isSolving ? "Analyzing..." : "⭕ Solve Circled Region"}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tab Switcher: AI Solution vs Notes Vault */}
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
            }}
          >
            <BookOpen size={15} />
            <span>Matching Notes ({matchingNotes.length})</span>
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
                      width: "42px",
                      height: "42px",
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
                    Turso L2 Cache ➔ Gemini 2.0 Multimodal &amp; Groq LPU
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
                        ? `⚡ ${solution.cacheTier || "Turso Cloud Cache"} (0ms Instant Hit)`
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
                      <span>{copied ? "Copied" : "Copy Solution"}</span>
                    </button>
                  </div>

                  {/* Solution Text with MathMarkdown KaTeX */}
                  <div
                    style={{
                      background: "rgba(0, 0, 0, 0.3)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      borderRadius: "14px",
                      padding: "16px",
                      fontSize: "0.88rem",
                      lineHeight: "1.65",
                      color: "#f1f5f9",
                    }}
                  >
                    <MathMarkdown content={solution.answer} />
                  </div>

                  {/* Auto-Save & Sync Footer Note */}
                  <div
                    style={{
                      marginTop: "12px",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      background: "rgba(16, 185, 129, 0.08)",
                      border: "1px solid rgba(16, 185, 129, 0.2)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      fontSize: "0.72rem",
                      color: "#94a3b8",
                    }}
                  >
                    <span>💾 Cached in Turso L2 Cache for Instant 0ms Future Access</span>
                    <span style={{ color: "#34d399", fontWeight: 600 }}>☁️ 0% Render Server Load</span>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "36px 20px", color: "#94a3b8" }}>
                  <div style={{ fontSize: "2rem", marginBottom: "8px" }}>⭕</div>
                  <div style={{ fontWeight: 600, color: "#cbd5e1", marginBottom: "4px" }}>
                    Type a math question above, or upload a photo to circle any formula or diagram!
                  </div>
                  <div style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>
                    Works with handwritten engineering notes, circuit schematics, physics diagrams &amp; PYQs.
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div>
              <div style={{ fontSize: "0.82rem", color: "#94a3b8", marginBottom: "12px" }}>
                Related lecture notes covering this topic across your library:
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
                  No exact matching notes found in the vault. Try searching a related topic above.
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
          <span>⭕ Circle to Search • Free Academic Cloud AI</span>
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
