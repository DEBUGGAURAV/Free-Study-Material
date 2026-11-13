import { ArrowRight, BookOpen, FileText, Search, ShieldCheck, Sparkles } from "lucide-react";

export default function HeroBanner({ totalNotes = 0, onOpenUpload, onBrowsePapers, onOpenAiStudy }) {
  const browseMaterials = () => {
    document.getElementById("study-materials")?.scrollIntoView({
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth",
      block: "start",
    });
  };
  const libraryLinks = [
    [FileText, "Class notes", "Review topics at your pace", browseMaterials],
    [Search, "Previous papers", "Find practice material by course", () => { onBrowsePapers(); browseMaterials(); }],
    [Sparkles, "✨ AI Study Studio", "Flashcards, Mind-Maps & Exam Summaries", onOpenAiStudy],
  ];

  return (
    <section className="hero-section">
      <div className="hero-layout">
        <div className="hero-copy">
          <div className="hero-badge-pill">
            <Sparkles size={14} />
            <span>Your study library, all in one place</span>
          </div>

          <h1 className="hero-title">
            Find the notes you need. <span>Focus on what matters.</span>
          </h1>

          <p className="hero-subtitle">
            Browse student-shared notes and previous question papers. Search by subject or course,
            then start studying right in your browser.
          </p>

          <div className="hero-actions">
            <button type="button" className="btn-primary" onClick={browseMaterials}>
              Explore study materials
              <ArrowRight size={17} />
            </button>
            <button type="button" className="btn-secondary" onClick={onOpenUpload}>
              Share your notes
            </button>
          </div>

          <p className="hero-reassurance">
            <ShieldCheck size={15} />
            Shared by students <span aria-hidden="true">·</span> Study at your own pace
          </p>
        </div>

        <div className="hero-library-card" aria-label="What you can find in the study library">
          <div className="hero-library-heading">
            <div className="hero-library-icon">
              <BookOpen size={19} />
            </div>
            <div>
              <p className="hero-library-kicker">THE STUDY LIBRARY</p>
              <h2>Start with what you need</h2>
            </div>
          </div>

          <div className="hero-library-count">
            <strong>{totalNotes.toLocaleString()}</strong>
            <span>{totalNotes === 1 ? "resource to explore" : "resources to explore"}</span>
          </div>

          <div className="hero-library-list">
            {libraryLinks.map(([Icon, title, description, onClick]) => (
              <button className="hero-library-item" key={title} onClick={onClick}>
                <span className="hero-library-item-icon"><Icon size={17} /></span>
                <span><strong>{title}</strong><small>{description}</small></span>
                <ArrowRight size={15} />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="hero-benefits" aria-label="Study library features">
        <div className="hero-benefit">
          <Search size={17} />
          <span><strong>Find it faster</strong><small>Search notes and subjects</small></span>
        </div>
        <div className="hero-benefit">
          <BookOpen size={17} />
          <span><strong>Study your way</strong><small>Read materials online</small></span>
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
              <span>Study with AI</span>
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
