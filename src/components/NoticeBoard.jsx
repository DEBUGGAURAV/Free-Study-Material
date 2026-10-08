import React, { useState, useMemo } from 'react';
import { 
  Sparkles, Trash2, Edit3, MessageSquare, Pin, Bell, Flame, 
  Search, ShieldAlert, ShieldCheck, Radio, CheckCircle2, 
  Send, X, Clock, Layers, Filter, AlertTriangle, Megaphone,
  Pencil, Check, RotateCcw, ExternalLink, ArrowUpRight, Link2, Plus
} from 'lucide-react';

const URL_REGEX = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s]|www\.[^\s<]+[^<.,:;"')\]\s])/gi;

export function extractFirstUrl(text) {
  if (!text) return '';
  const match = String(text).match(URL_REGEX);
  if (!match) return '';
  const url = match[0];
  return url.startsWith('http') ? url : `https://${url}`;
}

export function FormattedNoticeMessage({ text }) {
  if (!text) return null;
  const raw = String(text);
  const parts = [];
  let lastIndex = 0;
  let match;
  const regex = new RegExp(URL_REGEX.source, 'gi');

  while ((match = regex.exec(raw)) !== null) {
    if (match.index > lastIndex) {
      parts.push(raw.slice(lastIndex, match.index));
    }
    const rawUrl = match[0];
    const href = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;
    parts.push(
      <a
        key={match.index}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '2px 8px',
          margin: '0 3px',
          borderRadius: 'var(--radius-xs)',
          background: 'rgba(56, 189, 248, 0.12)',
          border: '1px solid rgba(56, 189, 248, 0.3)',
          color: 'var(--accent-cyan)',
          fontWeight: 600,
          fontSize: '0.84rem',
          textDecoration: 'none',
          verticalAlign: 'baseline'
        }}
        title={`Open link: ${href}`}
        onClick={(e) => e.stopPropagation()}
      >
        <span>Open Link</span> <ArrowUpRight size={13} />
      </a>
    );
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < raw.length) {
    parts.push(raw.slice(lastIndex));
  }

  return <>{parts}</>;
}

export default function NoticeBoard({ notices = [], canManage, isAdmin, onCreateNotice, onDeleteNotice, onEditNotice }) {
  const [draft, setDraft] = useState({ title: '', message: '', type: 'general', link: '' });
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all' | 'general' | 'exam' | 'alert'
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({ title: '', message: '', type: 'general', link: '' });

  const hasManagementRights = canManage || isAdmin;

  // Filtered notices
  const filteredNotices = useMemo(() => {
    return notices.filter(n => {
      if (!n) return false;
      if (filterType !== 'all' && n.type !== filterType) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return `${n.title || ''} ${n.message || ''}`.toLowerCase().includes(q);
      }
      return true;
    });
  }, [notices, filterType, searchQuery]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!draft.title.trim() || !draft.message.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (onCreateNotice) {
        await onCreateNotice({
          title: draft.title.trim(),
          message: draft.message.trim(),
          type: draft.type,
          link: draft.link.trim() || extractFirstUrl(draft.message),
          createdAt: new Date().toISOString()
        });
      }
      setDraft({ title: '', message: '', type: 'general', link: '' });
      setIsComposerOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveEdit = async (id) => {
    if (!editDraft.title.trim() || !editDraft.message.trim()) return;
    if (onEditNotice) {
      await onEditNotice(id, {
        title: editDraft.title.trim(),
        message: editDraft.message.trim(),
        type: editDraft.type,
        link: editDraft.link.trim()
      });
    }
    setEditingId(null);
  };

  return (
    <div className="noticeboard-container">
      {/* Header bar */}
      <div className="notice-header-bar">
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '4px 12px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: 'var(--radius-full)', fontSize: '0.78rem', fontWeight: 600, color: '#fbbf24', marginBottom: '10px' }}>
            <Bell size={14} />
            <span>Campus Live Bulletin & Official Notices</span>
          </div>
          <h2 style={{ fontSize: 'clamp(1.8rem, 3vw, 2.4rem)' }}>
            Notice Board
          </h2>
        </div>

        {hasManagementRights && (
          <button 
            className="button button-primary"
            onClick={() => setIsComposerOpen(!isComposerOpen)}
          >
            <Plus size={18} />
            <span>Post New Notice</span>
          </button>
        )}
      </div>

      {/* Composer modal / expandable form */}
      {isComposerOpen && (
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-card)',
          borderRadius: 'var(--radius-xl)',
          padding: '28px',
          marginBottom: '32px',
          backdropFilter: 'blur(20px)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '1.2rem' }}>Post Official Announcement</h3>
            <button onClick={() => setIsComposerOpen(false)} style={{ color: 'var(--text-dim)' }}>
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Notice Headline *</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. End-Semester Examination Schedule Declared"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Notice Category</label>
                <select
                  className="form-select"
                  value={draft.type}
                  onChange={(e) => setDraft({ ...draft, type: e.target.value })}
                >
                  <option value="general" style={{ background: '#0f172a' }}>📢 General Academic</option>
                  <option value="exam" style={{ background: '#0f172a' }}>📝 Examination & Datesheet</option>
                  <option value="alert" style={{ background: '#0f172a' }}>🚨 Urgent Deadline / Alert</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Reference Link (Optional)</label>
                <input
                  type="url"
                  className="form-input"
                  placeholder="https://..."
                  value={draft.link}
                  onChange={(e) => setDraft({ ...draft, link: e.target.value })}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Detailed Announcement *</label>
              <textarea
                className="form-textarea"
                rows="4"
                placeholder="Write announcement body..."
                value={draft.message}
                onChange={(e) => setDraft({ ...draft, message: e.target.value })}
                required
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button 
                type="button" 
                className="button button-ghost"
                onClick={() => setIsComposerOpen(false)}
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="button button-primary"
                disabled={isSubmitting}
              >
                <Send size={16} />
                <span>Publish Notice</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {['all', 'general', 'exam', 'alert'].map(type => (
            <button
              key={type}
              className={`year-pill ${filterType === type ? 'active' : ''}`}
              onClick={() => setFilterType(type)}
            >
              {type === 'all' ? 'All Notices' : type === 'exam' ? 'Exams' : type === 'alert' ? 'Alerts' : 'General'}
            </button>
          ))}
        </div>

        <div className="search-input-wrapper" style={{ maxWidth: '360px' }}>
          <Search size={16} className="search-input-icon" />
          <input
            type="text"
            className="search-input"
            style={{ height: '42px' }}
            placeholder="Search notices..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Notices List */}
      {filteredNotices.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--bg-card)', borderRadius: 'var(--radius-xl)', border: '1px dashed var(--border-card)' }}>
          <Bell size={40} style={{ color: 'var(--text-dim)', margin: '0 auto 14px' }} />
          <h3>No notices found</h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>There are no announcements matching your current filter.</p>
        </div>
      ) : (
        filteredNotices.map((notice) => {
          const isUrgent = notice.type === 'alert';
          const isExam = notice.type === 'exam';
          const isEditing = editingId === notice.id;

          return (
            <div 
              key={notice.id || notice.title}
              className={`notice-card ${isUrgent ? 'pinned' : ''}`}
            >
              {isEditing ? (
                /* Edit Mode */
                <div>
                  <input
                    type="text"
                    className="form-input"
                    value={editDraft.title}
                    onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })}
                    style={{ marginBottom: '12px' }}
                  />
                  <textarea
                    className="form-textarea"
                    rows="3"
                    value={editDraft.message}
                    onChange={(e) => setEditDraft({ ...editDraft, message: e.target.value })}
                    style={{ marginBottom: '12px' }}
                  />
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button className="button button-ghost compact-button" onClick={() => setEditingId(null)}>Cancel</button>
                    <button className="button button-primary compact-button" onClick={() => handleSaveEdit(notice.id)}>Save Changes</button>
                  </div>
                </div>
              ) : (
                /* Display Mode */
                <div>
                  <div className="notice-top-meta">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className={`badge ${isUrgent ? 'notice-tag-urgent' : isExam ? 'notice-tag-exam' : 'notice-tag-general'}`}>
                        {isUrgent ? '🚨 URGENT ALERT' : isExam ? '📝 EXAM NOTICE' : '📢 GENERAL'}
                      </span>
                      {notice.pinned && (
                        <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24' }}>
                          <Pin size={11} /> PINNED
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                      <span>{notice.createdAt ? new Date(notice.createdAt).toLocaleDateString() : 'Recent'}</span>

                      {hasManagementRights && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <button 
                            onClick={() => {
                              setEditingId(notice.id);
                              setEditDraft({ title: notice.title, message: notice.message, type: notice.type || 'general', link: notice.link || '' });
                            }}
                            title="Edit Notice"
                            style={{ color: 'var(--text-muted)', padding: '4px' }}
                          >
                            <Pencil size={14} />
                          </button>
                          <button 
                            onClick={() => onDeleteNotice?.(notice.id)}
                            title="Delete Notice"
                            style={{ color: '#fb7185', padding: '4px' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <h3 style={{ fontSize: '1.2rem', marginBottom: '10px', color: 'var(--text-pure)' }}>
                    {notice.title}
                  </h3>

                  <p style={{ fontSize: '0.94rem', color: 'var(--text-main)', lineHeight: 1.6, marginBottom: notice.link ? '14px' : '0' }}>
                    <FormattedNoticeMessage text={notice.message} />
                  </p>

                  {notice.link && (
                    <div style={{ marginTop: '12px' }}>
                      <a 
                        href={notice.link.startsWith('http') ? notice.link : `https://${notice.link}`} 
                        target="_blank" 
                        rel="noreferrer"
                        className="button button-secondary compact-button"
                        style={{ display: 'inline-flex', gap: '6px' }}
                      >
                        <ExternalLink size={14} />
                        <span>Open Attachment / Resource</span>
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
