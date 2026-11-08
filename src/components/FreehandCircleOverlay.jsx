import React, { useState, useRef, useEffect, useCallback } from "react";
import { Pencil, Sparkles, Copy, Check, Trash2, Undo2, X, Keyboard, Palette } from "lucide-react";
import GeminiIcon from "./GeminiIcon";
import {
  PENCIL_CURSOR_STYLE,
  strokePointsToSvgPath,
  computeFreehandBounds,
  renderFreehandStrokesToCanvas,
  extractDomContentFromScreenBounds,
  extractTextFromCroppedCanvas,
} from "../utils/circleSearchEngine";
import { warmupClientOcr } from "../utils/clientOcr";
import { useSafariNonPassiveTouchLock, copyTextSafariSafe } from "../utils/safariCompat";

export default function FreehandCircleOverlay({
  isActive,
  onCancel,
  onComplete,
  onOpenDirectModal,
  allNotes = [],
}) {
  const [strokes, setStrokes] = useState([]);
  const [currentStroke, setCurrentStroke] = useState(null);
  const [padMode, setPadMode] = useState(false); // false = Live Screen Select/Draw, true = Dedicated Clean Sketch Pad
  const [inkColor, setInkColor] = useState("#38bdf8");
  const [copiedText, setCopiedText] = useState(false);
  const [isExtractingCopy, setIsExtractingCopy] = useState(false);
  const [autoCountdown, setAutoCountdown] = useState(false);

  const overlayRef = useRef(null);
  const isDrawingRef = useRef(false);
  const autoSolveTimerRef = useRef(null);
  const strokesRef = useRef([]);
  const lastFinalizeTimeRef = useRef(0);

  // Prevent iOS/iPadOS Safari from hijacking touch drags into page scrolling or pointercancel
  useSafariNonPassiveTouchLock(overlayRef, isActive, "[data-pencil-toolbar='true'], button");

  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);

  const clearAutoTimer = useCallback(() => {
    if (autoSolveTimerRef.current) {
      clearTimeout(autoSolveTimerRef.current);
      autoSolveTimerRef.current = null;
    }
    setAutoCountdown(false);
  }, []);

  useEffect(() => {
    if (!isActive) {
      clearAutoTimer();
      setStrokes([]);
      setCurrentStroke(null);
      setPadMode(false);
      setCopiedText(false);
      setIsExtractingCopy(false);
      isDrawingRef.current = false;
    } else {
      warmupClientOcr();
    }
  }, [isActive, clearAutoTimer]);

  useEffect(() => {
    if (!isActive) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        clearAutoTimer();
        onCancel?.();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isActive, onCancel, clearAutoTimer]);

  const finalizeSelection = useCallback(
    async (inputStrokes) => {
      clearAutoTimer();
      const now = Date.now();
      if (now - lastFinalizeTimeRef.current < 900) return;
      lastFinalizeTimeRef.current = now;

      const targetStrokes = inputStrokes || strokesRef.current;
      if (!targetStrokes || targetStrokes.length === 0) return;

      const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
      const vh = typeof window !== "undefined" ? window.innerHeight : 800;
      const bounds = computeFreehandBounds(targetStrokes, vw, vh);
      if (!bounds) return;

      const sketch = renderFreehandStrokesToCanvas(targetStrokes, {
        background: "#ffffff",
        strokeColor: "#0f172a",
        lineWidth: 2.8,
      });

      if (padMode) {
        onComplete?.({
          text: "Analyze, identify, and solve this drawn structure / diagram / formula step-by-step",
          isPureSketch: true,
          source: "pencil-sketchpad",
          croppedImage: sketch?.dataUrl || null,
          bounds,
        });
        return;
      }

      const domHit = extractDomContentFromScreenBounds(bounds, allNotes);
      let resolvedScreenText = (domHit.text || "").trim();

      // If user circled an image/canvas on screen (e.g., handwritten note preview) with no DOM text,
      // run fast hybrid AI Vision + SIMD WASM handwriting extraction (~420ms, capped at 1800ms)!
      if (resolvedScreenText.length < 2 && domHit.croppedCanvas) {
        try {
          const ocrRes = await extractTextFromCroppedCanvas(domHit.croppedCanvas, undefined, {
            timeoutMs: 1800,
          });
          if (ocrRes?.text) {
            resolvedScreenText = ocrRes.text.trim();
          }
        } catch (_) {}
      }

      const hasScreenText = resolvedScreenText.length >= 2;

      if (hasScreenText || domHit.croppedImage) {
        onComplete?.({
          text: hasScreenText ? resolvedScreenText : "",
          source: "screen-pencil",
          croppedImage: domHit.croppedImage || null,
          noteId: domHit.matchedNote?.id || domHit.matchedNote?.noteId || "",
          subject: domHit.matchedNote?.subject || "",
          context: domHit.matchedNote
            ? `Selected Note: ${domHit.matchedNote.title || ""} (${domHit.matchedNote.subject || ""})\n${resolvedScreenText || ""}`
            : resolvedScreenText || "",
          bounds,
        });
      } else {
        // User drew a custom freehand structure/formula/symbol in open space!
        onComplete?.({
          text: "Identify, explain, and solve this drawn structure / formula / diagram step-by-step",
          isPureSketch: true,
          source: "pencil-structure",
          croppedImage: sketch?.dataUrl || null,
          bounds,
        });
      }
    },
    [allNotes, clearAutoTimer, onComplete, padMode]
  );

  const handlePointerDown = (e) => {
    if (e.target.closest("[data-pencil-toolbar='true']")) return;
    e.preventDefault();
    e.stopPropagation();
    clearAutoTimer();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}
    isDrawingRef.current = true;
    const pt = { x: e.clientX, y: e.clientY };
    setCurrentStroke([pt]);
  };

  const handlePointerMove = (e) => {
    if (!isDrawingRef.current || !currentStroke) return;
    e.preventDefault();
    e.stopPropagation();
    const pt = { x: e.clientX, y: e.clientY };
    setCurrentStroke((prev) => {
      if (!prev || prev.length === 0) return [pt];
      const last = prev[prev.length - 1];
      if (Math.hypot(pt.x - last.x, pt.y - last.y) < 2.5) return prev;
      return [...prev, pt];
    });
  };

  const handlePointerUp = (e) => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    try {
      if (e?.currentTarget && e?.pointerId !== undefined) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch (_) {}

    if (!currentStroke || currentStroke.length === 0) {
      setCurrentStroke(null);
      return;
    }

    const updated = [...strokesRef.current, currentStroke];
    strokesRef.current = updated;
    setStrokes(updated);
    setCurrentStroke(null);

    const geom = computeFreehandBounds(updated, window.innerWidth, window.innerHeight);
    if (!geom) return;

    // In Live Screen Mode, automatically deliver result after a snappy multi-stroke grace pause (480ms)
    // so both 1-stroke circles/underlines AND multi-stroke structures work effortlessly!
    if (!padMode) {
      setAutoCountdown(true);
      autoSolveTimerRef.current = setTimeout(() => {
        finalizeSelection(strokesRef.current);
      }, 480);
    }
  };

  const handleCopyUnderlyingText = async (e) => {
    e.stopPropagation();
    clearAutoTimer();
    if (isExtractingCopy) return;
    const bounds = computeFreehandBounds(strokesRef.current, window.innerWidth, window.innerHeight);
    if (!bounds) return;

    setIsExtractingCopy(true);
    try {
      const copied = await copyTextSafariSafe(async () => {
        let textToCopy = "";
        if (!padMode) {
          const domHit = extractDomContentFromScreenBounds(bounds, allNotes);
          textToCopy = (domHit.text || "").trim();
          if (!textToCopy && domHit.croppedCanvas) {
            const ocrRes = await extractTextFromCroppedCanvas(domHit.croppedCanvas);
            if (ocrRes?.text) textToCopy = ocrRes.text.trim();
          }
        }

        if (!textToCopy) {
          const sketch = renderFreehandStrokesToCanvas(strokesRef.current, {
            background: "#ffffff",
            strokeColor: "#0f172a",
            lineWidth: 2.8,
          });
          if (sketch?.canvas) {
            const sketchOcr = await extractTextFromCroppedCanvas(sketch.canvas);
            if (sketchOcr?.text) textToCopy = sketchOcr.text.trim();
          }
        }
        return textToCopy;
      });

      if (copied) {
        setCopiedText(true);
        setTimeout(() => {
          setCopiedText(false);
          onCancel?.();
        }, 1050);
      }
    } catch (_) {
    } finally {
      setIsExtractingCopy(false);
    }
  };

  if (!isActive) return null;

  const allActiveStrokes = currentStroke ? [...strokes, currentStroke] : strokes;
  const activeBounds = computeFreehandBounds(
    allActiveStrokes,
    typeof window !== "undefined" ? window.innerWidth : 1280,
    typeof window !== "undefined" ? window.innerHeight : 800
  );

  return (
    <div
      ref={overlayRef}
      data-pencil-overlay="true"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99998,
        cursor: PENCIL_CURSOR_STYLE,
        background: padMode
          ? "radial-gradient(circle at center, rgba(15, 23, 42, 0.97) 0%, rgba(2, 6, 23, 0.99) 100%)"
          : "rgba(2, 6, 23, 0.18)",
        backdropFilter: padMode ? "blur(12px)" : "none",
        WebkitBackdropFilter: padMode ? "blur(12px)" : "none",
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
      }}
    >
      {/* Subtle Shimmer Border indicating Live Pencil Mode */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          boxShadow: "inset 0 0 0 2.5px rgba(56, 189, 248, 0.65), inset 0 0 38px rgba(56, 189, 248, 0.22)",
        }}
      />

      {/* Top Floating Pencil Control Capsule */}
      <div
        data-pencil-toolbar="true"
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          top: "18px",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 100000,
          background: "rgba(15, 23, 42, 0.95)",
          backdropFilter: "blur(16px)",
          border: "1.5px solid rgba(56, 189, 248, 0.65)",
          boxShadow: "0 12px 36px rgba(0, 0, 0, 0.75), 0 0 24px rgba(56, 189, 248, 0.35)",
          borderRadius: "999px",
          padding: "7px 14px",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          flexWrap: "wrap",
          justifyContent: "center",
          maxWidth: "95vw",
          color: "#ffffff",
          fontSize: "0.79rem",
          fontWeight: 600,
        }}
      >
        <div style={{ display: "inline-flex", alignItems: "center", gap: "7px", paddingLeft: "4px" }}>
          <span
            style={{
              width: "26px",
              height: "26px",
              borderRadius: "50%",
              background: "linear-gradient(135deg, #0284c7, #6366f1)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 12px rgba(56, 189, 248, 0.6)",
            }}
          >
            <Pencil size={13} color="#fff" />
          </span>
          <span>
            {padMode
              ? "✏️ Sketch Pad: Draw any structure, diagram or formula freely"
              : "✏️ Pencil Active: Draw any shape/line on screen OR sketch any structure"}
          </span>
        </div>

        {/* Toggle Clean Sketch Pad vs Live Screen */}
        <button
          type="button"
          onClick={() => {
            clearAutoTimer();
            setStrokes([]);
            setPadMode((p) => !p);
          }}
          style={{
            background: padMode ? "linear-gradient(135deg, #8b5cf6, #6366f1)" : "rgba(255, 255, 255, 0.09)",
            border: "1px solid rgba(255, 255, 255, 0.2)",
            color: "#fff",
            borderRadius: "999px",
            padding: "4px 11px",
            fontSize: "0.73rem",
            fontWeight: 700,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
          }}
          title="Switch between drawing over live screen vs clean sketch pad"
        >
          <Palette size={12} />
          <span>{padMode ? "Live Screen" : "Clean Pad"}</span>
        </button>

        {/* Color Dots when in Sketch Pad */}
        {padMode && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
            {["#38bdf8", "#a855f7", "#34d399", "#f59e0b"].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setInkColor(c)}
                style={{
                  width: "16px",
                  height: "16px",
                  borderRadius: "50%",
                  background: c,
                  border: inkColor === c ? "2px solid #fff" : "1px solid rgba(255,255,255,0.3)",
                  cursor: "pointer",
                  padding: 0,
                }}
              />
            ))}
          </div>
        )}

        {strokes.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => {
                clearAutoTimer();
                setStrokes((prev) => prev.slice(0, -1));
              }}
              style={{
                background: "rgba(255, 255, 255, 0.08)",
                border: "1px solid rgba(255, 255, 255, 0.16)",
                color: "#cbd5e1",
                borderRadius: "999px",
                padding: "4px 9px",
                fontSize: "0.72rem",
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
              title="Undo last stroke"
            >
              <Undo2 size={12} />
              <span>Undo</span>
            </button>
            <button
              type="button"
              onClick={() => {
                clearAutoTimer();
                setStrokes([]);
              }}
              style={{
                background: "rgba(244, 63, 94, 0.16)",
                border: "1px solid rgba(244, 63, 94, 0.35)",
                color: "#fda4af",
                borderRadius: "999px",
                padding: "4px 9px",
                fontSize: "0.72rem",
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
              title="Clear drawing"
            >
              <Trash2 size={12} />
              <span>Clear</span>
            </button>
          </>
        )}

        {onOpenDirectModal && (
          <button
            type="button"
            onClick={() => {
              clearAutoTimer();
              onOpenDirectModal();
            }}
            style={{
              background: "rgba(56, 189, 248, 0.14)",
              border: "1px solid rgba(56, 189, 248, 0.35)",
              color: "#7dd3fc",
              borderRadius: "999px",
              padding: "4px 10px",
              fontSize: "0.73rem",
              fontWeight: 700,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
            }}
            title="Open Circle Search Chat & Upload Modal directly"
          >
            <Keyboard size={12} />
            <span>Ask / Upload</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            clearAutoTimer();
            onCancel?.();
          }}
          style={{
            background: "rgba(244, 63, 94, 0.25)",
            color: "#fecdd3",
            border: "1px solid rgba(244, 63, 94, 0.5)",
            borderRadius: "999px",
            padding: "4px 11px",
            fontSize: "0.73rem",
            cursor: "pointer",
            fontWeight: 700,
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          <X size={13} />
          <span>Exit</span>
        </button>
      </div>

      {/* Subtle grid guide when Clean Sketch Pad is enabled */}
      {padMode && strokes.length === 0 && !currentStroke && (
        <div
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            textAlign: "center",
            pointerEvents: "none",
            color: "#64748b",
          }}
        >
          <Pencil size={38} color="#38bdf8" style={{ opacity: 0.65, marginBottom: "10px" }} />
          <div style={{ fontSize: "1rem", fontWeight: 700, color: "#cbd5e1" }}>
            Draw any diagram, structure, graph, circuit, or math equation
          </div>
          <div style={{ fontSize: "0.8rem", marginTop: "4px" }}>
            Use as many pencil strokes as you want, then click &ldquo;Get Result&rdquo;
          </div>
        </div>
      )}

      {/* Freehand SVG Ink Layer (Safari WebKit 60fps safe — avoids 0x0 objectBoundingBox SVG filter bug) */}
      <svg
        width="100%"
        height="100%"
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          overflow: "visible",
        }}
      >
        {allActiveStrokes.map((stroke, idx) => {
          const d = strokePointsToSvgPath(stroke);
          if (!d) return null;
          return (
            <g key={idx}>
              <path
                d={d}
                fill="none"
                stroke={inkColor}
                strokeOpacity="0.25"
                strokeWidth="5.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d={d}
                fill="none"
                stroke={padMode ? inkColor : "#ffffff"}
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          );
        })}
      </svg>

      {/* Floating Action Pill right next to drawn structure */}
      {activeBounds && !currentStroke && strokes.length > 0 && (
        <div
          data-pencil-toolbar="true"
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            left: `${Math.max(
              150,
              Math.min(
                (typeof window !== "undefined" ? window.innerWidth : 1000) - 150,
                activeBounds.x + activeBounds.width / 2
              )
            )}px`,
            top: `${
              activeBounds.y + activeBounds.height + 58 < (typeof window !== "undefined" ? window.innerHeight : 800)
                ? activeBounds.y + activeBounds.height + 12
                : Math.max(72, activeBounds.y - 52)
            }px`,
            transform: "translateX(-50%)",
            zIndex: 100001,
            display: "flex",
            alignItems: "center",
            gap: "6px",
            background: "rgba(15, 23, 42, 0.96)",
            backdropFilter: "blur(14px)",
            border: "1.5px solid #38bdf8",
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.8), 0 0 20px rgba(56, 189, 248, 0.45)",
            borderRadius: "999px",
            padding: "5px 10px",
          }}
        >
          <button
            type="button"
            onClick={handleCopyUnderlyingText}
            disabled={isExtractingCopy}
            style={{
              background: copiedText ? "rgba(16, 185, 129, 0.25)" : "rgba(255, 255, 255, 0.1)",
              border: copiedText ? "1px solid #10b981" : "1px solid rgba(255, 255, 255, 0.2)",
              color: copiedText ? "#34d399" : "#ffffff",
              borderRadius: "999px",
              padding: "5px 12px",
              fontSize: "0.75rem",
              fontWeight: 700,
              cursor: isExtractingCopy ? "wait" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
            }}
            title="Extract & copy handwritten or screen text"
          >
            {copiedText ? <Check size={13} color="#34d399" /> : <Copy size={13} />}
            <span>
              {copiedText ? "Copied!" : isExtractingCopy ? "⚡ Reading..." : "📋 Copy Text"}
            </span>
          </button>

          <button
            type="button"
            onClick={() => finalizeSelection(strokes)}
            style={{
              background: "linear-gradient(135deg, #0284c7, #6366f1)",
              border: "none",
              color: "#ffffff",
              borderRadius: "999px",
              padding: "6px 15px",
              fontSize: "0.76rem",
              fontWeight: 800,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: "0 2px 12px rgba(2, 132, 199, 0.5)",
            }}
          >
            <GeminiIcon size={14} />
            <span>{autoCountdown ? "✨ Getting Result..." : "✨ Get Result"}</span>
          </button>
        </div>
      )}
    </div>
  );
}
