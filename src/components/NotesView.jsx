import React, { useState } from 'react';
import { Search, ChevronDown, FileText, Download, ArrowUpRight, UploadCloud, X, Sparkles, HardDrive, Share2, Check } from 'lucide-react';
import UploadDocumentSpace from './UploadDocumentSpace';

export default function NotesView({
  subject, setSubject, search, setSearch, notes, latestUploads,
  newUploadCount, onDismissNewUploads, folders, studentYear,
  connectionError, onRetry, onNoteAccess
}) {
  const [showAllNotes, setShowAllNotes] = useState(false);
  const studentFolders = folders;
  const availableSubjects = ['All notes', ...new Set(studentFolders.map((folder) => folder.subject))];
  const selectedFolder = studentFolders.find((folder) => folder.subject === subject);

  const filteredNotes = notes.filter((note) =>
    (subject === 'All notes' || (selectedFolder && (note.folderId ? note.folderId === selectedFolder.id : note.subject === subject))) &&
    `${note.title} ${note.subject}`.toLowerCase().includes(search.toLowerCase())
  );
  const visibleNotes = showAllNotes ? filteredNotes : filteredNotes.slice(0, 12);

  return (
    <section className="page-width" style={{ padding: '30px 24px 60px' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '28px' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '4px 12px', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: 'var(--radius-full)', fontSize: '0.78rem', fontWeight: 600, color: 'var(--accent-cyan)', marginBottom: '10px' }}>
            <Sparkles size={14} />
            <span>Free Study Material • Academic Archives</span>
          </div>
          <h1 style={{ fontSize: 'clamp(2rem, 3.5vw, 2.8rem)' }}>
            Curated Knowledge Vault
          </h1>
        </div>
        <span className="badge badge-year" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
          {studentYear ? `${studentYear} Syllabus` : 'All Engineering Years'}
        </span>
      </header>

      {connectionError && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', background: 'rgba(244, 63, 94, 0.1)', border: '1px solid rgba(244, 63, 94, 0.3)', borderRadius: 'var(--radius-md)', marginBottom: '24px', color: '#fb7185' }}>
          <div><strong>Connection status:</strong> {connectionError}</div>
          <button className="button button-ghost compact-button" onClick={onRetry}>Try again</button>
        </div>
      )}

      {latestUploads && latestUploads.length > 0 && (
        <LatestUploadsPanel notes={latestUploads} newUploadCount={newUploadCount} onDismiss={onDismissNewUploads} onNoteAccess={onNoteAccess} />
      )}

      {/* Cloud Status Hint Banner */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        padding: '16px 20px',
        background: 'rgba(99, 102, 241, 0.08)',
        border: '1px solid rgba(99, 102, 241, 0.2)',
        borderRadius: 'var(--radius-md)',
        marginBottom: '24px'
      }}>
        <div style={{ width: '38px', height: '38px', borderRadius: 'var(--radius-sm)', background: 'rgba(99, 102, 241, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary-light)', flexShrink: 0 }}>
          <HardDrive size={20} />
        </div>
        <span style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>
          Direct Telegram storage cloud active. Notes are peer-reviewed and synced across all semesters.
        </span>
      </div>

      {/* Search Bar */}
      <div className="search-input-wrapper" style={{ marginBottom: '20px' }}>
        <Search size={18} className="search-input-icon" />
        <input 
          className="search-input" 
          value={search} 
          onChange={(e) => setSearch(e.target.value)} 
          placeholder="Filter notes, algorithms, subjects (e.g. DBMS, DSA, Operating Systems)..." 
        />
        {search && (
          <button 
            onClick={() => setSearch('')}
            style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }}
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Subject Filter Tabs */}
      <div className="subject-chips-bar" style={{ marginBottom: '24px' }}>
        {availableSubjects.map((item) => (
          <button 
            className={`subject-chip ${subject === item ? 'active' : ''}`} 
            key={item} 
            onClick={() => setSubject(item)}
          >
            {item}
          </button>
        ))}
      </div>

      {/* Notes Grid */}
      <div className="notes-grid">
        {visibleNotes.map((note) => (
          <NoteCard key={note.id || note.title} note={note} onAccess={onNoteAccess} />
        ))}
      </div>

      {filteredNotes.length > 12 && !showAllNotes && (
        <div style={{ textAlign: 'center', marginTop: '36px' }}>
          <button 
            className="button button-secondary" 
            onClick={() => setShowAllNotes(true)}
            style={{ padding: '12px 28px' }}
          >
            Show All {filteredNotes.length} Notes <ChevronDown size={16} />
          </button>
        </div>
      )}
    </section>
  );
}

function LatestUploadsPanel({ notes = [], newUploadCount, onDismiss, onNoteAccess }) {
  if (!notes || notes.length === 0) return null;
  const displayNotes = notes.slice(0, 4);

  return (
    <div style={{
      background: 'rgba(18, 27, 48, 0.65)',
      border: '1px solid var(--border-card)',
      borderRadius: 'var(--radius-lg)',
      padding: '20px 24px',
      marginBottom: '24px',
      backdropFilter: 'blur(16px)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.88rem', fontWeight: 700, color: 'var(--accent-cyan)' }}>
          <Sparkles size={16} />
          <span>Recently Uploaded Study Notes</span>
          {newUploadCount > 0 && (
            <span style={{ padding: '2px 8px', background: 'var(--grad-primary)', color: '#fff', borderRadius: 'var(--radius-full)', fontSize: '0.72rem' }}>
              +{newUploadCount} New
            </span>
          )}
        </div>
        {onDismiss && (
          <button onClick={onDismiss} style={{ color: 'var(--text-dim)', fontSize: '0.8rem', padding: '4px' }}>
            <X size={15} />
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
        {displayNotes.map((note, index) => {
          const downloadHref = note.driveLink || (note.id ? `/api/notes/${note.id}/download` : '#');
          return (
            <a
              key={note.id || note.title}
              href={downloadHref}
              target="_blank"
              rel="noreferrer"
              onClick={() => onNoteAccess?.(note)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 14px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                transition: 'all 0.15s ease'
              }}
            >
              <div style={{ width: '32px', height: '32px', borderRadius: 'var(--radius-sm)', background: 'rgba(56, 189, 248, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-cyan)', flexShrink: 0 }}>
                <FileText size={16} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-pure)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {note.title}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                  {note.subject || 'Engineering'}
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}

function NoteCard({ note, onAccess }) {
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
        <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
          {note.uploadedByName || 'Telegram Peer'}
        </span>
        <a
          className="button button-primary compact-button"
          href={downloadHref}
          target="_blank"
          rel="noreferrer"
          onClick={() => onAccess?.(note)}
        >
          <Download size={14} />
          <span>Download</span>
        </a>
      </div>
    </div>
  );
}
