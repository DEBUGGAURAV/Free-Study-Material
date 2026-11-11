import { ArrowRight, BookOpen, FileText, Search, ShieldCheck, Sparkles } from "lucide-react";

export default function HeroBanner({ totalNotes = 0, onOpenUpload }) {
  const browseMaterials = () => {
    document.getElementById("study-materials")?.scrollIntoView({
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth",
      block: "start",
    });
  };

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
            <div className="hero-library-item">
              <span className="hero-library-item-icon"><FileText size={17} /></span>
              <span><strong>Class notes</strong><small>Review topics at your pace</small></span>
              <ArrowRight size={15} />
            </div>
            <div className="hero-library-item">
              <span className="hero-library-item-icon"><Search size={17} /></span>
              <span><strong>Previous papers</strong><small>Find practice material by course</small></span>
              <ArrowRight size={15} />
            </div>
            <div className="hero-library-item">
              <span className="hero-library-item-icon"><Sparkles size={17} /></span>
              <span><strong>AI study tools</strong><small>Get more from your materials</small></span>
              <ArrowRight size={15} />
            </div>
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
        <div className="hero-benefit">
          <Sparkles size={17} />
          <span><strong>Study with AI</strong><small>Explore built-in study tools</small></span>
        </div>
      </div>
    </section>
  );
}
