import React, { useState, useEffect, useRef } from "react";
import {
  X, Share2, QrCode, Camera, Copy, Check, RefreshCw, Zap,
  Download, ArrowRight, ShieldCheck, Wifi, Sparkles, CheckCircle2,
  AlertTriangle, Smartphone
} from "lucide-react";
import QRCode from "qrcode";
import {
  isNoteReadyForAirdrop,
  createAirDropSenderSession,
  completeSenderWithAnswer,
  createAirDropReceiverSession,
  cancelAirDropSession
} from "../utils/p2pCampusAirdrop";

export default function CampusAirdropModal({
  isOpen,
  onClose,
  currentNote = null,
  onNoteReceived = null,
}) {
  if (!isOpen) return null;

  const [activeTab, setActiveTab] = useState(currentNote ? "send" : "receive");
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Sender state
  const [senderSession, setSenderSession] = useState(null);
  const [offerQrUrl, setOfferQrUrl] = useState("");
  const [senderProgress, setSenderProgress] = useState(null);
  const [senderConnected, setSenderConnected] = useState(false);
  const [senderDone, setSenderDone] = useState(false);
  const [showAnswerInput, setShowAnswerInput] = useState(false);
  const [answerInputText, setAnswerInputText] = useState("");

  // Receiver state
  const [receiverSession, setReceiverSession] = useState(null);
  const [answerQrUrl, setAnswerQrUrl] = useState("");
  const [receiverProgress, setReceiverProgress] = useState(null);
  const [receivedNoteData, setReceivedNoteData] = useState(null);
  const [receiverDone, setReceiverDone] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [manualOfferText, setManualOfferText] = useState("");
  const [showManualReceive, setShowManualReceive] = useState(false);

  const videoRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const scanIntervalRef = useRef(null);

  // Initialize Sender when modal opens on "send" tab
  useEffect(() => {
    let session = null;
    let isCancelled = false;

    if (activeTab === "send" && currentNote?.id) {
      setErrorMsg("");
      setSenderDone(false);
      setSenderConnected(false);
      setSenderProgress(null);
      setOfferQrUrl("");

      createAirDropSenderSession(currentNote.id, {
        onConnected: () => {
          if (!isCancelled) setSenderConnected(true);
        },
        onProgress: (prog) => {
          if (!isCancelled) {
            setSenderProgress(prog);
            if (prog.percent >= 100) setSenderDone(true);
          }
        },
        onError: (err) => {
          if (!isCancelled) setErrorMsg(err.message || "Transfer interrupted");
        },
      })
        .then((s) => {
          if (isCancelled) {
            cancelAirDropSession(s);
            return;
          }
          session = s;
          setSenderSession(s);

          // Generate QR code for the Offer Token
          QRCode.toDataURL(s.offerToken, {
            width: 280,
            margin: 2,
            color: { dark: "#0f172a", light: "#ffffff" },
            errorCorrectionLevel: "L",
          })
            .then((url) => {
              if (!isCancelled) setOfferQrUrl(url);
            })
            .catch((e) => {
              console.warn("QR Render error:", e);
            });
        })
        .catch((err) => {
          if (!isCancelled) {
            setErrorMsg(err.message || "Failed to initialize AirDrop sender.");
          }
        });
    }

    return () => {
      isCancelled = true;
      if (session) {
        cancelAirDropSession(session);
      }
    };
  }, [activeTab, currentNote?.id]);

  // Clean up Camera on unmount or tab change
  useEffect(() => {
    return () => {
      stopCamera();
      if (senderSession) cancelAirDropSession(senderSession);
      if (receiverSession) cancelAirDropSession(receiverSession);
    };
  }, []);

  const stopCamera = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    setCameraActive(false);
  };

  // Start Camera for Receiver
  const startCamera = async () => {
    setErrorMsg("");
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
      });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      setCameraActive(true);

      // Check if native BarcodeDetector API is supported
      if ("BarcodeDetector" in window) {
        const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
        scanIntervalRef.current = setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes && barcodes.length > 0) {
              const detectedValue = barcodes[0].rawValue;
              if (detectedValue) {
                stopCamera();
                handleProcessOfferToken(detectedValue);
              }
            }
          } catch (_) {}
        }, 300);
      }
    } catch (err) {
      console.warn("Camera access failed:", err);
      setErrorMsg("Camera access denied or unavailable. Please use manual token paste below.");
      setShowManualReceive(true);
    }
  };

  // Process Offer Token when scanned or pasted by receiver
  const handleProcessOfferToken = async (tokenStr) => {
    setErrorMsg("");
    try {
      const session = await createAirDropReceiverSession(tokenStr.trim(), {
        onProgress: (prog) => {
          setReceiverProgress(prog);
        },
        onComplete: (data) => {
          setReceivedNoteData(data);
          setReceiverDone(true);
          if (onNoteReceived) onNoteReceived(data);
        },
        onError: (err) => {
          setErrorMsg(err.message || "Failed to receive document");
        },
      });

      setReceiverSession(session);

      // Render Answer QR
      const url = await QRCode.toDataURL(session.answerToken, {
        width: 260,
        margin: 2,
        color: { dark: "#0f172a", light: "#ffffff" },
        errorCorrectionLevel: "L",
      });
      setAnswerQrUrl(url);
    } catch (err) {
      setErrorMsg(err.message || "Invalid AirDrop offer QR token.");
    }
  };

  // Sender submits Receiver's Answer Token
  const handleApplyAnswerToken = async () => {
    if (!answerInputText.trim() || !senderSession) return;
    setErrorMsg("");
    try {
      await completeSenderWithAnswer(senderSession, answerInputText.trim());
      setShowAnswerInput(false);
    } catch (err) {
      setErrorMsg(err.message || "Failed to connect with receiver.");
    }
  };

  const copyToClipboard = (text) => {
    if (!text) return;
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.8)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 99999,
        padding: "16px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          stopCamera();
          onClose();
        }
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "480px",
          background: "linear-gradient(135deg, #0b1120, #0f172a)",
          border: "1px solid rgba(192, 132, 252, 0.35)",
          borderRadius: "18px",
          boxShadow: "0 25px 60px rgba(0, 0, 0, 0.7), 0 0 35px rgba(168, 85, 247, 0.15)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          color: "#f8fafc",
          position: "relative",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            background: "rgba(255, 255, 255, 0.02)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                background: "linear-gradient(135deg, #9333ea, #c084fc)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 0 15px rgba(168, 85, 247, 0.4)",
              }}
            >
              <Zap size={20} color="#fff" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: "6px" }}>
                Campus AirDrop
                <span style={{ fontSize: "0.68rem", padding: "2px 6px", borderRadius: "4px", background: "rgba(16, 185, 129, 0.2)", color: "#34d399", border: "1px solid rgba(16, 185, 129, 0.4)" }}>
                  0% Net • 0ms
                </span>
              </h3>
              <p style={{ margin: 0, fontSize: "0.74rem", color: "#94a3b8" }}>
                Zero-Internet P2P BitTorrent & 1-Tap QR Mesh
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            style={{
              background: "rgba(255, 255, 255, 0.06)",
              border: "none",
              borderRadius: "8px",
              padding: "6px",
              color: "#94a3b8",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            padding: "8px 16px",
            background: "rgba(0, 0, 0, 0.25)",
            gap: "8px",
          }}
        >
          <button
            type="button"
            onClick={() => {
              stopCamera();
              setActiveTab("send");
            }}
            disabled={!currentNote?.id}
            style={{
              padding: "9px 12px",
              borderRadius: "8px",
              border: activeTab === "send" ? "1px solid #c084fc" : "1px solid transparent",
              background: activeTab === "send" ? "rgba(168, 85, 247, 0.2)" : "transparent",
              color: activeTab === "send" ? "#e9d5ff" : (currentNote?.id ? "#94a3b8" : "#475569"),
              fontWeight: activeTab === "send" ? 700 : 500,
              fontSize: "0.82rem",
              cursor: currentNote?.id ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              transition: "all 0.15s ease",
            }}
          >
            <Share2 size={15} />
            <span>⚡ Share Note</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("receive");
              startCamera();
            }}
            style={{
              padding: "9px 12px",
              borderRadius: "8px",
              border: activeTab === "receive" ? "1px solid #38bdf8" : "1px solid transparent",
              background: activeTab === "receive" ? "rgba(56, 189, 248, 0.2)" : "transparent",
              color: activeTab === "receive" ? "#bae6fd" : "#94a3b8",
              fontWeight: activeTab === "receive" ? 700 : 500,
              fontSize: "0.82rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              transition: "all 0.15s ease",
            }}
          >
            <Camera size={15} />
            <span>📷 Receive Note</span>
          </button>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div
            style={{
              margin: "12px 16px 0",
              padding: "10px 14px",
              borderRadius: "8px",
              background: "rgba(239, 68, 68, 0.15)",
              border: "1px solid rgba(239, 68, 68, 0.35)",
              color: "#fca5a5",
              fontSize: "0.78rem",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <AlertTriangle size={15} style={{ flexShrink: 0 }} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Content Body */}
        <div style={{ padding: "16px 20px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>
          {/* ===================== TAB 1: SENDER ===================== */}
          {activeTab === "send" && (
            <div>
              {/* Note Preview Box */}
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: "10px",
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  marginBottom: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#fff" }}>
                    {currentNote?.title || "Document Note"}
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "#94a3b8" }}>
                    {currentNote?.subject || "Academic"} • {currentNote?.branch || "All Branches"}
                  </div>
                </div>
                <div style={{ fontSize: "0.74rem", fontWeight: 700, color: "#c084fc", fontFamily: "var(--font-mono)" }}>
                  {senderSession?.buffer ? `${(senderSession.buffer.byteLength / (1024 * 1024)).toFixed(1)} MB` : "Ready"}
                </div>
              </div>

              {/* Transfer in Progress */}
              {senderProgress && (
                <div
                  style={{
                    padding: "14px",
                    borderRadius: "12px",
                    background: "rgba(168, 85, 247, 0.1)",
                    border: "1px solid rgba(168, 85, 247, 0.3)",
                    marginBottom: "12px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: "6px" }}>
                    <span style={{ color: "#e9d5ff", fontWeight: 600 }}>
                      {senderDone ? "🎉 Transfer Complete!" : "⚡ AirDropping Chunks..."}
                    </span>
                    <span style={{ color: "#34d399", fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                      {senderProgress.speed} • {senderProgress.percent}%
                    </span>
                  </div>
                  <div style={{ width: "100%", height: "8px", background: "rgba(255, 255, 255, 0.1)", borderRadius: "6px", overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${senderProgress.percent}%`,
                        height: "100%",
                        background: senderDone ? "linear-gradient(90deg, #10b981, #34d399)" : "linear-gradient(90deg, #9333ea, #c084fc)",
                        borderRadius: "6px",
                        transition: "width 0.2s ease",
                      }}
                    />
                  </div>
                </div>
              )}

              {/* QR Code Card */}
              {!senderDone && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    padding: "16px",
                    background: "#ffffff",
                    borderRadius: "14px",
                    boxShadow: "0 10px 25px rgba(0,0,0,0.4)",
                  }}
                >
                  {offerQrUrl ? (
                    <img
                      src={offerQrUrl}
                      alt="AirDrop QR Handshake"
                      style={{ width: "230px", height: "230px", borderRadius: "8px", display: "block" }}
                    />
                  ) : (
                    <div style={{ width: "230px", height: "230px", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
                      <RefreshCw size={24} className="spin" />
                    </div>
                  )}

                  <div style={{ marginTop: "10px", textAlign: "center", color: "#0f172a" }}>
                    <div style={{ fontSize: "0.82rem", fontWeight: 700 }}>
                      Ask receiver to scan this QR code
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "#64748b" }}>
                      Both devices should be on same Wi-Fi or Mobile Hotspot
                    </div>
                  </div>
                </div>
              )}

              {/* Actions & Fallbacks */}
              <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                <button
                  type="button"
                  onClick={() => copyToClipboard(senderSession?.offerToken)}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    borderRadius: "8px",
                    color: "#cbd5e1",
                    fontSize: "0.76rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                  }}
                >
                  {copied ? <Check size={14} color="#34d399" /> : <Copy size={14} />}
                  <span>{copied ? "Copied Token!" : "Copy Token"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowAnswerInput(!showAnswerInput)}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    background: "rgba(168, 85, 247, 0.15)",
                    border: "1px solid rgba(168, 85, 247, 0.35)",
                    borderRadius: "8px",
                    color: "#e9d5ff",
                    fontSize: "0.76rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                  }}
                >
                  <span>Connect with Answer</span>
                  <ArrowRight size={14} />
                </button>
              </div>

              {/* Answer Input Dropdown */}
              {showAnswerInput && (
                <div style={{ marginTop: "10px", padding: "10px", background: "rgba(0, 0, 0, 0.3)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <input
                    type="text"
                    placeholder="Paste receiver's answer token here..."
                    value={answerInputText}
                    onChange={(e) => setAnswerInputText(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: "6px",
                      background: "rgba(255, 255, 255, 0.08)",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      color: "#fff",
                      fontSize: "0.76rem",
                      marginBottom: "6px",
                      outline: "none",
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleApplyAnswerToken}
                    style={{
                      width: "100%",
                      padding: "8px",
                      borderRadius: "6px",
                      background: "linear-gradient(135deg, #9333ea, #c084fc)",
                      border: "none",
                      color: "#fff",
                      fontSize: "0.76rem",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    ⚡ Establish High-Speed Data Tunnel
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ===================== TAB 2: RECEIVER ===================== */}
          {activeTab === "receive" && (
            <div>
              {/* Receiver Success Screen */}
              {receiverDone ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    padding: "24px 16px",
                    background: "rgba(16, 185, 129, 0.1)",
                    border: "1px solid rgba(16, 185, 129, 0.3)",
                    borderRadius: "14px",
                    textAlign: "center",
                  }}
                >
                  <CheckCircle2 size={48} color="#34d399" style={{ marginBottom: "12px" }} />
                  <h4 style={{ margin: "0 0 6px", fontSize: "1.05rem", fontWeight: 700, color: "#fff" }}>
                    Note Received Successfully!
                  </h4>
                  <p style={{ margin: "0 0 16px", fontSize: "0.78rem", color: "#94a3b8" }}>
                    Cached in your device's IndexedDB vault. Available 100% offline forever.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      stopCamera();
                      onClose();
                      if (onNoteReceived && receivedNoteData) {
                        onNoteReceived(receivedNoteData);
                      }
                    }}
                    style={{
                      padding: "10px 24px",
                      borderRadius: "8px",
                      background: "linear-gradient(135deg, #10b981, #059669)",
                      border: "none",
                      color: "#fff",
                      fontSize: "0.84rem",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    📖 Open & Read Document
                  </button>
                </div>
              ) : (
                <>
                  {/* Receiving Progress */}
                  {receiverProgress && (
                    <div
                      style={{
                        padding: "12px 14px",
                        borderRadius: "12px",
                        background: "rgba(56, 189, 248, 0.1)",
                        border: "1px solid rgba(56, 189, 248, 0.3)",
                        marginBottom: "12px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: "6px" }}>
                        <span style={{ color: "#bae6fd", fontWeight: 600 }}>📥 Receiving Document Chunks...</span>
                        <span style={{ color: "#38bdf8", fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                          {receiverProgress.speed} • {receiverProgress.percent}%
                        </span>
                      </div>
                      <div style={{ width: "100%", height: "8px", background: "rgba(255, 255, 255, 0.1)", borderRadius: "6px", overflow: "hidden" }}>
                        <div
                          style={{
                            width: `${receiverProgress.percent}%`,
                            height: "100%",
                            background: "linear-gradient(90deg, #0284c7, #38bdf8)",
                            borderRadius: "6px",
                            transition: "width 0.2s ease",
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Show Answer QR if generated for two-way camera */}
                  {answerQrUrl && !receiverProgress && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        padding: "16px",
                        background: "#ffffff",
                        borderRadius: "14px",
                        marginBottom: "12px",
                      }}
                    >
                      <img
                        src={answerQrUrl}
                        alt="Answer QR"
                        style={{ width: "210px", height: "210px", borderRadius: "8px" }}
                      />
                      <div style={{ marginTop: "8px", textAlign: "center", color: "#0f172a" }}>
                        <div style={{ fontSize: "0.8rem", fontWeight: 700 }}>Show this Answer QR to Seeder</div>
                        <div style={{ fontSize: "0.68rem", color: "#64748b" }}>Or copy answer token below</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(receiverSession?.answerToken)}
                        style={{
                          marginTop: "8px",
                          padding: "6px 12px",
                          background: "#0f172a",
                          color: "#fff",
                          border: "none",
                          borderRadius: "6px",
                          fontSize: "0.72rem",
                          cursor: "pointer",
                        }}
                      >
                        {copied ? "Copied!" : "Copy Answer Token"}
                      </button>
                    </div>
                  )}

                  {/* Live Camera Viewfinder */}
                  {!answerQrUrl && !receiverProgress && (
                    <div
                      style={{
                        position: "relative",
                        width: "100%",
                        height: "260px",
                        borderRadius: "14px",
                        overflow: "hidden",
                        background: "#000",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <video
                        ref={videoRef}
                        playsInline
                        muted
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          display: cameraActive ? "block" : "none",
                        }}
                      />

                      {!cameraActive && (
                        <div style={{ textAlign: "center", padding: "20px" }}>
                          <Camera size={36} color="#64748b" style={{ marginBottom: "10px" }} />
                          <div style={{ fontSize: "0.82rem", color: "#94a3b8", marginBottom: "12px" }}>
                            Camera is ready to scan Seeder's QR Code
                          </div>
                          <button
                            type="button"
                            onClick={startCamera}
                            style={{
                              padding: "8px 16px",
                              background: "linear-gradient(135deg, #0284c7, #38bdf8)",
                              border: "none",
                              borderRadius: "8px",
                              color: "#fff",
                              fontWeight: 700,
                              fontSize: "0.78rem",
                              cursor: "pointer",
                            }}
                          >
                            📷 Activate Camera
                          </button>
                        </div>
                      )}

                      {/* Viewfinder Target Overlay */}
                      {cameraActive && (
                        <div
                          style={{
                            position: "absolute",
                            width: "180px",
                            height: "180px",
                            border: "2px solid #38bdf8",
                            borderRadius: "16px",
                            boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.45)",
                            pointerEvents: "none",
                          }}
                        />
                      )}
                    </div>
                  )}

                  {/* Manual Paste Fallback */}
                  <div style={{ marginTop: "12px" }}>
                    <button
                      type="button"
                      onClick={() => setShowManualReceive(!showManualReceive)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#94a3b8",
                        fontSize: "0.74rem",
                        cursor: "pointer",
                        textDecoration: "underline",
                        padding: 0,
                      }}
                    >
                      {showManualReceive ? "Hide Manual Paste" : "Or Paste Seeder Token Manually"}
                    </button>

                    {showManualReceive && (
                      <div style={{ marginTop: "8px" }}>
                        <textarea
                          rows={2}
                          placeholder="Paste Seeder's offer token here..."
                          value={manualOfferText}
                          onChange={(e) => setManualOfferText(e.target.value)}
                          style={{
                            width: "100%",
                            padding: "8px 10px",
                            borderRadius: "6px",
                            background: "rgba(255, 255, 255, 0.08)",
                            border: "1px solid rgba(255, 255, 255, 0.15)",
                            color: "#fff",
                            fontSize: "0.74rem",
                            outline: "none",
                            resize: "none",
                            marginBottom: "6px",
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => handleProcessOfferToken(manualOfferText)}
                          style={{
                            width: "100%",
                            padding: "8px",
                            background: "linear-gradient(135deg, #0284c7, #38bdf8)",
                            border: "none",
                            borderRadius: "6px",
                            color: "#fff",
                            fontWeight: 700,
                            fontSize: "0.76rem",
                            cursor: "pointer",
                          }}
                        >
                          📥 Connect & Receive Note
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer Guarantee */}
        <div
          style={{
            padding: "10px 20px",
            background: "rgba(0, 0, 0, 0.35)",
            borderTop: "1px solid rgba(255, 255, 255, 0.06)",
            fontSize: "0.7rem",
            color: "#64748b",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <ShieldCheck size={14} color="#10b981" />
            End-to-End Local WebRTC Mesh
          </span>
          <span>Zero Server Cost • ₹0 Forever</span>
        </div>
      </div>
    </div>
  );
}
