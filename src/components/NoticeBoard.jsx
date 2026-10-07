import React, { useState, useMemo } from 'react';
import { 
  Sparkles, Trash2, Edit3, MessageSquare, Pin, Bell, Flame, 
  Search, ShieldAlert, ShieldCheck, Radio, CheckCircle2, 
  Send, X, Clock, Layers, Filter, AlertTriangle, Megaphone, Terminal,
  Pencil, Check, RotateCcw, ExternalLink, ArrowUpRight, Link2, Globe
} from 'lucide-react';

// Regex to capture web links (http, https, www)
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
          borderRadius: '6px',
          background: 'linear-gradient(135deg, rgba(0, 242, 254, 0.22) 0%, rgba(56, 189, 248, 0.28) 100%)',
          border: '1px solid rgba(0, 242, 254, 0.55)',
          color: '#00f2fe',
          fontWeight: '800',
          fontSize: '0.86rem',
          textDecoration: 'none',
          verticalAlign: 'baseline',
          boxShadow: '0 0 10px rgba(0, 242, 254, 0.25)',
          transition: 'all 0.15s ease'
        }}
        title={`Open link: ${href}`}
        onClick={(e) => e.stopPropagation()}
      >
        Click Here <ArrowUpRight size={13} />
      </a>
    );
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < raw.length) {
    parts.push(raw.slice(lastIndex));
  }

  return <>{parts}</>;
}

export default function NoticeBoard({ notices = [], canManage, onCreateNotice, onDeleteNotice, onEditNotice }) {
  const [draft, setDraft] = useState({ title: '', message: '', type: 'general', link: '' });
  const [showAll, setShowAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all' | 'general' | 'alert'
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // In-place edit state for notices
  const [editingNoticeId, setEditingNoticeId] = useState(null);
  const [editDraft, setEditDraft] = useState({ title: '', message: '', type: 'general', link: '' });
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const presetTopics = [
    '📝 Mid-term Exam Notice',
    '📚 New Question Banks Uploaded',
    '⏰ Crucial Submission Deadline',
    '📢 Department Directive',
    '🎉 Campus Event Announcement'
  ];

  const submit = async (e) => {
    e.preventDefault();
    if (!draft.title.trim() || !draft.message.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const detectedLink = draft.link?.trim() || extractFirstUrl(draft.message);
      const saved = await onCreateNotice({ 
        title: draft.title.trim(), 
        message: draft.message.trim(),
        type: draft.type || 'general',
        link: detectedLink
      });
      if (saved) {
        setDraft({ title: '', message: '', type: 'general', link: '' });
        setIsComposerOpen(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEditing = (notice) => {
    setEditingNoticeId(notice.id);
    setEditDraft({
      title: notice.title || '',
      message: notice.message || '',
      type: notice.type || 'general',
      link: notice.link || extractFirstUrl(notice.message) || ''
    });
  };

  const cancelEditing = () => {
    setEditingNoticeId(null);
    setEditDraft({ title: '', message: '', type: 'general', link: '' });
  };

  const handleSaveEdit = async (e, id) => {
    e.preventDefault();
    if (!editDraft.title.trim() || !editDraft.message.trim() || isSavingEdit) return;
    if (!onEditNotice) return;
    setIsSavingEdit(true);
    try {
      const detectedLink = editDraft.link?.trim() || extractFirstUrl(editDraft.message);
      const success = await onEditNotice(id, {
        title: editDraft.title.trim(),
        message: editDraft.message.trim(),
        type: editDraft.type || 'general',
        link: detectedLink
      });
      if (success) {
        setEditingNoticeId(null);
      }
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Filtered notices based on search query and category filter
  const filteredNotices = useMemo(() => {
    return notices.filter((notice) => {
      const matchesType = filterType === 'all' || 
        (filterType === 'alert' ? notice.type === 'alert' : notice.type !== 'alert');
      
      if (!matchesType) return false;
      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase();
      const titleMatch = (notice.title || '').toLowerCase().includes(q);
      const msgMatch = (notice.message || '').toLowerCase().includes(q);
      return titleMatch || msgMatch;
    });
  }, [notices, filterType, searchQuery]);

  const visibleNotices = showAll ? filteredNotices : filteredNotices.slice(0, 3);

  const alertCount = useMemo(() => notices.filter(n => n.type === 'alert').length, [notices]);
  const generalCount = notices.length - alertCount;

  return (
    <section className="page-width" style={{ maxWidth: 1040, paddingBottom: 60 }}>
      {/* ===== EXECUTIVE CYBER HERO HEADER ===== */}
      <div style={{
        position: 'relative',
        borderRadius: '24px',
        padding: 'clamp(20px, 4vw, 36px) clamp(16px, 3.5vw, 32px)',
        background: 'linear-gradient(145deg, rgba(16, 26, 48, 0.95) 0%, rgba(10, 18, 36, 0.98) 100%)',
        border: '1.5px solid rgba(0, 242, 254, 0.35)',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6), 0 0 30px rgba(0, 242, 254, 0.1)',
        marginBottom: '32px',
        overflow: 'hidden'
      }}>
        {/* Ambient Top Laser Strip */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '4px',
          background: 'linear-gradient(90deg, #00f2fe 0%, #38bdf8 40%, #c084fc 80%, #f43f5e 100%)',
          boxShadow: '0 0 15px #00f2fe'
        }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '20px' }}>
          <div>
            {/* Holographic Badge */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <span style={{
                width: '9px',
                height: '9px',
                borderRadius: '50%',
                background: '#00f2fe',
                boxShadow: '0 0 10px #00f2fe',
                animation: 'beaconPulse 1.6s infinite'
              }} />
              <span style={{
                fontSize: '0.76rem',
                fontWeight: '900',
                letterSpacing: '1px',
                textTransform: 'uppercase',
                background: 'linear-gradient(135deg, #00f2fe 0%, #38bdf8 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}>
                BROADCAST MATRIX // ENCRYPTED LIVE FEED
              </span>
            </div>

            <h1 style={{
              fontSize: 'clamp(2.2rem, 4.5vw, 3.2rem)',
              margin: '0 0 10px',
              fontWeight: '900',
              lineHeight: 1.1,
              letterSpacing: '-0.03em',
              background: 'linear-gradient(135deg, #00f2fe 0%, #38bdf8 45%, #c084fc 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              Campus Notice Board
            </h1>
            <p style={{
              margin: 0,
              color: '#cbd5e1',
              fontSize: '1.02rem',
              maxWidth: '560px',
              lineHeight: 1.55
            }}>
              High-velocity transmission suite for examination alerts, curriculum drops, faculty schedules, and official notices.
            </p>
          </div>

          {/* Header Action Button */}
          {canManage && (
            <button
              onClick={() => setIsComposerOpen(prev => !prev)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
                padding: '13px 22px',
                borderRadius: '14px',
                background: isComposerOpen
                  ? 'rgba(255, 255, 255, 0.08)'
                  : 'linear-gradient(135deg, #00f2fe 0%, #38bdf8 100%)',
                border: isComposerOpen ? '1.5px solid rgba(255, 255, 255, 0.2)' : 'none',
                color: isComposerOpen ? '#e0f2fe' : '#041726',
                fontWeight: '900',
                fontSize: '0.92rem',
                cursor: 'pointer',
                boxShadow: isComposerOpen ? 'none' : '0 4px 20px rgba(0, 242, 254, 0.45)',
                transition: 'all 0.2s ease',
                transform: 'translateY(0)'
              }}
            >
              {isComposerOpen ? (
                <>
                  <X size={17} /> Close Composer
                </>
              ) : (
                <>
                  <Edit3 size={17} /> + Broadcast New Notice
                </>
              )}
            </button>
          )}
        </div>

        {/* Telemetry Stats Strip */}
        <div style={{
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          flexWrap: 'wrap',
          marginTop: '26px',
          paddingTop: '20px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          {/* Active Signals Count */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 14px',
            borderRadius: '12px',
            background: 'rgba(0, 242, 254, 0.1)',
            border: '1.5px solid rgba(0, 242, 254, 0.35)',
            color: '#00f2fe',
            fontSize: '0.82rem',
            fontWeight: '800'
          }}>
            <Sparkles size={14} /> Active Signals: {notices.length}
          </div>

          {/* Urgent Alerts Count */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 14px',
            borderRadius: '12px',
            background: 'rgba(244, 63, 94, 0.1)',
            border: '1.5px solid rgba(244, 63, 94, 0.35)',
            color: '#fb7185',
            fontSize: '0.82rem',
            fontWeight: '800'
          }}>
            <AlertTriangle size={14} /> Critical Alerts: {alertCount}
          </div>

          {/* 5-Day Auto-Purge */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 14px',
            borderRadius: '12px',
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1.5px solid rgba(245, 158, 11, 0.35)',
            color: '#fbbf24',
            fontSize: '0.82rem',
            fontWeight: '800'
          }}>
            <Flame size={14} /> 5-Day Ephemeral Retention
          </div>

          {/* Channel Integrity */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 14px',
            borderRadius: '12px',
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1.5px solid rgba(16, 185, 129, 0.35)',
            color: '#34d399',
            fontSize: '0.82rem',
            fontWeight: '800',
            marginLeft: 'auto'
          }}>
            <ShieldCheck size={14} /> Official Verified Directives
          </div>
        </div>
      </div>

      {/* ===== BROADCAST COMMAND COMPOSER (ADMIN ONLY) ===== */}
      {canManage && isComposerOpen && (
        <div style={{
          background: 'linear-gradient(145deg, rgba(18, 28, 52, 0.98) 0%, rgba(12, 20, 38, 0.99) 100%)',
          border: '1.8px solid rgba(0, 242, 254, 0.45)',
          borderRadius: '22px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.7), 0 0 35px rgba(0, 242, 254, 0.18)',
          marginBottom: '36px',
          padding: '28px 30px',
          animation: 'slideDownCardForm 0.25s cubic-bezier(0.16, 1, 0.3, 1) both'
        }}>
          {/* Composer Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: 'rgba(0, 242, 254, 0.15)',
                border: '1.5px solid rgba(0, 242, 254, 0.4)',
                display: 'grid',
                placeItems: 'center',
                color: '#00f2fe'
              }}>
                <Megaphone size={20} />
              </div>
              <div>
                <h3 style={{
                  margin: 0,
                  fontSize: '1.3rem',
                  fontWeight: '800',
                  background: 'linear-gradient(135deg, #00f2fe 0%, #38bdf8 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent'
                }}>
                  Broadcast Command Terminal
                </h3>
                <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
                  Transmit notices instantly across all student dashboards with real-time HUD notification
                </span>
              </div>
            </div>

            <button
              onClick={() => setIsComposerOpen(false)}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#94a3b8',
                borderRadius: '8px',
                width: '32px',
                height: '32px',
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer'
              }}
            >
              <X size={16} />
            </button>
          </div>

          <form onSubmit={submit}>
            {/* Notice Type Selector */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '800', color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                Signal Priority Channel
              </label>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setDraft(prev => ({ ...prev, type: 'general' }))}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 16px',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: '800',
                    transition: 'all 0.15s ease',
                    background: draft.type === 'general' ? 'rgba(0, 242, 254, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                    border: draft.type === 'general' ? '1.5px solid #00f2fe' : '1px solid rgba(255, 255, 255, 0.1)',
                    color: draft.type === 'general' ? '#00f2fe' : '#94a3b8'
                  }}
                >
                  <Sparkles size={15} /> ⚡ Official Bulletin (Standard)
                </button>

                <button
                  type="button"
                  onClick={() => setDraft(prev => ({ ...prev, type: 'alert' }))}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 16px',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: '800',
                    transition: 'all 0.15s ease',
                    background: draft.type === 'alert' ? 'rgba(244, 63, 94, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                    border: draft.type === 'alert' ? '1.5px solid #f43f5e' : '1px solid rgba(255, 255, 255, 0.1)',
                    color: draft.type === 'alert' ? '#fb7185' : '#94a3b8'
                  }}
                >
                  <AlertTriangle size={15} /> 🚨 Urgent Alert / Critical Directive
                </button>
              </div>
            </div>

            {/* Quick Presets */}
            <div style={{ marginBottom: '18px' }}>
              <span style={{ fontSize: '0.78rem', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
                Quick Title Presets (click to insert):
              </span>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {presetTopics.map((topic, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setDraft(prev => ({ ...prev, title: topic }))}
                    style={{
                      background: 'rgba(0, 242, 254, 0.06)',
                      border: '1px solid rgba(0, 242, 254, 0.2)',
                      color: '#cbd5e1',
                      borderRadius: '8px',
                      padding: '4px 10px',
                      fontSize: '0.76rem',
                      fontWeight: '700',
                      cursor: 'pointer'
                    }}
                  >
                    {topic}
                  </button>
                ))}
              </div>
            </div>

            {/* Title Field */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '800', color: '#e0f2fe', marginBottom: '6px' }}>
                Announcement Headline
              </label>
              <input
                required
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="e.g. Mid-term Question Papers & Formula Sheets Now Uploaded..."
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  background: 'rgba(10, 18, 34, 0.9)',
                  border: '1.5px solid rgba(0, 242, 254, 0.3)',
                  color: '#e0f2fe',
                  fontSize: '0.96rem',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Message Field */}
            <div style={{ marginBottom: '22px' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '800', color: '#e0f2fe', marginBottom: '6px' }}>
                Broadcast Message Content
              </label>
              <textarea
                required
                rows={4}
                value={draft.message}
                onChange={(e) => setDraft({ ...draft, message: e.target.value })}
                placeholder="Type complete update details, schedules, download instructions, or guidance for students and admins..."
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  background: 'rgba(10, 18, 34, 0.9)',
                  border: '1.5px solid rgba(0, 242, 254, 0.3)',
                  color: '#e0f2fe',
                  fontSize: '0.94rem',
                  lineHeight: '1.5',
                  outline: 'none',
                  boxSizing: 'border-box',
                  resize: 'vertical'
                }}
              />
            </div>

            {/* Action / Document Link Field */}
            <div style={{ marginBottom: '22px' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '800', color: '#e0f2fe', marginBottom: '6px' }}>
                Attachment / Action Link <span style={{ color: '#94a3b8', fontWeight: '500' }}>(Optional — e.g. Google Drive, Exam Form, Web Link)</span>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="url"
                  value={draft.link || ''}
                  onChange={(e) => setDraft({ ...draft, link: e.target.value })}
                  placeholder="https://drive.google.com/... or https://forms.gle/..."
                  style={{
                    width: '100%',
                    padding: '12px 16px 12px 38px',
                    borderRadius: '12px',
                    background: 'rgba(10, 18, 34, 0.9)',
                    border: '1.5px solid rgba(0, 242, 254, 0.3)',
                    color: '#e0f2fe',
                    fontSize: '0.94rem',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
                <Link2 size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#38bdf8' }} />
              </div>
              <small style={{ color: '#94a3b8', fontSize: '0.78rem', display: 'block', marginTop: '6px' }}>
                💡 <b>Smart Link Feature:</b> You can paste a link here OR directly in the message text. It will automatically show as a modern <b>"Click Here"</b> button for students!
              </small>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => setDraft({ title: '', message: '', type: 'general' })}
                style={{
                  padding: '10px 18px',
                  borderRadius: '10px',
                  background: 'transparent',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#94a3b8',
                  fontSize: '0.88rem',
                  fontWeight: '700',
                  cursor: 'pointer'
                }}
              >
                Clear Form
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '11px 26px',
                  borderRadius: '12px',
                  background: draft.type === 'alert'
                    ? 'linear-gradient(135deg, #f43f5e 0%, #fb7185 100%)'
                    : 'linear-gradient(135deg, #00f2fe 0%, #38bdf8 100%)',
                  border: 'none',
                  color: draft.type === 'alert' ? '#ffe4e6' : '#041726',
                  fontSize: '0.92rem',
                  fontWeight: '900',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  boxShadow: draft.type === 'alert'
                    ? '0 4px 20px rgba(244, 63, 94, 0.5)'
                    : '0 4px 20px rgba(0, 242, 254, 0.45)',
                  opacity: isSubmitting ? 0.7 : 1
                }}
              >
                <Send size={16} /> {isSubmitting ? 'Transmitting...' : 'Transmit Broadcast'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===== CONTROLS & FILTER BAR ===== */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px',
        marginBottom: '26px'
      }}>
        {/* Search Bar */}
        <div style={{
          position: 'relative',
          flex: '1',
          minWidth: 'min(100%, 260px)',
          maxWidth: '460px'
        }}>
          <Search size={17} style={{
            position: 'absolute',
            left: '14px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#00f2fe'
          }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search dispatches by headline or text..."
            style={{
              width: '100%',
              padding: '11px 16px 11px 42px',
              borderRadius: '12px',
              background: 'rgba(15, 23, 42, 0.85)',
              border: '1.5px solid rgba(0, 242, 254, 0.3)',
              color: '#e0f2fe',
              fontSize: '0.88rem',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center'
              }}
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => setFilterType('all')}
            style={{
              padding: '8px 16px',
              borderRadius: '10px',
              fontSize: '0.82rem',
              fontWeight: '800',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              background: filterType === 'all' ? 'linear-gradient(135deg, rgba(0, 242, 254, 0.25) 0%, rgba(56, 189, 248, 0.15) 100%)' : 'rgba(255, 255, 255, 0.04)',
              border: filterType === 'all' ? '1.5px solid #00f2fe' : '1px solid rgba(255, 255, 255, 0.1)',
              color: filterType === 'all' ? '#00f2fe' : '#94a3b8'
            }}
          >
            All Signals ({notices.length})
          </button>

          <button
            onClick={() => setFilterType('general')}
            style={{
              padding: '8px 16px',
              borderRadius: '10px',
              fontSize: '0.82rem',
              fontWeight: '800',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              background: filterType === 'general' ? 'linear-gradient(135deg, rgba(56, 189, 248, 0.25) 0%, rgba(0, 242, 254, 0.15) 100%)' : 'rgba(255, 255, 255, 0.04)',
              border: filterType === 'general' ? '1.5px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
              color: filterType === 'general' ? '#38bdf8' : '#94a3b8'
            }}
          >
            Bulletins ({generalCount})
          </button>

          <button
            onClick={() => setFilterType('alert')}
            style={{
              padding: '8px 16px',
              borderRadius: '10px',
              fontSize: '0.82rem',
              fontWeight: '800',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              background: filterType === 'alert' ? 'linear-gradient(135deg, rgba(244, 63, 94, 0.25) 0%, rgba(251, 113, 133, 0.15) 100%)' : 'rgba(255, 255, 255, 0.04)',
              border: filterType === 'alert' ? '1.5px solid #f43f5e' : '1px solid rgba(255, 255, 255, 0.1)',
              color: filterType === 'alert' ? '#fb7185' : '#94a3b8'
            }}
          >
            Alerts ({alertCount})
          </button>
        </div>
      </div>

      {/* ===== NOTICES FEED ===== */}
      <div style={{ display: 'grid', gap: '20px' }}>
        {visibleNotices.length > 0 ? (
          visibleNotices.map((notice) => {
            const isAlert = notice.type === 'alert';
            const isEditingThis = editingNoticeId === notice.id;
            const postDate = notice.createdAt ? new Date(notice.createdAt) : new Date();
            const timeStr = postDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
            const dateStr = postDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
            
            // Ephemeral days calculation (standard 5-day cycle)
            const remainingDays = Math.max(1, Math.min(5, Math.ceil((Number(notice.expiresAt || 0) - Date.now()) / 86400000)));

            return (
              <article
                key={notice.id}
                style={{
                  position: 'relative',
                  borderRadius: '20px',
                  background: 'linear-gradient(145deg, rgba(16, 26, 48, 0.95) 0%, rgba(10, 18, 36, 0.98) 100%)',
                  border: isAlert ? '1.5px solid rgba(244, 63, 94, 0.55)' : '1.5px solid rgba(0, 242, 254, 0.35)',
                  boxShadow: isAlert
                    ? '0 12px 35px rgba(244, 63, 94, 0.2), 0 0 20px rgba(244, 63, 94, 0.1)'
                    : '0 12px 35px rgba(0, 0, 0, 0.5), 0 0 20px rgba(0, 242, 254, 0.1)',
                  overflow: 'hidden',
                  transition: 'transform 0.2s ease, border-color 0.2s ease'
                }}
              >
                {/* Top Ambient Laser Line */}
                <div style={{
                  height: '3px',
                  width: '100%',
                  background: isAlert
                    ? 'linear-gradient(90deg, #f43f5e 0%, #fb7185 50%, #fda4af 100%)'
                    : 'linear-gradient(90deg, #00f2fe 0%, #38bdf8 50%, #c084fc 100%)',
                  boxShadow: isAlert ? '0 0 10px #f43f5e' : '0 0 10px #00f2fe'
                }} />

                {/* Telemetry Header Bar */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 20px',
                  background: isAlert ? 'rgba(244, 63, 94, 0.06)' : 'rgba(0, 242, 254, 0.05)',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                  flexWrap: 'wrap',
                  gap: '10px'
                }}>
                  {/* Left: Signal Type + Radar Beacon */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                    <span style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: isAlert ? '#f43f5e' : '#00f2fe',
                      boxShadow: isAlert ? '0 0 8px #f43f5e' : '0 0 8px #00f2fe',
                      animation: 'beaconPulse 1.6s infinite'
                    }} />
                    <span style={{
                      fontSize: '0.74rem',
                      fontWeight: '900',
                      letterSpacing: '0.8px',
                      textTransform: 'uppercase',
                      color: isAlert ? '#fb7185' : '#00f2fe'
                    }}>
                      {isAlert ? '🚨 CRITICAL ALERT DIRECTIVE' : '⚡ OFFICIAL CAMPUS BROADCAST'}
                    </span>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: '8px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: '#94a3b8',
                      fontSize: '0.68rem',
                      fontWeight: '700'
                    }}>
                      PUBLIC ACCESS
                    </span>
                  </div>

                  {/* Right: Timestamp + Retention + Admin Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {/* Timestamp Pill */}
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '3px 9px',
                      borderRadius: '12px',
                      background: 'rgba(0, 242, 254, 0.08)',
                      border: '1px solid rgba(0, 242, 254, 0.2)',
                      color: '#38bdf8',
                      fontSize: '0.72rem',
                      fontWeight: '700'
                    }}>
                      <Clock size={12} /> {dateStr} • {timeStr}
                    </span>

                    {/* Auto-Purge Badge */}
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '3px 9px',
                      borderRadius: '12px',
                      background: 'rgba(245, 158, 11, 0.08)',
                      border: '1px solid rgba(245, 158, 11, 0.25)',
                      color: '#fbbf24',
                      fontSize: '0.72rem',
                      fontWeight: '700'
                    }}>
                      <Flame size={12} /> Purges in {remainingDays}d
                    </span>

                    {/* Admin Actions: Edit & Delete */}
                    {canManage && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        {/* Edit Button */}
                        <button
                          type="button"
                          onClick={() => isEditingThis ? cancelEditing() : startEditing(notice)}
                          title={isEditingThis ? 'Close edit form' : 'Edit notice broadcast'}
                          style={{
                            background: isEditingThis ? 'rgba(0, 242, 254, 0.3)' : 'rgba(0, 242, 254, 0.12)',
                            border: isEditingThis ? '1.5px solid #00f2fe' : '1px solid rgba(0, 242, 254, 0.35)',
                            color: '#00f2fe',
                            borderRadius: '8px',
                            width: '28px',
                            height: '28px',
                            display: 'grid',
                            placeItems: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <Pencil size={13} />
                        </button>

                        {/* Delete Button */}
                        <button
                          type="button"
                          onClick={() => onDeleteNotice(notice.id)}
                          title="Delete notice from board"
                          style={{
                            background: 'rgba(244, 63, 94, 0.12)',
                            border: '1px solid rgba(244, 63, 94, 0.3)',
                            color: '#fb7185',
                            borderRadius: '8px',
                            width: '28px',
                            height: '28px',
                            display: 'grid',
                            placeItems: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Notice Main Content OR In-place Edit Form */}
                {isEditingThis ? (
                  /* IN-PLACE NOTICE EDIT FORM */
                  <form
                    onSubmit={(e) => handleSaveEdit(e, notice.id)}
                    style={{
                      padding: '24px',
                      background: 'linear-gradient(145deg, rgba(14, 24, 46, 0.99) 0%, rgba(10, 16, 32, 0.99) 100%)',
                      borderTop: '1px solid rgba(0, 242, 254, 0.25)',
                      animation: 'slideDownCardForm 0.2s ease both'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Pencil size={16} style={{ color: '#00f2fe' }} />
                        <span style={{ fontSize: '0.85rem', fontWeight: '800', color: '#00f2fe', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                          Modify Signal Broadcast
                        </span>
                      </div>

                      {/* Type Switcher */}
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          type="button"
                          onClick={() => setEditDraft(prev => ({ ...prev, type: 'general' }))}
                          style={{
                            padding: '5px 12px',
                            borderRadius: '8px',
                            fontSize: '0.78rem',
                            fontWeight: '800',
                            cursor: 'pointer',
                            background: editDraft.type === 'general' ? 'rgba(0, 242, 254, 0.25)' : 'rgba(255, 255, 255, 0.04)',
                            border: editDraft.type === 'general' ? '1.5px solid #00f2fe' : '1px solid rgba(255, 255, 255, 0.1)',
                            color: editDraft.type === 'general' ? '#00f2fe' : '#94a3b8'
                          }}
                        >
                          ⚡ Standard
                        </button>

                        <button
                          type="button"
                          onClick={() => setEditDraft(prev => ({ ...prev, type: 'alert' }))}
                          style={{
                            padding: '5px 12px',
                            borderRadius: '8px',
                            fontSize: '0.78rem',
                            fontWeight: '800',
                            cursor: 'pointer',
                            background: editDraft.type === 'alert' ? 'rgba(244, 63, 94, 0.25)' : 'rgba(255, 255, 255, 0.04)',
                            border: editDraft.type === 'alert' ? '1.5px solid #f43f5e' : '1px solid rgba(255, 255, 255, 0.1)',
                            color: editDraft.type === 'alert' ? '#fb7185' : '#94a3b8'
                          }}
                        >
                          🚨 Urgent Alert
                        </button>
                      </div>
                    </div>

                    {/* Headline Input */}
                    <div style={{ marginBottom: '14px' }}>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '800', color: '#e0f2fe', marginBottom: '5px' }}>
                        Broadcast Headline
                      </label>
                      <input
                        required
                        value={editDraft.title}
                        onChange={(e) => setEditDraft(prev => ({ ...prev, title: e.target.value }))}
                        placeholder="Enter notice headline..."
                        style={{
                          width: '100%',
                          padding: '10px 14px',
                          borderRadius: '10px',
                          background: 'rgba(8, 14, 28, 0.95)',
                          border: '1.5px solid rgba(0, 242, 254, 0.4)',
                          color: '#e0f2fe',
                          fontSize: '0.94rem',
                          outline: 'none',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>

                    {/* Message Input */}
                    <div style={{ marginBottom: '18px' }}>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '800', color: '#e0f2fe', marginBottom: '5px' }}>
                        Notice Content
                      </label>
                      <textarea
                        required
                        rows={3}
                        value={editDraft.message}
                        onChange={(e) => setEditDraft(prev => ({ ...prev, message: e.target.value }))}
                        placeholder="Enter broadcast message..."
                        style={{
                          width: '100%',
                          padding: '10px 14px',
                          borderRadius: '10px',
                          background: 'rgba(8, 14, 28, 0.95)',
                          border: '1.5px solid rgba(0, 242, 254, 0.4)',
                          color: '#e0f2fe',
                          fontSize: '0.92rem',
                          lineHeight: '1.55',
                          outline: 'none',
                          boxSizing: 'border-box',
                          resize: 'vertical'
                        }}
                      />
                    </div>

                    {/* Action / Attachment Link Input */}
                    <div style={{ marginBottom: '18px' }}>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '800', color: '#e0f2fe', marginBottom: '5px' }}>
                        Attachment / Action Link <span style={{ color: '#94a3b8', fontWeight: '500' }}>(Optional)</span>
                      </label>
                      <div style={{ position: 'relative' }}>
                        <input
                          type="url"
                          value={editDraft.link || ''}
                          onChange={(e) => setEditDraft(prev => ({ ...prev, link: e.target.value }))}
                          placeholder="https://drive.google.com/... or https://forms.gle/..."
                          style={{
                            width: '100%',
                            padding: '10px 14px 10px 36px',
                            borderRadius: '10px',
                            background: 'rgba(8, 14, 28, 0.95)',
                            border: '1.5px solid rgba(0, 242, 254, 0.4)',
                            color: '#e0f2fe',
                            fontSize: '0.92rem',
                            outline: 'none',
                            boxSizing: 'border-box'
                          }}
                        />
                        <Link2 size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#38bdf8' }} />
                      </div>
                    </div>

                    {/* Edit Form Actions */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                      <button
                        type="button"
                        onClick={cancelEditing}
                        style={{
                          padding: '8px 16px',
                          borderRadius: '8px',
                          background: 'rgba(255, 255, 255, 0.06)',
                          border: '1px solid rgba(255, 255, 255, 0.15)',
                          color: '#94a3b8',
                          fontSize: '0.84rem',
                          fontWeight: '700',
                          cursor: 'pointer'
                        }}
                      >
                        Cancel
                      </button>

                      <button
                        type="submit"
                        disabled={isSavingEdit}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '8px 22px',
                          borderRadius: '8px',
                          background: editDraft.type === 'alert'
                            ? 'linear-gradient(135deg, #f43f5e 0%, #fb7185 100%)'
                            : 'linear-gradient(135deg, #00f2fe 0%, #38bdf8 100%)',
                          border: 'none',
                          color: editDraft.type === 'alert' ? '#ffe4e6' : '#041726',
                          fontSize: '0.85rem',
                          fontWeight: '900',
                          cursor: isSavingEdit ? 'not-allowed' : 'pointer',
                          boxShadow: '0 4px 15px rgba(0, 242, 254, 0.35)',
                          opacity: isSavingEdit ? 0.7 : 1
                        }}
                      >
                        <Check size={14} /> {isSavingEdit ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  </form>
                ) : (
                  /* NORMAL NOTICE CONTENT DISPLAY */
                  <div style={{ padding: '22px 24px', display: 'flex', gap: '18px', alignItems: 'flex-start' }}>
                    {/* Visual Pin / Signal Icon */}
                    <div style={{
                      width: '42px',
                      height: '42px',
                      minWidth: '42px',
                      borderRadius: '12px',
                      background: isAlert ? 'rgba(244, 63, 94, 0.14)' : 'rgba(0, 242, 254, 0.12)',
                      border: isAlert ? '1.5px solid rgba(244, 63, 94, 0.4)' : '1.5px solid rgba(0, 242, 254, 0.4)',
                      display: 'grid',
                      placeItems: 'center',
                      color: isAlert ? '#fb7185' : '#00f2fe',
                      boxShadow: isAlert ? '0 4px 15px rgba(244, 63, 94, 0.25)' : '0 4px 15px rgba(0, 242, 254, 0.2)'
                    }}>
                      {isAlert ? <AlertTriangle size={20} /> : <Pin size={20} />}
                    </div>

                    {/* Headline & Body Text */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{
                        fontSize: '1.3rem',
                        margin: '0 0 10px',
                        fontWeight: '800',
                        letterSpacing: '-0.02em',
                        lineHeight: 1.25,
                        background: isAlert
                          ? 'linear-gradient(135deg, #fb7185 0%, #f43f5e 100%)'
                          : 'linear-gradient(135deg, #00f2fe 0%, #38bdf8 60%, #c084fc 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent'
                      }}>
                        {notice.title}
                      </h3>

                      {/* Framed Speech Callout for Message */}
                      <div style={{
                        background: 'rgba(0, 0, 0, 0.25)',
                        borderLeft: isAlert ? '3px solid #f43f5e' : '3px solid #00f2fe',
                        padding: '12px 16px',
                        borderRadius: '0 10px 10px 0',
                        marginBottom: '14px'
                      }}>
                        <p style={{
                          color: '#cbd5e1',
                          fontSize: '0.96rem',
                          lineHeight: '1.65',
                          margin: 0,
                          whiteSpace: 'pre-line'
                        }}>
                          <FormattedNoticeMessage text={notice.message} />
                        </p>
                      </div>

                      {/* Prominent Action Button for Links ("Click Here to Open Link") */}
                      {(notice.link || extractFirstUrl(notice.message)) && (() => {
                        const targetUrl = notice.link || extractFirstUrl(notice.message);
                        const href = targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`;
                        return (
                          <div style={{ marginBottom: '14px' }}>
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '10px 20px',
                                borderRadius: '12px',
                                background: isAlert
                                  ? 'linear-gradient(135deg, rgba(244, 63, 94, 0.25) 0%, rgba(251, 113, 133, 0.3) 100%)'
                                  : 'linear-gradient(135deg, rgba(0, 242, 254, 0.22) 0%, rgba(56, 189, 248, 0.28) 100%)',
                                border: isAlert
                                  ? '1.5px solid rgba(244, 63, 94, 0.65)'
                                  : '1.5px solid rgba(0, 242, 254, 0.65)',
                                color: isAlert ? '#ffe4e6' : '#e0f2fe',
                                fontWeight: '900',
                                fontSize: '0.92rem',
                                textDecoration: 'none',
                                boxShadow: isAlert
                                  ? '0 4px 18px rgba(244, 63, 94, 0.35)'
                                  : '0 4px 18px rgba(0, 242, 254, 0.3)',
                                transition: 'all 0.18s ease',
                                cursor: 'pointer'
                              }}
                              title={`Open target link: ${href}`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink size={16} style={{ color: isAlert ? '#fb7185' : '#00f2fe' }} />
                              <span>Click Here to Open Link</span>
                              <ArrowUpRight size={16} style={{ color: isAlert ? '#fb7185' : '#00f2fe' }} />
                            </a>
                          </div>
                        );
                      })()}

                      {/* Footer Dispatch Stamp */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '8px',
                        paddingTop: '8px',
                        fontSize: '0.78rem',
                        color: '#94a3b8'
                      }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#34d399' }}>
                          <CheckCircle2 size={13} /> Authenticated Campus Dispatch
                        </span>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          color: '#38bdf8',
                          fontFamily: 'monospace',
                          letterSpacing: '0.5px'
                        }}>
                          <Terminal size={12} /> #ACADEMIC_SIGNALS
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </article>
            );
          })
        ) : (
          /* Empty or No Match State */
          <div style={{
            textAlign: 'center',
            padding: '60px 24px',
            background: 'linear-gradient(145deg, rgba(16, 26, 48, 0.7) 0%, rgba(10, 18, 36, 0.7) 100%)',
            border: '1.5px dashed rgba(0, 242, 254, 0.3)',
            borderRadius: '24px'
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              margin: '0 auto 16px',
              borderRadius: '50%',
              background: 'rgba(0, 242, 254, 0.1)',
              border: '1.5px solid rgba(0, 242, 254, 0.35)',
              display: 'grid',
              placeItems: 'center',
              color: '#00f2fe',
              boxShadow: '0 0 20px rgba(0, 242, 254, 0.2)'
            }}>
              <Radio size={28} />
            </div>

            <h3 style={{
              margin: '0 0 8px',
              fontSize: '1.3rem',
              fontWeight: '800',
              background: 'linear-gradient(135deg, #00f2fe 0%, #38bdf8 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              {searchQuery ? 'No Matching Broadcasts Found' : 'Channel Standby — No Active Dispatches'}
            </h3>

            <p style={{ color: '#cbd5e1', fontSize: '0.94rem', maxWidth: '440px', margin: '0 auto 18px', lineHeight: 1.5 }}>
              {searchQuery
                ? `No announcements match "${searchQuery}". Try a different keyword or reset filters.`
                : 'All broadcast channels are currently quiet. Admin directives and notices will beam in here.'}
            </p>

            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(''); setFilterType('all'); }}
                style={{
                  padding: '9px 20px',
                  borderRadius: '10px',
                  background: 'rgba(0, 242, 254, 0.15)',
                  border: '1.5px solid #00f2fe',
                  color: '#00f2fe',
                  fontWeight: '800',
                  fontSize: '0.84rem',
                  cursor: 'pointer'
                }}
              >
                Clear Search Filter
              </button>
            )}
          </div>
        )}
      </div>

      {/* ===== PAGINATION / EXPAND TOGGLE ===== */}
      {filteredNotices.length > 3 && (
        <div style={{ textAlign: 'center', marginTop: '34px' }}>
          <button
            onClick={() => setShowAll((prev) => !prev)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 30px',
              borderRadius: '50px',
              background: 'linear-gradient(135deg, rgba(0, 242, 254, 0.18) 0%, rgba(56, 189, 248, 0.12) 100%)',
              border: '1.5px solid rgba(0, 242, 254, 0.5)',
              color: '#00f2fe',
              fontWeight: '800',
              fontSize: '0.9rem',
              cursor: 'pointer',
              boxShadow: '0 0 25px rgba(0, 242, 254, 0.25)',
              transition: 'all 0.18s ease'
            }}
          >
            {showAll ? 'Show Latest 3 Broadcasts' : `Show All ${filteredNotices.length} Signals`}
          </button>
        </div>
      )}
    </section>
  );
}
