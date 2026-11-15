import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Share2,
  Copy,
  Check,
  Download,
  Smartphone,
  QrCode,
  MessageSquare,
  Sparkles,
  ExternalLink,
  FileText,
  Zap,
} from "lucide-react";
import QRCode from "qrcode";
import { generateWhatsAppStoryCardBlob, shareWhatsAppStoryCard } from "../utils/revisionCardCanvas";
import { playSuccess, playPop } from "../utils/soundEffects";
import { recordCampusShare } from "../utils/studentStudyContext";

export default function ShareNoteModal({ isOpen, onClose, note, initialCopied = false, currentUser, onRequireAuth }) {
  const [posterUrl, setPosterUrl] = useState("");
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [isGeneratingPoster, setIsGeneratingPoster] = useState(false);
  const [isDownloadingPoster, setIsDownloadingPoster] = useState(false);
  const [linkCopied, setLinkCopied] = useState(initialCopied);
  const [sharedToChat, setSharedToChat] = useState(false);
  const [systemShareError, setSystemShareError] = useState("");

  const noteUrl = note?.id
    ? `${typeof window !== "undefined" ? window.location.origin : "https://freestudymaterial.pages.dev"}/?note=${note.id}`
    : typeof window !== "undefined"
    ? window.location.origin
    : "https://freestudymaterial.pages.dev";

  const shareText = `📚 *Free Study Material Vault*\nDownload "${note?.title || "Study Note"}" for ${note?.subject || "General"} (${note?.course || "B.Tech"}):\n🔗 ${noteUrl}`;

  // Sync initialCopied prop when modal opens
  useEffect(() => {
    if (initialCopied && isOpen) {
      setLinkCopied(true);
      const timer = setTimeout(() => setLinkCopied(false), 2500);
      return () => clearTimeout(timer);
    }
  }, [initialCopied, isOpen]);

  // Generate QR Code and HD Poster preview when modal opens
  useEffect(() => {
    if (!isOpen || !note) return;

    let isMounted = true;
    setIsGeneratingPoster(true);
    setSystemShareError("");

    // 1. Generate crisp stand-alone QR code
    QRCode.toDataURL(noteUrl, {
      width: 320,
      margin: 1,
      color: { dark: "#0f172a", light: "#ffffff" },
    })
      .then((url) => {
        if (isMounted) setQrCodeUrl(url);
      })
      .catch((err) => console.warn("[SHARE-MODAL] QR Error:", err));

    // 2. Generate Full 9:16 HD Poster with QR Code
    generateWhatsAppStoryCardBlob(note, noteUrl)
      .then((blob) => {
        if (!isMounted) return;
        const objectUrl = URL.createObjectURL(blob);
        setPosterUrl(objectUrl);
        setIsGeneratingPoster(false);
      })
      .catch((err) => {
        console.warn("[SHARE-MODAL] Poster render failed:", err);
        if (isMounted) setIsGeneratingPoster(false);
      });

    return () => {
      isMounted = false;
      if (posterUrl) URL.revokeObjectURL(posterUrl);
    };
  }, [isOpen, note?.id]);

  if (!isOpen || !note) return null;

  // 1. NATIVE SYSTEM SHARE (Official OS Menu: Windows / Android / iOS)
  const handleNativeSystemShare = async () => {
    playSuccess();
    recordCampusShare(note);
    setSystemShareError("");

    const shareData = {
      title: `${note.title || "Study Note"} — Free Study Material`,
      text: `📚 Free Study Material Vault:\nDownload "${note.title}" for ${note.subject || "General"} (${note.course || "B.Tech"}):\n🔗 ${noteUrl}`,
      url: noteUrl,
    };

    // 1. Try sharing actual HD PNG image file if ready & supported by device
    if (posterUrl && typeof navigator !== "undefined" && navigator.canShare) {
      try {
        const response = await fetch(posterUrl);
        const blob = await response.blob();
        const safeName = String(note.title || "study-note")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .slice(0, 32) || "study-note";
        const file = new File([blob], `${safeName}-poster.png`, { type: "image/png" });

        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            ...shareData,
            files: [file],
          });
          setLinkCopied(true);
          setTimeout(() => setLinkCopied(false), 2200);
          return;
        }
      } catch (err) {
        if (err.name === "AbortError") return;
        console.warn("[SYSTEM-SHARE] File share error, falling back to text:", err);
      }
    }

    // 2. Standard native system share (text + url)
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share(shareData);
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2200);
        return;
      } catch (err) {
        if (err.name === "AbortError") return; // User closed sheet
        console.warn("[SYSTEM-SHARE] Native share dismissed or unsupported:", err);
      }
    }

    // 3. Fallback: Copy link and inform user
    try {
      await navigator.clipboard.writeText(noteUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    } catch (_) {
      window.open(
        `https://api.whatsapp.com/send?text=${encodeURIComponent(shareData.text)}`,
        "_blank"
      );
    }
  };

  // 2. DOWNLOAD HD POSTER
  const handleDownloadPoster = async () => {
    if (isDownloadingPoster) return;
    setIsDownloadingPoster(true);
    playSuccess();
    recordCampusShare(note);

    try {
      await shareWhatsAppStoryCard(note, noteUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2200);
    } catch (err) {
      console.warn("Poster download fallback:", err);
    } finally {
      setIsDownloadingPoster(false);
    }
  };

  // 3. COPY DIRECT LINK
  const handleCopyLink = async () => {
    playPop();
    try {
      await navigator.clipboard.writeText(noteUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2200);
    } catch (_) {}
  };

  // 4. WHATSAPP DIRECT SHARE
  const handleWhatsAppShare = () => {
    playPop();
    recordCampusShare(note);
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
    window.open(waUrl, "_blank");
  };

  // 5. TELEGRAM DIRECT SHARE
  const handleTelegramShare = () => {
    playPop();
    recordCampusShare(note);
    const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(noteUrl)}&text=${encodeURIComponent(
      `📚 ${note.title || "Study Note"} (${note.subject || "Engineering"})`
    )}`;
    window.open(tgUrl, "_blank");
  };

  // 6. DROP NOTE IN STUDENT STUDY CHAT
  const handleDropInChat = () => {
    playPop();
    if (!currentUser && onRequireAuth) {
      onRequireAuth("signin");
      return;
    }
    window.dispatchEvent(new CustomEvent("open_student_chat"));
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("share_note_to_chat", { detail: note }));
    }, 150);
    setSharedToChat(true);
    setTimeout(() => setSharedToChat(false), 2200);
  };

  return (
    <div
      className="modal-overlay"
      style={{
        zIndex: 1100,
        background: "rgba(3, 7, 18, 0.88)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        padding: "clamp(10px, 2.5vw, 24px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        className="modal-content"
        style={{
          maxWidth: "840px",
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
          background: "linear-gradient(145deg, #0f172a 0%, #090d16 100%)",
          border: "1.5px solid rgba(56, 189, 248, 0.35)",
          borderRadius: "24px",
          padding: "clamp(16px, 2.5vw, 28px)",
          boxShadow: "0 25px 65px -15px rgba(0, 0, 0, 0.85), 0 0 30px rgba(56, 189, 248, 0.2)",
          boxSizing: "border-box",
          color: "#f8fafc",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", paddingBottom: "12px", borderBottom: "1px solid rgba(255, 255, 255, 0.1)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "38px",
                height: "38px",
                borderRadius: "12px",
                background: "linear-gradient(135deg, #0284c7, #2563eb)",
                display: "grid",
                placeItems: "center",
                boxShadow: "0 4px 14px rgba(2, 132, 199, 0.35)",
              }}
            >
              <Share2 size={20} color="#ffffff" />
            </div>
            <div>
              <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "#38bdf8", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                National Academic Vault
              </div>
              <h2 style={{ fontSize: "1.15rem", fontWeight: 800, color: "#ffffff", margin: 0, letterSpacing: "-0.01em" }}>
                Share Study Note &amp; HD Poster
              </h2>
            </div>
          </div>

          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            title="Close"
            style={{
              width: "34px",
              height: "34px",
              borderRadius: "10px",
              background: "rgba(255, 255, 255, 0.06)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              color: "#94a3b8",
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Note Info Banner */}
        <div
          style={{
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "14px",
            padding: "10px 14px",
            marginBottom: "20px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "8px",
              background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
              display: "grid",
              placeItems: "center",
              fontWeight: 900,
              fontSize: "0.76rem",
              color: "#fff",
              flexShrink: 0,
            }}
          >
            PDF
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: "0.92rem", color: "#f8fafc", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {note.title || "University Study Note"}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "2px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
              <span style={{ color: "#38bdf8", fontWeight: 700 }}>{note.subject || "General Subject"}</span>
              <span>•</span>
              <span>{note.course || "B.Tech"}</span>
              {note.semester && (
                <>
                  <span>•</span>
                  <span>Sem {note.semester}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Main 2-Column Responsive Body */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "24px",
            alignItems: "start",
          }}
        >
          {/* ================= LEFT COLUMN: LIVE POSTER & QR PREVIEW ================= */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "0.8rem", fontWeight: 800, color: "#cbd5e1", textTransform: "uppercase", letterSpacing: "0.04em", display: "flex", alignItems: "center", gap: "6px" }}>
                <QrCode size={15} color="#38bdf8" />
                Live 9:16 HD Poster &amp; QR
              </span>
              <span style={{ fontSize: "0.72rem", color: "#34d399", fontWeight: 700, background: "rgba(52, 211, 153, 0.15)", padding: "2px 8px", borderRadius: "20px", border: "1px solid rgba(52, 211, 153, 0.3)" }}>
                ✓ Phone Camera Scannable
              </span>
            </div>

            {/* Poster Preview Card */}
            <div
              style={{
                position: "relative",
                width: "100%",
                maxWidth: "340px",
                margin: "0 auto",
                borderRadius: "18px",
                overflow: "hidden",
                border: "2px solid rgba(56, 189, 248, 0.4)",
                boxShadow: "0 12px 30px rgba(0, 0, 0, 0.6), 0 0 20px rgba(56, 189, 248, 0.2)",
                background: "#030712",
                aspectRatio: "9 / 16",
                display: "grid",
                placeItems: "center",
              }}
            >
              {posterUrl ? (
                <img
                  src={posterUrl}
                  alt="Aesthetic Academic Poster with QR"
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              ) : (
                <div style={{ textAlign: "center", padding: "24px", color: "#94a3b8" }}>
                  <div className="spinner" style={{ margin: "0 auto 12px auto", width: "28px", height: "28px", borderWidth: "3px" }} />
                  <div style={{ fontSize: "0.84rem", fontWeight: 700, color: "#f8fafc" }}>Rendering HD Study Poster...</div>
                  <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "4px" }}>Embedding high-speed camera QR code</div>
                </div>
              )}
            </div>

            {/* 🔗 Direct Link Attached Directly Below PNG Image (Jo copy ho sake) */}
            <div
              style={{
                maxWidth: "340px",
                margin: "0 auto",
                width: "100%",
                background: "rgba(15, 23, 42, 0.85)",
                border: `1.5px solid ${linkCopied ? "rgba(52, 211, 153, 0.6)" : "rgba(56, 189, 248, 0.4)"}`,
                borderRadius: "14px",
                padding: "8px 10px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                boxShadow: "0 4px 16px rgba(0, 0, 0, 0.45)",
                transition: "all 0.2s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: "0.85rem" }}>🔗</span>
                <input
                  type="text"
                  readOnly
                  value={noteUrl}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: "0.78rem",
                    fontFamily: "'JetBrains Mono', Consolas, monospace",
                    color: linkCopied ? "#34d399" : "#93c5fd",
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                  onFocus={(e) => e.target.select()}
                />
              </div>
              <button
                type="button"
                onClick={handleCopyLink}
                title="Copy note link to clipboard"
                style={{
                  padding: "7px 12px",
                  borderRadius: "10px",
                  background: linkCopied ? "#059669" : "linear-gradient(135deg, #0284c7, #2563eb)",
                  border: "none",
                  color: "#ffffff",
                  fontSize: "0.78rem",
                  fontWeight: 800,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  flexShrink: 0,
                  boxShadow: linkCopied ? "0 2px 8px rgba(5, 150, 105, 0.4)" : "0 2px 8px rgba(2, 132, 199, 0.35)",
                  transition: "all 0.18s ease",
                }}
              >
                {linkCopied ? (
                  <>
                    <Check size={14} />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy size={14} />
                    <span>Copy Link</span>
                  </>
                )}
              </button>
            </div>

            {/* Poster Actions (Device Share & Save Poster) */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "8px", maxWidth: "340px", margin: "0 auto", width: "100%" }}>
              {/* 📱 Device Native Share Button */}
              <button
                type="button"
                className="btn-primary"
                onClick={handleNativeSystemShare}
                style={{
                  width: "100%",
                  justifyContent: "center",
                  padding: "12px 16px",
                  borderRadius: "14px",
                  fontSize: "0.88rem",
                  fontWeight: 800,
                  background: "linear-gradient(135deg, #0284c7 0%, #4f46e5 100%)",
                  border: "1.5px solid rgba(56, 189, 248, 0.4)",
                  boxShadow: "0 6px 20px -2px rgba(2, 132, 199, 0.45)",
                  display: "flex",
                  alignItems: "center",
                  gap: "9px",
                  cursor: "pointer",
                }}
              >
                <Share2 size={18} />
                <span>📱 Open Device Share Option</span>
              </button>

              {/* 💾 Save / Download HD Poster */}
              <button
                type="button"
                onClick={handleDownloadPoster}
                disabled={isDownloadingPoster || isGeneratingPoster}
                style={{
                  width: "100%",
                  justifyContent: "center",
                  padding: "10px 16px",
                  borderRadius: "12px",
                  fontSize: "0.82rem",
                  fontWeight: 750,
                  background: "rgba(255, 255, 255, 0.06)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  color: "#cbd5e1",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  cursor: "pointer",
                  transition: "all 0.18s ease",
                }}
              >
                {isDownloadingPoster ? (
                  <>
                    <div className="spinner" style={{ width: "13px", height: "13px" }} />
                    <span>Preparing Download...</span>
                  </>
                ) : (
                  <>
                    <Download size={15} />
                    <span>Save / Download HD Poster (PNG)</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* ================= RIGHT COLUMN: SYSTEM SHARE & 1-CLICK APPS ================= */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* HERO OPTION: NATIVE SYSTEM SHARE (Exact same as before!) */}
            <div>
              <div style={{ fontSize: "0.75rem", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>
                Primary Action (Official OS Share)
              </div>
              <button
                type="button"
                onClick={handleNativeSystemShare}
                style={{
                  width: "100%",
                  padding: "14px 18px",
                  borderRadius: "16px",
                  background: "linear-gradient(135deg, #0284c7 0%, #4f46e5 100%)",
                  border: "1.5px solid rgba(56, 189, 248, 0.5)",
                  boxShadow: "0 8px 24px -4px rgba(2, 132, 199, 0.45)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                  textAlign: "left",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-1px)")}
                onMouseLeave={(e) => (e.currentTarget.style.transform = "none")}
              >
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "12px",
                    background: "rgba(255, 255, 255, 0.2)",
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                  }}
                >
                  <Share2 size={24} color="#ffffff" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "0.98rem", fontWeight: 900, color: "#ffffff", letterSpacing: "0.01em" }}>
                    📱 Open System Share Dialog
                  </div>
                  <div style={{ fontSize: "0.76rem", color: "rgba(255, 255, 255, 0.85)", marginTop: "2px" }}>
                    Triggers Windows Native Share / Android / iOS system share sheet
                  </div>
                </div>
                <div style={{ fontSize: "1.2rem", color: "#ffffff", fontWeight: 900 }}>➔</div>
              </button>
            </div>

            {/* Quick 1-Click Apps */}
            <div>
              <div style={{ fontSize: "0.75rem", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>
                Quick 1-Click Social Apps
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                {/* WhatsApp */}
                <button
                  type="button"
                  onClick={handleWhatsAppShare}
                  style={{
                    padding: "11px 14px",
                    borderRadius: "12px",
                    background: "linear-gradient(135deg, #16a34a, #15803d)",
                    border: "1px solid rgba(34, 197, 94, 0.4)",
                    color: "#ffffff",
                    fontSize: "0.84rem",
                    fontWeight: 750,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    boxShadow: "0 4px 12px rgba(22, 163, 74, 0.25)",
                    transition: "transform 0.18s ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-1px)")}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = "none")}
                >
                  <span style={{ fontSize: "1.1rem" }}>💬</span>
                  <span>WhatsApp</span>
                </button>

                {/* Telegram */}
                <button
                  type="button"
                  onClick={handleTelegramShare}
                  style={{
                    padding: "11px 14px",
                    borderRadius: "12px",
                    background: "linear-gradient(135deg, #0284c7, #0369a1)",
                    border: "1px solid rgba(56, 189, 248, 0.4)",
                    color: "#ffffff",
                    fontSize: "0.84rem",
                    fontWeight: 750,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    boxShadow: "0 4px 12px rgba(2, 132, 199, 0.25)",
                    transition: "transform 0.18s ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-1px)")}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = "none")}
                >
                  <span style={{ fontSize: "1.1rem" }}>✈️</span>
                  <span>Telegram</span>
                </button>
              </div>
            </div>

            {/* Direct Link Copy Bar */}
            <div>
              <div style={{ fontSize: "0.75rem", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>
                Direct Note Web Link
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  background: "#090d16",
                  border: "1.5px solid rgba(255, 255, 255, 0.12)",
                  borderRadius: "12px",
                  padding: "4px 6px 4px 12px",
                  gap: "8px",
                }}
              >
                <input
                  type="text"
                  readOnly
                  value={noteUrl}
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: "#cbd5e1",
                    fontSize: "0.82rem",
                    fontFamily: "monospace",
                    minWidth: 0,
                  }}
                  onFocus={(e) => e.target.select()}
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "8px",
                    background: linkCopied ? "#16a34a" : "rgba(56, 189, 248, 0.18)",
                    border: `1px solid ${linkCopied ? "#22c55e" : "#38bdf8"}`,
                    color: linkCopied ? "#ffffff" : "#38bdf8",
                    fontSize: "0.8rem",
                    fontWeight: 750,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    transition: "all 0.18s ease",
                    flexShrink: 0,
                  }}
                >
                  {linkCopied ? <Check size={14} /> : <Copy size={14} />}
                  <span>{linkCopied ? "Copied!" : "Copy Link"}</span>
                </button>
              </div>
            </div>

            {/* Drop in Student Study Chat Action */}
            <button
              type="button"
              onClick={handleDropInChat}
              style={{
                width: "100%",
                padding: "11px 16px",
                borderRadius: "12px",
                background: "rgba(99, 102, 241, 0.12)",
                border: "1px solid rgba(99, 102, 241, 0.35)",
                color: "#a5b4fc",
                fontSize: "0.84rem",
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                transition: "all 0.18s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(99, 102, 241, 0.2)";
                e.currentTarget.style.borderColor = "#818cf8";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(99, 102, 241, 0.12)";
                e.currentTarget.style.borderColor = "rgba(99, 102, 241, 0.35)";
              }}
            >
              {sharedToChat ? (
                <>
                  <Check size={16} color="#34d399" />
                  <span style={{ color: "#34d399" }}>Dropped into Student Study Chat!</span>
                </>
              ) : (
                <>
                  <MessageSquare size={16} color="#818cf8" />
                  <span>Drop Note Directly in Student Study Chat</span>
                </>
              )}
            </button>

            {/* Laptop-to-Phone Handoff Hint Card */}
            <div
              style={{
                background: "rgba(56, 189, 248, 0.06)",
                border: "1px solid rgba(56, 189, 248, 0.2)",
                borderRadius: "14px",
                padding: "12px 14px",
                display: "flex",
                alignItems: "flex-start",
                gap: "10px",
              }}
            >
              <Smartphone size={20} color="#38bdf8" style={{ flexShrink: 0, marginTop: "2px" }} />
              <div style={{ fontSize: "0.76rem", color: "#94a3b8", lineHeight: 1.5 }}>
                <strong style={{ color: "#38bdf8" }}>Laptop to Mobile Handoff:</strong> Scanning the QR code on the poster with your phone camera opens this complete note on your smartphone instantly without logging in.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
