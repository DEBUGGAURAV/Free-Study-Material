import React, { useState, useEffect } from "react";
import Navbar from "./components/Navbar";
import HeroBanner from "./components/HeroBanner";
import CategoryFilter from "./components/CategoryFilter";
import NoteCard from "./components/NoteCard";
import UploadModal from "./components/UploadModal";
import PreviewModal from "./components/PreviewModal";
import AdminModal from "./components/AdminModal";
import QueueStatusPill from "./components/QueueStatusPill";
import { api, getCurrentUser } from "./api";
import { BookOpen, RefreshCw } from "lucide-react";

export default function App() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSemester, setSelectedSemester] = useState("All");
  const [selectedBranch, setSelectedBranch] = useState("All");

  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [previewNote, setPreviewNote] = useState(null);
  const [currentUser, setCurrentUser] = useState(getCurrentUser());

  // Active Background Upload Job
  const [activeJob, setActiveJob] = useState(null);

  useEffect(() => {
    fetchNotes();
  }, [selectedSemester, selectedBranch, searchTerm]);

  const fetchNotes = async () => {
    try {
      setLoading(true);
      const res = await api.getNotes({
        branch: selectedBranch,
        semester: selectedSemester,
        search: searchTerm,
      });
      setNotes(res.notes || []);
    } catch (err) {
      console.error("[APP] Error fetching notes:", err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadQueued = (noteId, title) => {
    setActiveJob({ noteId, title });
    // Invalidate and refresh notes list
    fetchNotes();
  };

  const handleQueueCompleted = (noteId) => {
    fetchNotes();
  };

  const handleLogout = () => {
    api.logout();
    setCurrentUser(null);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Top Navbar */}
      <Navbar
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        onOpenUpload={() => setIsUploadOpen(true)}
        onOpenAdmin={() => setIsAdminOpen(true)}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      <main className="app-container" style={{ flex: 1 }}>
        {/* Hero Banner with Tech Architecture */}
        <HeroBanner totalNotes={notes.length} />

        {/* Filter Bar */}
        <CategoryFilter
          selectedSemester={selectedSemester}
          setSelectedSemester={setSelectedSemester}
          selectedBranch={selectedBranch}
          setSelectedBranch={setSelectedBranch}
          totalCount={notes.length}
        />

        {/* Notes Grid */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div className="spinner" style={{ width: "32px", height: "32px", margin: "0 auto 16px" }}></div>
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
              Connecting to Indian Edge CDN & loading notes...
            </p>
          </div>
        ) : notes.length > 0 ? (
          <div className="notes-grid">
            {notes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                onPreview={(n) => setPreviewNote(n)}
              />
            ))}
          </div>
        ) : (
          <div
            style={{
              textAlign: "center",
              padding: "70px 20px",
              background: "var(--bg-glass-card)",
              border: "1px dashed var(--border-subtle)",
              borderRadius: "var(--radius-lg)",
            }}
          >
            <BookOpen size={48} style={{ color: "var(--accent-indigo)", marginBottom: "16px", opacity: 0.8 }} />
            <h3 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "8px" }}>
              No study notes found in this filter
            </h3>
            <p style={{ color: "var(--text-dim)", fontSize: "0.88rem", maxWidth: "400px", margin: "0 auto 20px" }}>
              Be the first student to upload notes for {selectedBranch} ({selectedSemester})!
            </p>
            <button className="btn-primary" onClick={() => setIsUploadOpen(true)}>
              Upload First Note
            </button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer
        style={{
          borderTop: "1px solid var(--border-subtle)",
          padding: "24px",
          textAlign: "center",
          fontSize: "0.8rem",
          color: "var(--text-dim)",
          background: "rgba(7, 10, 18, 0.95)",
        }}
      >
        <div style={{ maxWidth: "1380px", margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div>
            Free Study Material Vault • Domain: <strong>freestudymaterial.onrender.com</strong>
          </div>
          <div>
            100% Free Lifetime Academic Cloud • Telegram MTProto Layer 198 • Cloudflare CDN LRU
          </div>
        </div>
      </footer>

      {/* Modals & Floating Pills */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploadQueued={handleUploadQueued}
      />

      <PreviewModal
        note={previewNote}
        onClose={() => setPreviewNote(null)}
      />

      <AdminModal
        isOpen={isAdminOpen}
        onClose={() => setIsAdminOpen(false)}
        currentUser={currentUser}
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          fetchNotes();
        }}
        notes={notes}
        onRefreshNotes={fetchNotes}
      />

      <QueueStatusPill
        activeJob={activeJob}
        onCompleted={handleQueueCompleted}
        onDismiss={() => setActiveJob(null)}
      />
    </div>
  );
}
