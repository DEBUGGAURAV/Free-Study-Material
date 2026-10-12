import React from "react";
import { Sparkles, Wifi, FileText, Search, Zap, Cpu } from "lucide-react";

export default function HeroBanner({ totalNotes }) {
  return (
    <section className="hero-section">
      <div className="hero-badge-pill">
        <Sparkles size={14} />
        <span>Next-Gen Academic Cloud • Zero Cost High Performance Architecture</span>
      </div>

      <h1 className="hero-title">
        Free Study Material — <span>Academic Cloud Vault</span>
      </h1>

      <p className="hero-subtitle">
        Powered by WebRTC Campus Mesh, Mozilla PDF.js Virtual Reader, Tesseract OCR handwritten search,
        Brotli compression, and Multi-Gigabit High-Speed Cloud Streaming with Indian Edge CDN caching.
      </p>

      {/* Technology HUD */}
      <div className="tech-hud-grid">
        <div className="tech-hud-card">
          <div className="tech-icon-box" style={{ color: "#38bdf8" }}>
            ⚡
          </div>
          <div>
            <div className="tech-hud-name">WebRTC P2P Wi-Fi Mesh</div>
            <div className="tech-hud-desc">
              Direct device-to-device sharing in hostel Wi-Fi at 100 MB/s with 0 server load.
            </div>
          </div>
        </div>

        <div className="tech-hud-card">
          <div className="tech-icon-box" style={{ color: "#a855f7" }}>
            📑
          </div>
          <div>
            <div className="tech-hud-name">Mozilla PDF.js Virtual Reader</div>
            <div className="tech-hud-desc">
              64KB byte-range page streaming, eye-care Night Mode & in-document search.
            </div>
          </div>
        </div>

        <div className="tech-hud-card">
          <div className="tech-icon-box" style={{ color: "#f59e0b" }}>
            🔍
          </div>
          <div>
            <div className="tech-hud-name">Tesseract OCR Text Extraction</div>
            <div className="tech-hud-desc">
              Handwritten notes & formula scanning makes photo notes searchable.
            </div>
          </div>
        </div>

        <div className="tech-hud-card">
          <div className="tech-icon-box" style={{ color: "#34d399" }}>
            🗜️
          </div>
          <div>
            <div className="tech-hud-name">Brotli (br) + pdf-lib Compression</div>
            <div className="tech-hud-desc">
              Native Brotli encoding delivers 20% higher compression for ultra-fast load times.
            </div>
          </div>
        </div>

        <div className="tech-hud-card">
          <div className="tech-icon-box" style={{ color: "#38bdf8" }}>
            ☁️
          </div>
          <div>
            <div className="tech-hud-name">Ultra-Fast Academic Cloud &amp; CDN</div>
            <div className="tech-hud-desc">
              500 MB in-memory LRU RAM cache &amp; Indian Anycast Edge CDN for 1ms cached downloads.
            </div>
          </div>
        </div>

        <div className="tech-hud-card">
          <div className="tech-icon-box" style={{ color: "#38bdf8" }}>
            🗄️
          </div>
          <div>
            <div className="tech-hud-name">Distributed Multi-Worker &amp; Zero-Loss Vault</div>
            <div className="tech-hud-desc">
              High-speed multi-worker streaming with automated snapshot recovery and accident-proof notes archiving.
            </div>
          </div>
        </div>

        <div className="tech-hud-card">
          <div className="tech-icon-box" style={{ color: "#10b981" }}>
            🛡️
          </div>
          <div>
            <div className="tech-hud-name">Brevo SMTP &amp; Zero-Threat Shield</div>
            <div className="tech-hud-desc">
              Cryptographic 6-digit email OTP verification, 10-round bcrypt salted encryption &amp; multi-tiered DDoS protection.
            </div>
          </div>
        </div>

        <div className="tech-hud-card">
          <div className="tech-icon-box" style={{ color: "#f59e0b" }}>
            ⚡
          </div>
          <div>
            <div className="tech-hud-name">Real-Time Bot Poller &amp; Fast Ingest</div>
            <div className="tech-hud-desc">
              Snappy 5s Telegram long-polling &amp; SHA-256 deduplication for instant study material publishing.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
