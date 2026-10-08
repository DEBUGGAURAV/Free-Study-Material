import React, { useEffect, useState, Suspense, lazy } from 'react';
import {
  ArrowUpRight, Clock3, FileText, LockKeyhole, Menu, X, Bell, Zap,
  Cpu, ShieldCheck, BookOpen, UploadCloud, Users, LogIn, LogOut,
  User, CheckCircle2, Search, Sparkles, ChevronRight, HardDrive, LayoutDashboard
} from 'lucide-react';
import {
  createFolder, createNote, createNotice, deleteAdminUser,
  deleteAllAdminUsers, deleteFolder, deleteNote, deleteNotice, updateNotice, decideAdminRoleRequest,
  getAdminNotes, getAdminRoleRequests, getAdminUsers, getFolders, getNotices,
  getNotes, recordLogout, recordNoteAccess,
  setUserBlocked, setUserPermissions, updateAdminUser,
  updateFolder, updateNote, updateProfile, downloadAdminExport, uploadNoteFile,
} from './api';

const AuthModal = lazy(() => import('./components/AuthModal'));
const NotesView = lazy(() => import('./components/NotesView'));
const StudentsView = lazy(() => import('./components/StudentsView'));
const StudentDashboard = lazy(() => import('./components/StudentDashboard'));
const ProfileView = lazy(() => import('./components/ProfileView'));
import NoticeBoard from './components/NoticeBoard';
import AdminView from './components/AdminView';
import UploadDocumentSpace from './components/UploadDocumentSpace';
import { ContentAdminManager, ContentAdminView } from './components/ContentAdmin';

const years = ['1st year', '2nd year', '3rd year', '4th year'];
const subjects = ['Cloud Computing (CC)', 'Cryptography (CNS)', 'Artificial Intelligence (AI)', 'Deep Learning', 'Data Structures'];

const notePermissionOptions = [
  { key: 'uploadNotes', label: 'Upload / publish notes' },
  { key: 'editNotes', label: 'Edit notes' },
  { key: 'deleteNotes', label: 'Delete notes' },
  { key: 'reviewNotes', label: 'Approve / reject submissions' },
];

const hasNotePermission = (user, permission) => user?.role === 'admin' || user?.role === 'content_admin' || user?.permissions?.[permission] === true;
const hasAnyNotePermission = (user) => user?.role === 'admin' || user?.role === 'content_admin' || notePermissionOptions.some(({ key }) => user?.permissions?.[key] === true);

export default function App() {
  const [view, setView] = useState('home'); // 'home' | 'notes' | 'upload' | 'notices' | 'students' | 'profile' | 'admin'
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('signup') === '1' || Boolean(params.get('reset'));
  });
  const [session, setSession] = useState(() => {
    try { return JSON.parse(localStorage.getItem('tech-titan-session') || 'null'); } catch { return null; }
  });
  const [liveNotes, setLiveNotes] = useState(() => {
    try {
      const cached = JSON.parse(localStorage.getItem('tech-titan-notes-cache') || '[]');
      return Array.isArray(cached) ? cached : (cached?.notes || []);
    } catch { return []; }
  });
  const [folders, setFolders] = useState(() => {
    try { return JSON.parse(localStorage.getItem('tech-titan-folders-cache') || '[]'); } catch { return []; }
  });
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminRoleRequests, setAdminRoleRequests] = useState([]);
  const [canApproveAdminRequests, setCanApproveAdminRequests] = useState(false);
  const [adminNotes, setAdminNotes] = useState([]);
  const [noticeBoard, setNoticeBoard] = useState(() => {
    try { return JSON.parse(localStorage.getItem('tech-titan-notices-cache') || '[]'); } catch { return []; }
  });
  const [notice, setNotice] = useState('');
  const [connectionError, setConnectionError] = useState('');

  const signedIn = Boolean(session?.token);
  const isAdmin = session?.user?.role === 'admin';
  const canManageContent = hasAnyNotePermission(session?.user);

  // Fetch initial notes & data
  useEffect(() => {
    let active = true;

    const loadData = async () => {
      try {
        const token = session?.token || null;
        const fetchedNotes = await getNotes(token);
        if (active) {
          const notesArr = Array.isArray(fetchedNotes) ? fetchedNotes : (fetchedNotes?.notes || []);
          setLiveNotes(notesArr);
          try { localStorage.setItem('tech-titan-notes-cache', JSON.stringify(notesArr)); } catch {}
          setConnectionError('');
        }
      } catch (err) {
        if (active && err.code === 'API_UNREACHABLE') {
          setConnectionError(err.message);
        }
      }

      try {
        const fetchedNotices = await getNotices(session?.token || null);
        if (active && fetchedNotices) {
          setNoticeBoard(fetchedNotices);
          try { localStorage.setItem('tech-titan-notices-cache', JSON.stringify(fetchedNotices)); } catch {}
        }
      } catch {}

      try {
        const fetchedFolders = await getFolders(session?.token || null);
        if (active && fetchedFolders) {
          setFolders(fetchedFolders);
          try { localStorage.setItem('tech-titan-folders-cache', JSON.stringify(fetchedFolders)); } catch {}
        }
      } catch {}

      if (session?.token && isAdmin) {
        try {
          const users = await getAdminUsers(session.token);
          if (active) setAdminUsers(users);
          const reqs = await getAdminRoleRequests(session.token);
          if (active) {
            setCanApproveAdminRequests(reqs.canApprove);
            setAdminRoleRequests(reqs.requests);
          }
        } catch {}
      }

      if (session?.token && canManageContent) {
        try {
          const aNotes = await getAdminNotes(session.token);
          if (active) setAdminNotes(aNotes);
        } catch {}
      }
    };

    loadData();

    // Auto-refresh interval (every 60s)
    const interval = setInterval(loadData, 60000);
    return () => { active = false; clearInterval(interval); };
  }, [session, isAdmin, canManageContent]);

  // Handle Note Access Recording
  const handleNoteAccess = (note) => {
    if (session?.token && note?.id) {
      recordNoteAccess(note.id, session.token).catch(() => {});
    }
  };

  // Handle Auth Success
  const handleAuthSuccess = (nextSession) => {
    setSession(nextSession);
    try { localStorage.setItem('tech-titan-session', JSON.stringify(nextSession)); } catch {}
    setAuthOpen(false);
    setNotice(`Welcome back, ${nextSession?.user?.name || 'Student'}!`);
  };

  // Handle Logout
  const handleLogout = async () => {
    if (session?.token) {
      recordLogout(session.token).catch(() => {});
    }
    localStorage.removeItem('tech-titan-session');
    setSession(null);
    setView('home');
    setNotice('Signed out successfully.');
  };

  return (
    <div className="app-shell" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navbar */}
      <header className="site-navbar">
        <div className="page-width">
          <div className="navbar-inner">
            {/* Brand Logo */}
            <div className="brand-logo" onClick={() => setView('home')}>
              <div className="brand-icon-wrapper">
                <BookOpen size={22} />
              </div>
              <div className="brand-text">
                <span className="brand-name">Free Study Material</span>
                <span className="brand-sub">Academic Cloud</span>
              </div>
            </div>

            {/* Nav Links Center */}
            <nav className="nav-links">
              <button 
                className={`nav-link-btn ${view === 'home' || view === 'notes' ? 'active' : ''}`}
                onClick={() => setView('home')}
              >
                <BookOpen size={16} />
                <span>Notes Vault</span>
              </button>

              <button 
                className={`nav-link-btn ${view === 'upload' ? 'active' : ''}`}
                onClick={() => setView('upload')}
              >
                <UploadCloud size={16} />
                <span>Upload Notes</span>
              </button>

              <button 
                className={`nav-link-btn ${view === 'notices' ? 'active' : ''}`}
                onClick={() => setView('notices')}
              >
                <Bell size={16} />
                <span>Notices</span>
              </button>

              <button 
                className={`nav-link-btn ${view === 'students' ? 'active' : ''}`}
                onClick={() => setView('students')}
              >
                <Users size={16} />
                <span>Student Hub</span>
              </button>

              {(isAdmin || canManageContent) && (
                <button 
                  className={`nav-link-btn ${view === 'admin' ? 'active' : ''}`}
                  onClick={() => setView('admin')}
                  style={{ color: '#fb7185' }}
                >
                  <ShieldCheck size={16} />
                  <span>Admin</span>
                </button>
              )}
            </nav>

            {/* Nav Actions Right */}
            <div className="nav-actions">
              <div className="cloud-status-pill">
                <span className="status-dot"></span>
                <span>Telegram Cloud 80MB/s</span>
              </div>

              {signedIn ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button 
                    className="button button-secondary compact-button"
                    onClick={() => setView('profile')}
                    title="User profile settings"
                  >
                    <User size={15} />
                    <span>{session.user?.name ? session.user.name.split(' ')[0] : 'Profile'}</span>
                  </button>

                  <button 
                    className="button button-ghost compact-button"
                    onClick={handleLogout}
                    title="Sign out"
                  >
                    <LogOut size={15} />
                  </button>
                </div>
              ) : (
                <button 
                  className="button button-primary compact-button"
                  onClick={() => setAuthOpen(true)}
                >
                  <LogIn size={15} />
                  <span>Sign In</span>
                </button>
              )}

              {/* Mobile Menu Button */}
              <button 
                className="mobile-nav-toggle"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label="Toggle navigation menu"
              >
                {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div style={{
          background: 'rgba(13, 19, 34, 0.98)',
          borderBottom: '1px solid var(--border-subtle)',
          padding: '20px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <button 
            className={`nav-link-btn ${view === 'home' ? 'active' : ''}`}
            onClick={() => { setView('home'); setMobileMenuOpen(false); }}
            style={{ width: '100%', justifyContent: 'flex-start' }}
          >
            <BookOpen size={18} /> <span>Notes Vault</span>
          </button>
          <button 
            className={`nav-link-btn ${view === 'upload' ? 'active' : ''}`}
            onClick={() => { setView('upload'); setMobileMenuOpen(false); }}
            style={{ width: '100%', justifyContent: 'flex-start' }}
          >
            <UploadCloud size={18} /> <span>Contribute Notes</span>
          </button>
          <button 
            className={`nav-link-btn ${view === 'notices' ? 'active' : ''}`}
            onClick={() => { setView('notices'); setMobileMenuOpen(false); }}
            style={{ width: '100%', justifyContent: 'flex-start' }}
          >
            <Bell size={18} /> <span>Notice Board</span>
          </button>
          <button 
            className={`nav-link-btn ${view === 'students' ? 'active' : ''}`}
            onClick={() => { setView('students'); setMobileMenuOpen(false); }}
            style={{ width: '100%', justifyContent: 'flex-start' }}
          >
            <Users size={18} /> <span>Student Hub</span>
          </button>
          {(isAdmin || canManageContent) && (
            <button 
              className={`nav-link-btn ${view === 'admin' ? 'active' : ''}`}
              onClick={() => { setView('admin'); setMobileMenuOpen(false); }}
              style={{ width: '100%', justifyContent: 'flex-start', color: '#fb7185' }}
            >
              <ShieldCheck size={18} /> <span>Admin Center</span>
            </button>
          )}
        </div>
      )}

      {/* Main View Router */}
      <main style={{ flex: 1 }}>
        <Suspense fallback={
          <div style={{ textAlign: 'center', padding: '100px 20px', color: 'var(--text-muted)' }}>
            <Sparkles size={32} style={{ color: 'var(--accent-cyan)', margin: '0 auto 16px', animation: 'spin 3s linear infinite' }} />
            <div>Loading Free Study Material...</div>
          </div>
        }>
          {view === 'home' || view === 'notes' ? (
            <StudentDashboard
              user={session?.user || null}
              token={session?.token || null}
              notes={liveNotes}
              folders={folders}
              notices={noticeBoard}
              activeView={view}
              onViewChange={setView}
              onNavigate={(target) => setView(target)}
              onNoteAccess={handleNoteAccess}
              onUploadSuccess={(createdNote) => {
                setLiveNotes(prev => [createdNote, ...prev]);
                setNotice('Note successfully published to Free Study Material!');
              }}
            />
          ) : view === 'upload' ? (
            <div className="page-width">
              <UploadDocumentSpace
                folders={folders}
                token={session?.token || null}
                onUploadSuccess={(createdNote) => {
                  setLiveNotes(prev => [createdNote, ...prev]);
                  setNotice('Note published successfully!');
                  setView('home');
                }}
              />
            </div>
          ) : view === 'notices' ? (
            <div className="page-width" style={{ padding: '30px 24px' }}>
              <NoticeBoard 
                notices={noticeBoard}
                isAdmin={isAdmin}
              />
            </div>
          ) : view === 'students' ? (
            <div className="page-width" style={{ padding: '30px 24px' }}>
              <StudentsView />
            </div>
          ) : view === 'profile' && signedIn ? (
            <div className="page-width" style={{ padding: '30px 24px' }}>
              <ProfileView 
                user={session.user} 
                onSave={async (updated) => {
                  if (session?.token) {
                    await updateProfile(updated, session.token);
                    const nextUser = { ...session.user, ...updated };
                    setSession({ ...session, user: nextUser });
                    localStorage.setItem('tech-titan-session', JSON.stringify({ ...session, user: nextUser }));
                    setNotice('Profile updated successfully.');
                  }
                }} 
                onBack={() => setView('home')} 
              />
            </div>
          ) : view === 'admin' && (isAdmin || canManageContent) ? (
            <div className="page-width" style={{ padding: '30px 24px' }}>
              {isAdmin ? (
                <AdminView
                  users={adminUsers}
                  notes={adminNotes.length ? adminNotes : liveNotes}
                  folders={folders}
                  token={session.token}
                  roleRequests={adminRoleRequests}
                  canApproveAdminRequests={canApproveAdminRequests}
                  onRoleRequestDecision={async (reqId, decision) => {
                    await decideAdminRoleRequest(reqId, decision, session.token);
                    setAdminRoleRequests(prev => prev.filter(r => r.id !== reqId));
                  }}
                  onExport={() => downloadAdminExport(session.token)}
                  onCreateFolder={async (f) => {
                    const created = await createFolder(f, session.token);
                    setFolders(prev => [...prev, created]);
                  }}
                  onCreateNote={async (n) => {
                    const created = await createNote(n, session.token);
                    setLiveNotes(prev => [created, ...prev]);
                  }}
                  onNoteStatus={async (id, s) => {
                    await updateNote(id, { status: s }, session.token);
                    setLiveNotes(prev => prev.map(n => n.id === id ? { ...n, status: s } : n));
                  }}
                  onEditFolder={async (id, f) => {
                    await updateFolder(id, f, session.token);
                    setFolders(prev => prev.map(fo => fo.id === id ? { ...fo, ...f } : fo));
                  }}
                  onDeleteFolder={async (id) => {
                    await deleteFolder(id, session.token);
                    setFolders(prev => prev.filter(fo => fo.id !== id));
                  }}
                  onEditNote={async (id, n) => {
                    await updateNote(id, n, session.token);
                    setLiveNotes(prev => prev.map(no => no.id === id ? { ...no, ...n } : no));
                  }}
                  onDeleteNote={async (id) => {
                    await deleteNote(id, session.token);
                    setLiveNotes(prev => prev.filter(no => no.id !== id));
                  }}
                  onUpdateUser={async (id, u) => {
                    await updateAdminUser(id, u, session.token);
                    setAdminUsers(prev => prev.map(us => us.id === id ? { ...us, ...u } : us));
                  }}
                  onDeleteAll={async () => {
                    await deleteAllAdminUsers(session.token);
                    setAdminUsers([]);
                  }}
                  onBlock={async (id, blocked) => {
                    await setUserBlocked(id, blocked, session.token);
                    setAdminUsers(prev => prev.map(us => us.id === id ? { ...us, blocked } : us));
                  }}
                  onDelete={async (id) => {
                    await deleteAdminUser(id, session.token);
                    setAdminUsers(prev => prev.filter(us => us.id !== id));
                  }}
                  notices={noticeBoard}
                  onCreateNotice={async (notc) => {
                    const created = await createNotice(notc, session.token);
                    setNoticeBoard(prev => [created, ...prev]);
                  }}
                  onDeleteNotice={async (id) => {
                    await deleteNotice(id, session.token);
                    setNoticeBoard(prev => prev.filter(nb => nb.id !== id));
                  }}
                  onEditNotice={async (id, notc) => {
                    await updateNotice(id, notc, session.token);
                    setNoticeBoard(prev => prev.map(nb => nb.id === id ? { ...nb, ...notc } : nb));
                  }}
                />
              ) : (
                <ContentAdminView
                  folders={folders}
                  notes={adminNotes.length ? adminNotes : liveNotes}
                  permissions={session.user?.role === 'content_admin' ? Object.fromEntries(notePermissionOptions.map(({ key }) => [key, true])) : (session.user?.permissions || {})}
                  onCreateNote={async (n) => {
                    const created = await createNote(n, session.token);
                    setLiveNotes(prev => [created, ...prev]);
                  }}
                  onEditNote={async (id, n) => {
                    await updateNote(id, n, session.token);
                    setLiveNotes(prev => prev.map(no => no.id === id ? { ...no, ...n } : no));
                  }}
                  onDeleteNote={async (id) => {
                    await deleteNote(id, session.token);
                    setLiveNotes(prev => prev.filter(no => no.id !== id));
                  }}
                  onNoteStatus={async (id, s) => {
                    await updateNote(id, { status: s }, session.token);
                    setLiveNotes(prev => prev.map(n => n.id === id ? { ...n, status: s } : n));
                  }}
                />
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '80px 20px' }}>
              <h2>Page Not Found</h2>
              <button className="button button-primary" onClick={() => setView('home')} style={{ marginTop: '16px' }}>
                Return to Notes Vault
              </button>
            </div>
          )}
        </Suspense>
      </main>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid var(--border-subtle)',
        background: 'rgba(8, 11, 18, 0.9)',
        padding: '36px 0 24px',
        marginTop: '60px'
      }}>
        <div className="page-width">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '20px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="brand-icon-wrapper" style={{ width: '32px', height: '32px' }}>
                <BookOpen size={16} />
              </div>
              <span style={{ fontWeight: 800, color: 'var(--text-pure)' }}>Free Study Material</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', fontSize: '0.86rem', color: 'var(--text-muted)' }}>
              <button onClick={() => setView('home')}>Notes Vault</button>
              <button onClick={() => setView('upload')}>Upload</button>
              <button onClick={() => setView('notices')}>Notices</button>
              <button onClick={() => setView('students')}>Community</button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', fontSize: '0.78rem', color: 'var(--text-dim)', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)' }}>
            <div>© {new Date().getFullYear()} Free Study Material. High-Performance Academic Cloud.</div>
            <div>Powered by Telegram Cloud Storage & Cloudflare Edge CDN</div>
          </div>
        </div>
      </footer>

      {/* Auth Modal */}
      {authOpen && (
        <AuthModal
          onClose={() => setAuthOpen(false)}
          onSuccess={handleAuthSuccess}
        />
      )}

      {/* Toast Notification */}
      {notice && (
        <div className="toast-container">
          <div className="toast-card">
            <CheckCircle2 size={20} style={{ color: '#10b981', flexShrink: 0, marginTop: '2px' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-pure)' }}>{notice}</div>
            </div>
            <button onClick={() => setNotice('')} style={{ color: 'var(--text-dim)' }}>
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
