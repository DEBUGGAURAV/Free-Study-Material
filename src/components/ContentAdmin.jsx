import React, { useState } from 'react';
import { 
  FileText, Pencil, Search, ShieldCheck, Trash2, Eye, EyeOff, 
  Users, Shield, Lock, AlertCircle, Sparkles, KeyRound, Award, 
  UserCheck, ShieldAlert, Cpu, CheckCircle2 
} from 'lucide-react';
import { AdminNoteForm, EditPublishedNoteModal } from './UploadForms';

const notePermissionOptions = [
  { key: 'uploadNotes', label: 'Upload / Publish', icon: '📤' },
  { key: 'editNotes', label: 'Edit Content', icon: '✏️' },
  { key: 'deleteNotes', label: 'Delete Records', icon: '🗑️' },
  { key: 'reviewNotes', label: 'Approve & Reject', icon: '🛡️' },
];

const statusTone = { approved: 'mint', pending: '', rejected: 'pink' };

/* Shared notes list used by both the full admin and content admins. */
export function NoteQueue({ notes = [], folders, can, onEditNote, onDeleteNote, onNoteStatus }) {
  const [filter, setFilter] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState(null);

  const matches = (notes || []).filter((note) => `${note.title || ''} ${note.year || ''} ${note.subject || ''} ${note.author || ''} ${note.status || ''}`.toLowerCase().includes(filter.trim().toLowerCase()));
  const visible = showAll ? matches : matches.slice(0, 7);

  return (
    <div className="admin-table">
      <div className="table-title">
        <div>
          <span className="eyebrow" style={{ color: 'var(--accent-cyan)' }}>⚡ CONTENT MODERATION QUEUE</span>
          <h2 style={{ color: 'var(--text-pure)' }}>
            Pending & Published Notes
          </h2>
        </div>
        <div className="search-inline">
          <Search size={16} />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search queue by title, year, author..." />
        </div>
      </div>

      {visible.map((note) => (
        <div key={note.id} className="table-row">
          <span className={`file-dot ${statusTone[note.status] ?? ''}`}><FileText size={20} /></span>
          <div className="row-name">
            <b style={{ color: 'var(--text-pure)', fontSize: '1rem', fontWeight: 600 }}>
              {note.title}
            </b>
            <small style={{ color: '#94a3b8', display: 'block', marginTop: '3px' }}>
              {note.year} • {note.subject} • by {note.author}
            </small>
          </div>
          <div className="user-row-actions">
            <span className={`pill ${note.status === 'approved' ? 'pill-ok' : note.status === 'rejected' ? 'pill-bad' : 'pill-wait'}`}>
              {note.status}
            </span>
            {note.status === 'pending' && can.review && <>
              <button className="button compact-button" onClick={() => onNoteStatus(note.id, 'approved')}>Approve</button>
              <button className="button danger-button compact-button" onClick={() => onNoteStatus(note.id, 'rejected')}>Reject</button>
            </>}
            {can.edit && <button className="button button-ghost compact-button" onClick={() => setEditing(note)} aria-label={`Edit ${note.title}`}><Pencil size={14} /></button>}
            {can.delete && <button className="button danger-button compact-button" onClick={() => onDeleteNote(note)} aria-label={`Delete ${note.title}`}><Trash2 size={14} /></button>}
          </div>
        </div>
      ))}
      {matches.length === 0 && <div className="empty-state" style={{ color: '#94a3b8' }}>No notes found matching the filter.</div>}
      {matches.length > 7 && (
        <div className="center-row" style={{ marginTop: 18 }}>
          <button className="button button-ghost compact-button" onClick={() => setShowAll((shown) => !shown)}>
            {showAll ? 'Show fewer' : `Show all ${matches.length} notes`}
          </button>
        </div>
      )}

      {editing && <EditPublishedNoteModal note={editing} folders={folders} canChangeFolder onClose={() => setEditing(null)} onSave={onEditNote} />}
    </div>
  );
}

/* Admin-only: choose which note powers each user gets. Ultra-Creative & High-Tech Cyber-Luxe Revamp. */
export function ContentAdminManager({ users = [], canApproveAdminRequests, onSavePermissions }) {
  const [filter, setFilter] = useState('');
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState('');
  const [showHiddenAdmins, setShowHiddenAdmins] = useState(true);
  const [showAllUsers, setShowAllUsers] = useState(false);
  const [roleTab, setRoleTab] = useState('all'); // 'all' | 'content_admin' | 'student' | 'admin' | 'blocked'

  // Pre-calculate counts
  const adminUsers = users.filter((u) => u.role === 'admin');
  const contentAdmins = users.filter((u) => u.role === 'content_admin' || (u.permissions && Object.values(u.permissions).some(Boolean)));
  const regularStudents = users.filter((u) => u.role !== 'admin' && u.role !== 'content_admin' && (!u.permissions || !Object.values(u.permissions).some(Boolean)));
  const blockedUsers = users.filter((u) => u.blocked);

  // Filter users based on search, role tab, and hidden admin toggle
  const filteredUsers = users.filter((user) => {
    if (!showHiddenAdmins && user.role === 'admin') return false;
    if (roleTab === 'admin' && user.role !== 'admin') return false;
    if (roleTab === 'content_admin' && (user.role !== 'content_admin' && (!user.permissions || !Object.values(user.permissions).some(Boolean)))) return false;
    if (roleTab === 'student' && (user.role === 'admin' || user.role === 'content_admin' || (user.permissions && Object.values(user.permissions).some(Boolean)))) return false;
    if (roleTab === 'blocked' && !user.blocked) return false;

    if (!filter.trim()) return true;
    const term = filter.trim().toLowerCase();
    return [user.name, user.email, user.role].some((v) => String(v || '').toLowerCase().includes(term));
  });

  // Limit to 10 users by default
  const visibleUsers = showAllUsers ? filteredUsers : filteredUsers.slice(0, 10);

  const draftFor = (user) => drafts[user.id] || { 
    permissions: { ...(user.permissions || {}) }, 
    fullAdmin: user.role === 'admin' 
  };

  const update = (user, next) => setDrafts((current) => ({ ...current, [user.id]: { ...draftFor(user), ...next } }));
  const toggle = (user, key) => update(user, { permissions: { ...draftFor(user).permissions, [key]: !draftFor(user).permissions[key] } });
  
  const save = async (user) => {
    setSavingId(user.id);
    const { permissions, fullAdmin } = draftFor(user);
    await onSavePermissions(user.id, permissions, fullAdmin);
    setSavingId('');
  };

  return (
    <section className="page-width" style={{ paddingTop: 0 }}>
      {/* Outer Executive Cyber-Glass Card */}
      <div style={{
        position: 'relative',
        background: 'linear-gradient(145deg, rgba(17, 24, 39, 0.92) 0%, rgba(15, 23, 42, 0.96) 50%, rgba(30, 27, 75, 0.75) 100%)',
        border: '1.5px solid rgba(0, 242, 254, 0.35)',
        borderRadius: '24px',
        padding: '36px 32px',
        boxShadow: '0 25px 60px rgba(0, 0, 0, 0.7), 0 0 40px rgba(0, 242, 254, 0.15)',
        backdropFilter: 'blur(20px)',
        overflow: 'hidden'
      }}>
        {/* Ambient Top Aurora Accents */}
        <div style={{
          position: 'absolute', top: '-100px', right: '-100px', width: '300px', height: '300px',
          background: 'radial-gradient(circle, rgba(0, 242, 254, 0.18) 0%, transparent 70%)',
          borderRadius: '50%', pointerEvents: 'none'
        }} />
        <div style={{
          position: 'absolute', bottom: '-80px', left: '-80px', width: '260px', height: '260px',
          background: 'radial-gradient(circle, rgba(192, 132, 252, 0.15) 0%, transparent 70%)',
          borderRadius: '50%', pointerEvents: 'none'
        }} />

        {/* Master Header Section */}
        <div style={{ position: 'relative', zIndex: 1, marginBottom: '26px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '20px' }}>
            <div>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                padding: '4px 14px', borderRadius: '30px',
                background: 'linear-gradient(135deg, rgba(0, 242, 254, 0.18) 0%, rgba(192, 132, 252, 0.18) 100%)',
                border: '1px solid rgba(0, 242, 254, 0.4)',
                fontSize: '0.78rem', fontWeight: '900', letterSpacing: '1px', textTransform: 'uppercase',
                color: '#00f2fe', marginBottom: '10px'
              }}>
                <Cpu size={14} /> ACCESS POWERS & PRIVILEGES MATRIX
              </div>

              <h2 style={{
                fontSize: 'clamp(2rem, 4vw, 2.8rem)',
                fontWeight: '900',
                letterSpacing: '-0.03em',
                lineHeight: '1.1',
                margin: '0 0 8px',
                background: 'linear-gradient(135deg, #00f2fe 0%, #38bdf8 45%, #c084fc 80%, #facc15 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                filter: 'drop-shadow(0 0 25px rgba(0, 242, 254, 0.3))'
              }}>
                Content Admins & Permissions
              </h2>

              <p style={{ color: '#94a3b8', fontSize: '0.96rem', margin: 0, maxWidth: '620px' }}>
                Delegate granular permissions to students and moderate content moderators across your academic community.
              </p>
            </div>

            {/* Quick Live Stats Pill Rack */}
            <div style={{
              display: 'flex', gap: '8px', flexWrap: 'wrap',
              background: 'rgba(15, 23, 42, 0.8)',
              padding: '8px 12px', borderRadius: '16px',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)'
            }}>
              <div style={{ textAlign: 'center', padding: '4px 10px' }}>
                <span style={{ display: 'block', fontSize: '1.15rem', fontWeight: '900', color: '#00f2fe' }}>{users.length}</span>
                <small style={{ color: '#64748b', fontSize: '0.7rem', fontWeight: '800', textTransform: 'uppercase' }}>Total</small>
              </div>
              <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }} />
              <div style={{ textAlign: 'center', padding: '4px 10px' }}>
                <span style={{ display: 'block', fontSize: '1.15rem', fontWeight: '900', color: '#38bdf8' }}>{contentAdmins.length}</span>
                <small style={{ color: '#64748b', fontSize: '0.7rem', fontWeight: '800', textTransform: 'uppercase' }}>⚡ Admins</small>
              </div>
              <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }} />
              <div style={{ textAlign: 'center', padding: '4px 10px' }}>
                <span style={{ display: 'block', fontSize: '1.15rem', fontWeight: '900', color: '#fbbf24' }}>{adminUsers.length}</span>
                <small style={{ color: '#64748b', fontSize: '0.7rem', fontWeight: '800', textTransform: 'uppercase' }}>👑 Full</small>
              </div>
              <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }} />
              <div style={{ textAlign: 'center', padding: '4px 10px' }}>
                <span style={{ display: 'block', fontSize: '1.15rem', fontWeight: '900', color: '#10b981' }}>{regularStudents.length}</span>
                <small style={{ color: '#64748b', fontSize: '0.7rem', fontWeight: '800', textTransform: 'uppercase' }}>🎓 Students</small>
              </div>
            </div>
          </div>

          {/* Action & Filter Controls */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: '14px', marginTop: '24px'
          }}>
            {/* Search Input */}
            <div style={{
              position: 'relative', flex: '1 1 300px', maxWidth: '420px',
              display: 'flex', alignItems: 'center'
            }}>
              <Search size={18} style={{ position: 'absolute', left: '16px', color: '#00f2fe', pointerEvents: 'none' }} />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search by student name, college, email, or role..."
                style={{
                  margin: 0,
                  padding: '12px 16px 12px 46px',
                  background: 'rgba(15, 23, 42, 0.85)',
                  border: '1.5px solid rgba(0, 242, 254, 0.35)',
                  borderRadius: '12px',
                  color: '#e0f2fe',
                  fontSize: '0.9rem',
                  boxShadow: '0 4px 15px rgba(0, 0, 0, 0.3)'
                }}
              />
            </div>

            {/* Toggle Hidden Admin Users Button */}
            <button
              onClick={() => setShowHiddenAdmins((prev) => !prev)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                padding: '10px 18px', borderRadius: '12px',
                background: showHiddenAdmins
                  ? 'linear-gradient(135deg, rgba(0, 242, 254, 0.16) 0%, rgba(56, 189, 248, 0.12) 100%)'
                  : 'rgba(255, 255, 255, 0.05)',
                border: showHiddenAdmins
                  ? '1.5px solid rgba(0, 242, 254, 0.5)'
                  : '1.5px solid rgba(255, 255, 255, 0.15)',
                color: showHiddenAdmins ? '#00f2fe' : '#94a3b8',
                fontWeight: '800', fontSize: '0.86rem',
                cursor: 'pointer', transition: 'all 0.2s ease',
                boxShadow: showHiddenAdmins ? '0 0 15px rgba(0, 242, 254, 0.25)' : 'none'
              }}
              title="Toggle visibility of primary administrator users"
            >
              {showHiddenAdmins ? <Eye size={16} /> : <EyeOff size={16} />}
              <span>{showHiddenAdmins ? `Hide Full Admins (${adminUsers.length})` : `Show Hidden Admins (${adminUsers.length})`}</span>
            </button>
          </div>
        </div>

        {/* High-Tech Terminal Guidance Banner */}
        <div style={{
          position: 'relative', zIndex: 1,
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.85) 0%, rgba(30, 27, 75, 0.4) 100%)',
          border: '1px solid rgba(0, 242, 254, 0.35)',
          borderRadius: '14px',
          padding: '14px 20px',
          marginBottom: '22px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: '12px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem', color: '#e0f2fe' }}>
            <Sparkles size={18} style={{ color: '#00f2fe', flexShrink: 0 }} />
            <span>
              <strong>Security Protocol:</strong> Showing top 10 users by default. Use role filters or the bottom <em>"Show All"</em> toggle to grant permissions.
            </span>
          </div>
          {!canApproveAdminRequests && (
            <small style={{ color: '#94a3b8', fontSize: '0.82rem' }}>
              👑 Promoting to Full Admin triggers primary root review.
            </small>
          )}
        </div>

        {/* Segmented Cyber-Tabs Dock */}
        <div style={{
          position: 'relative', zIndex: 1,
          display: 'flex', gap: '8px', flexWrap: 'wrap',
          marginBottom: '22px', paddingBottom: '14px',
          borderBottom: '1.5px solid rgba(255, 255, 255, 0.1)'
        }}>
          {[
            { id: 'all', label: `All Users (${users.length})`, color: '#00f2fe' },
            { id: 'content_admin', label: `⚡ Content Admins (${contentAdmins.length})`, color: '#38bdf8' },
            { id: 'student', label: `🎓 Students (${regularStudents.length})`, color: '#10b981' },
            { id: 'admin', label: `👑 Full Admins (${adminUsers.length})`, color: '#fbbf24' },
            ...(blockedUsers.length > 0 ? [{ id: 'blocked', label: `🚫 Blocked (${blockedUsers.length})`, color: '#f43f5e' }] : [])
          ].map((tab) => {
            const isActive = roleTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setRoleTab(tab.id);
                  if (tab.id === 'admin') setShowHiddenAdmins(true);
                }}
                style={{
                  padding: '8px 18px',
                  borderRadius: '10px',
                  fontSize: '0.88rem',
                  fontWeight: '800',
                  cursor: 'pointer',
                  transition: 'all 0.18s ease',
                  border: isActive ? `1.5px solid ${tab.color}` : '1px solid rgba(255, 255, 255, 0.12)',
                  background: isActive ? `linear-gradient(135deg, ${tab.color}25 0%, ${tab.color}10 100%)` : 'rgba(255, 255, 255, 0.04)',
                  color: isActive ? tab.color : '#94a3b8',
                  boxShadow: isActive ? `0 0 15px ${tab.color}35` : 'none',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* User Identity Cards Grid */}
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {visibleUsers.map((user) => {
            const draft = draftFor(user);
            const isUserAdmin = user.role === 'admin';
            const isUserContentAdmin = user.role === 'content_admin' || (user.permissions && Object.values(user.permissions).some(Boolean));

            // Theme colors per role
            const accent = isUserAdmin ? '#fbbf24' : isUserContentAdmin ? '#00f2fe' : '#38bdf8';
            const glowColor = isUserAdmin ? 'rgba(251, 191, 36, 0.22)' : isUserContentAdmin ? 'rgba(0, 242, 254, 0.2)' : 'rgba(56, 189, 248, 0.12)';
            const cardBg = isUserAdmin
              ? 'linear-gradient(135deg, rgba(30, 27, 75, 0.7) 0%, rgba(20, 20, 30, 0.95) 100%)'
              : isUserContentAdmin
                ? 'linear-gradient(135deg, rgba(14, 30, 56, 0.8) 0%, rgba(15, 23, 42, 0.96) 100%)'
                : 'linear-gradient(135deg, rgba(20, 30, 52, 0.7) 0%, rgba(15, 23, 42, 0.95) 100%)';

            const initials = (user.name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

            return (
              <div
                key={user.id}
                style={{
                  position: 'relative',
                  background: cardBg,
                  border: `1.5px solid ${accent}44`,
                  borderRadius: '18px',
                  padding: '22px 24px',
                  boxShadow: `0 8px 25px rgba(0, 0, 0, 0.45), 0 0 18px ${glowColor}`,
                  overflow: 'hidden',
                  transition: 'all 0.2s ease',
                }}
              >
                {/* Lateral Laser Stripe */}
                <div style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0,
                  width: '5px', borderRadius: '18px 0 0 18px',
                  background: `linear-gradient(180deg, ${accent} 0%, ${accent}44 100%)`,
                  boxShadow: `0 0 12px ${accent}`
                }} />

                {/* Corner Glow Halos */}
                <div style={{
                  position: 'absolute', top: '-40px', right: '-40px',
                  width: '140px', height: '140px',
                  background: `radial-gradient(circle, ${glowColor} 0%, transparent 70%)`,
                  borderRadius: '50%', pointerEvents: 'none'
                }} />

                {/* Identity Header: Avatar + User Info + Action Button */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', paddingLeft: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: '1 1 300px' }}>
                    {/* Cyber Avatar Badge */}
                    <div style={{
                      width: '48px', height: '48px', borderRadius: '14px', flexShrink: 0,
                      background: `linear-gradient(135deg, ${accent} 0%, ${accent}77 100%)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#0f172a', fontWeight: '900', fontSize: '1.05rem',
                      boxShadow: `0 0 18px ${glowColor}`,
                      border: `2px solid ${accent}88`
                    }}>
                      {initials}
                    </div>

                    {/* Name, Badges, and Details */}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                        <span style={{
                          fontSize: '1.15rem',
                          fontWeight: '900',
                          letterSpacing: '-0.2px',
                          background: isUserAdmin
                            ? 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)'
                            : 'linear-gradient(135deg, #00f2fe 0%, #38bdf8 50%, #c084fc 100%)',
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                        }}>
                          {user.name || 'Unnamed student'}
                        </span>

                        {isUserAdmin && (
                          <span style={{
                            background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                            color: '#0f172a', fontSize: '0.72rem', fontWeight: '900',
                            padding: '3px 10px', borderRadius: '20px', letterSpacing: '0.4px',
                            boxShadow: '0 0 10px rgba(245, 158, 11, 0.4)'
                          }}>
                            👑 Full Admin
                          </span>
                        )}
                        {!isUserAdmin && isUserContentAdmin && (
                          <span style={{
                            background: 'linear-gradient(135deg, #00f2fe 0%, #38bdf8 100%)',
                            color: '#0f172a', fontSize: '0.72rem', fontWeight: '900',
                            padding: '3px 10px', borderRadius: '20px', letterSpacing: '0.4px',
                            boxShadow: '0 0 10px rgba(0, 242, 254, 0.4)'
                          }}>
                            ⚡ Content Admin
                          </span>
                        )}
                        {user.blocked && (
                          <span style={{
                            background: 'linear-gradient(135deg, #f43f5e 0%, #fb7185 100%)',
                            color: '#ffe4e6', fontSize: '0.72rem', fontWeight: '900',
                            padding: '3px 10px', borderRadius: '20px', letterSpacing: '0.4px'
                          }}>
                            🚫 Blocked
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <small style={{ color: '#94a3b8', fontSize: '0.86rem' }}>
                          {user.email}
                        </small>
                        {user.year && (
                          <span style={{
                            background: `${accent}22`, color: accent, fontSize: '0.74rem',
                            fontWeight: '800', padding: '2px 8px', borderRadius: '8px',
                            border: `1px solid ${accent}44`
                          }}>
                            {user.year}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Save Access Button */}
                  <button
                    disabled={savingId === user.id}
                    onClick={() => save(user)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '8px',
                      padding: '10px 22px', borderRadius: '12px', border: 'none',
                      background: savingId === user.id
                        ? 'rgba(255, 255, 255, 0.1)'
                        : 'linear-gradient(135deg, #00f2fe 0%, #38bdf8 50%, #818cf8 100%)',
                      color: savingId === user.id ? '#94a3b8' : '#0f172a',
                      fontWeight: '900', fontSize: '0.88rem', cursor: 'pointer',
                      boxShadow: savingId === user.id ? 'none' : '0 4px 18px rgba(0, 242, 254, 0.45)',
                      transition: 'all 0.18s ease', whiteSpace: 'nowrap'
                    }}
                  >
                    {savingId === user.id ? '⏳ Syncing…' : '💾 Save Powers'}
                  </button>
                </div>

                {/* Interactive Cyber-Permission Tiles */}
                <div style={{
                  display: 'flex', flexWrap: 'wrap', gap: '8px',
                  marginTop: '16px', paddingTop: '16px', paddingLeft: '8px',
                  borderTop: `1px solid ${accent}22`
                }}>
                  {notePermissionOptions.map(({ key, label, icon }) => {
                    const isChecked = draft.fullAdmin || draft.permissions[key] === true;
                    return (
                      <label
                        key={key}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '8px',
                          padding: '7px 14px', borderRadius: '10px',
                          cursor: draft.fullAdmin ? 'not-allowed' : 'pointer',
                          fontSize: '0.84rem', fontWeight: '800',
                          transition: 'all 0.15s ease',
                          opacity: draft.fullAdmin ? 0.65 : 1,
                          background: isChecked ? `${accent}25` : 'rgba(0, 0, 0, 0.35)',
                          color: isChecked ? accent : '#94a3b8',
                          border: isChecked ? `1.5px solid ${accent}77` : '1px solid rgba(255, 255, 255, 0.1)',
                          boxShadow: isChecked ? `0 0 12px ${accent}25` : 'none'
                        }}
                      >
                        <input
                          type="checkbox"
                          disabled={draft.fullAdmin}
                          checked={isChecked}
                          onChange={() => toggle(user, key)}
                          style={{ accentColor: accent, width: '15px', height: '15px', cursor: 'pointer' }}
                        />
                        <span>{icon} {label}</span>
                      </label>
                    );
                  })}

                  {/* Make Full Admin VIP Gold Tile */}
                  <label style={{
                    display: 'inline-flex', alignItems: 'center', gap: '8px',
                    padding: '7px 14px', borderRadius: '10px', cursor: 'pointer',
                    fontSize: '0.84rem', fontWeight: '900', transition: 'all 0.15s ease',
                    background: draft.fullAdmin
                      ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.3) 0%, rgba(251, 191, 36, 0.2) 100%)'
                      : 'rgba(0, 0, 0, 0.35)',
                    color: draft.fullAdmin ? '#fbbf24' : '#94a3b8',
                    border: draft.fullAdmin ? '1.5px solid #fbbf24' : '1px solid rgba(255, 255, 255, 0.1)',
                    boxShadow: draft.fullAdmin ? '0 0 15px rgba(245, 158, 11, 0.35)' : 'none'
                  }}>
                    <input
                      type="checkbox"
                      checked={draft.fullAdmin}
                      onChange={() => update(user, { fullAdmin: !draft.fullAdmin })}
                      style={{ accentColor: '#fbbf24', width: '15px', height: '15px', cursor: 'pointer' }}
                    />
                    <span>👑 Grant Full Admin Matrix</span>
                  </label>
                </div>
              </div>
            );
          })}
        </div>

        {/* Master Show All / Show Fewer Executive Button */}
        {filteredUsers.length > 10 && (
          <div style={{ textAlign: 'center', marginTop: '32px', position: 'relative', zIndex: 1 }}>
            <button
              onClick={() => setShowAllUsers((prev) => !prev)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '12px',
                padding: '14px 34px',
                borderRadius: '50px',
                border: showAllUsers
                  ? '2px solid rgba(255, 255, 255, 0.25)'
                  : '2px solid rgba(0, 242, 254, 0.7)',
                background: showAllUsers
                  ? 'rgba(255, 255, 255, 0.08)'
                  : 'linear-gradient(135deg, rgba(0, 242, 254, 0.22) 0%, rgba(192, 132, 252, 0.22) 100%)',
                color: showAllUsers ? '#94a3b8' : '#00f2fe',
                fontWeight: '900',
                fontSize: '0.94rem',
                cursor: 'pointer',
                boxShadow: showAllUsers
                  ? 'none'
                  : '0 0 30px rgba(0, 242, 254, 0.35), 0 6px 20px rgba(0, 0, 0, 0.4)',
                transition: 'all 0.22s ease',
                letterSpacing: '0.4px',
                backdropFilter: 'blur(10px)',
              }}
            >
              {showAllUsers ? (
                <>
                  <span style={{
                    width: '8px', height: '8px', borderRadius: '50%',
                    background: '#94a3b8', display: 'inline-block', flexShrink: 0
                  }} />
                  Show Fewer (Top 10 Users)
                </>
              ) : (
                <>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    minWidth: '28px', height: '28px', padding: '0 8px', borderRadius: '50px',
                    background: 'linear-gradient(135deg, #00f2fe 0%, #38bdf8 100%)',
                    color: '#0f172a', fontWeight: '900', fontSize: '0.82rem', flexShrink: 0
                  }}>
                    {filteredUsers.length}
                  </span>
                  <span>Show All {filteredUsers.length} Users</span>
                </>
              )}
            </button>
          </div>
        )}

        {filteredUsers.length === 0 && (
          <div className="empty-state" style={{ color: '#94a3b8', marginTop: '20px' }}>
            No users match the selected query and filters.
          </div>
        )}
      </div>
    </section>
  );
}

/* Content admins (non-full admins): only the tools their permissions allow. */
export function ContentAdminView({ folders, notes, permissions, onCreateNote, onEditNote, onDeleteNote, onNoteStatus }) {
  const can = { upload: permissions.uploadNotes === true, edit: permissions.editNotes === true, delete: permissions.deleteNotes === true, review: permissions.reviewNotes === true };

  return (
    <section className="page-width">
      <header className="view-head">
        <div>
          <span className="eyebrow" style={{ color: '#00f2fe' }}>content tools</span>
          <h1 className="view-title">Curate the<br />library.</h1>
        </div>
      </header>
      {can.upload && <div className="grid-2" style={{ gridTemplateColumns: 'minmax(0, 560px)' }}><AdminNoteForm folders={folders} onSubmit={onCreateNote} /></div>}
      <NoteQueue notes={notes} folders={folders} can={can} onEditNote={onEditNote} onDeleteNote={onDeleteNote} onNoteStatus={onNoteStatus} />
    </section>
  );
}
