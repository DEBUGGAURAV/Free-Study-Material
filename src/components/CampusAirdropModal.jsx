import React, { useState, useEffect, useRef } from "react";
import {
  X, Share2, QrCode, Camera, Copy, Check, RefreshCw, Zap,
  Download, ArrowRight, ShieldCheck, Wifi, Sparkles, CheckCircle2,
  AlertTriangle, Smartphone, Volume2, Mic, Radio, VolumeX, Activity
} from "lucide-react";
import QRCode from "qrcode";
import jsQR from "jsqr";
import {
  isNoteReadyForAirdrop,
  createAirDropSenderSession,
  completeSenderWithAnswer,
  createAirDropReceiverSession,
  cancelAirDropSession
} from "../utils/p2pCampusAirdrop";
import {
  startSoundDropBroadcast,
  stopSoundDropBroadcast,
  startSoundDropListener,
  stopSoundDropListener
} from "../utils/soundDrop";


/**
 * Generates a deterministic 6-character hex code (0-9, A-F) from any token string.
 * Strictly guarantees compatibility with ultrasonic frequency bins in soundDrop.js.
 */
function getHexSoundCode(token) {
  if (!token) return "A1B2C3";
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) & 0xffffff).toString(16).padStart(6, "0").toUpperCase();
}

export default function CampusAirdropModal({
  isOpen,
  onClose,
  currentNote = null,
  directBuffer = null,
  onNoteReceived = null,
  initialMode = "sound",
}) {
  if (!isOpen) return null;

  const [activeTab, setActiveTab] = useState(currentNote ? "send" : "receive");
  const [pairingMode, setPairingMode] = useState(initialMode || "sound"); // 'sound' | 'qr'
  const [isAudible, setIsAudible] = useState(false);
  const [soundBeaming, setSoundBeaming] = useState(false);
  const [soundListening, setSoundListening] = useState(false);
  const [soundVolumeLevel, setSoundVolumeLevel] = useState(0);
  const [soundDetectedCode, setSoundDetectedCode] = useState("");
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
  const [soundPairingCode, setSoundPairingCode] = useState("");
  const broadcastChannelRef = useRef(null);

  const videoRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const scanIntervalRef = useRef(null);
  const senderSessionRef = useRef(null);
  const receiverSessionRef = useRef(null);

  // Sync active tab when modal opens
  useEffect(() => {
    if (isOpen) {
      if (currentNote?.id) {
        setActiveTab("send");
      } else {
        setActiveTab("receive");
      }
    }
  }, [isOpen, currentNote?.id]);

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
      }, directBuffer)
        .then((s) => {
          if (isCancelled) {
            cancelAirDropSession(s);
            return;
          }
          session = s;
          senderSessionRef.current = s;
          setSenderSession(s);

          // Set sound pairing code from token
          const soundCode = getHexSoundCode(s.offerToken);
          setSoundPairingCode(soundCode);

          // ⚡ 1. Register offer in Live Campus Signaling Relay (Zero-Touch Handshake)
          fetch("/api/p2p/airdrop/offer", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              code: soundCode,
              offerToken: s.offerToken,
              note: currentNote,
            }),
          }).catch((e) => console.warn("[AIRDROP-SIGNAL] Offer register notice:", e));

          // ⚡ 2. Auto-poll for receiver's answer in background (Hands-free connection)
          const pollTimer = setInterval(async () => {
            if (isCancelled || senderSessionRef.current !== s || !session?.active) {
              clearInterval(pollTimer);
              return;
            }
            try {
              const aRes = await fetch(`/api/p2p/airdrop/answer/${soundCode}`);
              if (aRes.ok) {
                const aData = await aRes.json();
                if (aData.ready && aData.answerToken) {
                  clearInterval(pollTimer);
                  await completeSenderWithAnswer(s, aData.answerToken);
                  setSenderConnected(true);
                }
              }
            } catch (_) {}
          }, 750);

          // ⚡ 3. Generate 100% Offline Standalone Offer QR code (0 server fetch required)
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
              if (!isCancelled) setErrorMsg("QR Code error: " + (e.message || "Failed to render QR"));
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
        if (senderSessionRef.current === session) senderSessionRef.current = null;
      }
    };
  }, [activeTab, currentNote?.id]);

  // Manage Sound-Drop Ultrasonic Broadcast for Sender
  useEffect(() => {
    stopSoundDropBroadcast();
    setSoundBeaming(false);

    if (activeTab === "send" && pairingMode === "sound" && senderSession?.offerToken && !senderDone) {
      try {
        const soundCode = getHexSoundCode(senderSession.offerToken);
        setSoundPairingCode(soundCode);

        // Broadcast over local network channel for zero-touch peer discovery
        if (typeof BroadcastChannel !== "undefined") {
          const bc = new BroadcastChannel("campus_airdrop_mesh_channel");
          broadcastChannelRef.current = bc;
          bc.onmessage = (e) => {
            if (e.data?.type === "AIRDROP_ANSWER" && e.data?.answerToken) {
              if (!e.data.soundCode || e.data.soundCode === soundCode) {
                completeSenderWithAnswer(senderSession, e.data.answerToken)
                  .then(() => setSenderConnected(true))
                  .catch(console.warn);
              }
            }
          };
          bc.postMessage({
            type: "AIRDROP_OFFER",
            soundCode,
            offerToken: senderSession.offerToken,
            note: currentNote,
          });
        }

        // Start ultrasonic audio wave broadcast from speaker
        startSoundDropBroadcast(soundCode, {
          isAudible,
          volume: 0.9,
          repeatIntervalMs: 1200,
        });
        setSoundBeaming(true);
      } catch (err) {
        console.warn("[SOUND-DROP] Start broadcast error:", err);
      }
    }

    return () => {
      stopSoundDropBroadcast();
      setSoundBeaming(false);
      if (broadcastChannelRef.current) {
        try { broadcastChannelRef.current.close(); } catch (_) {}
        broadcastChannelRef.current = null;
      }
    };
  }, [activeTab, pairingMode, senderSession?.offerToken, isAudible, senderDone]);

  // Manage Sound-Drop Microphone Listener for Receiver
  useEffect(() => {
    stopSoundDropListener();
    setSoundListening(false);
    setSoundVolumeLevel(0);

    let isCancelled = false;

    if (activeTab === "receive" && pairingMode === "sound" && !receiverDone) {
      stopCamera();

      // Listen on local network channel for matching offer
      if (typeof BroadcastChannel !== "undefined") {
        const bc = new BroadcastChannel("campus_airdrop_mesh_channel");
        broadcastChannelRef.current = bc;
      }

      startSoundDropListener({
        onTokenDetected: (token) => {
          if (!isCancelled && token) {
            setSoundDetectedCode(token);
            // ⚡ Instant cross-device handshake via SoundDrop ultrasonic chirp!
            handleProcessOfferToken(token);
          }
        },
        onVolume: (vol) => {
          if (!isCancelled) setSoundVolumeLevel(vol);
        },
        onError: (err) => {
          if (!isCancelled) setErrorMsg(err.message || "Microphone listener error");
        },
      }, { isAudible })
        .then(() => {
          if (!isCancelled) setSoundListening(true);
        })
        .catch((err) => {
          if (!isCancelled) setErrorMsg(err?.message || "Failed to start microphone listener");
        });
    } else if (activeTab === "receive" && pairingMode === "qr") {
      startCamera();
    }

    return () => {
      isCancelled = true;
      stopSoundDropListener();
      setSoundListening(false);
      if (broadcastChannelRef.current) {
        try { broadcastChannelRef.current.close(); } catch (_) {}
        broadcastChannelRef.current = null;
      }
    };
  }, [activeTab, pairingMode, isAudible, receiverDone]);

  // Clean up Camera & active Peer Sessions on unmount
  useEffect(() => {
    return () => {
      stopCamera();
      stopSoundDropBroadcast();
      stopSoundDropListener();
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

  // Process Offer Token when scanned via QR or heard via SoundDrop
  const handleProcessOfferToken = async (tokenStr) => {
    if (!tokenStr) return;
    setErrorMsg("");
    try {
      let rawToken = String(tokenStr).trim();
      let soundCode = "";

      // 1. Extract short pairing code (from SoundDrop audio chirp, or FSM:PIN)
      if (rawToken.startsWith("FSM:")) {
        soundCode = rawToken.replace(/^FSM:/i, "").trim().toUpperCase();
      } else if (rawToken.includes("airdrop=")) {
        const match = rawToken.match(/airdrop=([A-Za-z0-9_-]+)/i);
        if (match) soundCode = match[1].toUpperCase();
      } else if (rawToken.length <= 10 && !rawToken.startsWith("FSMZ:") && !rawToken.startsWith("FSMR:")) {
        soundCode = rawToken.toUpperCase();
      }

      // 2. If short code (heard via SoundDrop), resolve full offerToken from backend signaling relay
      if (soundCode) {
        setSoundDetectedCode(soundCode);
        try {
          const res = await fetch(`/api/p2p/airdrop/offer/${soundCode}`);
          if (!res.ok) {
            throw new Error(`AirDrop offer #${soundCode} not found or expired.`);
          }
          const data = await res.json();
          if (!data.offerToken) {
            throw new Error("No offer payload returned by sender.");
          }
          rawToken = data.offerToken;
        } catch (fetchErr) {
          throw new Error("SoundDrop audio pairing requires local Wi-Fi / Hotspot network. For 100% offline transfer without internet, switch to 📱 1-Tap QR Mesh mode!");
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

      const computedSoundCode = soundCode || getHexSoundCode(rawToken);

      // 4. Relay answerToken back to sender automatically if network exists (non-blocking)
      if (computedSoundCode && session.answerToken) {
        fetch("/api/p2p/airdrop/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: computedSoundCode,
            answerToken: session.answerToken,
          }),
        }).catch(() => {});
      }

      // 5. Also broadcast to local BroadcastChannel (for same-machine multi-tab pairing)
      if (broadcastChannelRef.current && session.answerToken) {
        try {
          broadcastChannelRef.current.postMessage({
            type: "AIRDROP_ANSWER",
            soundCode: computedSoundCode,
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

        {/* Pairing Mode Selector: Sound-Drop vs 1-Tap QR Mesh */}
        <div style={{ display: "flex", gap: "8px", margin: "14px 20px 0" }}>
          <button
            type="button"
            onClick={() => {
              setPairingMode("sound");
              stopCamera();
            }}
            style={{
              flex: 1,
              padding: "8px 10px",
              borderRadius: "8px",
              border: pairingMode === "sound" ? "1px solid #10b981" : "1px solid rgba(255, 255, 255, 0.1)",
              background: pairingMode === "sound" ? "rgba(16, 185, 129, 0.18)" : "rgba(255, 255, 255, 0.03)",
              color: pairingMode === "sound" ? "#34d399" : "#94a3b8",
              fontSize: "0.78rem",
              fontWeight: pairingMode === "sound" ? 700 : 500,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              transition: "all 0.15s ease",
            }}
          >
            <Volume2 size={15} />
            <span>🔊 Sound-Drop (Audio Mesh)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setPairingMode("qr");
            }}
            style={{
              flex: 1,
              padding: "8px 10px",
              borderRadius: "8px",
              border: pairingMode === "qr" ? "1px solid #38bdf8" : "1px solid rgba(255, 255, 255, 0.1)",
              background: pairingMode === "qr" ? "rgba(56, 189, 248, 0.18)" : "rgba(255, 255, 255, 0.03)",
              color: pairingMode === "qr" ? "#38bdf8" : "#94a3b8",
              fontSize: "0.78rem",
              fontWeight: pairingMode === "qr" ? 700 : 500,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              transition: "all 0.15s ease",
            }}
          >
            <QrCode size={15} />
            <span>📱 1-Tap QR Mesh</span>
          </button>
        </div>

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

              {/* Sender Pairing Display (Sound-Drop vs QR) */}
              {!senderDone && pairingMode === "sound" && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    padding: "24px 16px",
                    background: "radial-gradient(circle at 50% 40%, rgba(16, 185, 129, 0.16) 0%, rgba(15, 23, 42, 0.95) 75%)",
                    border: "1px solid rgba(16, 185, 129, 0.35)",
                    borderRadius: "16px",
                    boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  {/* Pulsing Acoustic Radar Wave Rings */}
                  <div
                    style={{
                      width: "120px",
                      height: "120px",
                      borderRadius: "50%",
                      background: "rgba(16, 185, 129, 0.12)",
                      border: "2px solid rgba(16, 185, 129, 0.4)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      position: "relative",
                      marginBottom: "16px",
                      boxShadow: soundBeaming ? "0 0 35px rgba(16, 185, 129, 0.5)" : "none",
                      animation: soundBeaming ? "pulse 2s infinite" : "none",
                    }}
                  >
                    <div
                      style={{
                        width: "80px",
                        height: "80px",
                        borderRadius: "50%",
                        background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: "0 6px 20px rgba(16, 185, 129, 0.4)",
                      }}
                    >
                      <Volume2 size={36} color="#ffffff" />
                    </div>
                  </div>

                  {/* Sound PIN Badge */}
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "6px 14px",
                      borderRadius: "20px",
                      background: "rgba(16, 185, 129, 0.18)",
                      border: "1px solid rgba(16, 185, 129, 0.4)",
                      marginBottom: "10px",
                    }}
                  >
                    <Radio size={14} color="#34d399" />
                    <span style={{ fontSize: "0.88rem", fontWeight: 800, color: "#a7f3d0", letterSpacing: "1.5px", fontFamily: "var(--font-mono)" }}>
                      #{soundPairingCode || "A1B2C3"}
                    </span>
                  </div>

                  <div style={{ textAlign: "center", color: "#e2e8f0", maxWidth: "290px", marginBottom: "14px" }}>
                    <div style={{ fontSize: "0.85rem", fontWeight: 700, marginBottom: "4px" }}>
                      {isAudible ? "🔔 Audible Audio Wave Emitting" : "🔊 Ultrasonic Chirp Emitting (19.2 kHz)"}
                    </div>
                    <div style={{ fontSize: "0.72rem", color: "#94a3b8", lineHeight: 1.4 }}>
                      {isAudible
                        ? "Broadcasting acoustic sound code. Bring receiver close to listen."
                        : "Inaudible to human ears. Receiver's microphone will automatically detect this sound and initiate transfer in <1s (0 KB internet)."}
                    </div>
                  </div>

                  {/* Frequency Switcher: Ultrasonic vs Audible */}
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      type="button"
                      onClick={() => setIsAudible(!isAudible)}
                      style={{
                        padding: "5px 12px",
                        borderRadius: "6px",
                        background: isAudible ? "rgba(234, 179, 8, 0.2)" : "rgba(255, 255, 255, 0.06)",
                        border: isAudible ? "1px solid #eab308" : "1px solid rgba(255, 255, 255, 0.15)",
                        color: isAudible ? "#fde047" : "#cbd5e1",
                        fontSize: "0.72rem",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                      }}
                    >
                      {isAudible ? <Volume2 size={13} /> : <VolumeX size={13} />}
                      <span>{isAudible ? "Switch to Ultrasonic (Silent)" : "Switch to Audible Beep"}</span>
                    </button>
                  </div>
                </div>
              )}

              {!senderDone && pairingMode === "qr" && (
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

                  {/* Receiver Audio Mesh Listener (Sound-Drop) */}
                  {!answerQrUrl && !receiverProgress && pairingMode === "sound" && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        padding: "26px 16px",
                        background: "radial-gradient(circle at 50% 40%, rgba(16, 185, 129, 0.15) 0%, rgba(15, 23, 42, 0.95) 75%)",
                        border: "1px solid rgba(16, 185, 129, 0.35)",
                        borderRadius: "16px",
                        boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
                      }}
                    >
                      {/* Pulsing Mic Circle */}
                      <div
                        style={{
                          width: "110px",
                          height: "110px",
                          borderRadius: "50%",
                          background: soundListening ? "rgba(16, 185, 129, 0.15)" : "rgba(255, 255, 255, 0.05)",
                          border: soundListening ? "2px solid rgba(16, 185, 129, 0.5)" : "2px solid rgba(255, 255, 255, 0.1)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          position: "relative",
                          marginBottom: "16px",
                          boxShadow: soundListening ? "0 0 30px rgba(16, 185, 129, 0.4)" : "none",
                        }}
                      >
                        <div
                          style={{
                            width: "70px",
                            height: "70px",
                            borderRadius: "50%",
                            background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Mic size={32} color="#ffffff" />
                        </div>
                      </div>

                      {/* Equalizer Frequency Bars */}
                      <div style={{ display: "flex", alignItems: "center", gap: "5px", height: "30px", marginBottom: "14px" }}>
                        {[0.3, 0.6, 1, 0.8, 0.5, 0.9, 0.4].map((scale, i) => {
                          const barHeight = Math.max(6, Math.min(28, (soundVolumeLevel * 100 * scale) + (soundListening ? 8 : 4)));
                          return (
                            <div
                              key={i}
                              style={{
                                width: "4px",
                                height: barHeight + "px",
                                borderRadius: "3px",
                                background: soundDetectedCode ? "#34d399" : (soundListening ? "#10b981" : "#475569"),
                                transition: "height 0.08s ease",
                              }}
                            />
                          );
                        })}
                      </div>

                      {/* Status Text */}
                      <div style={{ textAlign: "center", color: "#e2e8f0", maxWidth: "290px", marginBottom: "12px" }}>
                        <div style={{ fontSize: "0.88rem", fontWeight: 700, color: soundDetectedCode ? "#34d399" : "#fff", marginBottom: "4px" }}>
                          {soundDetectedCode ? "🎉 Signal Matched! Connecting..." : (soundListening ? "🎧 Listening for Sound-Drop..." : "Microphone Activating...")}
                        </div>
                        <div style={{ fontSize: "0.72rem", color: "#94a3b8", lineHeight: 1.4 }}>
                          {soundDetectedCode
                            ? `Matched sound token #${soundDetectedCode}. High-speed WebRTC data tunnel is starting.`
                            : "Hold phone close to sender's speaker. 0 KB internet required — automatic ultrasonic handshake in <0.6s."}
                        </div>
                      </div>

                      {/* Manual Frequency Toggle */}
                      <button
                        type="button"
                        onClick={() => setIsAudible(!isAudible)}
                        style={{
                          padding: "5px 12px",
                          borderRadius: "6px",
                          background: isAudible ? "rgba(234, 179, 8, 0.2)" : "rgba(255, 255, 255, 0.06)",
                          border: isAudible ? "1px solid #eab308" : "1px solid rgba(255, 255, 255, 0.15)",
                          color: isAudible ? "#fde047" : "#cbd5e1",
                          fontSize: "0.72rem",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "5px",
                        }}
                      >
                        <Activity size={13} />
                        <span>{isAudible ? "Listening: Audible Beeps" : "Listening: Ultrasonic (19.2 kHz)"}</span>
                      </button>
                    </div>
                  )}

                  {/* Live Camera Viewfinder (1-Tap QR Mesh) */}
                  {!answerQrUrl && !receiverProgress && pairingMode === "qr" && (
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

