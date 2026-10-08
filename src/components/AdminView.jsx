import React, { useState, useMemo, useCallback } from 'react';
import { 
  Download, Folder, Pencil, Search, ShieldCheck, Trash2, Users, Cpu, Clock, 
  Layers, Sparkles, Calendar, Activity, LogOut, LogIn, FileDown, 
  ChevronDown, ChevronUp, UserCheck, Shield, Check, X, AlertCircle, Megaphone,
  Terminal, Database, Server, Radio, Zap, ArrowUpRight, BarChart3, TrendingUp, HardDrive, RefreshCw, Flame
} from 'lucide-react';
import DatabaseAdminPanel from './DatabaseAdminPanel';
import { FolderForm, AdminNoteForm } from './UploadForms';
import { NoteQueue } from './ContentAdmin';
import NoticeBoard from './NoticeBoard';
import { getAdminUserDetails, deleteUserActivityLog, deleteAllUserActivityLogs, purgeStaleNotes } from '../api';

export default function AdminView({
  users = [], notes = [], folders = [], token, roleRequests = [], canApproveAdminRequests = false,
  onRoleRequestDecision, onExport, onCreateFolder, onCreateNote,
  onNoteStatus, onBlock, onDelete, onDeleteAll, onEditFolder,
  onDeleteFolder, onEditNote, onDeleteNote, onUpdateUser,
  notices = [], onCreateNotice, onDeleteNotice, onEditNotice
}) {
  const [userFilter, setUserFilter] = useState('');
  const [showAllUsers, setShowAllUsers] = useState(false);
  const [adminTab, setAdminTab] = useState('overview'); // 'overview' | 'users' | 'content' | 'notices' | 'database'

  // User Edit State
  const [editingUser, setEditingUser] = useState(null);
  const [editFormData, setEditFormData] = useState({
    name: '', email: '', mobile: '', college: '', year: '', branch: '', course: '', role: 'student'
  });
  const [savingUser, setSavingUser] = useState(false);
  const [editError, setEditError] = useState('');

  // Activity & Audit Logs State
  const [expandedActivityUserId, setExpandedActivityUserId] = useState(null);
  const [userActivities, setUserActivities] = useState({});
  const [loadingActivity, setLoadingActivity] = useState(false);

  // Smart Space Management & Auto-Purge State
  const [purgeDays, setPurgeDays] = useState(30);
  const [isPurging, setIsPurging] = useState(false);
  const [purgeResult, setPurgeResult] = useState(null);

  const handleManualPurge = async (dryRun = false) => {
    if (!dryRun && !window.confirm(`Are you sure you want to purge stale files inactive for more than ${purgeDays} days? This will remove records and delete attached Telegram messages.`)) return;
    setIsPurging(true);
    setPurgeResult(null);
    try {
      const res = await purgeStaleNotes({ days: Number(purgeDays), dryRun }, token);
      setPurgeResult(res);
    } catch (err) {
      alert("Space purge error: " + (err.message || 'Failed to execute purge'));
    } finally {
      setIsPurging(false);
    }
  };

  const yearsList = ['1st year', '2nd year', '3rd year', '4th year'];

  const formatDate = (iso) => {
    if (!iso) return 'Not recorded';
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return String(iso);
      return d.toLocaleString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true
      });
    } catch (e) {
      return String(iso);
    }
  };

  const startEditUser = (user) => {
    if (editingUser?.id === user.id) {
      setEditingUser(null);
      return;
    }
    setEditingUser(user);
    setEditError('');
    setEditFormData({
      name: user.name || '',
      email: user.email || '',
      mobile: user.mobile || '',
      college: user.college || '',
      year: user.year || '1st year',
      branch: user.branch || '',
      course: user.course || user.branch || '',
      role: user.role || 'student'
    });
    setTimeout(() => {
      const el = document.getElementById(`student-row-${user.id}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 40);
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    if (!editingUser) return;
    setSavingUser(true);
    setEditError('');
    try {
      await onUpdateUser(editingUser.id, editFormData);
      setEditingUser(null);
    } catch (err) {
      setEditError(err.message || 'Failed to update user profile');
    } finally {
      setSavingUser(false);
    }
  };

  const toggleUserActivity = async (userId) => {
    if (expandedActivityUserId === userId) {
      setExpandedActivityUserId(null);
      return;
    }
    setExpandedActivityUserId(userId);
    if (!userActivities[userId]) {
      setLoadingActivity(true);
      try {
        const data = await getAdminUserDetails(userId, token);
        setUserActivities(prev => ({ ...prev, [userId]: data.activity || [] }));
      } catch (err) {
        console.error('Failed to load user activity:', err);
      } finally {
        setLoadingActivity(false);
      }
    }
  };

  const handleDeleteLog = async (userId, logId) => {
    if (!window.confirm('Permanently delete this specific activity log entry?')) return;
    try {
      await deleteUserActivityLog(userId, logId, token);
      setUserActivities(prev => ({
        ...prev,
        [userId]: (prev[userId] || []).filter(item => item.id !== logId)
      }));
    } catch (err) {
      alert('Failed to delete activity log: ' + err.message);
    }
  };

  const handleDeleteAllLogs = async (userId, userName) => {
    if (!window.confirm(`Permanently delete ALL activity logs for ${userName || 'this student'}? This cannot be undone.`)) return;
    try {
      await deleteAllUserActivityLogs(userId, token);
      setUserActivities(prev => ({
        ...prev,
        [userId]: []
      }));
    } catch (err) {
      alert('Failed to delete all activity logs: ' + err.message);
    }
  };

  const userMatchesQuery = useCallback((u, q) => {
    if (!q.trim()) return true;
    const lower = q.trim().toLowerCase();
    return [u.name, u.email, u.role, u.college, u.year, u.branch].some((val) => String(val || '').toLowerCase().includes(lower));
  }, []);

  const safeUsers = Array.isArray(users) ? users : [];
  const safeNotes = Array.isArray(notes) ? notes : [];
  const safeFolders = Array.isArray(folders) ? folders : [];
  const safeNotices = Array.isArray(notices) ? notices : [];
  const safeRoleRequests = Array.isArray(roleRequests) ? roleRequests : [];

  const filteredUsers = useMemo(() => {
    return safeUsers.filter((user) => userMatchesQuery(user, userFilter));
  }, [safeUsers, userFilter, userMatchesQuery]);

  const visibleUsers = useMemo(() => {
    return showAllUsers ? filteredUsers : filteredUsers.slice(0, 10);
  }, [showAllUsers, filteredUsers]);

  const pendingNotes = useMemo(() => {
    return safeNotes.filter((n) => n && n.status === 'pending');
  }, [safeNotes]);

  // Top Most Downloaded Notes (Ranked)
  const topDownloadedNotes = useMemo(() => {
    return [...safeNotes]
      .filter(n => n && (n.downloadCount || n.downloads || 0) >= 0)
      .sort((a, b) => (b.downloadCount || b.downloads || 0) - (a.downloadCount || a.downloads || 0))
      .slice(0, 6);
  }, [safeNotes]);

  return (
    <section className="page-width" style={{ padding: '32px 24px 60px' }}>
      {/* Executive Admin Header */}
      <header className="view-head" style={{ marginBottom: '32px' }}>
        <div>
          <span className="eyebrow" style={{ color: 'var(--accent-cyan)' }}>
            <Cpu size={16} /> ROOT SYSTEM CONTROL & TELEMETRY
          </span>
          <h1 className="view-title" style={{ fontSize: 'clamp(2rem, 3.5vw, 2.8rem)' }}>
            Administrative Center
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginTop: '6px' }}>
            Academic resource management, user access control, and storage telemetry.
          </p>
        </div>
        <button
          className="button button-primary compact-button"
          onClick={onExport}
          style={{ padding: '12px 22px' }}
        >
          <Download size={16} /> Export Workbook
        </button>
      </header>

      {/* Cyber Metric Stats Grid */}
      <div className="stat-grid" style={{ marginBottom: '32px' }}>
        <div className="stat">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <small style={{ color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Users</small>
            <span style={{ color: 'var(--accent-cyan)', background: 'rgba(56, 189, 248, 0.12)', padding: '6px', borderRadius: 'var(--radius-sm)' }}><Users size={18} /></span>
          </div>
          <strong style={{ fontSize: '2.4rem', color: 'var(--text-pure)', fontWeight: 800 }}>
            {safeUsers.length}
          </strong>
          <small style={{ color: 'var(--text-dim)', display: 'block', marginTop: '4px' }}>Active database profiles</small>
        </div>

        <div className="stat">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <small style={{ color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Subject Folders</small>
            <span style={{ color: '#c084fc', background: 'rgba(168, 85, 247, 0.12)', padding: '6px', borderRadius: 'var(--radius-sm)' }}><Folder size={18} /></span>
          </div>
          <strong style={{ fontSize: '2.4rem', color: 'var(--text-pure)', fontWeight: 800 }}>
            {safeFolders.length}
          </strong>
          <small style={{ color: 'var(--text-dim)', display: 'block', marginTop: '4px' }}>Curated academic rooms</small>
        </div>

        <div className="stat">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <small style={{ color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Review Queue</small>
            <span style={{ color: '#fbbf24', background: 'rgba(245, 158, 11, 0.12)', padding: '6px', borderRadius: 'var(--radius-sm)' }}><Clock size={18} /></span>
          </div>
          <strong style={{ fontSize: '2.4rem', color: 'var(--text-pure)', fontWeight: 800 }}>
            {pendingNotes.length}
          </strong>
          <small style={{ color: 'var(--text-dim)', display: 'block', marginTop: '4px' }}>Notes awaiting review</small>
        </div>

        <div className="stat">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <small style={{ color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active Notices</small>
            <span style={{ color: '#34d399', background: 'rgba(16, 185, 129, 0.12)', padding: '6px', borderRadius: 'var(--radius-sm)' }}><Megaphone size={18} /></span>
          </div>
          <strong style={{ fontSize: '2.4rem', color: 'var(--text-pure)', fontWeight: 800 }}>
            {safeNotices.length}
          </strong>
          <small style={{ color: 'var(--text-dim)', display: 'block', marginTop: '4px' }}>Campus broadcasts live</small>
        </div>
      </div>

      {/* 🚀 EXECUTIVE COMMAND DECK NAVIGATION BAR */}
      <div style={{
        display: 'flex', gap: '8px', padding: '6px', marginBottom: '32px',
        background: 'rgba(11, 18, 38, 0.7)', border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)', overflowX: 'auto', backdropFilter: 'blur(16px)'
      }}>
        {[
          { key: 'overview', label: 'All-in-One Dashboard', icon: BarChart3, badge: null },
          { key: 'users', label: 'Access Directory & Logs', icon: Users, badge: safeUsers.length },
          { key: 'content', label: 'Curated Folders & Notes', icon: Folder, badge: pendingNotes.length ? `${pendingNotes.length} Pending` : null },
          { key: 'notices', label: 'Campus Broadcaster', icon: Megaphone, badge: safeNotices.length },
          { key: 'database', label: 'Database Collections', icon: Database, badge: null }
        ].map(item => {
          const Icon = item.icon;
          const isActive = adminTab === item.key;
          return (
            <button
              key={item.key}
              onClick={() => setAdminTab(item.key)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                padding: '10px 18px', borderRadius: 'var(--radius-md)',
                background: isActive ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.25) 0%, rgba(56, 189, 248, 0.15) 100%)' : 'transparent',
                border: '1px solid ' + (isActive ? 'rgba(99, 102, 241, 0.5)' : 'transparent'),
                color: isActive ? 'var(--text-pure)' : 'var(--text-muted)',
                fontWeight: isActive ? '700' : '500',
                fontSize: '0.88rem', whiteSpace: 'nowrap',
                boxShadow: isActive ? '0 4px 14px rgba(0, 0, 0, 0.35)' : 'none',
                transition: 'all 0.2s ease', cursor: 'pointer'
              }}
            >
              <Icon size={16} />
              <span>{item.label}</span>
              {item.badge && (
                <span style={{
                  padding: '2px 8px', borderRadius: 'var(--radius-full)', fontSize: '0.72rem', fontWeight: '700',
                  background: isActive ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                  color: isActive ? 'var(--accent-cyan)' : 'var(--text-muted)'
                }}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 🏆 MOST DOWNLOADED NOTES LEADERBOARD & 🧹 SMART SPACE MANAGEMENT CONSOLE */}
      {(adminTab === 'overview' || adminTab === 'content') && (
        <div className="grid-2" style={{ marginBottom: '32px' }}>
          {/* Top Most Downloaded Notes Matrix */}
          <div className="admin-table" style={{
            background: 'linear-gradient(150deg, rgba(16, 26, 52, 0.95) 0%, rgba(9, 15, 34, 0.98) 100%)',
            border: '1.5px solid rgba(0, 242, 254, 0.35)', borderRadius: '20px', padding: '24px',
            boxShadow: '0 12px 36px rgba(0, 0, 0, 0.6), 0 0 20px rgba(0, 242, 254, 0.15)',
            marginBottom: 0
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
              <div>
                <span className="eyebrow" style={{ color: '#00f2fe' }}>
                  <TrendingUp size={14} /> LIVE ANALYTICS
                </span>
                <h3 style={{ fontSize: '1.4rem', color: '#f1f5f9', margin: '4px 0 0' }}>Most Downloaded Notes</h3>
              </div>
              <span className="chip" style={{ background: 'rgba(0, 242, 254, 0.12)', borderColor: 'rgba(0, 242, 254, 0.4)', color: '#00f2fe' }}>
                <Flame size={14} color="#facc15" /> Top Ranked
              </span>
            </div>

            {topDownloadedNotes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '28px 12px', color: '#94a3b8' }}>
                No downloads recorded yet. As students download notes via Telegram stream, rankings will appear here automatically.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {topDownloadedNotes.map((note, index) => {
                  const count = note.downloadCount || note.downloads || 0;
                  const rankColor = index === 0 ? '#facc15' : index === 1 ? '#00f2fe' : index === 2 ? '#34d399' : '#94a3b8';
                  return (
                    <div
                      key={note.id || index}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '12px 14px', borderRadius: '12px',
                        background: 'rgba(15, 23, 42, 0.75)', border: '1px solid rgba(255, 255, 255, 0.08)',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                        <span style={{
                          width: '28px', height: '28px', borderRadius: '8px',
                          background: index === 0 ? 'rgba(250, 204, 21, 0.2)' : 'rgba(0, 242, 254, 0.12)',
                          color: rankColor, fontWeight: '900', fontSize: '0.9rem',
                          display: 'grid', placeItems: 'center', flexShrink: 0
                        }}>
                          #{index + 1}
                        </span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <strong style={{ display: 'block', color: '#f1f5f9', fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {note.title}
                          </strong>
                          <small style={{ color: '#94a3b8', fontSize: '0.78rem' }}>
                            {note.subject} • {note.year || 'All Years'}
                          </small>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: '12px' }}>
                        <span style={{
                          padding: '3px 10px', borderRadius: '20px',
                          background: 'rgba(0, 242, 254, 0.15)', border: '1px solid rgba(0, 242, 254, 0.4)',
                          color: '#00f2fe', fontWeight: '800', fontSize: '0.8rem'
                        }}>
                          {count} {count === 1 ? 'dl' : 'dls'}
                        </span>
                        <a
                          href={note.driveLink || (note.id ? `/api/notes/${note.id}/download` : '#')}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            color: '#38bdf8', padding: '6px', borderRadius: '8px',
                            background: 'rgba(255, 255, 255, 0.06)', display: 'grid', placeItems: 'center'
                          }}
                          title="Open/Download Note"
                        >
                          <Download size={14} />
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 🧹 Smart Space Management & Old File Auto-Purge Console */}
          <div className="admin-table" style={{
            background: 'linear-gradient(150deg, rgba(20, 18, 42, 0.95) 0%, rgba(9, 15, 34, 0.98) 100%)',
            border: '1.5px solid rgba(192, 132, 252, 0.35)', borderRadius: '20px', padding: '24px',
            boxShadow: '0 12px 36px rgba(0, 0, 0, 0.6), 0 0 20px rgba(192, 132, 252, 0.15)',
            marginBottom: 0
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div>
                <span className="eyebrow" style={{ color: '#c084fc' }}>
                  <HardDrive size={14} /> SMART STORAGE & AUTO-EVICTION
                </span>
                <h3 style={{ fontSize: '1.4rem', color: '#f1f5f9', margin: '4px 0 0' }}>Storage Space Optimizer</h3>
              </div>
              <span className="chip" style={{ background: 'rgba(192, 132, 252, 0.15)', borderColor: 'rgba(192, 132, 252, 0.4)', color: '#c084fc' }}>
                LRU Policy Active
              </span>
            </div>

            <p style={{ color: '#94a3b8', fontSize: '0.88rem', lineHeight: '1.5', margin: '0 0 16px' }}>
              Cloudflare edge automatically caches fresh notes for 7 days. Use this controller to inspect or manually purge cold/stale files older than your selected retention window to keep Telegram topic threads pristine.
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px', flexWrap: 'wrap' }}>
              <label style={{ fontSize: '0.85rem', color: '#cbd5e1', fontWeight: '700' }}>
                Retention Window:
              </label>
              <select
                value={purgeDays}
                onChange={(e) => setPurgeDays(Number(e.target.value))}
                style={{
                  background: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(192, 132, 252, 0.5)',
                  color: '#f0fdfa', padding: '6px 12px', borderRadius: '10px', fontSize: '0.88rem', width: 'auto'
                }}
              >
                <option value={7}>7 Days (Aggressive Clean)</option>
                <option value={14}>14 Days (Bi-weekly)</option>
                <option value={30}>30 Days (Standard 1 Month)</option>
                <option value={60}>60 Days (Semester End)</option>
                <option value={90}>90 Days (Quarterly Clean)</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
              <button
                className="button button-ghost compact-button"
                onClick={() => handleManualPurge(true)}
                disabled={isPurging}
                style={{ border: '1px solid rgba(192, 132, 252, 0.5)', color: '#c084fc' }}
              >
                <Search size={14} /> Scan Stale Files (Dry Run)
              </button>

              <button
                className="button danger-button compact-button"
                onClick={() => handleManualPurge(false)}
                disabled={isPurging}
                style={{
                  background: 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)',
                  boxShadow: '0 4px 15px rgba(244, 63, 94, 0.35)'
                }}
              >
                <Trash2 size={14} /> {isPurging ? 'Purging Space...' : `Purge Files > ${purgeDays}d`}
              </button>
            </div>

            {/* Purge Result Terminal Feedback */}
            {purgeResult && (
              <div style={{
                background: 'rgba(4, 8, 20, 0.85)', border: '1px solid rgba(192, 132, 252, 0.3)',
                borderRadius: '10px', padding: '12px 14px', fontFamily: 'var(--mono)', fontSize: '0.8rem', color: '#e0f2fe'
              }}>
                {purgeResult.dryRun ? (
                  <div>
                    <span style={{ color: '#facc15' }}>✦ Scan Completed:</span> Found <strong>{purgeResult.staleCount}</strong> note(s) inactive for &gt;{purgeDays} days.
                    {purgeResult.notesToPurge?.length > 0 && (
                      <div style={{ marginTop: '6px', color: '#94a3b8' }}>
                        Candidate sample: {purgeResult.notesToPurge.slice(0, 3).map(n => n.title).join(', ')}...
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <span style={{ color: '#34d399' }}>✓ Purge Executed:</span> {purgeResult.message}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 📁 CONTENT TAB OR OVERVIEW */}
      {(adminTab === 'overview' || adminTab === 'content') && (
        <>
          {/* Upload & Create Forms */}
          <div className="grid-2" style={{ marginBottom: '32px' }}>
            <FolderForm onSubmit={onCreateFolder} />
            <AdminNoteForm folders={safeFolders} onSubmit={onCreateNote} />
          </div>

          {/* Subject Folders List */}
          {safeFolders.length > 0 && (
            <div className="admin-table" style={{
              background: 'linear-gradient(145deg, rgba(20, 30, 52, 0.9) 0%, rgba(15, 23, 42, 0.95) 100%)',
              border: '1.5px solid rgba(0, 242, 254, 0.25)', borderRadius: '20px', marginBottom: '32px'
            }}>
              <div className="table-title">
                <div>
                  <span className="eyebrow" style={{ color: '#00f2fe' }}>⚡ CURATED CATALOG</span>
                  <h2>Subject Folders</h2>
                </div>
              </div>
              {safeFolders.map((folder) => (
                <div key={folder.id} className="table-row">
                  <span className="file-dot blue"><Folder size={20} /></span>
                  <div className="row-name">
                    <b style={{
                      background: 'linear-gradient(135deg, #00f2fe 0%, #38bdf8 100%)',
                      WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                      fontSize: '1.05rem', fontWeight: '800'
                    }}>
                      {folder.subject}
                    </b>
                    <small style={{ color: '#94a3b8', display: 'block', marginTop: '3px' }}>{folder.year}</small>
                  </div>
                  <div className="user-row-actions">
                    <button className="button button-ghost compact-button" onClick={() => onEditFolder(folder)} aria-label={`Edit ${folder.subject}`}><Pencil size={14} /></button>
                    <button className="button danger-button compact-button" onClick={() => onDeleteFolder(folder)} aria-label={`Delete ${folder.subject}`}><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Admin Role Requests */}
          {safeRoleRequests.length > 0 && (
            <div className="admin-table">
              <div className="table-title">
                <div>
                  <span className="eyebrow" style={{ color: '#f43f5e' }}>⚠️ SECURITY ELEVATION QUEUE</span>
                  <h2>Admin Requests</h2>
                </div>
              </div>
              {safeRoleRequests.map((request) => (
                <div key={request.id} className="table-row">
                  <span className="file-dot pink"><ShieldCheck size={20} /></span>
                  <div className="row-name">
                    <b style={{ color: 'var(--text-pure)', fontSize: '1.02rem' }}>
                      {request.targetName || request.targetEmail || 'Promotion request'}
                    </b>
                    <small style={{ color: 'var(--text-muted)', display: 'block', marginTop: '3px' }}>
                      {request.requestedByName || request.requestedByEmail || 'A content admin'} requested full admin access
                    </small>
                  </div>
                  {canApproveAdminRequests ? (
                    <div className="user-row-actions">
                      <button className="button compact-button" onClick={() => onRoleRequestDecision(request, 'approved')}>Approve</button>
                      <button className="button danger-button compact-button" onClick={() => onRoleRequestDecision(request, 'rejected')}>Reject</button>
                    </div>
                  ) : <span className="pill pill-wait">Root admin decides</span>}
                </div>
              ))}
            </div>
          )}

          {/* Note Queue */}
          <NoteQueue
            notes={safeNotes} folders={safeFolders}
            can={{ review: true, edit: true, delete: true }}
            onEditNote={onEditNote} onDeleteNote={onDeleteNote} onNoteStatus={onNoteStatus}
          />
        </>
      )}

      {/* 📢 NOTICES TAB OR OVERVIEW */}
      {(adminTab === 'overview' || adminTab === 'notices') && (
        <div style={{ marginTop: '36px', marginBottom: '36px' }}>
          <NoticeBoard
            notices={safeNotices}
            canManage={true}
            onCreateNotice={onCreateNotice}
            onDeleteNotice={onDeleteNotice}
            onEditNotice={onEditNotice}
          />
        </div>
      )}

      {/* 👥 USERS & ACCESS DIRECTORY TAB OR OVERVIEW - User Records Management Table */}
      {(adminTab === 'overview' || adminTab === 'users') && (
        <div className="admin-table">
        <div className="table-title">
          <div>
            <span className="eyebrow" style={{ color: 'var(--accent-cyan)' }}>⚡ ACCESS DIRECTORY</span>
            <h2>User Profiles & Accounts</h2>
          </div>
          <div className="table-tools">
            <div className="search-inline">
              <Search size={16} />
              <input value={userFilter} onChange={(e) => setUserFilter(e.target.value)} placeholder="Search user directory..." />
            </div>
            <button
              className="button danger-button compact-button"
              onClick={onDeleteAll}
              disabled={!safeUsers.some((u) => u.role !== 'admin')}
            >
              Delete non-admins
            </button>
          </div>
        </div>

        {visibleUsers.map((user) => {
          const isExpanded = expandedActivityUserId === user.id;
          const isEditing = editingUser?.id === user.id;
          const logs = userActivities[user.id] || [];
          const downloadCount = logs.filter((l) => l.event === 'note_download' || l.event === 'note_access').length;
          const logoutCount = logs.filter((l) => l.event === 'logout').length;
          const loginCount = logs.filter((l) => l.event === 'login').length;

          return (
            <div
              key={user.id}
              id={`student-row-${user.id}`}
              style={{
                margin: '10px 0',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid ' + (isEditing ? 'var(--accent-cyan)' : isExpanded ? 'rgba(99, 102, 241, 0.4)' : 'rgba(255, 255, 255, 0.06)'),
                background: isEditing ? 'rgba(30, 41, 68, 0.55)' : 'rgba(15, 23, 42, 0.45)',
                overflow: 'hidden',
                transition: 'all 0.25s ease',
                boxShadow: (isEditing || isExpanded) ? '0 10px 30px rgba(0, 0, 0, 0.4)' : 'none'
              }}
            >
              {/* Main User Row Header */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '16px 20px', flexWrap: 'wrap', gap: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: '1 1 320px' }}>
                  <div style={{
                    width: '44px', height: '44px', borderRadius: 'var(--radius-md)',
                    background: user.role === 'admin'
                      ? 'rgba(245, 158, 11, 0.15)'
                      : 'rgba(56, 189, 248, 0.12)',
                    border: '1px solid ' + (user.role === 'admin' ? 'rgba(245, 158, 11, 0.35)' : 'rgba(56, 189, 248, 0.3)'),
                    display: 'grid', placeItems: 'center',
                    color: user.role === 'admin' ? '#fbbf24' : 'var(--accent-cyan)',
                    fontWeight: '800', fontSize: '1.05rem'
                  }}>
                    {user.name?.slice(0, 2)?.toUpperCase() || 'TT'}
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <b style={{
                        color: user.role === 'admin' ? '#fbbf24' : 'var(--text-pure)',
                        fontSize: '1.05rem', fontWeight: '700'
                      }}>
                        {user.name || 'Unnamed student'}
                      </b>

                      <span style={{
                        padding: '2px 10px', borderRadius: 'var(--radius-full)', fontSize: '0.72rem', fontWeight: '700',
                        background: user.role === 'admin' ? 'rgba(245, 158, 11, 0.15)' : user.role === 'content_admin' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                        color: user.role === 'admin' ? '#fbbf24' : user.role === 'content_admin' ? 'var(--accent-cyan)' : 'var(--primary-light)',
                        border: '1px solid currentColor'
                      }}>
                        {user.role === 'admin' ? '👑 Full Admin' : user.role === 'content_admin' ? '⚡ Content Admin' : '🎓 Student'}
                      </span>

                      <span style={{
                        padding: '2px 10px', borderRadius: 'var(--radius-full)', fontSize: '0.72rem', fontWeight: '700',
                        background: user.blocked ? 'rgba(244, 63, 94, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                        color: user.blocked ? '#fb7185' : '#34d399',
                        border: '1px solid currentColor'
                      }}>
                        {user.blocked ? '🚫 Blocked' : '✓ Active'}
                      </span>
                    </div>

                    <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ color: 'var(--text-main)' }}>{user.email}</span>
                      {user.mobile && <span>• 📱 {user.mobile}</span>}
                      {user.college && <span>• 🏛️ {user.college}</span>}
                      {user.year && <span>• 📚 {user.year}</span>}
                      {user.branch && <span>• {user.branch}</span>}
                    </div>

                    {/* 🕒 REGISTRATION TIME BADGE */}
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                      marginTop: '6px', padding: '3px 10px', borderRadius: 'var(--radius-sm)',
                      background: 'rgba(255, 255, 255, 0.04)', border: '1px solid var(--border-subtle)',
                      color: 'var(--text-dim)', fontSize: '0.76rem', fontWeight: '500'
                    }}>
                      <Calendar size={13} style={{ color: 'var(--accent-cyan)' }} />
                      <span>Registered: <strong style={{ color: 'var(--text-main)' }}>{formatDate(user.registeredAt || user.createdAt)}</strong></span>
                    </div>
                  </div>
                </div>

                {/* Action Buttons Toolbar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  {/* ✏️ EDIT USER DETAIL BUTTON */}
                  <button
                    className="button button-secondary compact-button"
                    onClick={() => startEditUser(user)}
                    style={{
                      borderColor: isEditing ? 'var(--accent-cyan)' : 'var(--border-subtle)',
                      color: isEditing ? 'var(--accent-cyan)' : 'var(--text-main)',
                      fontSize: '0.8rem', padding: '6px 12px'
                    }}
                  >
                    <Pencil size={13} /> {isEditing ? 'Close Edit' : 'Edit Profile'}
                  </button>

                  {/* 📊 ACTIVITY & AUDIT LOGS BUTTON */}
                  <button
                    className="button button-ghost compact-button"
                    onClick={() => toggleUserActivity(user.id)}
                    style={{
                      background: isExpanded ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                      color: isExpanded ? 'var(--accent-cyan)' : 'var(--text-muted)',
                      fontSize: '0.8rem', padding: '6px 12px'
                    }}
                  >
                    <Activity size={13} />
                    Logs {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>

                  {/* BLOCK / UNBLOCK BUTTON */}
                  <button
                    className="button button-ghost compact-button"
                    onClick={() => onBlock(user.id, !user.blocked)}
                    style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                  >
                    {user.blocked ? 'Unblock' : 'Block'}
                  </button>

                  {/* DELETE USER BUTTON */}
                  <button
                    className="button danger-button compact-button"
                    onClick={() => { if (window.confirm(`Delete ${user.name || user.email}?`)) onDelete(user.id); }}
                    style={{ padding: '6px 12px', fontSize: '0.8rem', borderRadius: '8px' }}
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                </div>
              </div>

              {/* 🪪 STUDENT UPDATE CARD FORM (INLINE & ELEVATED) */}
              {isEditing && (
                <div className="student-card-form" style={{
                  borderTop: '1.5px solid rgba(0, 242, 254, 0.45)',
                  background: 'linear-gradient(145deg, rgba(12, 22, 44, 0.98) 0%, rgba(18, 30, 56, 0.98) 100%)',
                  padding: '24px 26px',
                  boxShadow: 'inset 0 2px 14px rgba(0, 242, 254, 0.12)',
                  animation: 'fadeIn 0.25s ease'
                }}>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    marginBottom: '18px', paddingBottom: '12px',
                    borderBottom: '1px solid rgba(0, 242, 254, 0.18)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{
                        width: '36px', height: '36px', borderRadius: '10px',
                        background: 'linear-gradient(135deg, rgba(0, 242, 254, 0.2) 0%, rgba(56, 189, 248, 0.25) 100%)',
                        border: '1.2px solid rgba(0, 242, 254, 0.5)',
                        color: '#00f2fe', display: 'grid', placeItems: 'center'
                      }}>
                        <Pencil size={17} />
                      </span>
                      <div>
                        <span className="eyebrow" style={{ color: '#00f2fe', margin: 0, fontSize: '0.72rem' }}>
                          🪪 STUDENT UPDATE CARD FORM
                        </span>
                        <h4 style={{
                          margin: '2px 0 0', fontSize: '1.22rem',
                          background: 'linear-gradient(135deg, #00f2fe 0%, #38bdf8 60%, #c084fc 100%)',
                          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontWeight: '800'
                        }}>
                          Update Profile: {user.name || user.email}
                        </h4>
                      </div>
                    </div>
                    <button
                      onClick={() => setEditingUser(null)}
                      style={{
                        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                        color: '#94a3b8', borderRadius: '50%', width: '32px', height: '32px',
                        display: 'grid', placeItems: 'center', cursor: 'pointer', transition: 'all 0.2s'
                      }}
                      title="Close Card Form"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  <form onSubmit={handleSaveUser} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                      <label className="field">
                        <span style={{ color: '#38bdf8', fontSize: '0.82rem', fontWeight: '700' }}>Full Name</span>
                        <input
                          value={editFormData.name}
                          onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                          required
                          style={{ background: 'rgba(8, 14, 26, 0.9)', borderColor: 'rgba(0, 242, 254, 0.35)', color: '#e0f2fe' }}
                        />
                      </label>
                      <label className="field">
                        <span style={{ color: '#38bdf8', fontSize: '0.82rem', fontWeight: '700' }}>Email Address</span>
                        <input
                          type="email"
                          value={editFormData.email}
                          onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                          required
                          style={{ background: 'rgba(8, 14, 26, 0.9)', borderColor: 'rgba(0, 242, 254, 0.35)', color: '#e0f2fe' }}
                        />
                      </label>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                      <label className="field">
                        <span style={{ color: '#38bdf8', fontSize: '0.82rem', fontWeight: '700' }}>Mobile Number</span>
                        <input
                          value={editFormData.mobile}
                          onChange={(e) => setEditFormData({ ...editFormData, mobile: e.target.value })}
                          required
                          style={{ background: 'rgba(8, 14, 26, 0.9)', borderColor: 'rgba(0, 242, 254, 0.35)', color: '#e0f2fe' }}
                        />
                      </label>
                      <label className="field">
                        <span style={{ color: '#38bdf8', fontSize: '0.82rem', fontWeight: '700' }}>College / University</span>
                        <input
                          value={editFormData.college}
                          onChange={(e) => setEditFormData({ ...editFormData, college: e.target.value })}
                          required
                          style={{ background: 'rgba(8, 14, 26, 0.9)', borderColor: 'rgba(0, 242, 254, 0.35)', color: '#e0f2fe' }}
                        />
                      </label>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                      <label className="field">
                        <span style={{ color: '#38bdf8', fontSize: '0.82rem', fontWeight: '700' }}>Academic Year</span>
                        <select
                          value={editFormData.year}
                          onChange={(e) => setEditFormData({ ...editFormData, year: e.target.value })}
                          required
                          style={{ background: 'rgba(8, 14, 26, 0.9)', borderColor: 'rgba(0, 242, 254, 0.35)', color: '#e0f2fe' }}
                        >
                          {yearsList.map((yr) => <option key={yr} value={yr}>{yr}</option>)}
                        </select>
                      </label>
                      <label className="field">
                        <span style={{ color: '#38bdf8', fontSize: '0.82rem', fontWeight: '700' }}>Branch</span>
                        <input
                          value={editFormData.branch}
                          onChange={(e) => setEditFormData({ ...editFormData, branch: e.target.value })}
                          required
                          style={{ background: 'rgba(8, 14, 26, 0.9)', borderColor: 'rgba(0, 242, 254, 0.35)', color: '#e0f2fe' }}
                        />
                      </label>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                      <label className="field">
                        <span style={{ color: '#38bdf8', fontSize: '0.82rem', fontWeight: '700' }}>Course</span>
                        <input
                          value={editFormData.course}
                          onChange={(e) => setEditFormData({ ...editFormData, course: e.target.value })}
                          required
                          style={{ background: 'rgba(8, 14, 26, 0.9)', borderColor: 'rgba(0, 242, 254, 0.35)', color: '#e0f2fe' }}
                        />
                      </label>
                      <label className="field">
                        <span style={{ color: '#38bdf8', fontSize: '0.82rem', fontWeight: '700' }}>Role Permission</span>
                        <select
                          value={editFormData.role}
                          onChange={(e) => setEditFormData({ ...editFormData, role: e.target.value })}
                          style={{ background: 'rgba(8, 14, 26, 0.9)', borderColor: 'rgba(0, 242, 254, 0.35)', color: '#e0f2fe' }}
                        >
                          <option value="student">🎓 Student</option>
                          <option value="content_admin">⚡ Content Admin</option>
                          <option value="admin">👑 Full Admin</option>
                        </select>
                      </label>
                    </div>

                    {editError && (
                      <div style={{
                        padding: '10px 14px', borderRadius: '10px', background: 'rgba(244, 63, 94, 0.15)',
                        border: '1px solid rgba(244, 63, 94, 0.4)', color: '#fb7185', fontSize: '0.85rem',
                        display: 'flex', alignItems: 'center', gap: '8px'
                      }}>
                        <AlertCircle size={16} /> {editError}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '6px' }}>
                      <button
                        type="button"
                        className="button button-ghost compact-button"
                        onClick={() => setEditingUser(null)}
                        style={{ color: '#94a3b8' }}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="button compact-button"
                        disabled={savingUser}
                        style={{
                          background: 'linear-gradient(135deg, #00f2fe 0%, #38bdf8 100%)',
                          color: '#0f172a', fontWeight: '900', padding: '8px 18px'
                        }}
                      >
                        {savingUser ? 'Saving...' : 'Save Profile Changes'} <Check size={16} />
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* 📊 EXPANDED AUDIT & ACTIVITY LOGS SECTION */}
              {isExpanded && (
                <div style={{
                  borderTop: '1px solid rgba(0, 242, 254, 0.25)',
                  background: 'rgba(8, 14, 26, 0.96)',
                  padding: '20px 24px',
                  animation: 'fadeIn 0.25s ease'
                }}>
                  {/* Summary Bar & Delete All Logs Button */}
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    marginBottom: '18px', flexWrap: 'wrap', gap: '14px',
                    paddingBottom: '14px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
                  }}>
                    <div>
                      <span className="eyebrow" style={{ color: '#00f2fe' }}>STUDENT ACTIVITY TELEMETRY</span>
                      <h4 style={{
                        margin: '4px 0 0', fontSize: '1.15rem',
                        background: 'linear-gradient(135deg, #00f2fe 0%, #38bdf8 50%, #c084fc 100%)',
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
                      }}>
                        Real-Time Audit Trail: {user.name || user.email}
                      </h4>
                      <div style={{ display: 'flex', gap: '16px', marginTop: '6px', fontSize: '0.82rem', flexWrap: 'wrap' }}>
                        <span style={{ color: '#38bdf8' }}>
                          🕒 <strong>Registered:</strong> {formatDate(user.registeredAt || user.createdAt)}
                        </span>
                        <span style={{ color: '#00f2fe' }}>
                          📥 <strong>Notes Downloaded:</strong> {downloadCount}
                        </span>
                        <span style={{ color: '#f59e0b' }}>
                          🚪 <strong>Logouts:</strong> {logoutCount}
                        </span>
                        <span style={{ color: '#10b981' }}>
                          🔑 <strong>Logins:</strong> {loginCount}
                        </span>
                      </div>
                    </div>

                    {/* 🗑️ DELETE ALL LOGS OF THIS STUDENT BUTTON */}
                    <button
                      className="button danger-button compact-button"
                      onClick={() => handleDeleteAllLogs(user.id, user.name)}
                      disabled={logs.length === 0}
                      style={{
                        padding: '8px 16px', borderRadius: '10px',
                        fontWeight: '800', display: 'flex', alignItems: 'center', gap: '6px',
                        boxShadow: '0 4px 15px rgba(244, 63, 94, 0.35)',
                        opacity: logs.length === 0 ? 0.5 : 1,
                        cursor: logs.length === 0 ? 'not-allowed' : 'pointer'
                      }}
                    >
                      <Trash2 size={14} /> Delete All Logs of this Student ({logs.length})
                    </button>
                  </div>

                  {loadingActivity && !logs.length ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: '#00f2fe' }}>
                      Loading real-time user activity logs...
                    </div>
                  ) : logs.length === 0 ? (
                    <div style={{
                      padding: '24px', textAlign: 'center', color: '#94a3b8',
                      background: 'rgba(0,0,0,0.2)', borderRadius: '12px', fontSize: '0.9rem'
                    }}>
                      No activity logs recorded for this student yet. (Registration time: {formatDate(user.registeredAt || user.createdAt)})
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {logs.map((log) => {
                        const isDownload = log.event === 'note_download' || log.event === 'note_access';
                        const isLogout = log.event === 'logout';
                        const isLogin = log.event === 'login';
                        const isRegister = log.event === 'registered';

                        const badgeColor = isDownload ? '#00f2fe' : isLogout ? '#f59e0b' : isLogin ? '#10b981' : isRegister ? '#c084fc' : '#38bdf8';
                        const badgeBg = isDownload ? 'rgba(0, 242, 254, 0.12)' : isLogout ? 'rgba(245, 158, 11, 0.12)' : isLogin ? 'rgba(16, 185, 129, 0.12)' : isRegister ? 'rgba(192, 132, 252, 0.12)' : 'rgba(56, 189, 248, 0.12)';

                        return (
                          <div
                            key={log.id}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              padding: '12px 16px', borderRadius: '12px',
                              background: 'rgba(15, 23, 42, 0.65)', border: '1px solid rgba(255, 255, 255, 0.06)',
                              flexWrap: 'wrap', gap: '10px', transition: 'all 0.2s ease'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '1 1 280px' }}>
                              <span style={{
                                width: '34px', height: '34px', borderRadius: '8px',
                                background: badgeBg, color: badgeColor, border: `1px solid ${badgeColor}`,
                                display: 'grid', placeItems: 'center'
                              }}>
                                {isDownload ? <FileDown size={16} /> : isLogout ? <LogOut size={16} /> : isLogin ? <LogIn size={16} /> : isRegister ? <UserCheck size={16} /> : <Activity size={16} />}
                              </span>

                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                  <span style={{
                                    padding: '2px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: '800',
                                    background: badgeBg, color: badgeColor, border: `1px solid ${badgeColor}`
                                  }}>
                                    {isDownload ? '📥 Note Downloaded' : isLogout ? '🚪 Session Logged Out' : isLogin ? '🔑 Account Logged In' : isRegister ? '🎓 Account Registered' : log.event}
                                  </span>

                                  {isDownload && log.noteTitle && (
                                    <strong style={{ color: '#e0f2fe', fontSize: '0.9rem' }}>
                                      "{log.noteTitle}"
                                    </strong>
                                  )}

                                  {isDownload && log.subject && (
                                    <span style={{ color: '#38bdf8', fontSize: '0.8rem' }}>
                                      [{log.subject}]
                                    </span>
                                  )}
                                </div>

                                <div style={{ color: '#94a3b8', fontSize: '0.78rem', marginTop: '3px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                  <span>🕒 Timestamp: <strong style={{ color: '#cbd5e1' }}>{formatDate(log.occurredAt)}</strong></span>
                                  {log.ipAddress && <span>🌐 IP: {log.ipAddress}</span>}
                                </div>
                              </div>
                            </div>

                            {/* 🗑️ DELETE EACH LOG BUTTON */}
                            <button
                              className="button danger-button compact-button"
                              onClick={() => handleDeleteLog(user.id, log.id)}
                              title="Permanently delete this specific log"
                              style={{
                                padding: '5px 10px', fontSize: '0.75rem', borderRadius: '6px',
                                display: 'flex', alignItems: 'center', gap: '4px'
                              }}
                            >
                              <Trash2 size={12} /> Delete Log
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {filteredUsers.length === 0 && <div className="empty-state" style={{ color: '#94a3b8' }}>No users found. Try a different search.</div>}
        {filteredUsers.length > 10 && (
          <div className="center-row" style={{ marginTop: 18, marginBottom: 18 }}>
            <button className="button button-ghost compact-button" onClick={() => setShowAllUsers((shown) => !shown)}>
              {showAllUsers ? 'Show fewer' : `Show all ${filteredUsers.length} users`}
            </button>
          </div>
        )}
      </div>
      )}

      {/* 🗄️ DATABASE COLLECTIONS TAB OR OVERVIEW */}
      {(adminTab === 'overview' || adminTab === 'database') && (
        <DatabaseAdminPanel token={token} />
      )}
    </section>
  );
}
