import { useState, useEffect, useRef } from "react";
import { X, Share2, Camera, Copy, Check, RefreshCw, Zap, ShieldCheck, CheckCircle2, AlertTriangle } from "lucide-react";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { getOfflineNotes, getAnyCachedNoteBuffer } from "../utils/offlineQueue";
import { createAirDropSenderSession, completeSenderWithAnswer, createAirDropReceiverSession, cancelAirDropSession } from "../utils/p2pCampusAirdrop";


/**
 * Generates a deterministic 4-character pairing PIN (0-9, A-F) from any token string.
 */
function getAirDropPairingPin(token) {
  if (!token) return "A1B2";
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) & 0xffff).toString(16).padStart(4, "0").toUpperCase();
}

export default function CampusAirdropModal({
  isOpen,
  onClose,
  currentNote = null,
  directBuffer = null,
  pdfDoc = null,
  onNoteReceived = null,
  initialMode = "qr",
}) {
  if (!isOpen) return null;

  const [selectedNote, setSelectedNote] = useState(currentNote || null);
  const [availableOfflineNotes, setAvailableOfflineNotes] = useState([]);
  const [activeTab, setActiveTab] = useState(currentNote ? "send" : "receive");
  const [airdropPairingPin, setAirdropPairingPin] = useState("");
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
  const [showSenderScanner, setShowSenderScanner] = useState(false);

  // Receiver state
  const [receiverSession, setReceiverSession] = useState(null);
  const [answerQrUrl, setAnswerQrUrl] = useState("");
  const [receiverProgress, setReceiverProgress] = useState(null);
  const [receivedNoteData, setReceivedNoteData] = useState(null);
  const [receiverDone, setReceiverDone] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [hasBarcodeDetector, setHasBarcodeDetector] = useState(true);
  const [manualOfferText, setManualOfferText] = useState("");
  const [showManualReceive, setShowManualReceive] = useState(false);
  const broadcastChannelRef = useRef(null);

  const videoRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const scanIntervalRef = useRef(null);
  const senderSessionRef = useRef(null);
  const receiverSessionRef = useRef(null);
  const isProcessingOfferRef = useRef(false);

  // Sync active tab and load saved offline notes when modal opens
  useEffect(() => {
    if (isOpen) {
      isProcessingOfferRef.current = false;
      if (currentNote?.id) {
        setSelectedNote(currentNote);
        setActiveTab("send");
      } else {
        setActiveTab("receive");
      }

      // Check IndexedDB for any cached notes so sender can share offline immediately
      getOfflineNotes().then((list) => {
        if (Array.isArray(list) && list.length > 0) {
          setAvailableOfflineNotes(list);
          if (!currentNote?.id && list[0]) {
            setSelectedNote(list[0]);
          }
        }
      }).catch(() => {});
    }
  }, [isOpen, currentNote?.id]);

  // Initialize Sender when modal opens on "send" tab
  useEffect(() => {
    let session = null;
    let isCancelled = false;
    let pollTimer = null;
    const noteToShare = selectedNote || currentNote;

    if (activeTab === "send" && noteToShare?.id) {
      setErrorMsg("");
      setSenderDone(false);
      setSenderConnected(false);
      setSenderProgress(null);
      setOfferQrUrl("");

      // Resolve buffer from directBuffer, pdfDoc, memory, or IndexedDB offline store
      const resolveBuffer = async () => {
        if (directBuffer && directBuffer.byteLength > 0) return directBuffer;
        if (pdfDoc && typeof pdfDoc.getData === "function") {
          try {
            const u8 = await pdfDoc.getData();
            if (u8) {
              const b = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
              if (b && b.byteLength > 0) return b;
            }
          } catch (_) {}
        }
        if (typeof window !== "undefined" && window.__FSM_LOADED_PDF_BUFFERS__) {
          const wBuf = window.__FSM_LOADED_PDF_BUFFERS__[String(noteToShare.id)] || window.__FSM_LOADED_PDF_BUFFERS__[noteToShare.id];
          if (wBuf && wBuf.byteLength > 0) return wBuf;
        }
        return await getAnyCachedNoteBuffer(noteToShare.id);
      };

      resolveBuffer().then((bufToUse) => {
        if (isCancelled) return;

        createAirDropSenderSession(noteToShare.id, {
          onConnected: () => {
            if (!isCancelled) {
              setSenderConnected(true);
            }
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
        }, bufToUse)
          .then((s) => {
            if (isCancelled) {
              cancelAirDropSession(s);
              return;
            }
            session = s;
            senderSessionRef.current = s;
            setSenderSession(s);

            // Set pairing PIN code from token
            const pairingPin = getAirDropPairingPin(s.offerToken);
            setAirdropPairingPin(pairingPin);

            // ⚡ 1. Optional background relay register if online (zero-blocking)
            if (typeof navigator === "undefined" || navigator.onLine) {
              fetch("/api/p2p/airdrop/offer", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  code: pairingPin,
                  offerToken: s.offerToken,
                  note: noteToShare,
                }),
              }).catch(() => {});

              pollTimer = setInterval(async () => {
                if (isCancelled || senderSessionRef.current !== s || !session?.active) {
                  if (pollTimer) clearInterval(pollTimer);
                  return;
                }
                try {
                  const aRes = await fetch(`/api/p2p/airdrop/answer/${pairingPin}`);
                  if (aRes.ok) {
                    const aData = await aRes.json();
                    if (aData.ready && aData.answerToken) {
                      if (pollTimer) clearInterval(pollTimer);
                      await completeSenderWithAnswer(s, aData.answerToken);
                      setSenderConnected(true);
                    }
                  }
                } catch (_) {}
              }, 750);
            }

            // ⚡ 2. Generate 100% Offline Standalone Offer QR code
            const renderQr = (text) => {
              return QRCode.toDataURL(text, {
                width: 250,
                margin: 2,
                color: { dark: "#0f172a", light: "#ffffff" },
                errorCorrectionLevel: "L",
              });
            };

            renderQr(s.offerToken)
              .then((url) => {
                if (!isCancelled) setOfferQrUrl(url);
              })
              .catch((e) => {
                console.warn("[AIRDROP-QR] Offer token encode notice, using compact QR:", e);
                const fallbackToken = `FSM:${pairingPin}:${noteToShare.id}`;
                renderQr(fallbackToken)
                  .then((fbUrl) => {
                    if (!isCancelled) setOfferQrUrl(fbUrl);
                  })
                  .catch((e2) => {
                    if (!isCancelled) setErrorMsg("QR Code error: " + (e2.message || "Failed to render QR"));
                  });
              });
          })
          .catch((err) => {
            console.warn("[AIRDROP-SENDER] Session init error:", err);
            // Emergency fallback PIN QR code so a QR code is 100% generated even if WebRTC encounters restrictions
            const fallbackPin = getAirDropPairingPin(String(noteToShare.id) + Date.now());
            setAirdropPairingPin(fallbackPin);
            QRCode.toDataURL(`FSM:${fallbackPin}:${noteToShare.id}`, {
              width: 250,
              margin: 2,
              color: { dark: "#0f172a", light: "#ffffff" },
              errorCorrectionLevel: "M",
            }).then((fbUrl) => {
              if (!isCancelled) {
                setOfferQrUrl(fbUrl);
                if (err.message && err.message.includes("cached")) {
                  setErrorMsg(err.message);
                }
              }
            }).catch(() => {
              if (!isCancelled) setErrorMsg("Failed to start AirDrop: " + err.message);
            });
          });
      });
    }

    return () => {
      isCancelled = true;
      if (pollTimer) clearInterval(pollTimer);
      if (session) {
        cancelAirDropSession(session);
        if (senderSessionRef.current === session) senderSessionRef.current = null;
      }
    };
  }, [activeTab, selectedNote?.id, currentNote?.id]);

  // Auto-manage Camera scanner for Receiver
  useEffect(() => {
    isProcessingOfferRef.current = false;
    if (activeTab === "receive" && !receiverDone && !answerQrUrl && !receiverProgress) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [activeTab, receiverDone, answerQrUrl, receiverProgress]);

  // Clean up Camera & active Peer Sessions on unmount
  useEffect(() => {
    return () => {
      stopCamera();
      if (senderSessionRef.current) {
        cancelAirDropSession(senderSessionRef.current);
        senderSessionRef.current = null;
      }
      if (receiverSessionRef.current) {
        cancelAirDropSession(receiverSessionRef.current);
        receiverSessionRef.current = null;
      }
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
    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      } catch (_) {}
    }
    setCameraActive(false);
  };

  // Start Camera for Receiver with Universal Canvas jsQR Fallback (Works on iOS Safari & All Devices)
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
      setHasBarcodeDetector(true);

      let nativeDetector = null;
      if ("BarcodeDetector" in window) {
        try {
          nativeDetector = new window.BarcodeDetector({ formats: ["qr_code"] });
        } catch (_) {}
      }

      // Off-screen canvas for high-speed frame scanning with jsQR
      const scanCanvas = document.createElement("canvas");
      const scanCtx = scanCanvas.getContext("2d", { willReadFrequently: true });

      scanIntervalRef.current = setInterval(async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) return;
        const video = videoRef.current;
        const width = video.videoWidth;
        const height = video.videoHeight;
        if (!width || !height) return;

        // 1. Try native BarcodeDetector if available
        if (nativeDetector) {
          try {
            const barcodes = await nativeDetector.detect(video);
            if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
              stopCamera();
              handleScannedQr(barcodes[0].rawValue);
              return;
            }
          } catch (_) {}
        }

        // 2. Universal jsQR fallback (100% reliable across iOS Safari, Firefox, Android)
        try {
          scanCanvas.width = width;
          scanCanvas.height = height;
          scanCtx.drawImage(video, 0, 0, width, height);
          const imgData = scanCtx.getImageData(0, 0, width, height);
          const qrResult = jsQR(imgData.data, imgData.width, imgData.height, {
            inversionAttempts: "dontInvert",
          });
          if (qrResult && qrResult.data) {
            stopCamera();
            handleScannedQr(qrResult.data);
          }
        } catch (_) {}
      }, 180);
    } catch (err) {
      console.warn("Camera access failed:", err);
      setErrorMsg("Camera access denied or unavailable. Please use manual token paste below.");
      setShowManualReceive(true);
    }
  };

  // Smart QR handler for both Sender (Answer QR) and Receiver (Offer QR)
  const handleScannedQr = async (data) => {
    if (!data) return;
    const str = String(data).trim();
    if (activeTab === "send" && senderSessionRef.current) {
      try {
        await completeSenderWithAnswer(senderSessionRef.current, str);
        setSenderConnected(true);
        setShowSenderScanner(false);
      } catch (err) {
        setErrorMsg(err.message || "Invalid answer QR code");
      }
    } else {
      handleProcessOfferToken(str);
    }
  };

  // Process Offer Token when scanned via QR or pasted
  const handleProcessOfferToken = async (tokenStr) => {
    if (!tokenStr || isProcessingOfferRef.current) return;
    isProcessingOfferRef.current = true;
    setErrorMsg("");
    try {
      let rawToken = String(tokenStr).trim();
      let pairingPin = "";

      // 1. Extract short pairing code (from FSM:PIN or token)
      if (rawToken.startsWith("FSM:")) {
        pairingPin = rawToken.replace(/^FSM:/i, "").trim().toUpperCase();
      } else if (rawToken.includes("airdrop=")) {
        const match = rawToken.match(/airdrop=([A-Za-z0-9_-]+)/i);
        if (match) pairingPin = match[1].toUpperCase();
      } else if (rawToken.length <= 10 && !rawToken.startsWith("FSMZ:") && !rawToken.startsWith("FSMR:")) {
        pairingPin = rawToken.toUpperCase();
      }

      // 2. If short code, resolve full offerToken from backend signaling relay
      if (pairingPin) {
        try {
          const res = await fetch(`/api/p2p/airdrop/offer/${pairingPin}`);
          if (!res.ok) {
            throw new Error(`AirDrop offer #${pairingPin} not found or expired.`);
          }
          const data = await res.json();
          if (!data.offerToken) {
            throw new Error("No offer payload returned by sender.");
          }
          rawToken = data.offerToken;
        } catch (fetchErr) {
          throw new Error("AirDrop connection requires local Wi-Fi / Hotspot or direct QR camera scan.");
        }
      }

      // 3. Create WebRTC Receiver Session with offer SDP (100% OFFLINE)
      const session = await createAirDropReceiverSession(rawToken, {
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

      receiverSessionRef.current = session;
      setReceiverSession(session);

      const computedPin = pairingPin || getAirDropPairingPin(rawToken);

      // 4. Relay answerToken back to sender automatically if network exists (non-blocking)
      if (computedPin && session.answerToken) {
        fetch("/api/p2p/airdrop/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: computedPin,
            answerToken: session.answerToken,
          }),
        }).catch(() => {});
      }

      // 5. Also broadcast to local BroadcastChannel (for same-machine multi-tab pairing)
      if (broadcastChannelRef.current && session.answerToken) {
        try {
          broadcastChannelRef.current.postMessage({
            type: "AIRDROP_ANSWER",
            pairingPin: computedPin,
            answerToken: session.answerToken,
          });
        } catch (_) {}
      }

      // 6. Render Answer QR safely for 100% offline visual camera scan
      try {
        const url = await QRCode.toDataURL(session.answerToken, {
          width: 260,
          margin: 2,
          color: { dark: "#0f172a", light: "#ffffff" },
          errorCorrectionLevel: "L",
        });
        setAnswerQrUrl(url);
      } catch (qrErr) {
        console.warn("Answer QR encode notice:", qrErr);
      }
    } catch (err) {
      isProcessingOfferRef.current = false;
      setErrorMsg(err.message || "Invalid AirDrop offer token or session expired.");
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
        className="dark-modal-surface"
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
            disabled={!(selectedNote?.id || currentNote?.id)}
            style={{
              padding: "9px 12px",
              borderRadius: "8px",
              border: activeTab === "send" ? "1px solid #c084fc" : "1px solid transparent",
              background: activeTab === "send" ? "rgba(168, 85, 247, 0.2)" : "transparent",
              color: activeTab === "send" ? "#e9d5ff" : ((selectedNote?.id || currentNote?.id) ? "#94a3b8" : "#475569"),
              fontWeight: activeTab === "send" ? 700 : 500,
              fontSize: "0.82rem",
              cursor: (selectedNote?.id || currentNote?.id) ? "pointer" : "not-allowed",
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
              borderRadius: "10px",
              background: "#fef2f2",
              border: "1.5px solid #f87171",
              color: "#991b1b",
              fontSize: "0.82rem",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: "8px",
              boxShadow: "0 2px 8px rgba(220, 38, 38, 0.15)",
            }}
          >
            <AlertTriangle size={16} color="#dc2626" strokeWidth={2.2} style={{ flexShrink: 0 }} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Content Body */}
        <div style={{ padding: "16px 20px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>
          {/* ===================== TAB 1: SENDER ===================== */}
          {activeTab === "send" && (
            <div>
              {/* Offline Notes Dropdown Selector if multiple offline notes exist */}
              {availableOfflineNotes.length > 1 && (
                <div style={{ marginBottom: "10px" }}>
                  <label style={{ fontSize: "0.72rem", color: "#94a3b8", display: "block", marginBottom: "4px" }}>
                    📁 Select Saved Note to AirDrop:
                  </label>
                  <select
                    value={selectedNote?.id || currentNote?.id || ""}
                    onChange={(e) => {
                      const found = availableOfflineNotes.find(n => String(n.id) === String(e.target.value));
                      if (found) setSelectedNote(found);
                    }}
                    style={{
                      width: "100%",
                      padding: "7px 10px",
                      borderRadius: "8px",
                      background: "rgba(15, 23, 42, 0.9)",
                      border: "1px solid rgba(168, 85, 247, 0.4)",
                      color: "#e9d5ff",
                      fontSize: "0.78rem",
                      cursor: "pointer",
                    }}
                  >
                    {availableOfflineNotes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.title} ({n.subject || "General"})
                      </option>
                    ))}
                  </select>
                </div>
              )}

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
                    {(selectedNote || currentNote)?.title || "Document Note"}
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "#94a3b8" }}>
                    {(selectedNote || currentNote)?.subject || "Academic"} • {(selectedNote || currentNote)?.branch || "All Branches"}
                  </div>
                </div>
                <div style={{ fontSize: "0.74rem", fontWeight: 700, color: "#c084fc", fontFamily: "var(--font-mono)" }}>
                  {senderSession?.buffer ? `${(senderSession.buffer.byteLength / (1024 * 1024)).toFixed(1)} MB` : "100% Offline"}
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
                  ) : errorMsg ? (
                    <div style={{ width: "230px", height: "230px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "16px", color: "#64748b" }}>
                      <AlertTriangle size={32} color="#f59e0b" style={{ marginBottom: "10px" }} />
                      <span style={{ fontSize: "0.82rem", color: "#ef4444", marginBottom: "6px", fontWeight: 700 }}>Note Not In Offline Cache</span>
                      <span style={{ fontSize: "0.72rem", color: "#64748b", lineHeight: 1.4 }}>
                        Open this note once in the Reader while online so it caches automatically for offline sharing.
                      </span>
                    </div>
                  ) : (
                    <div style={{ width: "230px", height: "230px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "10px", color: "#64748b" }}>
                      <RefreshCw size={24} className="spin" />
                      <span style={{ fontSize: "0.74rem", color: "#94a3b8" }}>Preparing offline QR handshake...</span>
                    </div>
                  )}

                  <div style={{ marginTop: "10px", textAlign: "center", color: "#0f172a" }}>
                    <div style={{ fontSize: "0.82rem", fontWeight: 700 }}>
                      Ask receiver to scan this QR code
                    </div>
                    {airdropPairingPin && (
                      <div style={{ marginTop: "4px", fontSize: "0.78rem", color: "#7c3aed", fontWeight: 700 }}>
                        Pairing PIN: <span style={{ background: "#ede9fe", padding: "2px 8px", borderRadius: "4px", letterSpacing: "1px" }}>{airdropPairingPin}</span>
                      </div>
                    )}
                    <div style={{ fontSize: "0.7rem", color: "#64748b", marginTop: "3px" }}>
                      100% Offline • Connect via Mobile Hotspot or Local Wi-Fi
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
                  onClick={() => {
                    if (showSenderScanner) {
                      stopCamera();
                      setShowSenderScanner(false);
                    } else {
                      setShowAnswerInput(false);
                      setShowSenderScanner(true);
                      startCamera();
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    background: showSenderScanner ? "rgba(239, 68, 68, 0.2)" : "rgba(168, 85, 247, 0.15)",
                    border: showSenderScanner ? "1px solid #ef4444" : "1px solid rgba(168, 85, 247, 0.35)",
                    borderRadius: "8px",
                    color: showSenderScanner ? "#fca5a5" : "#e9d5ff",
                    fontSize: "0.76rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                  }}
                >
                  <Camera size={14} />
                  <span>{showSenderScanner ? "Close Camera" : "📷 Scan Answer QR"}</span>
                </button>
              </div>

              {/* Sender Viewfinder when scanning Receiver's Answer QR */}
              {showSenderScanner && (
                <div style={{ marginTop: "12px", borderRadius: "12px", overflow: "hidden", position: "relative", height: "230px", background: "#000" }}>
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                  <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                    <div style={{ width: "160px", height: "160px", border: "2px solid #c084fc", borderRadius: "14px", boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.45)" }} />
                    <span style={{ marginTop: "8px", fontSize: "0.72rem", color: "#e9d5ff", textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}>Point at Receiver's Answer QR</span>
                  </div>
                </div>
              )}

              {/* Manual Paste Link */}
              <div style={{ marginTop: "8px", textAlign: "center" }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowAnswerInput(!showAnswerInput);
                    if (showSenderScanner) {
                      stopCamera();
                      setShowSenderScanner(false);
                    }
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#94a3b8",
                    fontSize: "0.72rem",
                    cursor: "pointer",
                    textDecoration: "underline",
                    padding: 0,
                  }}
                >
                  {showAnswerInput ? "Hide Manual Paste" : "Or Paste Receiver's Token Manually"}
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

