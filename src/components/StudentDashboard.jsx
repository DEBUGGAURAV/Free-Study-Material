import React, { useState, useMemo, useEffect } from 'react';
import { 
  Sparkles, BookOpen, Download, ShieldCheck, Zap, 
  ArrowUpRight, Clock, Award, ChevronRight, Eye,
  CheckCircle2, FileText, Search, X, Filter, HardDrive,
  Share2, FolderOpen, TrendingUp, UploadCloud, Activity,
  Layers, Users, Bell, ExternalLink, Copy, Check, LayoutGrid, List
} from 'lucide-react';
import UploadDocumentSpace from './UploadDocumentSpace';
import StudentsView from './StudentsView';
import NoticeBoard from './NoticeBoard';

export default function StudentDashboard({ 
  user, 
  notes: rawNotes = [], 
  folders = [], 
  notices = [], 
  token,
  onNavigate, 
  onNoteAccess,
  onUploadSuccess,
  activeView = 'home',
  onViewChange
}) {
  const notes = useMemo(() => {
    if (Array.isArray(rawNotes)) return rawNotes;
    if (rawNotes && Array.isArray(rawNotes.notes)) return rawNotes.notes;
    return [];
  }, [rawNotes]);

  // Navigation tabs: 'vault' (Notes) | 'upload' (Upload Studio) | 'radar' (Notices) | 'network' (Students)
  const [activeTab, setActiveTab] = useState(() => {
    if (activeView === 'notes') return 'vault';
    if (activeView === 'notices') return 'radar';
    if (activeView === 'students') return 'network';
    return 'vault';
  });
  
  // Search and filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedYear, setSelectedYear] = useState('All'); // 'All' | '1st year' | '2nd year' | '3rd year' | '4th year'
  const [selectedSubject, setSelectedSubject] = useState('All');
  const [sortBy, setSortBy] = useState('popular'); // 'popular' | 'newest' | 'alphabetical'
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
  const [previewNote, setPreviewNote] = useState(null);
  const [copiedNoteId, setCopiedNoteId] = useState(null);

  // Fast Escape Key Listener for Note Preview
  useEffect(() => {
    if (!previewNote) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') setPreviewNote(null);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [previewNote]);

  const userYear = user?.year || '1st year';
  const userBranch = user?.branch || 'Computer Science & Engineering';
  const userName = user?.name || 'Student';

  // Distinct subjects list with note counts
  const subjectList = useMemo(() => {
    const map = new Map();
    notes.forEach(note => {
      const subj = note.subject || 'General Engineering';
      map.set(subj, (map.get(subj) || 0) + 1);
    });
    const list = [{ name: 'All', count: notes.length }];
    map.forEach((count, name) => {
      list.push({ name, count });
    });
    return list;
  }, [notes]);

  // Filtered and sorted notes
  const filteredNotes = useMemo(() => {
    let result = notes.filter(n => {
      if (!n) return false;

      // Year filter
      if (selectedYear !== 'All') {
        const nYearStr = String(n.year || '').toLowerCase();
        const selYearStr = selectedYear.toLowerCase();
        const nDigit = nYearStr.match(/\d+/)?.[0];
        const selDigit = selYearStr.match(/\d+/)?.[0];
        if (nDigit && selDigit) {
          if (nDigit !== selDigit) return false;
        } else if (!nYearStr.includes(selYearStr) && !selYearStr.includes(nYearStr)) {
          return false;
        }
      }

      // Subject filter
      if (selectedSubject !== 'All' && n.subject !== selectedSubject) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const target = `${n.title || ''} ${n.subject || ''} ${n.author || ''} ${n.year || ''} ${n.fileName || ''}`.toLowerCase();
        if (!target.includes(query)) return false;
      }

      return true;
    });

    // Sorting
    if (sortBy === 'popular') {
      result.sort((a, b) => (b.downloadCount || b.downloads || 0) - (a.downloadCount || a.downloads || 0));
    } else if (sortBy === 'newest') {
      result.sort((a, b) => {
        const timeA = a.createdAt?._seconds ? a.createdAt._seconds * 1000 : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
        const timeB = b.createdAt?._seconds ? b.createdAt._seconds * 1000 : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
        return timeB - timeA;
      });
    } else if (sortBy === 'alphabetical') {
      result.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    }

    return result;
  }, [notes, selectedYear, selectedSubject, searchQuery, sortBy]);

  // Total downloads aggregate
  const totalDownloads = useMemo(() => {
    return notes.reduce((acc, curr) => acc + (curr.downloadCount || curr.downloads || 0), 0);
  }, [notes]);

  // Copy share link helper
  const handleCopyLink = (note) => {
    const downloadUrl = note.driveLink || (note.id ? `${window.location.origin}/api/notes/${note.id}/download` : window.location.href);
    navigator.clipboard.writeText(downloadUrl).then(() => {
      setCopiedNoteId(note.id || note.title);
      setTimeout(() => setCopiedNoteId(null), 2500);
    });
  };

  return (
    <div className="vault-container">
      {/* Top Welcome & Bento Metrics */}
      <div className="page-width">
        <section className="dashboard-welcome-banner" style={{
          background: 'linear-gradient(135deg, rgba(30, 41, 68, 0.45) 0%, rgba(15, 23, 42, 0.65) 100%)',
          border: '1px solid var(--border-card)',
          borderRadius: 'var(--radius-xl)',
          padding: '32px 36px',
          marginBottom: '28px',
          backdropFilter: 'blur(20px)',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{
            position: 'absolute',
            top: '-60px',
            right: '-60px',
            width: '260px',
            height: '260px',
            background: 'radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 70%)',
            pointerEvents: 'none'
          }} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '20px' }}>
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '5px 12px', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: 'var(--radius-full)', fontSize: '0.78rem', fontWeight: 600, color: 'var(--accent-cyan)', marginBottom: '12px' }}>
                <Sparkles size={14} />
                <span>Free Study Material • Next-Gen Academic Cloud</span>
              </div>
              <h1 style={{ fontSize: 'clamp(1.8rem, 3vw, 2.4rem)', marginBottom: '8px' }}>
                {user ? `Welcome, ${userName}` : 'Academic Knowledge Cloud'}
              </h1>
              <p style={{ maxWidth: '600px', fontSize: '0.96rem' }}>
                {user 
                  ? `${userBranch} • ${userYear} • Instant access to peer-curated semester notes, guides, and blueprints.`
                  : 'Free university study notes, syllabus blueprints, and continuous cloud archives.'}
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button 
                className="button button-primary"
                onClick={() => setActiveTab('upload')}
                style={{ padding: '12px 22px' }}
              >
                <UploadCloud size={18} />
                <span>Upload & Share Notes</span>
              </button>
            </div>
          </div>

          {/* Quick Metrics Strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginTop: '28px', paddingTop: '24px', borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-sm)', background: 'rgba(99, 102, 241, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary-light)' }}>
                <BookOpen size={20} />
              </div>
              <div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-pure)' }}>{notes.length}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Available Documents</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-sm)', background: 'rgba(56, 189, 248, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-cyan)' }}>
                <Download size={20} />
              </div>
              <div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-pure)' }}>{totalDownloads.toLocaleString()}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Total Downloads</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-sm)', background: 'rgba(16, 185, 129, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#34d399' }}>
                <HardDrive size={20} />
              </div>
              <div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-pure)' }}>Telegram Cloud</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Zero File Size Limits</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-sm)', background: 'rgba(245, 158, 11, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fbbf24' }}>
                <Zap size={20} />
              </div>
              <div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-pure)' }}>80+ MB/s</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Edge CDN Throughput</div>
              </div>
            </div>
          </div>
        </section>

        {/* Studio Tab Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border-subtle)', marginBottom: '24px', overflowX: 'auto', paddingBottom: '2px' }}>
          <button 
            className={`tab-btn ${activeTab === 'vault' ? 'active' : ''}`}
            onClick={() => setActiveTab('vault')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 20px',
              fontSize: '0.95rem',
              fontWeight: 600,
              color: activeTab === 'vault' ? 'var(--text-pure)' : 'var(--text-muted)',
              borderBottom: activeTab === 'vault' ? '2px solid var(--accent-cyan)' : '2px solid transparent',
              background: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            <BookOpen size={18} />
            <span>Study Notes Vault ({notes.length})</span>
          </button>

          <button 
            className={`tab-btn ${activeTab === 'upload' ? 'active' : ''}`}
            onClick={() => setActiveTab('upload')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 20px',
              fontSize: '0.95rem',
              fontWeight: 600,
              color: activeTab === 'upload' ? 'var(--text-pure)' : 'var(--text-muted)',
              borderBottom: activeTab === 'upload' ? '2px solid var(--accent-cyan)' : '2px solid transparent',
              background: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            <UploadCloud size={18} />
            <span>Contribute Notes</span>
          </button>

          <button 
            className={`tab-btn ${activeTab === 'radar' ? 'active' : ''}`}
            onClick={() => setActiveTab('radar')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 20px',
              fontSize: '0.95rem',
              fontWeight: 600,
              color: activeTab === 'radar' ? 'var(--text-pure)' : 'var(--text-muted)',
              borderBottom: activeTab === 'radar' ? '2px solid var(--accent-cyan)' : '2px solid transparent',
              background: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            <Bell size={18} />
            <span>Campus Notice Board ({notices.length})</span>
          </button>

          <button 
            className={`tab-btn ${activeTab === 'network' ? 'active' : ''}`}
            onClick={() => setActiveTab('network')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 20px',
              fontSize: '0.95rem',
              fontWeight: 600,
              color: activeTab === 'network' ? 'var(--text-pure)' : 'var(--text-muted)',
              borderBottom: activeTab === 'network' ? '2px solid var(--accent-cyan)' : '2px solid transparent',
              background: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            <Users size={18} />
            <span>Student Peers</span>
          </button>
        </div>

        {/* Tab 1: STUDY NOTES VAULT */}
        {activeTab === 'vault' && (
          <div>
            {/* Year Filter Pills Bar */}
            <div className="year-pills-bar">
              {['All', '1st year', '2nd year', '3rd year', '4th year'].map(yr => (
                <button
                  key={yr}
                  className={`year-pill ${selectedYear === yr ? 'active' : ''}`}
                  onClick={() => setSelectedYear(yr)}
                >
                  {yr === 'All' ? '⚡ All Years' : yr.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Subject Chips Carousel */}
            <div className="subject-chips-bar">
              {subjectList.map(subj => (
                <button
                  key={subj.name}
                  className={`subject-chip ${selectedSubject === subj.name ? 'active' : ''}`}
                  onClick={() => setSelectedSubject(subj.name)}
                >
                  <span>{subj.name}</span>
                  <span className="subject-chip-badge">{subj.count}</span>
                </button>
              ))}
            </div>

            {/* Search and Sort Controls Bar */}
            <div className="controls-bar">
              <div className="search-input-wrapper">
                <Search size={18} className="search-input-icon" />
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search by title, subject, semester, or topics (e.g. DBMS, DSA, Operating Systems)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              <div className="controls-right">
                <select 
                  className="custom-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                >
                  <option value="popular">🔥 Most Popular</option>
                  <option value="newest">🕒 Newest Uploads</option>
                  <option value="alphabetical">🔤 Title (A-Z)</option>
                </select>

                <div className="view-toggle-group">
                  <button
                    className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
                    onClick={() => setViewMode('grid')}
                    title="Grid View"
                  >
                    <LayoutGrid size={17} />
                  </button>
                  <button
                    className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                    onClick={() => setViewMode('list')}
                    title="List View"
                  >
                    <List size={17} />
                  </button>
                </div>
              </div>
            </div>

            {/* Notes List / Grid View */}
            {filteredNotes.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '60px 20px',
                background: 'var(--bg-card)',
                borderRadius: 'var(--radius-xl)',
                border: '1px dashed var(--border-card)',
                margin: '20px 0'
              }}>
                <FileText size={48} style={{ color: 'var(--text-dim)', margin: '0 auto 16px' }} />
                <h3 style={{ marginBottom: '8px' }}>No study notes matched your filter</h3>
                <p style={{ maxWidth: '440px', margin: '0 auto 20px', fontSize: '0.9rem' }}>
                  Try switching the year or subject filter, or be the first to upload notes for this section.
                </p>
                <button 
                  className="button button-primary compact-button"
                  onClick={() => { setSelectedYear('All'); setSelectedSubject('All'); setSearchQuery(''); }}
                >
                  Reset All Filters
                </button>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="notes-grid">
                {filteredNotes.map(note => (
                  <NoteGridCard
                    key={note.id || note.title}
                    note={note}
                    onPreview={() => setPreviewNote(note)}
                    onAccess={() => onNoteAccess?.(note)}
                    onCopyLink={() => handleCopyLink(note)}
                    isCopied={copiedNoteId === (note.id || note.title)}
                  />
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {filteredNotes.map(note => (
                  <NoteListRow
                    key={note.id || note.title}
                    note={note}
                    onPreview={() => setPreviewNote(note)}
                    onAccess={() => onNoteAccess?.(note)}
                    onCopyLink={() => handleCopyLink(note)}
                    isCopied={copiedNoteId === (note.id || note.title)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: UPLOAD STUDIO */}
        {activeTab === 'upload' && (
          <UploadDocumentSpace 
            folders={folders}
            token={token}
            onUploadSuccess={(createdNote) => {
              onUploadSuccess?.(createdNote);
              setActiveTab('vault');
            }}
          />
        )}

        {/* Tab 3: NOTICE BOARD */}
        {activeTab === 'radar' && (
          <NoticeBoard 
            notices={notices}
            isAdmin={user?.role === 'admin'}
          />
        )}

        {/* Tab 4: STUDENTS PEER NETWORK */}
        {activeTab === 'network' && (
          <StudentsView />
        )}
      </div>

      {/* Note Preview & Download Modal */}
      {previewNote && (
        <div className="modal-backdrop" onClick={() => setPreviewNote(null)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-sm)', background: 'rgba(56, 189, 248, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-cyan)' }}>
                  <FileText size={20} />
                </div>
                <div>
                  <div className="modal-title" style={{ fontSize: '1.1rem' }}>Document Overview</div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-dim)' }}>Verified Free Study Material Cloud</div>
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setPreviewNote(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <h2 style={{ fontSize: '1.35rem', marginBottom: '14px', lineHeight: 1.35 }}>
                {previewNote.title}
              </h2>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '24px' }}>
                <span className="badge badge-year">{previewNote.year || '1st year'}</span>
                <span className="badge badge-subject">{previewNote.subject || 'Engineering'}</span>
                {previewNote.branch && <span className="badge" style={{ background: 'rgba(168, 85, 247, 0.12)', color: '#c084fc', border: '1px solid rgba(168, 85, 247, 0.3)' }}>{previewNote.branch}</span>}
                <span className="badge badge-cloud">⚡ Telegram Edge Storage</span>
              </div>

              <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '16px', marginBottom: '20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '0.85rem' }}>
                  <div>
                    <span style={{ color: 'var(--text-dim)', display: 'block', marginBottom: '2px' }}>File Name</span>
                    <strong style={{ color: 'var(--text-pure)', wordBreak: 'break-all' }}>{previewNote.fileName || `${previewNote.title}.pdf`}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-dim)', display: 'block', marginBottom: '2px' }}>File Size</span>
                    <strong style={{ color: 'var(--text-pure)' }}>{previewNote.fileSize ? `${(previewNote.fileSize / (1024 * 1024)).toFixed(2)} MB` : 'Optimized Cloud PDF'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-dim)', display: 'block', marginBottom: '2px' }}>Downloads</span>
                    <strong style={{ color: 'var(--text-pure)' }}>{(previewNote.downloadCount || previewNote.downloads || 0).toLocaleString()} times</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-dim)', display: 'block', marginBottom: '2px' }}>Contributor</span>
                    <strong style={{ color: 'var(--text-pure)' }}>{previewNote.uploadedByName || previewNote.author || 'Telegram Peer'}</strong>
                  </div>
                </div>
              </div>

              <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Direct global edge stream is enabled with high-speed 80+ MB/s cache replication for instant delivery.
              </p>
            </div>

            <div className="modal-footer">
              <button 
                className="button button-ghost"
                onClick={() => handleCopyLink(previewNote)}
              >
                {copiedNoteId === (previewNote.id || previewNote.title) ? (
                  <>
                    <Check size={16} style={{ color: '#10b981' }} />
                    <span style={{ color: '#10b981' }}>Link Copied</span>
                  </>
                ) : (
                  <>
                    <Copy size={16} />
                    <span>Copy Stream Link</span>
                  </>
                )}
              </button>

              <a 
                href={previewNote.driveLink || (previewNote.id ? `/api/notes/${previewNote.id}/download` : '#')}
                target="_blank"
                rel="noreferrer"
                className="button button-primary"
                onClick={() => {
                  onNoteAccess?.(previewNote);
                  setPreviewNote(null);
                }}
              >
                <Download size={17} />
                <span>Download Note</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Subcomponent: Grid Card for Note
function NoteGridCard({ note, onPreview, onAccess, onCopyLink, isCopied }) {
  const downloadHref = note.driveLink || (note.id ? `/api/notes/${note.id}/download` : '#');
  const sizeMb = note.fileSize ? `${(note.fileSize / (1024 * 1024)).toFixed(1)} MB` : 'PDF';
  const downloads = (note.downloadCount || note.downloads || 0).toLocaleString();

  return (
    <div className="note-card">
      <div className="note-header">
        <div className="note-file-icon">
          <FileText size={22} />
        </div>
        <div className="note-meta-badges">
          <span className="badge badge-year">{note.year || '1st year'}</span>
          <span className="badge badge-subject">{note.subject || 'General'}</span>
        </div>
      </div>

      <div className="note-body">
        <h3 className="note-title" title={note.title}>
          {note.title}
        </h3>
        <div className="note-details">
          <span>{sizeMb}</span>
          <span>•</span>
          <span>{downloads} downloads</span>
        </div>
      </div>

      <div className="note-footer">
        <button 
          className="button button-ghost compact-button"
          onClick={onPreview}
          title="Quick preview details"
        >
          <Eye size={15} />
          <span>Preview</span>
        </button>

        <div className="note-action-btns">
          <button
            className="button button-ghost compact-button"
            onClick={onCopyLink}
            title="Copy download link"
          >
            {isCopied ? <Check size={14} style={{ color: '#10b981' }} /> : <Share2 size={14} />}
          </button>

          <a
            href={downloadHref}
            target="_blank"
            rel="noreferrer"
            className="button button-primary compact-button"
            onClick={onAccess}
            title="Download document"
          >
            <Download size={14} />
            <span>Download</span>
          </a>
        </div>
      </div>
    </div>
  );
}

// Subcomponent: List View Row for Note
function NoteListRow({ note, onPreview, onAccess, onCopyLink, isCopied }) {
  const downloadHref = note.driveLink || (note.id ? `/api/notes/${note.id}/download` : '#');
  const sizeMb = note.fileSize ? `${(note.fileSize / (1024 * 1024)).toFixed(1)} MB` : 'PDF';
  const downloads = (note.downloadCount || note.downloads || 0).toLocaleString();

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '16px',
      padding: '16px 20px',
      background: 'var(--bg-card)',
      border: '1px solid var(--border-card)',
      borderRadius: 'var(--radius-md)',
      backdropFilter: 'blur(14px)',
      transition: 'all 0.2s ease'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0, flex: 1 }}>
        <div style={{ width: '38px', height: '38px', borderRadius: 'var(--radius-sm)', background: 'rgba(56, 189, 248, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-cyan)', flexShrink: 0 }}>
          <FileText size={18} />
        </div>
        <div style={{ minWidth: 0 }}>
          <h4 style={{ fontSize: '0.96rem', fontWeight: 700, color: 'var(--text-pure)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {note.title}
          </h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '2px' }}>
            <span style={{ color: 'var(--accent-cyan)' }}>{note.subject || 'Engineering'}</span>
            <span>•</span>
            <span>{note.year || '1st year'}</span>
            <span>•</span>
            <span>{sizeMb}</span>
            <span>•</span>
            <span>{downloads} downloads</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <button className="button button-ghost compact-button" onClick={onPreview}>
          <Eye size={14} />
          <span>View</span>
        </button>
        <button className="button button-ghost compact-button" onClick={onCopyLink}>
          {isCopied ? <Check size={14} style={{ color: '#10b981' }} /> : <Share2 size={14} />}
        </button>
        <a href={downloadHref} target="_blank" rel="noreferrer" className="button button-primary compact-button" onClick={onAccess}>
          <Download size={14} />
          <span>Download</span>
        </a>
      </div>
    </div>
  );
}
