import React, { useState } from 'react';
import { Search, ChevronDown, FileText, Download, ArrowUpRight, UploadCloud, X } from 'lucide-react';
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
  const visibleNotes = showAllNotes ? filteredNotes : filteredNotes.slice(0, 9);

  return (
    <section className="page-width">
      <header className="view-head">
        <div>
          <span className="eyebrow">⚡ KNOWLEDGE REPOSITORY // VERIFIED ARCHIVES</span>
          <h1 className="view-title">Precision archives.<br />Zero compromise.</h1>
        </div>
        <span className="chip" style={{ background: 'rgba(0, 242, 254, 0.1)', borderColor: 'rgba(0, 242, 254, 0.35)', color: '#00f2fe' }}>
          {studentYear ? `${studentYear} Cluster` : 'All Engineering Years'}
        </span>
      </header>

      {connectionError && (
        <div className="banner">
          <div><strong>Connection interrupted:</strong> {connectionError}</div>
          <button className="button button-ghost compact-button" onClick={onRetry}>Try again</button>
        </div>
      )}

      <LatestUploadsPanel notes={latestUploads} newUploadCount={newUploadCount} onDismiss={onDismissNewUploads} onNoteAccess={onNoteAccess} />

      <div className="hint" style={{ background: 'rgba(10, 16, 32, 0.85)', borderColor: 'rgba(0, 242, 254, 0.3)' }}>
        <span className="icon-tile cyan"><UploadCloud size={22} /></span>
        <span style={{ color: '#cbd5e1' }}>Direct Telegram storage pipeline active. Notes and syllabus modules are peer-reviewed and synced topic-wise.</span>
      </div>

      <div className="searchbar" style={{ borderColor: 'rgba(0, 242, 254, 0.3)', background: 'rgba(7, 12, 28, 0.9)' }}>
        <Search size={20} style={{ color: '#00f2fe' }} />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter blueprints, algorithms, subjects (e.g. DBMS, DSA, Operating Systems)..." />
      </div>

      <div className="tabs" role="tablist">
        {availableSubjects.length > 1 ? availableSubjects.map((item) => (
          <button role="tab" aria-selected={subject === item} className={`tab ${subject === item ? 'active' : ''}`} key={item} onClick={() => setSubject(item)}>{item}</button>
        )) : <span style={{ paddingBottom: 12 }}>No subject folders yet for this year.</span>}
      </div>

      <div className="notes-grid">
        {visibleNotes.map((note) => <NoteCard key={note.id || note.title} note={note} onAccess={onNoteAccess} />)}
      </div>

      {filteredNotes.length === 0 && (
        <div className="empty-state">
          <FileText size={44} />
          <p>No approved notes match that search yet. Try a different subject tab or clear the search box.</p>
        </div>
      )}

      {filteredNotes.length > 9 && (
        <div className="center-row">
          <button className="button button-ghost" onClick={() => setShowAllNotes((shown) => !shown)}>
            {showAllNotes ? 'Show fewer notes' : `Show all ${filteredNotes.length} notes`}
            <ChevronDown size={18} style={{ transform: showAllNotes ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
          </button>
        </div>
      )}

      <UploadDocumentSpace />
    </section>
  );
}

function LatestUploadsPanel({ notes = [], newUploadCount, onDismiss, onNoteAccess }) {
  const displayNotes = notes.slice(0, 8);
  if (!displayNotes.length) return null;

  return (
    <section className="latest" aria-label="Latest uploads">
      <div className="latest-head">
        <div>
          <span className="eyebrow"><span className="live-dot" /> fresh from the library</span>
          <h2>Latest uploads</h2>
        </div>
        <span className="chip">{displayNotes.length} in the feed</span>
      </div>

      {newUploadCount > 0 && (
        <div className="new-alert" role="status">
          <div>
            <strong>{newUploadCount > 1 ? `${newUploadCount} new notes` : 'New note'} just arrived</strong><br />
            <small>New notes from the team are ready to explore.</small>
          </div>
          <button onClick={onDismiss} aria-label="Dismiss new upload notification"><X size={18} /></button>
        </div>
      )}

      <div className="latest-grid">
        {displayNotes.map((note, index) => (
          <a key={note.id || note.title} className={`latest-item ${index === 0 ? 'first' : ''}`} href={note.driveLink || (note.id ? `/api/notes/${note.id}/download` : '#')} target="_blank" rel="noreferrer" onClick={() => onNoteAccess?.(note)}>
            <span className="rank">{index === 0 ? 'New' : String(index + 1).padStart(2, '0')}</span>
            <div>
              <strong>{note.title}</strong>
              <small>{note.subject} • {note.createdAt ? new Date(note.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Recently added'}</small>
            </div>
            <ArrowUpRight size={20} />
          </a>
        ))}
      </div>
    </section>
  );
}

function NoteCard({ note, onAccess }) {
  const subjectColors = {
    'Cloud Computing (CC)': { accent: '#38bdf8', glow: 'rgba(56,189,248,0.18)' },
    'Cryptography (CNS)':   { accent: '#a78bfa', glow: 'rgba(167,139,250,0.18)' },
    'Artificial Intelligence (AI)': { accent: '#34d399', glow: 'rgba(52,211,153,0.18)' },
    'Deep Learning':        { accent: '#fb923c', glow: 'rgba(251,146,60,0.18)'  },
  };
  const colors = subjectColors[note.subject] || { accent: '#00f2fe', glow: 'rgba(0,242,254,0.15)' };

  return (
    <article className="note-card" style={{
      background: `linear-gradient(145deg, rgba(15,23,42,0.95) 0%, rgba(30,41,59,0.9) 100%)`,
      border: `1.5px solid ${colors.accent}44`,
      borderRadius: '18px',
      padding: '22px 20px 18px',
      position: 'relative',
      overflow: 'hidden',
      boxShadow: `0 4px 20px rgba(0,0,0,0.35)`,
      transition: 'transform 0.2s ease, border-color 0.2s ease',
      cursor: 'default',
      contain: 'content',
    }}>
      {/* Accent glow blob */}
      <div style={{
        position: 'absolute', top: '-30px', right: '-30px',
        width: '110px', height: '110px',
        background: `radial-gradient(circle, ${colors.glow} 0%, transparent 70%)`,
        borderRadius: '50%', pointerEvents: 'none'
      }} />

      {/* Top bar: subject pill + type badge */}
      <div className="note-meta" style={{ marginBottom: '12px' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: '5px',
          background: `${colors.accent}22`, color: colors.accent,
          fontSize: '0.72rem', fontWeight: '800', padding: '3px 10px',
          borderRadius: '20px', border: `1px solid ${colors.accent}55`,
          letterSpacing: '0.3px', textTransform: 'uppercase',
          whiteSpace: 'nowrap'
        }}>
          {note.subject || 'General'}
        </span>
        <span className="badge" style={{
          background: `${colors.accent}22`, color: colors.accent,
          border: `1px solid ${colors.accent}44`, borderRadius: '6px',
          fontSize: '0.72rem', fontWeight: '900', padding: '3px 8px',
          letterSpacing: '0.5px'
        }}>
          {note.type || 'LINK'}
        </span>
      </div>

      {/* Title */}
      <h3 style={{
        color: '#f1f5f9', fontSize: '1.05rem', fontWeight: '800',
        lineHeight: '1.35', margin: '0 0 14px', letterSpacing: '-0.2px'
      }}>
        {note.title}
      </h3>

      {/* Footer: author + open button */}
      <div className="note-foot" style={{ borderTop: `1px solid ${colors.accent}22`, paddingTop: '12px', marginTop: 'auto' }}>
        <span style={{ color: '#94a3b8', fontSize: '0.82rem' }}>
          By <b style={{ color: '#cbd5e1' }}>{note.author}</b>
          {note.year && <span style={{ marginLeft: 6, color: colors.accent, fontSize: '0.75rem', fontWeight: '700' }}>• {note.year}</span>}
        </span>
        <a
          className="button compact-button"
          href={note.driveLink || (note.id ? `/api/notes/${note.id}/download` : '#')}
          target="_blank"
          rel="noreferrer"
          onClick={() => onAccess?.(note)}
          style={{
            background: `linear-gradient(135deg, ${colors.accent} 0%, ${colors.accent}bb 100%)`,
            color: '#000', fontWeight: '900', border: 'none',
            boxShadow: `0 3px 10px ${colors.glow}`
          }}
        >
          <Download size={14} /> Open
        </a>
      </div>
    </article>
  );
}
