import React from "react";
import { Sparkles } from "lucide-react";
import { SITE_NAME, SITE_TAGLINE } from "../config/clientConfig";

export default function HeroBanner({ totalNotes }) {
  const techCards = [
    {
      icon: "☁️",
      color: "#38bdf8",
      name: "Ultra-Fast Academic Cloud Engine",
      desc: "Unlimited direct cloud streaming through High-Performance Academic Storage Nodes and Indian Edge CDN for 1ms cached downloads.",
    },
    {
      icon: "⚡",
      color: "#60a5fa",
      name: "WebRTC P2P Mesh Network",
      desc: "Direct 100 MB/s peer-to-peer file transfer between students on the same hostel or campus Wi-Fi without server bandwidth limits.",
    },
    {
      icon: "📑",
      color: "#a855f7",
      name: "Mozilla PDF.js Virtual Reader",
      desc: "Read handwritten notes and textbooks instantly in your browser with Night Mode, page jump, and zero download waiting time.",
    },
    {
      icon: "🔍",
      color: "#f59e0b",
      name: "Tesseract OCR Deep Search",
      desc: "Universal search matches typed titles as well as handwritten formulas scanned directly inside students' handwritten PDF pages.",
    },
    {
      icon: "🗜️",
      color: "#34d399",
      name: "In-Memory LRU RAM & Brotli Booster",
      desc: "Dedicated 500 MB in-memory RAM cache pool delivering microsecond document streaming with dual Brotli & Gzip compression for 25% extra bandwidth savings.",
    },
    {
      icon: "🗄️",
      color: "#06b6d4",
      name: "Distributed Multi-Worker Vault & Zero-Loss Archiving",
      desc: "High-speed parallel multi-worker streaming engine with automated snapshot recovery, ensuring accident-proof note preservation and zero-loss cloud archiving.",
    },
    {
      icon: "🛡️",
      color: "#10b981",
      name: "Brevo SMTP & Zero-Threat Security Shield",
      desc: "Cryptographic 6-digit email OTP verification, 10-round bcrypt salted encryption, and multi-tiered DDoS protection for 100% student data safety.",
    },
    {
      icon: "🤖",
      color: "#eab308",
      name: "Real-Time Bot Poller & Fast Ingest",
      desc: "Snappy 5s Telegram long-polling & SHA-256 deduplication for instant study material publishing.",
    },
    {
      icon: "🔒",
      color: "#22c55e",
      name: "100% Autonomous & Zero Data Sharing",
      desc: "This platform operates completely autonomously with zero human intervention. All student data, credentials, and activity logs are strictly private and will never be shared, sold, or tracked.",
    },
  ];

  return (
    <section className="hero-section">
      <div className="hero-badge-pill">
        <Sparkles size={14} />
        <span>Next-Gen Academic Cloud • Zero Cost High Performance Architecture</span>
      </div>

      <h1 className="hero-title">
        {SITE_NAME} — <span>{SITE_TAGLINE}</span>
      </h1>

      <p className="hero-subtitle">
        Powered by WebRTC Campus Mesh, Mozilla PDF.js Virtual Reader, Tesseract OCR handwritten search,
        Brotli compression, and Multi-Gigabit High-Speed Cloud Streaming with Indian Edge CDN caching.
      </p>

      {/* Technology HUD: 3x3 Grid (3 columns, exactly 3 in each column/row) */}
      <div className="tech-hud-grid">
        {techCards.map((card, idx) => (
          <div className="tech-hud-card" key={idx}>
            <div className="tech-icon-box" style={{ color: card.color }}>
              {card.icon}
            </div>
            <div>
              <div className="tech-hud-name">{card.name}</div>
              <div className="tech-hud-desc">{card.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
