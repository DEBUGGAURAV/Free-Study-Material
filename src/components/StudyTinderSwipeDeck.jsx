import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Sparkles,
  Flame,
  Star,
  CheckCircle2,
  RotateCw,
  RotateCcw,
  Layers,
  ChevronLeft,
  ChevronRight,
  Lightbulb,
  Award,
  Volume2,
  VolumeX,
  HelpCircle,
  Zap,
} from "lucide-react";
import MathMarkdown from "./MathMarkdown";

/**
 * 🎊 Zero-dependency 60fps Canvas Confetti
 */
function triggerConfetti(canvasRef, count = 45, isGold = false) {
  const canvas = canvasRef?.current;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = (canvas.width = canvas.offsetWidth || 340);
  const height = (canvas.height = canvas.offsetHeight || 380);

  const colors = isGold
    ? ["#f59e0b", "#fbbf24", "#fcd34d", "#d97706", "#ffffff"]
    : ["#10b981", "#34d399", "#6ee7b7", "#06b6d4", "#8b5cf6", "#ec4899", "#f59e0b"];

  const particles = Array.from({ length: count }, () => ({
    x: width / 2 + (Math.random() - 0.5) * 60,
    y: height / 2 + (Math.random() - 0.5) * 40,
    vx: (Math.random() - 0.5) * 12,
    vy: -Math.random() * 10 - 4,
    size: Math.random() * 7 + 4,
    color: colors[Math.floor(Math.random() * colors.length)],
    rotation: Math.random() * 360,
    vRot: (Math.random() - 0.5) * 15,
    opacity: 1,
  }));

  let animFrameId = null;
  const render = () => {
    ctx.clearRect(0, 0, width, height);
    let alive = false;
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.35; // gravity
      p.rotation += p.vRot;
      p.opacity -= 0.018;

      if (p.opacity > 0) {
        alive = true;
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
        ctx.restore();
      }
    }

    if (alive) {
      animFrameId = requestAnimationFrame(render);
    } else {
      ctx.clearRect(0, 0, width, height);
    }
  };

  render();
}

/**
 * 🔊 Zero-cost Web Audio API Synth Chimes
 */
function playSynthSound(type = "success") {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    if (type === "success") {
      // Pleasant high-arpeggio chime
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.12); // A5
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    } else if (type === "gold") {
      // Shimmering triple tone
      osc.type = "triangle";
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
      osc.frequency.exponentialRampToValueAtTime(1046.5, now + 0.18); // C6
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (type === "flip") {
      // Subtle wooden click/whoosh
      osc.type = "sine";
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(160, now + 0.08);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    }
  } catch (_) {}
}

export default function StudyTinderSwipeDeck({
  cards = [],
  title = "Study Notes",
  subject = "Exam Prep",
  onMasterCard = null,
  onBookmarkCard = null,
  onResetDeck = null,
}) {
  const [deck, setDeck] = useState(() => (Array.isArray(cards) ? [...cards] : []));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [exitDirection, setExitDirection] = useState(null); // 'left' | 'right' | 'up' | null
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [masteredIds, setMasteredIds] = useState(new Set());
  const [goldStarredIds, setGoldStarredIds] = useState(new Set());
  const [reviewIds, setReviewIds] = useState(new Set());
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [historyStack, setHistoryStack] = useState([]);

  const canvasRef = useRef(null);
  const cardRef = useRef(null);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const hasMovedRef = useRef(false);

  // Sync deck if cards prop changes
  useEffect(() => {
    if (Array.isArray(cards) && cards.length > 0) {
      setDeck([...cards]);
      setCurrentIndex(0);
      setIsFlipped(false);
      setExitDirection(null);
    }
  }, [cards]);

  const currentCard = deck[currentIndex] || null;
  const isDeckFinished = currentIndex >= deck.length && deck.length > 0;

  // Sound helper
  const triggerSound = useCallback(
    (type) => {
      if (soundEnabled) playSynthSound(type);
    },
    [soundEnabled]
  );

  // Swipe Action: Right (Mastered)
  const handleSwipeRight = useCallback(() => {
    if (!currentCard || exitDirection) return;
    setExitDirection("right");
    triggerSound("success");
    if (navigator?.vibrate) navigator.vibrate([20, 40]);
    triggerConfetti(canvasRef, 40, false);

    const cardId = currentCard.id || currentIndex;
    setMasteredIds((prev) => new Set([...prev, cardId]));
    setReviewIds((prev) => {
      const copy = new Set(prev);
      copy.delete(cardId);
      return copy;
    });

    setStreak((s) => {
      const next = s + 1;
      setBestStreak((b) => Math.max(b, next));
      return next;
    });

    setHistoryStack((h) => [
      ...h,
      { index: currentIndex, action: "right", wasFlipped: isFlipped, cardId },
    ]);

    if (onMasterCard) onMasterCard(currentCard);

    setTimeout(() => {
      setCurrentIndex((idx) => idx + 1);
      setIsFlipped(false);
      setExitDirection(null);
      setDragOffset({ x: 0, y: 0 });
    }, 240);
  }, [currentCard, currentIndex, isFlipped, exitDirection, onMasterCard, triggerSound]);

  // Swipe Action: Up (Gold Exam Bookmark)
  const handleSwipeUp = useCallback(() => {
    if (!currentCard || exitDirection) return;
    setExitDirection("up");
    triggerSound("gold");
    if (navigator?.vibrate) navigator.vibrate([30, 30, 30]);
    triggerConfetti(canvasRef, 35, true);

    const cardId = currentCard.id || currentIndex;
    setGoldStarredIds((prev) => new Set([...prev, cardId]));

    setHistoryStack((h) => [
      ...h,
      { index: currentIndex, action: "up", wasFlipped: isFlipped, cardId },
    ]);

    if (onBookmarkCard) onBookmarkCard(currentCard);

    setTimeout(() => {
      setCurrentIndex((idx) => idx + 1);
      setIsFlipped(false);
      setExitDirection(null);
      setDragOffset({ x: 0, y: 0 });
    }, 240);
  }, [currentCard, currentIndex, isFlipped, exitDirection, onBookmarkCard, triggerSound]);

  // Swipe Action: Left (Revise / Flip)
  const handleSwipeLeft = useCallback(() => {
    if (!currentCard || exitDirection) return;

    if (!isFlipped) {
      // First swipe left: 3D Flip to reveal answer & key trick!
      setIsFlipped(true);
      triggerSound("flip");
      if (navigator?.vibrate) navigator.vibrate(20);
      setStreak(0); // reset streak on needing help
      const cardId = currentCard.id || currentIndex;
      setReviewIds((prev) => new Set([...prev, cardId]));
      setDragOffset({ x: 0, y: 0 });
      return;
    }

    // If already flipped: Dismiss to 'Needs Review' pile and go to next
    setExitDirection("left");
    triggerSound("flip");
    if (navigator?.vibrate) navigator.vibrate(25);

    const cardId = currentCard.id || currentIndex;
    setReviewIds((prev) => new Set([...prev, cardId]));

    setHistoryStack((h) => [
      ...h,
      { index: currentIndex, action: "left", wasFlipped: true, cardId },
    ]);

    setTimeout(() => {
      setCurrentIndex((idx) => idx + 1);
      setIsFlipped(false);
      setExitDirection(null);
      setDragOffset({ x: 0, y: 0 });
    }, 240);
  }, [currentCard, currentIndex, isFlipped, exitDirection, triggerSound]);

  // Undo previous swipe
  const handleUndo = () => {
    if (historyStack.length === 0 || currentIndex === 0) return;
    const last = historyStack[historyStack.length - 1];
    setHistoryStack((h) => h.slice(0, -1));
    setCurrentIndex(last.index);
    setIsFlipped(last.wasFlipped || false);
    setExitDirection(null);
    setDragOffset({ x: 0, y: 0 });
    triggerSound("flip");
  };

  // Reset & Shuffle Deck
  const handleRestart = (onlyStarred = false) => {
    let newCards = [...cards];
    if (onlyStarred && goldStarredIds.size > 0) {
      newCards = newCards.filter((c, idx) => goldStarredIds.has(c.id || idx));
    }
    // Fisher-Yates shuffle
    for (let i = newCards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newCards[i], newCards[j]] = [newCards[j], newCards[i]];
    }
    setDeck(newCards);
    setCurrentIndex(0);
    setIsFlipped(false);
    setExitDirection(null);
    setStreak(0);
    setHistoryStack([]);
    if (onResetDeck) onResetDeck();
  };

  // Keyboard Navigation
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        handleSwipeRight();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        handleSwipeLeft();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        handleSwipeUp();
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setIsFlipped((f) => !f);
        triggerSound("flip");
      } else if (e.key === "Backspace" || e.key === "z") {
        handleUndo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSwipeRight, handleSwipeLeft, handleSwipeUp, triggerSound]);

  // Pointer / Touch Gestures Physics
  const handlePointerDown = (e) => {
    if (exitDirection) return;
    setIsDragging(true);
    hasMovedRef.current = false;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerMove = (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
      hasMovedRef.current = true;
    }
    setDragOffset({ x: dx, y: dy });
  };

  const handlePointerUp = () => {
    if (!isDragging) return;
    setIsDragging(false);

    const { x, y } = dragOffset;

    // Tap without significant drag: flip the card!
    if (!hasMovedRef.current || (Math.abs(x) < 14 && Math.abs(y) < 14)) {
      setIsFlipped((f) => !f);
      triggerSound("flip");
      setDragOffset({ x: 0, y: 0 });
      return;
    }

    // Threshold check for swipe
    if (x > 85) {
      handleSwipeRight();
    } else if (x < -85) {
      handleSwipeLeft();
    } else if (y < -75 && Math.abs(x) < 60) {
      handleSwipeUp();
    } else {
      // Spring back to center
      setDragOffset({ x: 0, y: 0 });
    }
  };

  // Transform calculation
  const getCardTransform = () => {
    if (exitDirection === "right") {
      return "translate(140%, 15px) rotate(28deg)";
    }
    if (exitDirection === "left") {
      return "translate(-140%, 15px) rotate(-28deg)";
    }
    if (exitDirection === "up") {
      return "translate(0px, -140%) scale(0.85)";
    }
    if (isDragging) {
      const rot = dragOffset.x * 0.08;
      return `translate(${dragOffset.x}px, ${dragOffset.y}px) rotate(${rot}deg)`;
    }
    return "translate(0px, 0px) rotate(0deg)";
  };

  // Visual drag stamps opacity
  const rightStampOpacity = Math.max(0, Math.min(1, (dragOffset.x - 20) / 65));
  const leftStampOpacity = Math.max(0, Math.min(1, (-dragOffset.x - 20) / 65));
  const upStampOpacity =
    Math.abs(dragOffset.x) < 45 ? Math.max(0, Math.min(1, (-dragOffset.y - 20) / 55)) : 0;

  // Next cards preview
  const nextCard = deck[currentIndex + 1] || null;
  const thirdCard = deck[currentIndex + 2] || null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: "100%",
        userSelect: "none",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* 🎊 Particle Confetti Canvas Layer */}
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          zIndex: 99,
        }}
      />

      {/* 🌟 Header Stats & Dopamine Streak HUD Strip */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "6px 8px",
          marginBottom: "10px",
          borderRadius: "14px",
          background: "rgba(15, 23, 42, 0.4)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          flexWrap: "wrap",
          gap: "8px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {/* Flame Streak Badge */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "4px 10px",
              borderRadius: "999px",
              background:
                streak >= 3
                  ? "linear-gradient(135deg, rgba(239, 68, 68, 0.25), rgba(245, 158, 11, 0.25))"
                  : "rgba(255, 255, 255, 0.05)",
              border:
                streak >= 3
                  ? "1px solid rgba(245, 158, 11, 0.5)"
                  : "1px solid rgba(255, 255, 255, 0.1)",
              color: streak >= 3 ? "#f59e0b" : "#94a3b8",
              fontSize: "0.76rem",
              fontWeight: 800,
              boxShadow: streak >= 3 ? "0 0 12px rgba(245, 158, 11, 0.3)" : "none",
            }}
            title={`Current Study Streak: ${streak} cards in a row without a hint! Best: ${bestStreak}`}
          >
            <Flame size={14} className={streak >= 3 ? "animate-pulse" : ""} color="#f59e0b" />
            <span>
              {streak} {streak === 1 ? "Streak" : "Streak"}
            </span>
          </div>

          {/* Gold Star Count */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "4px 9px",
              borderRadius: "999px",
              background: "rgba(245, 158, 11, 0.12)",
              border: "1px solid rgba(245, 158, 11, 0.3)",
              color: "#fbbf24",
              fontSize: "0.72rem",
              fontWeight: 700,
            }}
            title="Questions marked as '⭐ Exam me Pakka Aayega!'"
          >
            <Star size={12} fill="#fbbf24" color="#fbbf24" />
            <span>{goldStarredIds.size} Starred</span>
          </div>
        </div>

        {/* Card Progress & Sound Control */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
            Card <strong>{Math.min(currentIndex + 1, deck.length)}</strong> /{" "}
            <strong>{deck.length}</strong>
          </span>

          <button
            type="button"
            onClick={() => setSoundEnabled((s) => !s)}
            style={{
              background: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              color: soundEnabled ? "#38bdf8" : "#64748b",
              borderRadius: "8px",
              padding: "4px 8px",
              fontSize: "0.7rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
            title={soundEnabled ? "Mute audio chimes" : "Enable audio chimes"}
          >
            {soundEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
          </button>
        </div>
      </div>

      {/* 📊 Slim Progress Bar */}
      <div
        style={{
          width: "100%",
          height: "4px",
          background: "rgba(255, 255, 255, 0.08)",
          borderRadius: "999px",
          marginBottom: "12px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${deck.length > 0 ? (currentIndex / deck.length) * 100 : 0}%`,
            background: "linear-gradient(90deg, #8b5cf6, #34d399)",
            borderRadius: "999px",
            transition: "width 0.25s ease",
          }}
        />
      </div>

      {/* 🃏 MAIN 3D TINDER CARD STACK CONTAINER */}
      <div
        style={{
          flex: 1,
          position: "relative",
          minHeight: "330px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          perspective: "1200px",
          touchAction: "none",
        }}
      >
        {isDeckFinished ? (
          /* 🎉 DECK COMPLETED VICTORY SCREEN */
          <div
            style={{
              width: "100%",
              maxWidth: "460px",
              padding: "32px 24px",
              background: "linear-gradient(145deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.98))",
              borderRadius: "24px",
              border: "1.5px solid rgba(139, 92, 246, 0.4)",
              boxShadow: "0 16px 40px rgba(0, 0, 0, 0.5), 0 0 25px rgba(139, 92, 246, 0.2)",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "16px",
            }}
          >
            <div
              style={{
                width: "68px",
                height: "68px",
                borderRadius: "50%",
                background: "linear-gradient(135deg, #10b981, #06b6d4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 0 24px rgba(16, 185, 129, 0.5)",
              }}
            >
              <Award size={36} color="#fff" />
            </div>

            <div>
              <h3 style={{ fontSize: "1.25rem", fontWeight: 800, color: "#fff", margin: "0 0 6px 0" }}>
                Revision Round Complete! 🏆
              </h3>
              <p style={{ fontSize: "0.82rem", color: "#94a3b8", margin: 0 }}>
                You swiped through all <strong>{deck.length}</strong> concepts for{" "}
                <span style={{ color: "#c4b5fd" }}>{title}</span>.
              </p>
            </div>

            {/* Score Grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "10px",
                width: "100%",
                marginTop: "4px",
              }}
            >
              <div
                style={{
                  background: "rgba(16, 185, 129, 0.12)",
                  border: "1px solid rgba(16, 185, 129, 0.3)",
                  borderRadius: "14px",
                  padding: "10px 6px",
                }}
              >
                <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#34d399" }}>
                  {masteredIds.size}
                </div>
                <div style={{ fontSize: "0.68rem", color: "#a7f3d0", fontWeight: 600 }}>
                  ✅ Mastered
                </div>
              </div>

              <div
                style={{
                  background: "rgba(245, 158, 11, 0.12)",
                  border: "1px solid rgba(245, 158, 11, 0.3)",
                  borderRadius: "14px",
                  padding: "10px 6px",
                }}
              >
                <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#fbbf24" }}>
                  {goldStarredIds.size}
                </div>
                <div style={{ fontSize: "0.68rem", color: "#fde68a", fontWeight: 600 }}>
                  ⭐ High-Yield
                </div>
              </div>

              <div
                style={{
                  background: "rgba(239, 68, 68, 0.12)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  borderRadius: "14px",
                  padding: "10px 6px",
                }}
              >
                <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#f87171" }}>
                  {reviewIds.size}
                </div>
                <div style={{ fontSize: "0.68rem", color: "#fca5a5", fontWeight: 600 }}>
                  💡 Need Review
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: "flex", gap: "10px", width: "100%", marginTop: "8px" }}>
              <button
                type="button"
                onClick={() => handleRestart(false)}
                style={{
                  flex: 1,
                  background: "linear-gradient(135deg, #8b5cf6, #6366f1)",
                  border: "none",
                  borderRadius: "12px",
                  padding: "12px",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: "0.85rem",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  boxShadow: "0 4px 15px rgba(139, 92, 246, 0.4)",
                }}
              >
                <RotateCw size={15} />
                <span>Shuffle & Replay</span>
              </button>

              {goldStarredIds.size > 0 && (
                <button
                  type="button"
                  onClick={() => handleRestart(true)}
                  style={{
                    flex: 1,
                    background: "rgba(245, 158, 11, 0.15)",
                    border: "1px solid rgba(245, 158, 11, 0.4)",
                    borderRadius: "12px",
                    padding: "12px",
                    color: "#fbbf24",
                    fontWeight: 700,
                    fontSize: "0.85rem",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                  }}
                >
                  <Star size={15} fill="#fbbf24" />
                  <span>Only Starred ({goldStarredIds.size})</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* 🥉 Layer 3 Underneath Card (Peek) */}
            {thirdCard && (
              <div
                style={{
                  position: "absolute",
                  width: "100%",
                  maxWidth: "500px",
                  height: "100%",
                  maxHeight: "410px",
                  borderRadius: "24px",
                  background: "rgba(15, 23, 42, 0.7)",
                  border: "1px solid rgba(255, 255, 255, 0.04)",
                  transform: "translateY(24px) scale(0.91)",
                  opacity: 0.35,
                  pointerEvents: "none",
                  zIndex: 1,
                }}
              />
            )}

            {/* 🥈 Layer 2 Underneath Card (Peek) */}
            {nextCard && (
              <div
                style={{
                  position: "absolute",
                  width: "100%",
                  maxWidth: "500px",
                  height: "100%",
                  maxHeight: "410px",
                  borderRadius: "24px",
                  background: "linear-gradient(145deg, rgba(30, 41, 59, 0.85), rgba(15, 23, 42, 0.9))",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  transform: "translateY(12px) scale(0.96)",
                  opacity: 0.75,
                  pointerEvents: "none",
                  zIndex: 2,
                  boxShadow: "0 10px 25px rgba(0, 0, 0, 0.3)",
                }}
              />
            )}

            {/* 🥇 Top Interactive Swipable Tinder Card */}
            {currentCard && (
              <div
                ref={cardRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                style={{
                  position: "absolute",
                  width: "100%",
                  maxWidth: "500px",
                  height: "100%",
                  maxHeight: "410px",
                  borderRadius: "24px",
                  padding: "26px",
                  cursor: isDragging ? "grabbing" : "grab",
                  transform: getCardTransform(),
                  transition: isDragging
                    ? "none"
                    : exitDirection
                    ? "transform 0.28s cubic-bezier(0.2, 0.9, 0.3, 1.2), opacity 0.28s ease"
                    : "transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
                  background: isFlipped
                    ? "linear-gradient(145deg, rgba(30, 41, 59, 0.97), rgba(15, 23, 42, 0.99))"
                    : "linear-gradient(145deg, rgba(88, 28, 135, 0.32), rgba(15, 23, 42, 0.98))",
                  border: isFlipped
                    ? "1.5px solid rgba(52, 211, 153, 0.55)"
                    : "1.5px solid rgba(139, 92, 246, 0.45)",
                  boxShadow: isFlipped
                    ? "0 16px 40px rgba(52, 211, 153, 0.18), 0 0 20px rgba(52, 211, 153, 0.1)"
                    : "0 16px 40px rgba(139, 92, 246, 0.22), 0 0 20px rgba(139, 92, 246, 0.1)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  zIndex: 10,
                  overflow: "hidden",
                }}
              >
                {/* 🟢 DRAG STAMP: RIGHT (PATA HAI! ✅) */}
                <div
                  style={{
                    position: "absolute",
                    top: "22px",
                    left: "22px",
                    padding: "6px 14px",
                    borderRadius: "10px",
                    border: "2.5px solid #10b981",
                    color: "#10b981",
                    background: "rgba(16, 185, 129, 0.2)",
                    fontWeight: 900,
                    fontSize: "0.92rem",
                    letterSpacing: "1px",
                    transform: "rotate(-12deg)",
                    opacity: rightStampOpacity,
                    pointerEvents: "none",
                    boxShadow: "0 0 15px rgba(16, 185, 129, 0.5)",
                    transition: "opacity 0.1s ease",
                    zIndex: 20,
                  }}
                >
                  PATA HAI! ✅
                </div>

                {/* 🔴 DRAG STAMP: LEFT (REVISE / FLIP 💡) */}
                <div
                  style={{
                    position: "absolute",
                    top: "22px",
                    right: "22px",
                    padding: "6px 14px",
                    borderRadius: "10px",
                    border: "2.5px solid #f43f5e",
                    color: "#f43f5e",
                    background: "rgba(244, 63, 94, 0.2)",
                    fontWeight: 900,
                    fontSize: "0.92rem",
                    letterSpacing: "1px",
                    transform: "rotate(12deg)",
                    opacity: leftStampOpacity,
                    pointerEvents: "none",
                    boxShadow: "0 0 15px rgba(244, 63, 94, 0.5)",
                    transition: "opacity 0.1s ease",
                    zIndex: 20,
                  }}
                >
                  REVISE 💡
                </div>

                {/* 🟡 DRAG STAMP: UP (⭐ EXAM ME PAKKA AAYEGA!) */}
                <div
                  style={{
                    position: "absolute",
                    bottom: "22px",
                    left: "50%",
                    transform: "translateX(-50%)",
                    padding: "6px 16px",
                    borderRadius: "10px",
                    border: "2.5px solid #f59e0b",
                    color: "#f59e0b",
                    background: "rgba(245, 158, 11, 0.25)",
                    fontWeight: 900,
                    fontSize: "0.85rem",
                    letterSpacing: "0.5px",
                    opacity: upStampOpacity,
                    pointerEvents: "none",
                    boxShadow: "0 0 15px rgba(245, 158, 11, 0.6)",
                    transition: "opacity 0.1s ease",
                    whiteSpace: "nowrap",
                    zIndex: 20,
                  }}
                >
                  ⭐ EXAM ME PAKKA AAYEGA!
                </div>

                {/* Card Top Category & Flip Chip */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: 800,
                      padding: "4px 10px",
                      borderRadius: "8px",
                      background: isFlipped ? "rgba(52, 211, 153, 0.18)" : "rgba(139, 92, 246, 0.22)",
                      color: isFlipped ? "#34d399" : "#c4b5fd",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                      letterSpacing: "0.3px",
                    }}
                  >
                    {isFlipped ? (
                      <>
                        <CheckCircle2 size={13} />
                        <span>💡 EXAM ANSWER &amp; KEY FORMULA</span>
                      </>
                    ) : (
                      <>
                        <HelpCircle size={13} />
                        <span>❓ EXAM CONCEPT / QUESTION</span>
                      </>
                    )}
                  </span>

                  {currentCard.category && (
                    <span
                      style={{
                        fontSize: "0.68rem",
                        color: "#94a3b8",
                        background: "rgba(255, 255, 255, 0.05)",
                        padding: "3px 8px",
                        borderRadius: "6px",
                        fontWeight: 600,
                      }}
                    >
                      {currentCard.category}
                    </span>
                  )}
                </div>

                {/* Card Center Content with Math KaTeX */}
                <div
                  style={{
                    margin: "auto 0",
                    padding: "16px 0",
                    maxHeight: "260px",
                    overflowY: "auto",
                    scrollbarWidth: "none",
                  }}
                >
                  <div
                    style={{
                      fontSize: isFlipped ? "1.02rem" : "1.15rem",
                      fontWeight: isFlipped ? 500 : 700,
                      lineHeight: 1.6,
                      color: isFlipped ? "#f1f5f9" : "#ffffff",
                      wordBreak: "break-word",
                    }}
                  >
                    <MathMarkdown
                      content={
                        isFlipped
                          ? currentCard.answer || currentCard.back || "Answer not available."
                          : currentCard.question || currentCard.front || "Question text."
                      }
                    />
                  </div>

                  {/* 💡 Desi Memory Trick / Exam Tip Box if flipped */}
                  {isFlipped && (currentCard.trick || currentCard.tip) && (
                    <div
                      style={{
                        marginTop: "14px",
                        padding: "10px 14px",
                        borderRadius: "10px",
                        background: "rgba(245, 158, 11, 0.1)",
                        border: "1px solid rgba(245, 158, 11, 0.3)",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "8px",
                      }}
                    >
                      <Lightbulb size={16} color="#fbbf24" style={{ flexShrink: 0, marginTop: "2px" }} />
                      <div style={{ fontSize: "0.78rem", color: "#fde68a", lineHeight: 1.4 }}>
                        <strong>Exam Trick / Tip:</strong> {currentCard.trick || currentCard.tip}
                      </div>
                    </div>
                  )}
                </div>

                {/* Card Bottom Gesture Guide */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "0.7rem",
                    color: "#94a3b8",
                    borderTop: "1px solid rgba(255, 255, 255, 0.06)",
                    paddingTop: "10px",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <Sparkles size={11} color="#c4b5fd" />
                    <span>Tap card to flip (or Spacebar)</span>
                  </span>

                  <span style={{ color: "#64748b" }}>Swipe 👉 Pata hai • 👈 Revise</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 🎮 BOTTOM THUMB-FRIENDLY TACTILE ACTION BUTTONS */}
      {!isDeckFinished && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "16px",
            paddingTop: "14px",
          }}
        >
          {/* ↩️ Undo Previous Card */}
          <button
            type="button"
            onClick={handleUndo}
            disabled={historyStack.length === 0}
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "50%",
              background: "rgba(255, 255, 255, 0.06)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              color: historyStack.length > 0 ? "#cbd5e1" : "#475569",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: historyStack.length > 0 ? "pointer" : "default",
              transition: "transform 0.15s ease",
            }}
            title="Undo previous swipe (Hotkey: Z)"
          >
            <RotateCcw size={16} />
          </button>

          {/* 🔴 Swipe Left: ❌ Revise / Flip */}
          <button
            type="button"
            onClick={handleSwipeLeft}
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              background: "linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(225, 29, 72, 0.25))",
              border: "2px solid rgba(244, 63, 94, 0.5)",
              color: "#f43f5e",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              boxShadow: "0 6px 18px rgba(244, 63, 94, 0.25)",
              transition: "transform 0.15s ease, box-shadow 0.15s ease",
            }}
            title="Nahi Pata: Flip to read explanation (Hotkey: 🠄 Left Arrow)"
          >
            <span style={{ fontSize: "1.2rem", lineHeight: 1 }}>✕</span>
            <span style={{ fontSize: "0.58rem", fontWeight: 800, marginTop: "2px" }}>REVISE</span>
          </button>

          {/* 🟡 Swipe Up: ⭐ Exam me Pakka Aayega! */}
          <button
            type="button"
            onClick={handleSwipeUp}
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              background: "linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(217, 119, 6, 0.25))",
              border: "2px solid rgba(245, 158, 11, 0.5)",
              color: "#fbbf24",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              boxShadow: "0 6px 18px rgba(245, 158, 11, 0.25)",
              transition: "transform 0.15s ease",
            }}
            title="Exam me Pakka Aayega! Gold Bookmark (Hotkey: 🠅 Up Arrow)"
          >
            <Star size={18} fill="#fbbf24" />
          </button>

          {/* 🟢 Swipe Right: ✅ Pata Hai! */}
          <button
            type="button"
            onClick={handleSwipeRight}
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              background: "linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(5, 150, 105, 0.25))",
              border: "2px solid rgba(16, 185, 129, 0.55)",
              color: "#10b981",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              boxShadow: "0 6px 18px rgba(16, 185, 129, 0.25)",
              transition: "transform 0.15s ease, box-shadow 0.15s ease",
            }}
            title="Pata Hai! Mastered concept + Streak (Hotkey: 🠆 Right Arrow)"
          >
            <span style={{ fontSize: "1.2rem", lineHeight: 1 }}>✓</span>
            <span style={{ fontSize: "0.58rem", fontWeight: 800, marginTop: "2px" }}>MASTER</span>
          </button>
        </div>
      )}
    </div>
  );
}
