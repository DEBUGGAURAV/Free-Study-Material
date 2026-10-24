import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Users,
  Share2,
  Copy,
  Check,
  Send,
  MessageSquare,
  PenTool,
  Eraser,
  RotateCcw,
  Sparkles,
  Zap,
  Shield,
  Maximize2,
  FileText,
  Volume2,
} from "lucide-react";
import { WebrtcStudyRoom } from "../utils/webrtcStudyRoom";

export default function StudyPodModal({
  isOpen,
  onClose,
  currentUser,
  note = null,
  initialRoomCode = "",
}) {
  const [roomCode, setRoomCode] = useState(initialRoomCode || "");
  const [roomJoined, setRoomJoined] = useState(true);
  const [peerCount, setPeerCount] = useState(1);
  const [peersList, setPeersList] = useState([]);
  const [copiedLink, setCopiedLink] = useState(false);

  // Canvas drawing state
  const canvasRef = useRef(null);
  const isDrawingRef = useRef(false);
  const [currentTool, setCurrentTool] = useState("pen"); // 'pen' | 'highlighter' | 'eraser'
  const [currentColor, setCurrentColor] = useState("#06b6d4"); // cyan
  const [strokeWidth, setStrokeWidth] = useState(3);
  const currentStrokePoints = useRef([]);

  // Chat state
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [showChat, setShowChat] = useState(true);
  const chatBottomRef = useRef(null);

  // Webrtc instance ref
  const roomInstanceRef = useRef(null);

  // Auto-generate room code if empty
  useEffect(() => {
    if (isOpen && !roomCode) {
      const generated = note
        ? `${note.branch || "cse"}-${note.subject || "core"}-${Math.floor(1000 + Math.random() * 9000)}`
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, "")
        : `pod-${Math.floor(100000 + Math.random() * 900000)}`;
      setRoomCode(generated);
    }
  }, [isOpen, note]);

  // Connect to P2P Mesh when room is joined
  useEffect(() => {
    if (!isOpen || !roomJoined || !roomCode) return;

    const userProfile = {
      name: currentUser?.name || "Scholar",
      id: currentUser?.id || `user_${Date.now()}`,
    };

    const pod = new WebrtcStudyRoom(roomCode, userProfile);
    roomInstanceRef.current = pod;

    // Listen to peers
    pod.onPeersChange((count, peers) => {
      setPeerCount(Math.max(1, count));
      setPeersList(peers);
    });

    // Listen to strokes
    pod.onStrokesChange((strokes) => {
      redrawCanvas(strokes);
    });

    // Listen to chat
    pod.onChatChange((chatList) => {
      setMessages(chatList);
      chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    });

    return () => {
      pod.destroy();
      roomInstanceRef.current = null;
    };
  }, [isOpen, roomJoined, roomCode, currentUser]);

  // Redraw canvas from strokes
  const redrawCanvas = (strokes) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    strokes.forEach((stroke) => {
      if (!stroke.points || stroke.points.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);

      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }

      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.globalAlpha = stroke.tool === "highlighter" ? 0.35 : 1.0;
      ctx.stroke();
      ctx.globalAlpha = 1.0;
    });
  };

  // Canvas Mouse / Touch Handlers
  const getCanvasCoords = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const handlePointerDown = (e) => {
    isDrawingRef.current = true;
    const coords = getCanvasCoords(e);
    currentStrokePoints.current = [coords];

    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx.beginPath();
      ctx.arc(coords.x, coords.y, strokeWidth / 2, 0, Math.PI * 2);
      ctx.fillStyle = currentTool === "eraser" ? "#0f172a" : currentColor;
      ctx.fill();
    }
  };

  const handlePointerMove = (e) => {
    if (!isDrawingRef.current) return;
    const coords = getCanvasCoords(e);
    currentStrokePoints.current.push(coords);

    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      const pts = currentStrokePoints.current;
      if (pts.length > 1) {
        ctx.beginPath();
        ctx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y);
        ctx.lineTo(coords.x, coords.y);
        ctx.strokeStyle = currentTool === "eraser" ? "#0f172a" : currentColor;
        ctx.lineWidth = currentTool === "eraser" ? strokeWidth * 3 : strokeWidth;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.globalAlpha = currentTool === "highlighter" ? 0.35 : 1.0;
        ctx.stroke();
        ctx.globalAlpha = 1.0;
      }
    }
  };

  const handlePointerUp = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    if (currentStrokePoints.current.length > 0 && roomInstanceRef.current) {
      const strokeData = {
        points: currentStrokePoints.current,
        color: currentTool === "eraser" ? "#0f172a" : currentColor,
        width: currentTool === "eraser" ? strokeWidth * 3 : strokeWidth,
        tool: currentTool,
      };
      roomInstanceRef.current.addStroke(strokeData);
    }
    currentStrokePoints.current = [];
  };

  const handleClearBoard = (e) => {
    e?.preventDefault();
    e?.stopPropagation();

    // 1. Immediately wipe local HTML5 2D canvas
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    // 2. Clear current in-flight stroke points
    currentStrokePoints.current = [];
    isDrawingRef.current = false;

    // 3. Clear P2P shared strokes across WebRTC DataChannel
    if (roomInstanceRef.current && typeof roomInstanceRef.current.clearStrokes === "function") {
      try {
        roomInstanceRef.current.clearStrokes();
      } catch (err) {
        console.warn("[STUDY-POD] Clear strokes error:", err);
      }
    }
  };

  const handleSendChat = (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !roomInstanceRef.current) return;
    roomInstanceRef.current.sendChatMessage(chatInput, currentUser?.name || "Scholar");
    setChatInput("");
  };

  const getInviteUrl = () => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/?pod=${encodeURIComponent(roomCode)}`;
  };

  const handleCopyLink = () => {
    const url = getInviteUrl();
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleShareWhatsApp = () => {
    const url = getInviteUrl();
    const text = `Join my Live Study Pod on Free Study Material! We are reading & solving notes collaboratively:\n\n${url}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        zIndex: 1300,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        background: "rgba(3, 7, 18, 0.88)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div
        className="modal-content"
        style={{
          width: "96vw",
          maxWidth: "1280px",
          height: "92vh",
          display: "flex",
          flexDirection: "column",
          background: "#0b132b",
          border: "1.5px solid rgba(6, 182, 212, 0.4)",
          boxShadow: "0 25px 60px rgba(0, 0, 0, 0.75)",
          borderRadius: "16px",
          overflow: "hidden",
          padding: 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Control Bar */}
        <div
          style={{
            padding: "12px 18px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            background: "rgba(15, 23, 42, 0.85)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "10px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "38px",
                height: "38px",
                borderRadius: "10px",
                background: "linear-gradient(135deg, #06b6d4, #8b5cf6)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                boxShadow: "0 0 15px rgba(6, 182, 212, 0.4)",
              }}
            >
              <Users size={20} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800, color: "#fff" }}>
                  Collaborative Live Study Pod
                </h3>
                <span
                  style={{
                    fontSize: "0.7rem",
                    fontWeight: 800,
                    background: "rgba(16, 185, 129, 0.2)",
                    color: "#34d399",
                    border: "1px solid rgba(16, 185, 129, 0.4)",
                    padding: "2px 7px",
                    borderRadius: "999px",
                  }}
                >
                  🟢 {peerCount} Peer{peerCount > 1 ? "s" : ""} Connected
                </span>
                <span
                  style={{
                    fontSize: "0.68rem",
                    fontWeight: 700,
                    background: "rgba(6, 182, 212, 0.15)",
                    color: "var(--accent-cyan)",
                    border: "1px solid rgba(6, 182, 212, 0.3)",
                    padding: "2px 7px",
                    borderRadius: "999px",
                  }}
                >
                  ⚡ Server Load: 0.0% (P2P Mesh)
                </span>
              </div>
              <div style={{ fontSize: "0.74rem", color: "var(--text-dim)", marginTop: "2px" }}>
                Room Code: <code style={{ color: "#38bdf8", fontWeight: 700 }}>{roomCode}</code> • WebRTC DataChannel Zero-Latency Mesh
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <button
              onClick={handleCopyLink}
              className="btn-secondary"
              style={{ fontSize: "0.78rem", padding: "6px 12px", display: "inline-flex", alignItems: "center", gap: "6px" }}
              title="Copy Instant Invite Link"
            >
              {copiedLink ? <Check size={14} style={{ color: "#34d399" }} /> : <Copy size={14} />}
              <span>{copiedLink ? "Link Copied!" : "Copy Link"}</span>
            </button>

            <button
              onClick={handleShareWhatsApp}
              style={{
                fontSize: "0.78rem",
                padding: "6px 12px",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                background: "#25D366",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                fontWeight: 700,
                cursor: "pointer",
              }}
              title="Invite Friends via WhatsApp"
            >
              <Share2 size={14} />
              <span>Share on WhatsApp</span>
            </button>

            <button
              onClick={() => setShowChat(!showChat)}
              className="btn-secondary"
              style={{ fontSize: "0.78rem", padding: "6px 12px", display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              <MessageSquare size={14} />
              <span>{showChat ? "Hide Chat" : "Peer Chat"}</span>
            </button>

            <button
              className="modal-close-btn"
              onClick={onClose}
              style={{ marginLeft: "6px" }}
              title="Leave Study Pod"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Main Work Area: Canvas + Live Document / Board */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
          {/* Canvas & Board Section */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", position: "relative", background: "#0a0f1d" }}>
            {/* Canvas Toolbar */}
            <div
              style={{
                padding: "8px 14px",
                background: "rgba(15, 23, 42, 0.9)",
                borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                flexWrap: "wrap",
                zIndex: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <button
                  type="button"
                  onClick={() => setCurrentTool("pen")}
                  style={{
                    background: currentTool === "pen" ? "rgba(6, 182, 212, 0.25)" : "transparent",
                    color: currentTool === "pen" ? "#38bdf8" : "var(--text-dim)",
                    border: `1px solid ${currentTool === "pen" ? "rgba(6, 182, 212, 0.4)" : "transparent"}`,
                    padding: "4px 8px",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "0.74rem",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    fontWeight: 700,
                  }}
                >
                  <PenTool size={14} />
                  <span>Pen</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCurrentTool("highlighter");
                    setCurrentColor("#facc15"); // yellow
                    setStrokeWidth(12);
                  }}
                  style={{
                    background: currentTool === "highlighter" ? "rgba(250, 204, 21, 0.2)" : "transparent",
                    color: currentTool === "highlighter" ? "#facc15" : "var(--text-dim)",
                    border: `1px solid ${currentTool === "highlighter" ? "rgba(250, 204, 21, 0.4)" : "transparent"}`,
                    padding: "4px 8px",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "0.74rem",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    fontWeight: 700,
                  }}
                >
                  <Sparkles size={14} />
                  <span>Highlighter</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCurrentTool("eraser")}
                  style={{
                    background: currentTool === "eraser" ? "rgba(239, 68, 68, 0.2)" : "transparent",
                    color: currentTool === "eraser" ? "#f87171" : "var(--text-dim)",
                    border: `1px solid ${currentTool === "eraser" ? "rgba(239, 68, 68, 0.4)" : "transparent"}`,
                    padding: "4px 8px",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "0.74rem",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    fontWeight: 700,
                  }}
                >
                  <Eraser size={14} />
                  <span>Eraser</span>
                </button>
              </div>

              {/* Color Swatches */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px", borderLeft: "1px solid rgba(255,255,255,0.1)", paddingLeft: "10px" }}>
                {["#06b6d4", "#facc15", "#10b981", "#f43f5e", "#a855f7", "#ffffff"].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      setCurrentColor(c);
                      if (currentTool === "eraser") setCurrentTool("pen");
                    }}
                    style={{
                      width: "18px",
                      height: "18px",
                      borderRadius: "50%",
                      background: c,
                      border: currentColor === c ? "2px solid #fff" : "1px solid rgba(0,0,0,0.5)",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  />
                ))}
              </div>

              {/* Clear Canvas */}
              <button
                type="button"
                onClick={handleClearBoard}
                style={{
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  color: "var(--text-dim)",
                  padding: "4px 8px",
                  borderRadius: "6px",
                  fontSize: "0.72rem",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  marginLeft: "auto",
                }}
              >
                <RotateCcw size={13} />
                <span>Clear Canvas</span>
              </button>
            </div>

            {/* Interactive HTML5 Canvas Board */}
            <div style={{ flex: 1, position: "relative", overflow: "hidden", cursor: currentTool === "eraser" ? "crosshair" : "default" }}>
              <canvas
                ref={canvasRef}
                width={1600}
                height={1000}
                onMouseDown={handlePointerDown}
                onMouseMove={handlePointerMove}
                onMouseUp={handlePointerUp}
                onTouchStart={handlePointerDown}
                onTouchMove={handlePointerMove}
                onTouchEnd={handlePointerUp}
                style={{
                  width: "100%",
                  height: "100%",
                  display: "block",
                  touchAction: "none",
                }}
              />

              {/* Background Watermark/Study Focus Banner */}
              <div
                style={{
                  position: "absolute",
                  bottom: "16px",
                  left: "16px",
                  background: "rgba(15, 23, 42, 0.75)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: "8px",
                  padding: "6px 12px",
                  fontSize: "0.72rem",
                  color: "var(--text-dim)",
                  pointerEvents: "none",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <Shield size={14} style={{ color: "#10b981" }} />
                <span>Peer-to-Peer CRDTs Canvas • 0 KB Database Writes</span>
              </div>
            </div>
          </div>

          {/* Right-Side Real-Time P2P Chat Sidebar */}
          {showChat && (
            <div
              style={{
                width: "320px",
                borderLeft: "1px solid rgba(255, 255, 255, 0.08)",
                background: "rgba(11, 19, 43, 0.95)",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  padding: "10px 14px",
                  borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
                  fontSize: "0.82rem",
                  fontWeight: 700,
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <MessageSquare size={15} style={{ color: "var(--accent-cyan)" }} />
                <span>Pod Peer Chat ({messages.length})</span>
              </div>

              {/* Chat Messages */}
              <div style={{ flex: 1, overflowY: "auto", padding: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
                {messages.length === 0 ? (
                  <div style={{ textAlign: "center", color: "var(--text-dim)", fontSize: "0.76rem", marginTop: "40px" }}>
                    💬 No messages yet. Say hi to your study partners!
                  </div>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        background: "rgba(15, 23, 42, 0.6)",
                        border: "1px solid rgba(255, 255, 255, 0.05)",
                        borderRadius: "8px",
                        padding: "8px 10px",
                        fontSize: "0.78rem",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                        <strong style={{ color: "var(--accent-cyan)" }}>{m.author}</strong>
                        <span style={{ fontSize: "0.68rem", color: "var(--text-dim)" }}>{m.timestamp}</span>
                      </div>
                      <div style={{ color: "#f8fafc", wordBreak: "break-word" }}>{m.text}</div>
                    </div>
                  ))
                )}
                <div ref={chatBottomRef} />
              </div>

              {/* Chat Input */}
              <form onSubmit={handleSendChat} style={{ padding: "10px", borderTop: "1px solid rgba(255, 255, 255, 0.06)", display: "flex", gap: "6px" }}>
                <input
                  type="text"
                  className="form-input"
                  style={{ flex: 1, padding: "7px 10px", fontSize: "0.78rem" }}
                  placeholder="Type message to pod..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                />
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ padding: "7px 12px", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  <Send size={14} />
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

