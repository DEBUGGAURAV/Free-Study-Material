import { useState, useEffect, useRef, useMemo } from "react";
import {
  X,
  Flame,
  RotateCw,
  Sparkles,
  Award,
  Check,
  Star,
  Zap,
  Volume2,
  VolumeX,
  BookOpen,
  Filter,
  CheckCircle2,
  ChevronRight,
  TrendingUp,
} from "lucide-react";
import { playPop } from "../utils/soundEffects";

// High-Yield Question Deck curated for Engineering, B.Tech, BCA, MCA & College Exams
const REVISION_DECK = [
  {
    id: "java-static-interface",
    subject: "Java & OOPs",
    code: "B.Tech CSE - Sem 3",
    question: "Can an Interface in Java contain static methods with body implementations?",
    options: ["(a) No, strictly abstract", "(b) Yes, since Java 8", "(c) Only in abstract classes", "(d) Only private static"],
    correctAnswer: "Yes, since Java 8",
    desiTrick: "8 number ka figure 'B' jaisa dikhta hai -> Java 8 me Interface ko 'Body' mili (static & default methods)!",
    explanation:
      "Java 8 se interfaces me `static` aur `default` methods allow hain. Static methods utility functions provide karte hain aur subclass inhe override nahi kar sakti (`InterfaceName.methodName()` se call hoti hai).",
    examProbability: "98% (Semester + Placement Favorite)",
    marks: "2 or 5 Marks",
  },
  {
    id: "os-deadlock-conditions",
    subject: "Operating Systems",
    code: "B.Tech CSE - Sem 4",
    question: "Which 4 Coffman conditions MUST occur simultaneously for a Deadlock to exist?",
    options: ["(a) Mutual Exclusion, Hold & Wait, No Preemption, Circular Wait", "(b) Paging, Segmentation, Thrashing, Swapping", "(c) Mutex, Semaphore, Spinlock, Barrier", "(d) FIFO, LRU, LFU, Optimal"],
    correctAnswer: "Mutual Exclusion, Hold & Wait, No Preemption, Circular Wait",
    desiTrick: "M-H-N-C Trick: 'Mera Hostel Nahi Chala' -> Mutual exclusion, Hold & wait, No preemption, Circular wait. Ek bhi tod do toh Deadlock khatam!",
    explanation:
      "Deadlock Prevention inhi 4 me se kisi ek condition ko invalidate karke kaam karta hai (e.g. Spooling for Mutual Exclusion, Resource Ordering for Circular Wait).",
    examProbability: "100% Guaranteed 10-Marker Question",
    marks: "10 Marks",
  },
  {
    id: "dbms-acid-isolation",
    subject: "DBMS",
    code: "B.Tech CSE - Sem 4",
    question: "In ACID properties, which component ensures that concurrent transactions do not interfere with each other?",
    options: ["(a) Atomicity", "(b) Consistency", "(c) Isolation", "(d) Durability"],
    correctAnswer: "Isolation",
    desiTrick: "'I' se Isolation, 'I' se Individual room -> Har transaction ko lagta hai wo database me akeli hai (No interference)!",
    explanation:
      "Isolation ensures serializability. DBMS concurrency control protocols (2-Phase Locking, Timestamp Ordering) Isolation level maintain karne ke liye lagaye jaate hain.",
    examProbability: "95% (Viva + Theory Paper)",
    marks: "5 Marks",
  },
  {
    id: "cn-tcp-udp-difference",
    subject: "Computer Networks",
    code: "B.Tech CSE - Sem 5",
    question: "Why does TCP have a 3-way handshake while UDP has 0 handshakes?",
    options: ["(a) TCP is connection-oriented & reliable; UDP is connectionless & fast", "(b) UDP is slower than TCP", "(c) TCP uses 16-bit ports only", "(d) UDP uses encrypted SSL directly"],
    correctAnswer: "TCP is connection-oriented & reliable; UDP is connectionless & fast",
    desiTrick: "TCP = Registered Post (Pehle receiver se confirmation lo - SYN, SYN-ACK, ACK); UDP = Loudspeaker (Bina soche chillate jao, koi sune ya na sune)!",
    explanation:
      "TCP SYN -> SYN+ACK -> ACK sequence numbers exchange karta hai to ensure zero data loss. UDP bina kisi handshake ke direct datagram send karta hai (best for live streaming, DNS, gaming).",
    examProbability: "96% (Interview + Midsem Exam)",
    marks: "5 or 7 Marks",
  },
  {
    id: "dsa-quick-sort-worst-case",
    subject: "Data Structures",
    code: "B.Tech CSE - Sem 3",
    question: "What is the Worst-Case Time Complexity of QuickSort and when does it occur?",
    options: ["(a) O(n log n) - Random Pivot", "(b) O(n²) - Already Sorted Array with extreme pivot", "(c) O(n) - Reverse sorted", "(d) O(log n) - Median pivot"],
    correctAnswer: "O(n²) - Already Sorted Array with extreme pivot",
    desiTrick: "Jab array pehle se perfect sorted ho aur pehla element hi pivot chuno, toh QuickSort sabse bada 'Nalla' ban jaata hai -> O(n²) worst case!",
    explanation:
      "Jab partitioning unbalanced hoti hai (1 aur n-1 elements), recursion tree depth n ho jati hai. Isko prevent karne ke liye Randomized QuickSort ya Median-of-Three pivot use hota hai jo hamesha O(n log n) maintain karta hai.",
    examProbability: "99% (GATE + University Exam)",
    marks: "5 Marks",
  },
  {
    id: "os-virtual-memory-thrashing",
    subject: "Operating Systems",
    code: "B.Tech CSE - Sem 4",
    question: "What is Thrashing in Virtual Memory and how is it resolved?",
    options: ["(a) Excessive Page Faults where CPU spends more time paging than executing", "(b) Hard disk head collision", "(c) CPU overheating and clock down", "(d) Stack Overflow error"],
    correctAnswer: "Excessive Page Faults where CPU spends more time paging than executing",
    desiTrick: "Student padhai kam aur book ke panne idhar-udhar palatne me sara time nikal de -> Yahi hai Thrashing! Solution: Page Fault Frequency (PFF) ya Working Set Model.",
    explanation:
      "Jab processes ki total working set frames available physical RAM se jyada ho jati hain, toh CPU utilization drop ho jata hai kyunki sabhi processes page-in/page-out me busy rehti hain.",
    examProbability: "94% (Short Notes Section)",
    marks: "5 Marks",
  },
  {
    id: "web-http-status-codes",
    subject: "Web Technologies",
    code: "B.Tech CSE - Sem 5",
    question: "What is the exact difference between HTTP 401 Unauthorized and 403 Forbidden?",
    options: ["(a) 401 = Missing/Invalid Identity; 403 = Identity known but Permission Denied", "(b) 401 is Server error, 403 is Client error", "(c) Both are identical", "(d) 401 is for GET, 403 is for POST"],
    correctAnswer: "401 = Missing/Invalid Identity; 403 = Identity known but Permission Denied",
    desiTrick: "401 = 'Tum ho kaun? ID card dikhao!' (Unauthenticated); 403 = 'Hum jante hain tum kaun ho, par andar aana mana hai!' (Forbidden/No Role).",
    explanation:
      "401 Authentication header demand karta hai. 403 par authenticate hone ke baad bhi server resource access allow nahi karta (e.g., student trying to access `/admin/delete`).",
    examProbability: "92% (Viva & Industry Interview)",
    marks: "2 Marks",
  },
];

export default function SwipeToReviseModal({ isOpen, onClose, initialSubject = "All" }) {
  const [selectedSubject, setSelectedSubject] = useState(initialSubject);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState(null); // "right" | "left" | "up" | null
  const [streakCount, setStreakCount] = useState(14);
  const [xpPoints, setXpPoints] = useState(420);
  const [masteredIds, setMasteredIds] = useState([]);
  const [revisionIds, setRevisionIds] = useState([]);
  const [starredIds, setStarredIds] = useState([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [confettiActive, setConfettiActive] = useState(false);

  const cardRef = useRef(null);
  const startPos = useRef({ x: 0, y: 0 });
  const canvasRef = useRef(null);

  // Load saved streak and progress from localStorage
  useEffect(() => {
    try {
      const savedStreak = localStorage.getItem("fsm_swipe_streak");
      const savedXp = localStorage.getItem("fsm_swipe_xp");
      const savedMastered = localStorage.getItem("fsm_swipe_mastered");
      if (savedStreak) setStreakCount(parseInt(savedStreak, 10));
      if (savedXp) setXpPoints(parseInt(savedXp, 10));
      if (savedMastered) setMasteredIds(JSON.parse(savedMastered));
    } catch (_) {}
  }, []);

  // Filtered Cards Deck
  const deck = useMemo(() => {
    if (selectedSubject === "All") return REVISION_DECK;
    return REVISION_DECK.filter((c) => c.subject === selectedSubject);
  }, [selectedSubject]);

  const currentCard = deck[currentIndex] || deck[0];

  const subjectsList = useMemo(() => {
    const set = new Set(REVISION_DECK.map((c) => c.subject));
    return ["All", ...Array.from(set)];
  }, []);

  // Trigger tactile haptics on mobile phones
  const triggerHaptic = (pattern = [30]) => {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      try {
        navigator.vibrate(pattern);
      } catch (_) {}
    }
  };

  // Zero-dependency Canvas Confetti Celebration
  const triggerConfetti = () => {
    setConfettiActive(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles = Array.from({ length: 45 }).map(() => ({
      x: canvas.width / 2 + (Math.random() - 0.5) * 120,
      y: canvas.height / 2 - 40,
      vx: (Math.random() - 0.5) * 14,
      vy: -(Math.random() * 12 + 6),
      size: Math.random() * 8 + 4,
      color: ["#10b981", "#38bdf8", "#fbbf24", "#6366f1", "#f43f5e"][Math.floor(Math.random() * 5)],
      rot: Math.random() * 360,
      vRot: (Math.random() - 0.5) * 15,
      alpha: 1,
    }));

    let animId;
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.45; // gravity
        p.rot += p.vRot;
        p.alpha -= 0.016;

        if (p.alpha > 0) {
          alive = true;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate((p.rot * Math.PI) / 180);
          ctx.fillStyle = p.color;
          ctx.globalAlpha = Math.max(0, p.alpha);
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
          ctx.restore();
        }
      });

      if (alive) {
        animId = requestAnimationFrame(render);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setConfettiActive(false);
      }
    };
    animId = requestAnimationFrame(render);
  };

  // Perform card transition
  const handleCardSwiped = (direction) => {
    if (!currentCard) return;

    setSwipeDirection(direction);
    triggerHaptic(direction === "right" ? [40, 30, 60] : [35]);

    if (soundEnabled) {
      playPop();
    }

    if (direction === "right") {
      // Mastered!
      const newStreak = streakCount + 1;
      const newXp = xpPoints + 15;
      setStreakCount(newStreak);
      setXpPoints(newXp);
      const updatedMastered = [...new Set([...masteredIds, currentCard.id])];
      setMasteredIds(updatedMastered);
      try {
        localStorage.setItem("fsm_swipe_streak", String(newStreak));
        localStorage.setItem("fsm_swipe_xp", String(newXp));
        localStorage.setItem("fsm_swipe_mastered", JSON.stringify(updatedMastered));
      } catch (_) {}
      triggerConfetti();
    } else if (direction === "left") {
      // Revise later
      setRevisionIds((prev) => [...new Set([...prev, currentCard.id])]);
    } else if (direction === "up") {
      // Starred
      setStarredIds((prev) => [...new Set([...prev, currentCard.id])]);
      const newXp = xpPoints + 10;
      setXpPoints(newXp);
      try {
        localStorage.setItem("fsm_swipe_xp", String(newXp));
      } catch (_) {}
    }

    setTimeout(() => {
      setSwipeDirection(null);
      setDragOffset({ x: 0, y: 0 });
      setIsFlipped(false);
      if (currentIndex < deck.length - 1) {
        setCurrentIndex((prev) => prev + 1);
      } else {
        // Reset back to card 1 with reshuffle
        setCurrentIndex(0);
      }
    }, 280);
  };

  // Pointer / Touch Gestures
  const handlePointerDown = (e) => {
    if (swipeDirection) return;
    setIsDragging(true);
    startPos.current = { x: e.clientX || e.touches?.[0]?.clientX || 0, y: e.clientY || e.touches?.[0]?.clientY || 0 };
  };

  const handlePointerMove = (e) => {
    if (!isDragging) return;
    const curX = e.clientX || e.touches?.[0]?.clientX || 0;
    const curY = e.clientY || e.touches?.[0]?.clientY || 0;
    const dx = curX - startPos.current.x;
    const dy = curY - startPos.current.y;
    setDragOffset({ x: dx, y: dy });
  };

  const handlePointerUp = () => {
    if (!isDragging) return;
    setIsDragging(false);

    const threshold = 95;
    if (dragOffset.x > threshold) {
      handleCardSwiped("right");
    } else if (dragOffset.x < -threshold) {
      handleCardSwiped("left");
    } else if (dragOffset.y < -threshold) {
      handleCardSwiped("up");
    } else {
      // Spring back to center
      setDragOffset({ x: 0, y: 0 });
    }
  };

  // Keyboard navigation shortcuts
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e) => {
      if (e.key === "ArrowRight") handleCardSwiped("right");
      else if (e.key === "ArrowLeft") handleCardSwiped("left");
      else if (e.key === "ArrowUp") handleCardSwiped("up");
      else if (e.key === " " || e.key === "Enter") setIsFlipped((prev) => !prev);
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, currentCard, currentIndex, deck]);

  if (!isOpen) return null;

  // Visual drag badge triggers
  const isRightGlow = dragOffset.x > 45;
  const isLeftGlow = dragOffset.x < -45;
  const isUpGlow = dragOffset.y < -55 && Math.abs(dragOffset.x) < 45;

  const cardRotation = dragOffset.x * 0.07;
  const cardScale = isDragging ? 1.02 : 1;

  return (
    <div
      className="modal-backdrop swipe-revise-backdrop"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        background: "rgba(15, 23, 42, 0.78)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        overflowY: "auto",
      }}
    >
      {/* Fullscreen Canvas for Confetti */}
      <canvas
        ref={canvasRef}
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 100000,
        }}
      />

      <div
        className="swipe-revise-dialog modal-content"
        style={{
          width: "100%",
          maxWidth: "520px",
          background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
          borderRadius: "28px",
          border: "1.5px solid rgba(226, 232, 240, 0.9)",
          boxShadow: "0 25px 60px -15px rgba(15, 23, 42, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.8) inset",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          position: "relative",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER DOCK */}
        <div
          className="swipe-header-dock"
          style={{
            padding: "16px 20px 12px",
            borderBottom: "1px solid #f1f5f9",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#ffffff",
          }}
        >
          {/* 3D Flame Streak Badge */}
          <div
            className="streak-badge-3d"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "6px 14px",
              borderRadius: "999px",
              background: "linear-gradient(135deg, #fffbeb, #fef3c7)",
              border: "1.5px solid #fde68a",
              boxShadow: "0 4px 12px rgba(245, 158, 11, 0.18), inset 0 2px 2px #ffffff",
            }}
          >
            <div
              className="icon-3d-flame"
              style={{
                width: "24px",
                height: "24px",
                borderRadius: "50%",
                background: "linear-gradient(145deg, #f59e0b, #ef4444)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 2px 6px rgba(239, 68, 68, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.8)",
              }}
            >
              <Flame size={14} color="#ffffff" />
            </div>
            <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
              <span style={{ fontSize: "0.82rem", fontWeight: 800, color: "#92400e" }}>
                {streakCount} Day Streak
              </span>
              <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#b45309" }}>
                {xpPoints} XP • Level 4
              </span>
            </div>
          </div>

          {/* Controls: Sound + Close */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              className="btn-3d-pill-icon"
              onClick={() => setSoundEnabled(!soundEnabled)}
              title={soundEnabled ? "Mute Haptics/Audio" : "Enable Sound Effects"}
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "12px",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                boxShadow: "0 2px 5px rgba(0, 0, 0, 0.04), inset 0 1px 1px #ffffff",
              }}
            >
              {soundEnabled ? <Volume2 size={16} color="#475569" /> : <VolumeX size={16} color="#94a3b8" />}
            </button>

            <button
              type="button"
              className="btn-3d-pill-icon"
              onClick={onClose}
              title="Close Swipe-to-Revise"
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "12px",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                boxShadow: "0 2px 5px rgba(0, 0, 0, 0.04), inset 0 1px 1px #ffffff",
              }}
            >
              <X size={17} color="#475569" />
            </button>
          </div>
        </div>

        {/* SUBJECT FILTER BAR & PROGRESS */}
        <div style={{ padding: "10px 20px", background: "#f8fafc", borderBottom: "1px solid #edf2f7" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.78rem", fontWeight: 700, color: "#64748b" }}>
              <Filter size={13} />
              <span>Subject:</span>
              <select
                value={selectedSubject}
                onChange={(e) => {
                  setSelectedSubject(e.target.value);
                  setCurrentIndex(0);
                  setIsFlipped(false);
                }}
                style={{
                  padding: "2px 8px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  color: "#0f172a",
                  cursor: "pointer",
                }}
              >
                {subjectsList.map((sub) => (
                  <option key={sub} value={sub}>
                    {sub}
                  </option>
                ))}
              </select>
            </div>

            <span style={{ fontSize: "0.76rem", fontWeight: 800, color: "#4f46e5" }}>
              Card {currentIndex + 1} of {deck.length}
            </span>
          </div>

          {/* Progress Bar */}
          <div style={{ width: "100%", height: "5px", background: "#e2e8f0", borderRadius: "999px", overflow: "hidden" }}>
            <div
              style={{
                width: `${((currentIndex + 1) / deck.length) * 100}%`,
                height: "100%",
                background: "linear-gradient(90deg, #4f46e5, #06b6d4)",
                borderRadius: "999px",
                transition: "width 0.3s ease",
              }}
            />
          </div>
        </div>

        {/* CARD SWIPE ARENA */}
        <div
          className="swipe-arena"
          style={{
            padding: "24px 20px 20px",
            minHeight: "380px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            perspective: "1200px",
            userSelect: "none",
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onTouchStart={handlePointerDown}
          onTouchMove={handlePointerMove}
          onTouchEnd={handlePointerUp}
        >
          {/* FLOATING 3D REACTION BADGES */}
          {/* Green Right Badge */}
          <div
            className="swipe-indicator-badge badge-right"
            style={{
              position: "absolute",
              top: "35px",
              right: "28px",
              zIndex: 30,
              padding: "8px 18px",
              borderRadius: "999px",
              background: "linear-gradient(135deg, rgba(16, 185, 129, 0.95), rgba(5, 150, 105, 0.95))",
              color: "#ffffff",
              fontWeight: 800,
              fontSize: "0.85rem",
              boxShadow: "0 8px 25px rgba(16, 185, 129, 0.5), inset 0 2px 2px rgba(255, 255, 255, 0.6)",
              border: "1.5px solid rgba(255, 255, 255, 0.6)",
              opacity: isRightGlow || swipeDirection === "right" ? 1 : 0,
              transform: `scale(${isRightGlow || swipeDirection === "right" ? 1.08 : 0.8}) rotate(12deg)`,
              transition: "all 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)",
              pointerEvents: "none",
            }}
          >
            👉 PATA HAI! (+15 XP)
          </div>

          {/* Red Left Badge */}
          <div
            className="swipe-indicator-badge badge-left"
            style={{
              position: "absolute",
              top: "35px",
              left: "28px",
              zIndex: 30,
              padding: "8px 18px",
              borderRadius: "999px",
              background: "linear-gradient(135deg, rgba(239, 68, 68, 0.95), rgba(220, 38, 38, 0.95))",
              color: "#ffffff",
              fontWeight: 800,
              fontSize: "0.85rem",
              boxShadow: "0 8px 25px rgba(239, 68, 68, 0.5), inset 0 2px 2px rgba(255, 255, 255, 0.6)",
              border: "1.5px solid rgba(255, 255, 255, 0.6)",
              opacity: isLeftGlow || swipeDirection === "left" ? 1 : 0,
              transform: `scale(${isLeftGlow || swipeDirection === "left" ? 1.08 : 0.8}) rotate(-12deg)`,
              transition: "all 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)",
              pointerEvents: "none",
            }}
          >
            👈 NAHI PATA (Revise)
          </div>

          {/* Star Top Badge */}
          <div
            className="swipe-indicator-badge badge-top"
            style={{
              position: "absolute",
              top: "12px",
              left: "50%",
              transform: `translateX(-50%) scale(${isUpGlow || swipeDirection === "up" ? 1.08 : 0.8})`,
              zIndex: 30,
              padding: "6px 18px",
              borderRadius: "999px",
              background: "linear-gradient(135deg, #f59e0b, #d97706)",
              color: "#ffffff",
              fontWeight: 800,
              fontSize: "0.82rem",
              boxShadow: "0 8px 25px rgba(245, 158, 11, 0.5), inset 0 2px 2px rgba(255, 255, 255, 0.6)",
              border: "1.5px solid rgba(255, 255, 255, 0.6)",
              opacity: isUpGlow || swipeDirection === "up" ? 1 : 0,
              transition: "all 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)",
              pointerEvents: "none",
            }}
          >
            ⭐ EXAM SPECIAL (+10 XP)
          </div>

          {/* 3D Underlay Ghost Cards (Depth Stack) */}
          <div
            className="deck-ghost-card ghost-2"
            style={{
              position: "absolute",
              width: "88%",
              height: "320px",
              borderRadius: "24px",
              background: "#e2e8f0",
              bottom: "16px",
              transform: "translateY(18px) scale(0.92)",
              zIndex: 1,
              opacity: 0.5,
              border: "1.5px solid #cbd5e1",
            }}
          />
          <div
            className="deck-ghost-card ghost-1"
            style={{
              position: "absolute",
              width: "93%",
              height: "320px",
              borderRadius: "24px",
              background: "#f1f5f9",
              bottom: "20px",
              transform: "translateY(9px) scale(0.96)",
              zIndex: 2,
              opacity: 0.8,
              border: "1.5px solid #e2e8f0",
            }}
          />

          {/* ACTIVE SWIPE CARD */}
          <div
            ref={cardRef}
            className={`swipe-card-3d ${isFlipped ? "flipped" : ""}`}
            style={{
              position: "relative",
              zIndex: 10,
              width: "100%",
              maxWidth: "440px",
              minHeight: "330px",
              borderRadius: "24px",
              transformStyle: "preserve-3d",
              transform: `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0) rotate(${cardRotation}deg) scale(${cardScale})`,
              transition: isDragging ? "none" : "transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1)",
              cursor: isDragging ? "grabbing" : "grab",
              boxShadow: "0 20px 40px -10px rgba(15, 23, 42, 0.2), 0 0 0 1px rgba(226, 232, 240, 0.8)",
            }}
          >
            {/* FRONT OF CARD (Question & Options) */}
            <div
              className="card-side card-front"
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: "24px",
                background: "#ffffff",
                padding: "24px 22px",
                display: isFlipped ? "none" : "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                backfaceVisibility: "hidden",
                border: "2px solid #e2e8f0",
              }}
            >
              <div>
                {/* Subject & Marks Tag */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span
                      style={{
                        padding: "4px 10px",
                        borderRadius: "999px",
                        fontSize: "0.72rem",
                        fontWeight: 800,
                        background: "#e0e7ff",
                        color: "#4338ca",
                      }}
                    >
                      {currentCard.subject}
                    </span>
                    <span
                      style={{
                        padding: "4px 9px",
                        borderRadius: "999px",
                        fontSize: "0.7rem",
                        fontWeight: 700,
                        background: "#f1f5f9",
                        color: "#475569",
                      }}
                    >
                      {currentCard.code}
                    </span>
                  </div>

                  <span
                    style={{
                      fontSize: "0.7rem",
                      fontWeight: 800,
                      color: "#b45309",
                      background: "#fef3c7",
                      padding: "3px 8px",
                      borderRadius: "6px",
                    }}
                  >
                    {currentCard.marks}
                  </span>
                </div>

                {/* Question */}
                <h3
                  style={{
                    fontSize: "1.08rem",
                    fontWeight: 800,
                    color: "#0f172a",
                    lineHeight: 1.45,
                    marginBottom: "16px",
                  }}
                >
                  {currentCard.question}
                </h3>

                {/* Multiple Choice Options Preview */}
                <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
                  {currentCard.options?.map((opt, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "8px 12px",
                        borderRadius: "10px",
                        background: "#f8fafc",
                        border: "1px solid #edf2f7",
                        fontSize: "0.82rem",
                        fontWeight: 600,
                        color: "#334155",
                      }}
                    >
                      {opt}
                    </div>
                  ))}
                </div>
              </div>

              {/* Tap to Flip Prompt */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsFlipped(true);
                  triggerHaptic([20]);
                }}
                style={{
                  marginTop: "16px",
                  padding: "9px 14px",
                  borderRadius: "12px",
                  background: "linear-gradient(135deg, #f0fdf4, #dcfce7)",
                  border: "1.5px solid #bbf7d0",
                  color: "#166534",
                  fontSize: "0.78rem",
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  cursor: "pointer",
                }}
              >
                <Sparkles size={14} color="#16a34a" />
                <span>Tap to Flip: Desi Memory Trick &amp; Solution</span>
              </button>
            </div>

            {/* BACK OF CARD (Desi Mnemonic Trick & Diagram) */}
            <div
              className="card-side card-back"
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: "24px",
                background: "linear-gradient(180deg, #faf5ff 0%, #ffffff 100%)",
                padding: "24px 22px",
                display: isFlipped ? "flex" : "none",
                flexDirection: "column",
                justifyContent: "space-between",
                backfaceVisibility: "hidden",
                border: "2px solid #e9d5ff",
              }}
            >
              <div>
                {/* Answer Badge */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                  <span
                    style={{
                      padding: "4px 10px",
                      borderRadius: "999px",
                      fontSize: "0.74rem",
                      fontWeight: 800,
                      background: "#dcfce7",
                      color: "#15803d",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <CheckCircle2 size={13} />
                    <span>Answer: {currentCard.correctAnswer}</span>
                  </span>

                  <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "#9333ea" }}>
                    🔥 {currentCard.examProbability}
                  </span>
                </div>

                {/* Desi Memory Trick */}
                <div
                  style={{
                    padding: "12px 14px",
                    borderRadius: "14px",
                    background: "linear-gradient(135deg, #fdf4ff, #fae8ff)",
                    border: "1.5px solid #f0abfc",
                    marginBottom: "12px",
                  }}
                >
                  <div style={{ fontSize: "0.74rem", fontWeight: 800, color: "#a21caf", marginBottom: "4px", display: "flex", alignItems: "center", gap: "5px" }}>
                    <span>💡 DESI MEMORY TRICK:</span>
                  </div>
                  <p style={{ margin: 0, fontSize: "0.86rem", fontWeight: 700, color: "#86198f", lineHeight: 1.45 }}>
                    "{currentCard.desiTrick}"
                  </p>
                </div>

                {/* Core Concept Breakdown */}
                <div style={{ fontSize: "0.82rem", color: "#334155", lineHeight: 1.5, fontWeight: 500 }}>
                  <strong style={{ color: "#0f172a", display: "block", marginBottom: "4px" }}>Concept Breakdown:</strong>
                  {currentCard.explanation}
                </div>
              </div>

              {/* Flip Back Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsFlipped(false);
                }}
                style={{
                  marginTop: "14px",
                  padding: "8px 12px",
                  borderRadius: "10px",
                  background: "#f8fafc",
                  border: "1px solid #cbd5e1",
                  color: "#475569",
                  fontSize: "0.76rem",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "5px",
                  cursor: "pointer",
                }}
              >
                <RotateCw size={13} />
                <span>Flip back to Question</span>
              </button>
            </div>
          </div>
        </div>

        {/* BOTTOM TACTILE 3D ACTION BAR */}
        <div
          className="swipe-action-dock"
          style={{
            padding: "16px 24px 22px",
            background: "#ffffff",
            borderTop: "1px solid #f1f5f9",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-around",
            gap: "14px",
          }}
        >
          {/* 1. Red 3D Button (Revise Again) */}
          <button
            type="button"
            className="btn-3d-round btn-3d-red"
            onClick={() => handleCardSwiped("left")}
            title="Revise Again (Left Swipe / 👈)"
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              background: "linear-gradient(145deg, #ffffff, #fee2e2)",
              border: "2px solid #fca5a5",
              boxShadow: "0 8px 18px rgba(239, 68, 68, 0.25), inset 0 2px 2px #ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "transform 0.15s ease",
            }}
          >
            <X size={26} color="#ef4444" strokeWidth={2.6} />
          </button>

          {/* 2. Flip 3D Button */}
          <button
            type="button"
            className="btn-3d-round btn-3d-flip"
            onClick={() => {
              setIsFlipped(!isFlipped);
              triggerHaptic([20]);
            }}
            title="Flip Card / Solution"
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              background: "linear-gradient(145deg, #ffffff, #f1f5f9)",
              border: "2px solid #cbd5e1",
              boxShadow: "0 6px 14px rgba(15, 23, 42, 0.12), inset 0 2px 2px #ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <RotateCw size={20} color="#64748b" strokeWidth={2.4} />
          </button>

          {/* 3. Gold 3D Button (Star Exam Special) */}
          <button
            type="button"
            className="btn-3d-round btn-3d-gold"
            onClick={() => handleCardSwiped("up")}
            title="Mark as Exam Special (Up Swipe / 👆)"
            style={{
              width: "50px",
              height: "50px",
              borderRadius: "50%",
              background: "linear-gradient(145deg, #ffffff, #fef3c7)",
              border: "2px solid #fcd34d",
              boxShadow: "0 8px 18px rgba(245, 158, 11, 0.28), inset 0 2px 2px #ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <Star size={22} color="#f59e0b" fill="#f59e0b" />
          </button>

          {/* 4. Green 3D Button (Pata Hai!) */}
          <button
            type="button"
            className="btn-3d-round btn-3d-green"
            onClick={() => handleCardSwiped("right")}
            title="Pata Hai! Mastered (Right Swipe / 👉)"
            style={{
              width: "58px",
              height: "58px",
              borderRadius: "50%",
              background: "linear-gradient(145deg, #ffffff, #dcfce7)",
              border: "2px solid #86efac",
              boxShadow: "0 8px 20px rgba(16, 185, 129, 0.3), inset 0 2px 2px #ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <Check size={28} color="#10b981" strokeWidth={2.8} />
          </button>
        </div>
      </div>
    </div>
  );
}
