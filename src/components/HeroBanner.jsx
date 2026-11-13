import { ArrowRight, BookOpen, FileText, Search, ShieldCheck, Sparkles, Zap, Award } from "lucide-react";

export default function HeroBanner({ totalNotes = 0, onOpenUpload, onBrowsePapers, onOpenAiStudy }) {
  const browseMaterials = () => {
    document.getElementById("study-materials")?.scrollIntoView({
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth",
      block: "start",
    });
  };

  const libraryLinks = [
    [FileText, "Class notes", "Review lecture notes & solved PYQs at your pace", browseMaterials],
    [Search, "Previous papers", "Find previous semester papers with solutions", () => { onBrowsePapers(); browseMaterials(); }],
    [Sparkles, "AI Study", "Interactive 3D Flashcards, Mind-Maps & Tutor", onOpenAiStudy],
  ];

  return (
    <section className="hero-section">
      <div className="hero-layout">
        <div className="hero-copy">
          <div
            className="hero-badge-pill"
            style={{
              background: "linear-gradient(135deg, rgba(56, 189, 248, 0.12), rgba(139, 92, 246, 0.12))",
              border: "1px solid rgba(56, 189, 248, 0.35)",
              boxShadow: "0 4px 16px rgba(56, 189, 248, 0.15)",
            }}
          >
            <Sparkles size={14} color="#38bdf8" />
            <span style={{ fontWeight: 700, color: "#38bdf8" }}>
              ⚡ Exam-Ready Study Vault • 100% Free
            </span>
          </div>

          <h1 className="hero-title" style={{ letterSpacing: "-0.03em", lineHeight: 1.15 }}>
            Ace Every Exam.{" "}
            <span
              style={{
                background: "linear-gradient(135deg, #38bdf8 0%, #818cf8 50%, #c084fc 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Study Smarter with AI.
            </span>
          </h1>

          <p className="hero-subtitle" style={{ fontSize: "1.05rem", lineHeight: 1.6, color: "#94a3b8" }}>
            Curated university lecture notes, solved previous question papers, and instant AI study tools. Read directly in your browser or save 100% offline.
          </p>

          <div className="hero-actions" style={{ marginTop: "24px" }}>
            <button
              type="button"
              className="btn-primary"
              onClick={browseMaterials}
              style={{
                background: "linear-gradient(135deg, #0284c7 0%, #3b82f6 50%, #6366f1 100%)",
                boxShadow: "0 8px 24px rgba(2, 132, 199, 0.45)",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                fontWeight: 800,
              }}
            >
              <span>Explore Study Materials</span>
              <ArrowRight size={17} />
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={onOpenUpload}
              style={{
                background: "rgba(255, 255, 255, 0.06)",
                border: "1px solid rgba(255, 255, 255, 0.16)",
                color: "#e2e8f0",
                fontWeight: 700,
              }}
            >
              Share Your Notes
            </button>
          </div>

          <p className="hero-reassurance" style={{ marginTop: "16px", color: "#64748b", fontSize: "0.82rem" }}>
            <ShieldCheck size={15} color="#34d399" />
            <span>Curated by students</span>
            <span aria-hidden="true">·</span>
            <span>0ms Instant Reader</span>
            <span aria-hidden="true">·</span>
            <span>Zero Paywalls</span>
          </p>
        </div>

        <div className="hero-library-card" aria-label="What you can find in the study library">
          <div className="hero-library-heading">
            <div
              className="hero-library-icon"
              style={{
                background: "linear-gradient(135deg, rgba(56, 189, 248, 0.2), rgba(99, 102, 241, 0.2))",
                border: "1px solid rgba(56, 189, 248, 0.4)",
                color: "#38bdf8",
              }}
            >
              <BookOpen size={19} />
            </div>
            <div>
              <p className="hero-library-kicker" style={{ color: "#38bdf8", fontWeight: 700, letterSpacing: "1px" }}>
                THE STUDY VAULT
              </p>
              <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800 }}>Start with what you need</h2>
            </div>
          </div>

          <div
            className="hero-library-count"
            style={{
              background: "linear-gradient(135deg, rgba(15, 23, 42, 0.8), rgba(30, 41, 59, 0.6))",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "12px",
              padding: "12px 16px",
            }}
          >
            <strong style={{ fontSize: "1.5rem", color: "#38bdf8" }}>{totalNotes.toLocaleString()}</strong>
            <span style={{ color: "#94a3b8" }}>{totalNotes === 1 ? "verified academic resource" : "verified academic resources"}</span>
          </div>

          <div className="hero-library-list">
            {libraryLinks.map(([Icon, title, description, onClick]) => (
              <button className="hero-library-item" key={title} onClick={onClick}>
                <span className="hero-library-item-icon">
                  <Icon size={17} />
                </span>
                <span>
                  <strong>{title}</strong>
                  <small>{description}</small>
                </span>
                <ArrowRight size={15} style={{ marginLeft: "auto", opacity: 0.7 }} />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="hero-benefits" aria-label="Study library features">
        <div className="hero-benefit">
          <Search size={17} color="#38bdf8" />
          <span><strong>Find it faster</strong><small>Instant search by topic or code</small></span>
        </div>
        <div className="hero-benefit">
          <BookOpen size={17} color="#34d399" />
          <span><strong>Study your way</strong><small>Offline PWA &amp; Zero Lag Reader</small></span>
        </div>
        <button
          type="button"
          onClick={onOpenAiStudy}
          className="hero-benefit"
          style={{
            cursor: "pointer",
            textAlign: "left",
            background: "linear-gradient(135deg, rgba(99, 102, 241, 0.16), rgba(6, 182, 212, 0.16))",
            border: "1px solid rgba(139, 92, 246, 0.45)",
            boxShadow: "0 4px 18px rgba(99, 102, 241, 0.15)",
            transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          <div style={{
            width: "30px",
            height: "30px",
            borderRadius: "9px",
            background: "linear-gradient(135deg, #8b5cf6, #06b6d4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            flexShrink: 0,
            boxShadow: "0 2px 8px rgba(139, 92, 246, 0.45)",
          }}>
            <Sparkles size={16} />
          </div>
          <span>
            <strong style={{ color: "#fff", display: "flex", alignItems: "center", gap: "6px" }}>
              <span>AI Study</span>
              <span style={{ fontSize: "0.62rem", padding: "1px 6px", borderRadius: "999px", background: "rgba(56, 189, 248, 0.2)", color: "#38bdf8", border: "1px solid rgba(56, 189, 248, 0.4)" }}>0ms Edge</span>
            </strong>
            <small style={{ color: "#94a3b8" }}>3D Flashcards, Mind-Maps &amp; Summaries</small>
          </span>
          <ArrowRight size={14} style={{ marginLeft: "auto", color: "#38bdf8", opacity: 0.8 }} />
        </button>
      </div>
    </section>
  );
}
