import React from "react";
import { Sparkles, Cpu, Layers, HardDrive, Zap, ShieldCheck } from "lucide-react";

export default function HeroBanner({ totalNotes, totalSaved }) {
  return (
    <section className="hero-section">
      <div className="hero-badge-pill">
        <Sparkles size={14} />
        <span>Next-Gen Academic Cloud • Zero Cost Architecture</span>
      </div>

      <h1 className="hero-title">
        High-Speed Academic Vault & <span>Study Materials</span>
      </h1>

      <p className="hero-subtitle">
        Powered by direct Telegram MTProto 2GB streaming, smart PDF compression, SHA-256
        deduplication, and Indian Cloudflare CDN Edge nodes for blazing fast downloads.
      </p>

      {/* Technology HUD */}
      <div className="tech-hud-grid">
        <div className="tech-hud-card">
          <div className="tech-icon-box" style={{ color: "#34d399" }}>
            🧬
          </div>
          <div>
            <div className="tech-hud-name">SHA-256 Deduplication</div>
            <div className="tech-hud-desc">
              0-sec upload for repeated files. 100% duplicate protection.
            </div>
          </div>
        </div>

        <div className="tech-hud-card">
          <div className="tech-icon-box" style={{ color: "#fbbf24" }}>
            🗜️
          </div>
          <div>
            <div className="tech-hud-name">PDF Compressor (pdf-lib)</div>
            <div className="tech-hud-desc">
              Smart object stream compression saves up to 75% cloud storage.
            </div>
          </div>
        </div>

        <div className="tech-hud-card">
          <div className="tech-icon-box" style={{ color: "#38bdf8" }}>
            ⚡
          </div>
          <div>
            <div className="tech-hud-name">Async Background Queue</div>
            <div className="tech-hud-desc">
              Instant &lt; 2s receipt response while MTProto syncs in background.
            </div>
          </div>
        </div>

        <div className="tech-hud-card">
          <div className="tech-icon-box" style={{ color: "#a855f7" }}>
            ☁️
          </div>
          <div>
            <div className="tech-hud-name">Cloudflare CDN LRU Cache</div>
            <div className="tech-hud-desc">
              Unlimited Indian edge caching with 0% server bandwidth drain.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
