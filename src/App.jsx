import React, { useState, useEffect } from "react";
import Navbar from "./components/Navbar";
import HeroBanner from "./components/HeroBanner";
import CategoryFilter from "./components/CategoryFilter";
import NoteCard from "./components/NoteCard";
import UploadModal from "./components/UploadModal";
import PreviewModal from "./components/PreviewModal";
import AdminModal from "./components/AdminModal";
import NoticeBoardModal from "./components/NoticeBoardModal";
import AuthModal from "./components/AuthModal";
import QueueStatusPill from "./components/QueueStatusPill";
import { api, getCurrentUser } from "./api";
import { BookOpen, ChevronDown, ChevronUp, Bell } from "lucide-react";

export default function App() {
  const [notes, setNotes] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSemester, setSelectedSemester] = useState("All");
  const [selectedBranch, setSelectedBranch] = useState("All");
  const [showAllNotes, setShowAllNotes] = useState(false);

  // Modals
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isNoticeBoardOpen, setIsNoticeBoardOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [previewNote, setPreviewNote] = useState(null);

  // User & Notices
  const [currentUser, setCurrentUser] = useState(getCurrentUser());
  const [notices, setNotices] = useState([]);

  // Active Background Upload Job
  const [activeJob, setActiveJob] = useState(null);

  useEffect(() => {
    fetchBranches();
    fetchNotices();
  }, []);

  useEffect(() => {
    fetchNotes();
  }, [selectedSemester, selectedBranch, searchTerm]);

  const fetchBranches = async () => {
    try {
      const res = await api.getBranches();
      setBranches(res.branches || []);
    } catch {}
  };

  const fetchNotices = async () => {
    try {
      const res = await api.getNotices();
      setNotices(res.notices || []);
    } catch {}
  };

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
    fetchNotes();
    fetchBranches();
    fetchNotices();
  };

  const handleQueueCompleted = (noteId) => {
    fetchNotes();
    fetchBranches();
  };

  const handleLogout = async () => {
    await api.logout();
    setCurrentUser(null);
  };

  // Rule: Display initial 15 notes, keep rest hidden until user clicks "Show All Notes"
  const displayedNotes = showAllNotes ? notes : notes.slice(0, 15);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Top Navbar */}
      <Navbar
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        onOpenUpload={() => setIsUploadOpen(true)}
        onOpenAdmin={() => {
          if (!currentUser) {
            setIsAuthOpen(true);
          } else {
            setIsAdminOpen(true);
          }
        }}
        onOpenNotices={() => setIsNoticeBoardOpen(true)}
        onOpenAuth={() => setIsAuthOpen(true)}
        currentUser={currentUser}
        onLogout={handleLogout}
        noticeCount={notices.length}
      />

      <main className="app-container" style={{ flex: 1 }}>
        {/* Notice Board Ticker Bar (if notices exist) */}
        {notices.length > 0 && (
          <div
            style={{
              margin: "16px 0 -8px",
              background: "rgba(6, 182, 212, 0.08)",
              border: "1px solid rgba(6, 182, 212, 0.25)",
              borderRadius: "var(--radius-md)",
              padding: "10px 18px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              cursor: "pointer",
            }}
            onClick={() => setIsNoticeBoardOpen(true)}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", overflow: "hidden" }}>
              <Bell size={16} style={{ color: "var(--accent-cyan)", flexShrink: 0 }} />
              <span style={{ fontSize: "0.82rem", color: "#fff", fontWeight: 600 }}>
                Latest Notice:
              </span>
              <span style={{ fontSize: "0.82rem", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {notices[0].title}
              </span>
            </div>

            <span style={{ fontSize: "0.75rem", color: "var(--accent-cyan)", fontWeight: 700, flexShrink: 0 }}>
              View Notice Board &rarr;
            </span>
          </div>
        )}

        {/* Hero Banner with Tech Architecture */}
        <HeroBanner totalNotes={notes.length} />

        {/* Filter Bar (With Dynamic Custom Branches) */}
        <CategoryFilter
          selectedSemester={selectedSemester}
          setSelectedSemester={setSelectedSemester}
          selectedBranch={selectedBranch}
          setSelectedBranch={setSelectedBranch}
          branches={branches}
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
          <>
            <div className="notes-grid">
              {displayedNotes.map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  onPreview={(n) => setPreviewNote(n)}
                />
              ))}
            </div>

            {/* Show 15 notes rule: Expand / Collapse Button */}
            {notes.length > 15 && (
              <div style={{ textAlign: "center", marginTop: "32px" }}>
                <button
                  className="btn-secondary"
                  style={{ padding: "12px 28px", fontSize: "0.9rem", fontWeight: 600 }}
                  onClick={() => setShowAllNotes((prev) => !prev)}
                >
                  {showAllNotes ? (
                    <>
                      <span>Show Less (Only 15 Notes)</span>
                      <ChevronUp size={16} />
                    </>
                  ) : (
                    <>
                      <span>Show All {notes.length} Notes (Showing 15 of {notes.length})</span>
                      <ChevronDown size={16} />
                    </>
                  )}
                </button>
              </div>
            )}
          </>
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

      {/* Modals & Overlays */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploadQueued={handleUploadQueued}
        existingBranches={branches}
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
        branches={branches}
      />

      <NoticeBoardModal
        isOpen={isNoticeBoardOpen}
        onClose={() => setIsNoticeBoardOpen(false)}
        currentUser={currentUser}
      />

      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onAuthSuccess={(user) => {
          setCurrentUser(user);
          fetchNotes();
        }}
      />

      <QueueStatusPill
        activeJob={activeJob}
        onCompleted={handleQueueCompleted}
        onDismiss={() => setActiveJob(null)}
      />
    </div>
  );
}
