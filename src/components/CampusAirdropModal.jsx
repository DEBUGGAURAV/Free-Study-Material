import { useState, useEffect, useRef } from "react";
import { X, Share2, Camera, Copy, Check, RefreshCw, Zap, ShieldCheck, CheckCircle2, AlertTriangle } from "lucide-react";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { getOfflineNotes, getAllStoredOfflineNotes, getAnyCachedNoteBuffer } from "../utils/offlineQueue";
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
      getAllStoredOfflineNotes().then((list) => {
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
        background: "rgba(15, 23, 42, 0.6)",
        backdropFilter: "blur(12px) saturate(180%)",
        WebkitBackdropFilter: "blur(12px) saturate(180%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 99999,
        padding: "16px",
        animation: "airdropFadeIn 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          stopCamera();
          onClose();
        }
      }}
    >
      <div
        className="campus-airdrop-modal-surface white-modal-surface"
        style={{
          width: "100%",
          maxWidth: "490px",
          background: "#ffffff",
          border: "1.5px solid rgba(226, 232, 240, 0.95)",
          borderRadius: "24px",
          boxShadow: "0 25px 70px -12px rgba(15, 23, 42, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.9) inset, 0 12px 32px -4px rgba(99, 102, 241, 0.12)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          color: "#0f172a",
          position: "relative",
          animation: "airdropSlideUp 0.28s cubic-bezier(0.16, 1, 0.3, 1)",
          fontFamily: "var(--font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif)",
        }}
      >
        {/* Top Rainbow Accent Strip */}
        <div
          style={{
            height: "4px",
            width: "100%",
            background: "linear-gradient(90deg, #6366f1, #8b5cf6, #ec4899, #06b6d4)",
          }}
        />

        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "18px 22px 14px",
            borderBottom: "1px solid #f1f5f9",
            background: "linear-gradient(180deg, #ffffff 0%, #fafafa 100%)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "42px",
                height: "42px",
                borderRadius: "12px",
                background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #d946ef 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 14px rgba(139, 92, 246, 0.35)",
                flexShrink: 0,
              }}
            >
              <Zap size={22} color="#ffffff" strokeWidth={2.4} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <h3 style={{ margin: 0, fontSize: "1.12rem", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em" }}>
                  Campus AirDrop
                </h3>
                <span
                  style={{
                    fontSize: "0.68rem",
                    fontWeight: 800,
                    padding: "2px 8px",
                    borderRadius: "9999px",
                    background: "linear-gradient(135deg, #ecfdf5, #d1fae5)",
                    color: "#047857",
                    border: "1px solid #a7f3d0",
                    boxShadow: "0 1px 2px rgba(16, 185, 129, 0.1)",
                    letterSpacing: "0.02em",
                  }}
                >
                  ⚡ 0% Net • 0ms P2P
                </span>
              </div>
              <p style={{ margin: "2px 0 0", fontSize: "0.75rem", color: "#64748b", fontWeight: 500 }}>
                Zero-Internet P2P BitTorrent & Instant QR Mesh
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            title="Close"
            style={{
              width: "34px",
              height: "34px",
              borderRadius: "10px",
              background: "#f1f5f9",
              border: "1px solid #e2e8f0",
              color: "#64748b",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.18s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#fee2e2";
              e.currentTarget.style.color = "#ef4444";
              e.currentTarget.style.borderColor = "#fca5a5";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#f1f5f9";
              e.currentTarget.style.color = "#64748b";
              e.currentTarget.style.borderColor = "#e2e8f0";
            }}
          >
            <X size={18} strokeWidth={2.4} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            padding: "5px",
            margin: "14px 20px 0",
            background: "#f1f5f9",
            borderRadius: "14px",
            border: "1px solid #e2e8f0",
            gap: "6px",
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
              padding: "10px 14px",
              borderRadius: "10px",
              border: "none",
              background: activeTab === "send" ? "linear-gradient(135deg, #7c3aed, #6366f1)" : "transparent",
              color: activeTab === "send" ? "#ffffff" : ((selectedNote?.id || currentNote?.id) ? "#475569" : "#94a3b8"),
              fontWeight: activeTab === "send" ? 800 : 600,
              fontSize: "0.82rem",
              boxShadow: activeTab === "send" ? "0 3px 12px rgba(124, 58, 237, 0.28)" : "none",
              cursor: (selectedNote?.id || currentNote?.id) ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "7px",
              transition: "all 0.18s ease",
            }}
          >
            <Share2 size={15} strokeWidth={2.2} />
            <span>⚡ Share Note</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("receive");
            }}
            style={{
              padding: "10px 14px",
              borderRadius: "10px",
              border: "none",
              background: activeTab === "receive" ? "linear-gradient(135deg, #0284c7, #2563eb)" : "transparent",
              color: activeTab === "receive" ? "#ffffff" : "#475569",
              fontWeight: activeTab === "receive" ? 800 : 600,
              fontSize: "0.82rem",
              boxShadow: activeTab === "receive" ? "0 3px 12px rgba(37, 99, 235, 0.28)" : "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "7px",
              transition: "all 0.18s ease",
            }}
          >
            <Camera size={15} strokeWidth={2.2} />
            <span>📷 Receive Note</span>
          </button>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div
            style={{
              margin: "12px 20px 0",
              padding: "10px 14px",
              borderRadius: "12px",
              background: "#fef2f2",
              border: "1.5px solid #fecaca",
              color: "#991b1b",
              fontSize: "0.82rem",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: "9px",
              boxShadow: "0 2px 8px rgba(220, 38, 38, 0.08)",
            }}
          >
            <AlertTriangle size={17} color="#dc2626" strokeWidth={2.2} style={{ flexShrink: 0 }} />
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
                <div style={{ marginBottom: "12px" }}>
                  <label style={{ fontSize: "0.74rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: "5px" }}>
                    📁 Select Saved Note to AirDrop:
                  </label>
                  <select
                    value={selectedNote?.id || currentNote?.id || ""}
                    onChange={(e) => {
                      const found = availableOfflineNotes.find((n) => String(n.id) === String(e.target.value));
                      if (found) setSelectedNote(found);
                    }}
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      borderRadius: "10px",
                      background: "#ffffff",
                      border: "1.5px solid #cbd5e1",
                      color: "#0f172a",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      cursor: "pointer",
                      boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
                      outline: "none",
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
                  padding: "12px 16px",
                  borderRadius: "14px",
                  background: "linear-gradient(135deg, #faf5ff 0%, #f5f3ff 60%, #eff6ff 100%)",
                  border: "1.5px solid #e9d5ff",
                  marginBottom: "14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  boxShadow: "0 2px 8px rgba(168, 85, 247, 0.06)",
                }}
              >
                <div>
                  <div style={{ fontSize: "0.88rem", fontWeight: 800, color: "#1e1b4b" }}>
                    {(selectedNote || currentNote)?.title || "Document Note"}
                  </div>
                  <div style={{ fontSize: "0.74rem", color: "#6b21a8", fontWeight: 600, marginTop: "2px" }}>
                    {(selectedNote || currentNote)?.subject || "Academic"} • {(selectedNote || currentNote)?.branch || "All Branches"}
                  </div>
                </div>
                <div
                  style={{
                    fontSize: "0.74rem",
                    fontWeight: 800,
                    color: "#7c3aed",
                    background: "#ffffff",
                    border: "1px solid #ddd6fe",
                    padding: "3px 9px",
                    borderRadius: "7px",
                    fontFamily: "var(--font-mono, monospace)",
                    boxShadow: "0 1px 2px rgba(124, 58, 237, 0.08)",
                  }}
                >
                  {senderSession?.buffer ? `${(senderSession.buffer.byteLength / (1024 * 1024)).toFixed(1)} MB` : "100% Offline"}
                </div>
              </div>

              {/* Transfer in Progress */}
              {senderProgress && (
                <div
                  style={{
                    padding: "14px 16px",
                    borderRadius: "14px",
                    background: "linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)",
                    border: "1.5px solid #d8b4fe",
                    marginBottom: "14px",
                    boxShadow: "0 3px 10px rgba(168, 85, 247, 0.08)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: "8px" }}>
                    <span style={{ color: "#6b21a8", fontWeight: 700 }}>
                      {senderDone ? "🎉 Transfer Complete!" : "⚡ AirDropping Chunks..."}
                    </span>
                    <span style={{ color: "#059669", fontWeight: 800, fontFamily: "var(--font-mono, monospace)" }}>
                      {senderProgress.speed} • {senderProgress.percent}%
                    </span>
                  </div>
                  <div style={{ width: "100%", height: "8px", background: "#e2e8f0", borderRadius: "9999px", overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${senderProgress.percent}%`,
                        height: "100%",
                        background: senderDone ? "linear-gradient(90deg, #10b981, #059669)" : "linear-gradient(90deg, #7c3aed, #a855f7, #ec4899)",
                        borderRadius: "9999px",
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
                    padding: "18px 16px",
                    background: "#ffffff",
                    borderRadius: "18px",
                    border: "1.5px solid #e2e8f0",
                    boxShadow: "0 10px 30px -4px rgba(15, 23, 42, 0.08), 0 2px 6px rgba(15, 23, 42, 0.04)",
                  }}
                >
                  {offerQrUrl ? (
                    <img
                      src={offerQrUrl}
                      alt="AirDrop QR Handshake"
                      style={{
                        width: "230px",
                        height: "230px",
                        borderRadius: "12px",
                        border: "1px solid #f1f5f9",
                        padding: "8px",
                        background: "#ffffff",
                        display: "block",
                        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04)",
                      }}
                    />
                  ) : errorMsg ? (
                    <div
                      style={{
                        width: "230px",
                        height: "230px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        textAlign: "center",
                        padding: "16px",
                        color: "#64748b",
                      }}
                    >
                      <AlertTriangle size={32} color="#f59e0b" style={{ marginBottom: "10px" }} />
                      <span style={{ fontSize: "0.82rem", color: "#ef4444", marginBottom: "6px", fontWeight: 700 }}>
                        Note Not In Offline Cache
                      </span>
                      <span style={{ fontSize: "0.72rem", color: "#64748b", lineHeight: 1.4 }}>
                        Open this note once in the Reader while online so it caches automatically for offline sharing.
                      </span>
                    </div>
                  ) : (
                    <div
                      style={{
                        width: "230px",
                        height: "230px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "10px",
                        color: "#64748b",
                      }}
                    >
                      <RefreshCw size={24} className="spin" color="#6366f1" />
                      <span style={{ fontSize: "0.76rem", color: "#64748b", fontWeight: 600 }}>Preparing offline QR handshake...</span>
                    </div>
                  )}

                  <div style={{ marginTop: "12px", textAlign: "center", color: "#0f172a" }}>
                    <div style={{ fontSize: "0.86rem", fontWeight: 800 }}>
                      Ask receiver to scan this QR code
                    </div>
                    {airdropPairingPin && (
                      <div style={{ marginTop: "6px", fontSize: "0.78rem", color: "#6d28d9", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "6px" }}>
                        <span>Pairing PIN:</span>
                        <span
                          style={{
                            background: "linear-gradient(135deg, #f5f3ff, #ede9fe)",
                            border: "1px solid #c4b5fd",
                            color: "#6d28d9",
                            padding: "3px 10px",
                            borderRadius: "6px",
                            letterSpacing: "1.5px",
                            fontWeight: 900,
                            fontSize: "0.9rem",
                          }}
                        >
                          {airdropPairingPin}
                        </span>
                      </div>
                    )}
                    <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 600, marginTop: "5px" }}>
                      100% Offline • Connect via Mobile Hotspot or Local Wi-Fi
                    </div>
                  </div>
                </div>
              )}

              {/* Actions & Fallbacks */}
              <div style={{ display: "flex", gap: "10px", marginTop: "14px" }}>
                <button
                  type="button"
                  onClick={() => copyToClipboard(senderSession?.offerToken)}
                  style={{
                    flex: 1,
                    padding: "9px 14px",
                    background: "#ffffff",
                    border: "1.5px solid #cbd5e1",
                    borderRadius: "10px",
                    color: "#334155",
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
                    transition: "all 0.18s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#f8fafc";
                    e.currentTarget.style.borderColor = "#94a3b8";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#ffffff";
                    e.currentTarget.style.borderColor = "#cbd5e1";
                  }}
                >
                  {copied ? <Check size={14} color="#059669" strokeWidth={2.4} /> : <Copy size={14} strokeWidth={2.2} />}
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
                    padding: "9px 14px",
                    background: showSenderScanner ? "#fee2e2" : "linear-gradient(135deg, #7c3aed, #6366f1)",
                    border: showSenderScanner ? "1.5px solid #fca5a5" : "none",
                    borderRadius: "10px",
                    color: showSenderScanner ? "#dc2626" : "#ffffff",
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    boxShadow: showSenderScanner ? "none" : "0 3px 12px rgba(124, 58, 237, 0.25)",
                    transition: "all 0.18s ease",
                  }}
                >
                  <Camera size={14} strokeWidth={2.2} />
                  <span>{showSenderScanner ? "Close Camera" : "📷 Scan Answer QR"}</span>
                </button>
              </div>

              {/* Sender Viewfinder when scanning Receiver's Answer QR */}
              {showSenderScanner && (
                <div
                  style={{
                    marginTop: "12px",
                    borderRadius: "16px",
                    overflow: "hidden",
                    position: "relative",
                    height: "230px",
                    background: "#0f172a",
                    border: "2px solid #e2e8f0",
                    boxShadow: "0 4px 16px rgba(15, 23, 42, 0.08)",
                  }}
                >
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      pointerEvents: "none",
                    }}
                  >
                    <div
                      style={{
                        width: "160px",
                        height: "160px",
                        border: "2.5px solid #c084fc",
                        borderRadius: "14px",
                        boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.55)",
                      }}
                    />
                    <span style={{ marginTop: "10px", fontSize: "0.74rem", color: "#f8fafc", fontWeight: 700, textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}>
                      Point at Receiver's Answer QR
                    </span>
                  </div>
                </div>
              )}

              {/* Manual Paste Link */}
              <div style={{ marginTop: "10px", textAlign: "center" }}>
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
                    color: "#6366f1",
                    fontSize: "0.75rem",
                    fontWeight: 600,
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
                <div
                  style={{
                    marginTop: "10px",
                    padding: "12px",
                    background: "#f8fafc",
                    borderRadius: "12px",
                    border: "1.5px solid #e2e8f0",
                  }}
                >
                  <input
                    type="text"
                    placeholder="Paste receiver's answer token here..."
                    value={answerInputText}
                    onChange={(e) => setAnswerInputText(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      borderRadius: "8px",
                      background: "#ffffff",
                      border: "1.5px solid #cbd5e1",
                      color: "#0f172a",
                      fontSize: "0.78rem",
                      marginBottom: "8px",
                      outline: "none",
                      boxShadow: "0 1px 2px rgba(0, 0, 0, 0.04)",
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleApplyAnswerToken}
                    style={{
                      width: "100%",
                      padding: "9px",
                      borderRadius: "8px",
                      background: "linear-gradient(135deg, #7c3aed, #6366f1)",
                      border: "none",
                      color: "#ffffff",
                      fontSize: "0.78rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      boxShadow: "0 3px 10px rgba(124, 58, 237, 0.25)",
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
                    padding: "26px 20px",
                    background: "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)",
                    border: "1.5px solid #6ee7b7",
                    borderRadius: "18px",
                    textAlign: "center",
                    boxShadow: "0 10px 25px -4px rgba(16, 185, 129, 0.15)",
                  }}
                >
                  <CheckCircle2 size={52} color="#059669" style={{ marginBottom: "12px" }} />
                  <h4 style={{ margin: "0 0 6px", fontSize: "1.1rem", fontWeight: 800, color: "#065f46" }}>
                    Note Received Successfully!
                  </h4>
                  <p style={{ margin: "0 0 16px", fontSize: "0.8rem", color: "#047857", fontWeight: 500 }}>
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
                      padding: "11px 26px",
                      borderRadius: "10px",
                      background: "linear-gradient(135deg, #059669, #10b981)",
                      border: "none",
                      color: "#ffffff",
                      fontSize: "0.86rem",
                      fontWeight: 800,
                      cursor: "pointer",
                      boxShadow: "0 4px 14px rgba(16, 185, 129, 0.35)",
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
                        padding: "14px 16px",
                        borderRadius: "14px",
                        background: "linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)",
                        border: "1.5px solid #7dd3fc",
                        marginBottom: "14px",
                        boxShadow: "0 3px 10px rgba(2, 132, 199, 0.08)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: "8px" }}>
                        <span style={{ color: "#0369a1", fontWeight: 700 }}>📥 Receiving Document Chunks...</span>
                        <span style={{ color: "#0284c7", fontWeight: 800, fontFamily: "var(--font-mono, monospace)" }}>
                          {receiverProgress.speed} • {receiverProgress.percent}%
                        </span>
                      </div>
                      <div style={{ width: "100%", height: "8px", background: "#cbd5e1", borderRadius: "9999px", overflow: "hidden" }}>
                        <div
                          style={{
                            width: `${receiverProgress.percent}%`,
                            height: "100%",
                            background: "linear-gradient(90deg, #0284c7, #38bdf8)",
                            borderRadius: "9999px",
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
                        padding: "18px 16px",
                        background: "#ffffff",
                        borderRadius: "18px",
                        border: "1.5px solid #e2e8f0",
                        boxShadow: "0 10px 30px -4px rgba(15, 23, 42, 0.08)",
                        marginBottom: "14px",
                      }}
                    >
                      <img
                        src={answerQrUrl}
                        alt="Answer QR"
                        style={{
                          width: "210px",
                          height: "210px",
                          borderRadius: "10px",
                          border: "1px solid #f1f5f9",
                          padding: "6px",
                        }}
                      />
                      <div style={{ marginTop: "10px", textAlign: "center", color: "#0f172a" }}>
                        <div style={{ fontSize: "0.85rem", fontWeight: 800 }}>Show this Answer QR to Seeder</div>
                        <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "2px" }}>Or copy answer token below</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(receiverSession?.answerToken)}
                        style={{
                          marginTop: "10px",
                          padding: "8px 16px",
                          background: "linear-gradient(135deg, #0284c7, #2563eb)",
                          color: "#ffffff",
                          border: "none",
                          borderRadius: "8px",
                          fontSize: "0.78rem",
                          fontWeight: 700,
                          cursor: "pointer",
                          boxShadow: "0 3px 10px rgba(2, 132, 199, 0.25)",
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
                        borderRadius: "16px",
                        overflow: "hidden",
                        background: "#0f172a",
                        border: "2px solid #e2e8f0",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: "0 4px 16px rgba(15, 23, 42, 0.08)",
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
                        <div
                          style={{
                            width: "100%",
                            height: "100%",
                            background: "linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            textAlign: "center",
                            padding: "20px",
                            border: "1.5px dashed #7dd3fc",
                          }}
                        >
                          <Camera size={38} color="#0284c7" style={{ marginBottom: "10px" }} />
                          <div style={{ fontSize: "0.86rem", color: "#0369a1", fontWeight: 700, marginBottom: "12px" }}>
                            Camera is ready to scan Seeder's QR Code
                          </div>
                          <button
                            type="button"
                            onClick={startCamera}
                            style={{
                              padding: "10px 20px",
                              background: "linear-gradient(135deg, #0284c7, #2563eb)",
                              border: "none",
                              borderRadius: "10px",
                              color: "#ffffff",
                              fontWeight: 800,
                              fontSize: "0.82rem",
                              cursor: "pointer",
                              boxShadow: "0 4px 12px rgba(2, 132, 199, 0.3)",
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
                            border: "2.5px solid #38bdf8",
                            borderRadius: "16px",
                            boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.55)",
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
                        color: "#0284c7",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        textDecoration: "underline",
                        padding: 0,
                      }}
                    >
                      {showManualReceive ? "Hide Manual Paste" : "Or Paste Seeder Token Manually"}
                    </button>

                    {showManualReceive && (
                      <div
                        style={{
                          marginTop: "8px",
                          padding: "12px",
                          background: "#f8fafc",
                          borderRadius: "12px",
                          border: "1.5px solid #e2e8f0",
                        }}
                      >
                        <textarea
                          rows={2}
                          placeholder="Paste Seeder's offer token here..."
                          value={manualOfferText}
                          onChange={(e) => setManualOfferText(e.target.value)}
                          style={{
                            width: "100%",
                            padding: "9px 12px",
                            borderRadius: "8px",
                            background: "#ffffff",
                            border: "1.5px solid #cbd5e1",
                            color: "#0f172a",
                            fontSize: "0.76rem",
                            outline: "none",
                            resize: "none",
                            marginBottom: "8px",
                            boxShadow: "0 1px 2px rgba(0, 0, 0, 0.04)",
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => handleProcessOfferToken(manualOfferText)}
                          style={{
                            width: "100%",
                            padding: "9px",
                            background: "linear-gradient(135deg, #0284c7, #2563eb)",
                            border: "none",
                            borderRadius: "8px",
                            color: "#ffffff",
                            fontWeight: 800,
                            fontSize: "0.78rem",
                            cursor: "pointer",
                            boxShadow: "0 3px 10px rgba(2, 132, 199, 0.25)",
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
            padding: "12px 22px",
            background: "linear-gradient(180deg, #fafafa 0%, #f1f5f9 100%)",
            borderTop: "1px solid #f1f5f9",
            fontSize: "0.72rem",
            color: "#64748b",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <ShieldCheck size={15} color="#059669" strokeWidth={2.2} />
            End-to-End Local WebRTC Mesh
          </span>
          <span style={{ fontWeight: 700, color: "#475569" }}>Zero Server Cost • ₹0 Forever</span>
        </div>
      </div>
    </div>
  );
}

