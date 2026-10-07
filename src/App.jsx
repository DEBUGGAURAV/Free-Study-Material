import React, { useEffect, useState, Suspense, lazy } from 'react'
import {
  ArrowUpRight, Clock3, FileText, LockKeyhole, Menu, X, Bell, Zap, Cpu, ShieldCheck,
} from 'lucide-react'
import {
  createFolder, createNote, createNotice, deleteAdminUser,
  deleteAllAdminUsers, deleteFolder, deleteNote, deleteNotice, updateNotice, decideAdminRoleRequest,
  getAdminNotes, getAdminRoleRequests, getAdminUsers, getFolders, getNotices,
  getNotes, recordLogout, recordNoteAccess,
  setUserBlocked, setUserPermissions, updateAdminUser,
  updateFolder, updateNote, updateProfile, downloadAdminExport,
} from './api'
const AuthModal = lazy(() => import('./components/AuthModal'))
const NotesView = lazy(() => import('./components/NotesView'))
const StudentsView = lazy(() => import('./components/StudentsView'))
const StudentDashboard = lazy(() => import('./components/StudentDashboard'))
import Sidebar from './components/Sidebar'
const ProfileView = lazy(() => import('./components/ProfileView'))
import NoticeBoard, { FormattedNoticeMessage } from './components/NoticeBoard'
import AdminView from './components/AdminView'
import { AddNoteModal } from './components/UploadForms'
import { ContentAdminManager, ContentAdminView } from './components/ContentAdmin'

const years = ['1st year', '2nd year', '3rd year', '4th year']
const subjects = ['Cloud Computing (CC)', 'Cryptography (CNS)', 'Artificial Intelligence (AI)', 'Deep Learning']
const uploadLink = 'https://www.playbook.com/techtitan/drop'
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i
const notePermissionOptions = [
  { key: 'uploadNotes', label: 'Upload / publish notes' },
  { key: 'editNotes', label: 'Edit notes' },
  { key: 'deleteNotes', label: 'Delete notes' },
  { key: 'reviewNotes', label: 'Approve / reject submissions' },
]
const hasNotePermission = (user, permission) => user?.role === 'admin' || user?.role === 'content_admin' || user?.permissions?.[permission] === true
const hasAnyNotePermission = (user) => user?.role === 'admin' || user?.role === 'content_admin' || notePermissionOptions.some(({ key }) => user?.permissions?.[key] === true)
const isValidMobile = (value) => {
  const mobile = value.trim()
  const digitCount = (mobile.match(/\d/g) || []).length
  return mobile.length <= 20 && /^\+?[0-9][0-9\s().-]*$/.test(mobile) && digitCount >= 7 && digitCount <= 15
}
const userMatchesQuery = (user, query) => {
  const normalizedQuery = query.trim().toLowerCase()
  return !normalizedQuery || [user.name, user.email, user.mobile, user.college, user.year, user.branch, user.course, user.role]
    .some((value) => String(value || '').toLowerCase().includes(normalizedQuery))
}


function App() {
  const [view, setView] = useState('home')
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth > 1024
    }
    return false
  })
  const [subject, setSubject] = useState('All notes')
  const [search, setSearch] = useState('')
  const [authOpen, setAuthOpen] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('signup') === '1' || Boolean(params.get('reset'))
  })
  const [adminOpen, setAdminOpen] = useState(false)
  const [session, setSession] = useState(() => JSON.parse(localStorage.getItem('tech-titan-session') || 'null'))
  const [liveNotes, setLiveNotes] = useState(() => {
    try { return JSON.parse(localStorage.getItem('tech-titan-notes-cache') || '[]'); } catch { return []; }
  })
  const [folders, setFolders] = useState(() => {
    try { return JSON.parse(localStorage.getItem('tech-titan-folders-cache') || '[]'); } catch { return []; }
  })
  const [adminUsers, setAdminUsers] = useState([])
  const [adminRoleRequests, setAdminRoleRequests] = useState([])
  const [canApproveAdminRequests, setCanApproveAdminRequests] = useState(false)
  const [adminNotes, setAdminNotes] = useState([])
  const [noticeBoard, setNoticeBoard] = useState(() => {
    try { return JSON.parse(localStorage.getItem('tech-titan-notices-cache') || '[]'); } catch { return []; }
  })
  const [notice, setNotice] = useState('')
  const [newUploadCount, setNewUploadCount] = useState(0)
  const [connectionError, setConnectionError] = useState('')
  const [connectionAttempt, setConnectionAttempt] = useState(0)
  const signedIn = Boolean(session?.token)
  const isAdmin = session?.user?.role === 'admin'
  const canManageContent = hasAnyNotePermission(session?.user)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('reset') || params.get('signup') === '1') {
      setAuthOpen(true)
    }
  }, [])

  useEffect(() => {
    if (!session?.token) {
      setNoticeBoard([])
      setAdminRoleRequests([])
      setCanApproveAdminRequests(false)
      return
    }
    let active = true
    let initialized = false
    let knownNoteIds = new Set()
    const refreshNotes = () => {
      if (document.visibilityState !== 'visible') return
      getNotes(session.token).then((nextNotes) => {
      if (!active) return
      const newNotes = nextNotes.filter((note) => !knownNoteIds.has(note.id || note.title))
      if (initialized && newNotes.length) {
        setNewUploadCount(Math.min(newNotes.length, 8))
        setNotice(`${newNotes.length} new note${newNotes.length === 1 ? ' is' : 's are'} available.`)
      }
      knownNoteIds = new Set(nextNotes.map((note) => note.id || note.title))
      initialized = true
      setConnectionError('')
      setLiveNotes(nextNotes)
      try { localStorage.setItem('tech-titan-notes-cache', JSON.stringify(nextNotes)) } catch {}
    }).catch((error) => {
      if (active && error.code === 'API_UNREACHABLE') setConnectionError(error.message)
      })
    }
    const refreshNoticeBoard = () => {
      if (document.visibilityState !== 'visible') return
      getNotices(session.token).then((nextNotices) => {
        if (active) {
          setNoticeBoard(nextNotices)
          try { localStorage.setItem('tech-titan-notices-cache', JSON.stringify(nextNotices)) } catch {}
        }
      }).catch(() => {
        if (active) setNoticeBoard([])
      })
    }
    const refreshAdminRoleRequests = () => {
      if (!isAdmin || document.visibilityState !== 'visible') return
      getAdminRoleRequests(session.token).then((result) => {
        if (!active) return
        setCanApproveAdminRequests(result.canApprove)
        setAdminRoleRequests(result.requests)
      }).catch(() => {
        if (active) {
          setCanApproveAdminRequests(false)
          setAdminRoleRequests([])
        }
      })
    }
    let lastRefreshTime = Date.now()
    const doThrottledRefresh = () => {
      const now = Date.now()
      if (now - lastRefreshTime < 45000) return
      lastRefreshTime = now
      refreshNotes()
      refreshNoticeBoard()
      refreshAdminRoleRequests()
    }
    refreshNotes()
    refreshNoticeBoard()
    refreshAdminRoleRequests()
    const refreshTimer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      lastRefreshTime = Date.now()
      refreshNotes()
      refreshNoticeBoard()
      refreshAdminRoleRequests()
    }, 60000)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        doThrottledRefresh()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    getFolders(session.token).then((nextFolders) => {
      if (active) {
        setFolders(nextFolders)
        try { localStorage.setItem('tech-titan-folders-cache', JSON.stringify(nextFolders)) } catch {}
      }
    }).catch(() => setFolders([]))
    if (isAdmin) {
      getAdminUsers(session.token).then(setAdminUsers).catch(() => setAdminUsers([]))
    } else {
      setAdminRoleRequests([])
      setCanApproveAdminRequests(false)
    }
    if (canManageContent) getAdminNotes(session.token).then(setAdminNotes).catch(() => setAdminNotes([]))
    return () => { active = false; window.clearInterval(refreshTimer); document.removeEventListener('visibilitychange', onVisibilityChange) }
  }, [session, isAdmin, canManageContent, connectionAttempt])

  const navigate = (nextView) => {
    if (nextView === 'admin' && !canManageContent && !isAdmin) {
      setNotice('Admin panel access is restricted.')
      setAuthOpen(true)
      return
    }
    if ((nextView === 'notes' || nextView === 'students') && !signedIn) {
      setNotice('Sign in with your college email to access the student room.')
      setAuthOpen(true)
      return
    }
    setView(nextView)
  }

  const handleAuthSuccess = (nextSession) => {
    const location = new URL(window.location.href)
    location.searchParams.delete('signup')
    location.searchParams.delete('reset')
    window.history.replaceState({}, '', location)
    localStorage.setItem('tech-titan-session', JSON.stringify(nextSession))
    setSession(nextSession)
    setAuthOpen(false)
    setNotice('')
    setNewUploadCount(0)
    setView('home')
  }

  const handleProfileSave = async (profile) => {
    const updatedProfile = await updateProfile(profile, session.token)
    const nextSession = { ...session, user: { ...session.user, ...updatedProfile, email: session.user.email } }
    localStorage.setItem('tech-titan-session', JSON.stringify(nextSession))
    setSession(nextSession)
    setNotice('Profile updated.')
  }

  const handleSignOut = async () => {
    let logoutError = ''
    try { await recordLogout(session.token) } catch (error) { logoutError = error.message }
    localStorage.removeItem('tech-titan-session')
    setSession(null)
    setView('home')
    setNewUploadCount(0)
    setNotice(logoutError ? `Signed out, but activity could not be recorded: ${logoutError}` : 'You have been signed out.')
  }

  const handleNoteAccess = (note) => {
    if (!note.id) return
    recordNoteAccess(note.id, session.token).catch((error) => setNotice(`Note access could not be recorded: ${error.message}`))
  }

  const handleUpdateAdminUser = async (id, profile) => {
    const updated = await updateAdminUser(id, profile, session.token)
    setAdminUsers((current) => current.map((user) => user.id === id ? { ...user, ...updated } : user))
    setNotice('User details updated.')
    return updated
  }

  const handleCreateNote = async (note) => {
    try {
      await createNote(note, session.token)
      setAdminOpen(false)
      setNotice('Your Drive link was submitted for admin review.')
    } catch (error) {
      setNotice(error.message)
    }
  }

  const handleCreateFolder = async (folder) => {
    try {
      if (folders.some((item) => item.year === folder.year && item.subject.trim().toLowerCase() === folder.subject.trim().toLowerCase())) {
        throw new Error('A folder for this subject and year already exists.')
      }
      const created = await createFolder(folder, session.token)
      setFolders((current) => [...current, created].sort((left, right) => `${left.year}${left.subject}`.localeCompare(`${right.year}${right.subject}`)))
      setNotice('Subject folder created for students.')
    } catch (error) { setNotice(error.message) }
  }

  const handleAdminNote = async (note) => {
    try {
      const folder = folders.find((item) => item.id === note.folderId)
      if (!folder) throw new Error('Create the matching year folder before publishing this note.')
      const created = await createNote({ ...note, year: folder.year, subject: folder.subject, folderId: folder.id, status: 'approved' }, session.token)
      setAdminNotes((current) => [created, ...current])
      setLiveNotes((current) => [created, ...current])
      setNewUploadCount(1)
      setNotice('Note published. Students will see it in their subject room shortly.')
      return true
    } catch (error) { setNotice(error.message); return false }
  }

  const handleNoteStatus = async (id, status) => {
    try {
      await updateNote(id, { status }, session.token)
      setAdminNotes((current) => current.map((note) => note.id === id ? { ...note, status } : note))
      if (status === 'approved') setLiveNotes((current) => [...current, adminNotes.find((note) => note.id === id)].filter(Boolean))
      else setLiveNotes((current) => current.filter((note) => note.id !== id))
      setNotice(`Note ${status}.`)
    } catch (error) { setNotice(error.message) }
  }

  const handleEditFolder = async (folder) => {
    const subject = window.prompt('Subject name', folder.subject)
    const year = window.prompt('Student year', folder.year)
    if (!subject || !year) return
    try {
      const updated = await updateFolder(folder.id, { subject, year }, session.token)
      const belongsToFolder = (note) => note.folderId === folder.id || (!note.folderId && note.subject === folder.subject && note.year === folder.year)
      setFolders((current) => current.map((item) => item.id === folder.id ? { ...item, ...updated } : item))
      setAdminNotes((current) => current.map((note) => belongsToFolder(note) ? { ...note, subject, year, folderId: folder.id } : note))
      setLiveNotes((current) => current.map((note) => belongsToFolder(note) ? { ...note, subject, year, folderId: folder.id } : note))
      setNotice('Subject and linked notes updated.')
    } catch (error) { setNotice(error.message) }
  }

  const handleDeleteFolder = async (folder) => {
    if (!window.confirm(`Delete ${folder.subject} and every note in it?`)) return
    try {
      const result = await deleteFolder(folder.id, session.token)
      const belongsToFolder = (note) => note.folderId === folder.id || (!note.folderId && note.subject === folder.subject && note.year === folder.year)
      setFolders((current) => current.filter((item) => item.id !== folder.id))
      setAdminNotes((current) => current.filter((note) => !belongsToFolder(note)))
      setLiveNotes((current) => current.filter((note) => !belongsToFolder(note)))
      setNotice(`Subject and ${result.deletedNotes} linked note(s) deleted.`)
    } catch (error) { setNotice(error.message) }
  }

  const handleEditNote = async (note) => {
    const { id, ...changes } = note
    try {
      const updated = await updateNote(id, changes, session.token)
      setAdminNotes((current) => current.map((item) => item.id === id ? { ...item, ...updated } : item))
      setLiveNotes((current) => current.map((item) => item.id === id ? { ...item, ...updated } : item))
      setNotice('Published note updated.')
      return true
    } catch (error) { setNotice(error.message); return false }
  }

  const handleDeleteNote = async (note) => {
    if (!window.confirm(`Delete ${note.title}?`)) return
    try { await deleteNote(note.id, session.token); setAdminNotes((current) => current.filter((item) => item.id !== note.id)); setLiveNotes((current) => current.filter((item) => item.id !== note.id)); setNotice('Published note deleted.') } catch (error) { setNotice(error.message) }
  }

  const handleSetContentPermissions = async (id, permissions, fullAdmin) => {
    try {
      const updated = await setUserPermissions(id, permissions, fullAdmin, session.token)
      if (updated.pendingApproval) {
        setNotice('Admin promotion request sent to the main admin for review.')
        return updated
      }
      setAdminUsers((users) => users.map((user) => user.id === id ? { ...user, ...updated } : user))
      setNotice('Access permissions saved. The user must sign in again.')
      return updated
    } catch (error) { setNotice(error.message) }
  }

  const handleAdminRoleRequestDecision = async (request, decision) => {
    try {
      const result = await decideAdminRoleRequest(request.id, decision, session.token)
      setAdminRoleRequests((requests) => requests.filter((item) => item.id !== request.id))
      if (result.status === 'approved') {
        setAdminUsers((users) => users.map((user) => user.id === result.targetUserId ? { ...user, role: 'admin', permissions: {} } : user))
      }
      setNotice(`Admin promotion request ${result.status}.`)
    } catch (error) { setNotice(error.message) }
  }

  const handleCreateNotice = async ({ title, message, type = 'general', link = '' }) => {
    try {
      const created = await createNotice({ title, message, type, link }, session.token)
      setNoticeBoard((current) => [created, ...current])
      setNotice('Notice published to the board.')
      return true
    } catch (error) {
      setNotice(error.message)
      return false
    }
  }

  const handleEditNotice = async (id, changes) => {
    try {
      const updated = await updateNotice(id, changes, session.token)
      setNoticeBoard((notices) => notices.map((item) => item.id === id ? { ...item, ...updated } : item))
      setNotice('Notice updated on the board.')
      return true
    } catch (error) {
      setNotice(error.message)
      return false
    }
  }

  const handleDeleteNotice = async (id) => {
    if (!window.confirm('Delete this notice from the board?')) return
    try {
      await deleteNotice(id, session.token)
      setNoticeBoard((notices) => notices.filter((item) => item.id !== id))
      setNotice('Notice deleted from the board.')
    } catch (error) { setNotice(error.message) }
  }

  const handleExportUsers = async () => {
    try {
      await downloadAdminExport(session.token)
      setNotice('Admin workbook downloaded.')
    } catch (error) { setNotice(error.message) }
  }

  const handleDeleteAllUsers = async () => {
    const count = adminUsers.filter((user) => user.role !== 'admin').length
    if (!count || !window.confirm(`Permanently delete all ${count} non-admin users? Their activity will be archived in the export.`)) return
    try {
      const result = await deleteAllAdminUsers(session.token)
      setAdminUsers((users) => users.filter((user) => user.role === 'admin'))
      setNotice(`${result.deletedCount} non-admin user(s) deleted.`)
    } catch (error) { setNotice(error.message) }
  }

  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  useEffect(() => {
    if (signedIn || view === 'profile' || view === 'admin') return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.35) {
            setView(entry.target.id);
            break;
          }
        }
      },
      { threshold: 0.35 }
    );
    const sections = ['home', 'notes', 'students'].map((id) => document.getElementById(id)).filter(Boolean);
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [signedIn, view]);


  // Lock body scroll ONLY on mobile drawer (screen <= 1024px) when open
  useEffect(() => {
    if (sidebarOpen && typeof window !== 'undefined' && window.innerWidth <= 1024) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    } else {
      document.body.style.overflow = ''
    }
  }, [sidebarOpen])

  return (
    <div className={`app-shell dashboard-layout ${sidebarOpen ? 'sidebar-active' : 'sidebar-collapsed'}`}>
      {sidebarOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
      <Sidebar
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        mobileNavOpen={sidebarOpen}
        setMobileNavOpen={setSidebarOpen}
        view={view}
        setView={setView}
        canManageContent={canManageContent}
        signedIn={signedIn}
        session={session}
        handleSignOut={handleSignOut}
        navigate={navigate}
        scrollTo={scrollTo}
        setAuthOpen={setAuthOpen}
      />

      <div className={`main-content-wrapper ${sidebarOpen ? 'sidebar-active' : 'sidebar-collapsed'}`}>
        <header className="app-topbar">
          <div className="topbar-left">
            {!sidebarOpen && (
              <button 
                className="icon-button menu-toggle-btn" 
                aria-label="Open sidebar menu" 
                onClick={() => setSidebarOpen(true)}
                title="Open sidebar"
              >
                <Menu size={22} />
              </button>
            )}
            <span 
              className="topbar-brand-text"
              onClick={() => {
                setView('home')
                if (window.innerWidth <= 1024) setSidebarOpen(false)
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
              style={{ cursor: 'pointer' }}
            >
              <span className="brand-mark"><Zap size={18} fill="currentColor" /></span>
              <span>FreeStudy<i>Material</i></span>
            </span>
          </div>

          <div className="topbar-right">
            {signedIn ? (
              <button 
                className="avatar-circle small" 
                aria-label="Profile and account settings" 
                onClick={() => {
                  navigate('profile')
                  if (window.innerWidth <= 1024) setSidebarOpen(false)
                }}
                title="Edit profile & account details"
              >
                {session.user?.name?.slice(0, 2).toUpperCase() || 'TT'}
              </button>
            ) : (
              <button 
                className="button button-ghost compact-button" 
                onClick={() => {
                  setAuthOpen(true)
                  if (window.innerWidth <= 1024) setSidebarOpen(false)
                }}
                style={{ fontSize: '0.8rem', padding: '6px 14px' }}
              >
                Sign in
              </button>
            )}
          </div>
        </header>

        <main className="main-content"><Suspense fallback={<div className="loading-skeleton">Loading view...</div>}>
          {view === 'profile' && signedIn ? (
            <ProfileView user={session.user} onSave={handleProfileSave} onBack={() => setView('home')} />
          ) : (view === 'admin' && (isAdmin || canManageContent)) ? (
            <div id="admin">
              {isAdmin ? (
                <>
                  <AdminView
                    users={adminUsers}
                    notes={adminNotes && adminNotes.length ? adminNotes : liveNotes}
                    folders={folders}
                    token={session.token}
                    roleRequests={adminRoleRequests}
                    canApproveAdminRequests={canApproveAdminRequests}
                    onRoleRequestDecision={handleAdminRoleRequestDecision}
                    onExport={handleExportUsers}
                    onCreateFolder={handleCreateFolder}
                    onCreateNote={handleAdminNote}
                    onNoteStatus={handleNoteStatus}
                    onEditFolder={handleEditFolder}
                    onDeleteFolder={handleDeleteFolder}
                    onEditNote={handleEditNote}
                    onDeleteNote={handleDeleteNote}
                    onUpdateUser={handleUpdateAdminUser}
                    onDeleteAll={handleDeleteAllUsers}
                    onBlock={async (id, blocked) => { await setUserBlocked(id, blocked, session.token); setAdminUsers((users) => users.map((user) => user.id === id ? { ...user, blocked } : user)) }}
                    onDelete={async (id) => { try { await deleteAdminUser(id, session.token); setAdminUsers((users) => users.filter((user) => user.id !== id)); setNotice('User deleted from access management.') } catch (error) { setNotice(error.message) } }}
                    notices={noticeBoard}
                    onCreateNotice={handleCreateNotice}
                    onDeleteNotice={handleDeleteNotice}
                    onEditNotice={handleEditNotice}
                  />
                  <ContentAdminManager users={adminUsers} canApproveAdminRequests={canApproveAdminRequests} onSavePermissions={handleSetContentPermissions} />
                </>
              ) : (
                <ContentAdminView folders={folders} notes={adminNotes && adminNotes.length ? adminNotes : liveNotes} permissions={session.user?.role === 'content_admin' ? Object.fromEntries(notePermissionOptions.map(({ key }) => [key, true])) : (session.user?.permissions || {})} onCreateNote={handleAdminNote} onEditNote={handleEditNote} onDeleteNote={handleDeleteNote} onNoteStatus={handleNoteStatus} />
              )}
            </div>
          ) : view === 'admin' ? (
            <div className="page-width" style={{ maxWidth: 640, margin: '80px auto', padding: '36px 28px', textAlign: 'center', background: 'rgba(15, 23, 42, 0.9)', border: '1.5px solid rgba(244, 63, 94, 0.4)', borderRadius: '20px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
              <div style={{ color: '#f43f5e', marginBottom: '16px', display: 'flex', justifyContent: 'center' }}><ShieldCheck size={48} /></div>
              <h2 style={{ color: '#f1f5f9', fontSize: '1.6rem', marginBottom: '10px' }}>Admin Access Restricted</h2>
              <p style={{ color: '#94a3b8', fontSize: '0.95rem', marginBottom: '24px', lineHeight: '1.6' }}>
                Your signed-in account ({session?.user?.email || 'Guest'}) does not have root system privileges to view the Admin Operations Center.
              </p>
              <button className="button" onClick={() => setView('home')} style={{ background: 'linear-gradient(135deg, #00f2fe 0%, #38bdf8 100%)', color: '#030712', fontWeight: '800', margin: '0 auto' }}>
                Return to Mission Dashboard
              </button>
            </div>
          ) : signedIn ? (
            <div id="student-portal">
              <StudentDashboard
                user={session.user}
                notes={liveNotes}
                folders={folders}
                notices={noticeBoard}
                activeView={view}
                onViewChange={setView}
                onNavigate={(target) => {
                  setView(target);
                }}
                onExploreNotes={() => setView('notes')}
                onNoteAccess={handleNoteAccess}
              />
            </div>
          ) : (
            <div id="home">
              <Home onExplore={() => setAuthOpen(true)} onSignIn={() => setAuthOpen(true)} signedIn={signedIn} noticeBoard={noticeBoard} />
            </div>
          )}
        </Suspense></main>
      </div>

      {notice && (
        <aside className="toast-notification crazy-notice-box" role="status" aria-live="polite">
          <div className="notice-box-glow"></div>
          <div className="notice-box-header">
            <div className="notice-status-badge">
              <span className="notice-beacon-ring"></span>
              <span className="notice-badge-title">⚡ OFFICIAL NOTICE</span>
            </div>
            <div className="notice-timestamp-pill">
              <Clock3 size={12} />
              <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
            </div>
            <button className="notice-close-button" onClick={() => setNotice('')} aria-label="Dismiss notice">
              <X size={15} />
            </button>
          </div>
          <div className="notice-box-content">
            <span className="notice-icon-frame">
              <Bell size={18} />
            </span>
            <div className="notice-text-wrapper">
              <p className="notice-message-text"><FormattedNoticeMessage text={notice} /></p>
            </div>
          </div>
          <div className="notice-timer-bar"></div>
        </aside>
      )}
      {authOpen && <Suspense fallback={<div className="modal-overlay"><div className="modal-content"><div className="loading-skeleton">Loading...</div></div></div>}><AuthModal onClose={() => setAuthOpen(false)} onSuccess={handleAuthSuccess} /></Suspense>}
      {adminOpen && signedIn && <AddNoteModal onClose={() => setAdminOpen(false)} onSubmit={handleCreateNote} />}
    </div>
  )
}

function Home({ onExplore, onSignIn, signedIn, noticeBoard = [] }) {
  // Parallax: the desk items drift slightly with the pointer (only for precise mouse devices, skipped on touchscreens)
  useEffect(() => {
    // Only run on desktop with a real mouse pointer
    const hasFinePointer = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: fine)').matches
    if (!hasFinePointer || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const root = document.documentElement
    let ticking = false
    const move = (e) => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          root.style.setProperty('--mx', ((e.clientX / window.innerWidth) * 2 - 1).toFixed(2))
          root.style.setProperty('--my', ((e.clientY / window.innerHeight) * 2 - 1).toFixed(2))
          ticking = false
        })
        ticking = true
      }
    }
    window.addEventListener('pointermove', move, { passive: true })
    return () => window.removeEventListener('pointermove', move)
  }, [])

  const ticker = [
    'DISTRIBUTED CLOUD ARCHITECTURE',
    'DATA STRUCTURES & ALGORITHMIC COMPLEXITY',
    'NEURAL NETWORKS & DEEP LEARNING',
    'CYBERSECURITY & CRYPTOGRAPHY',
    'OPERATING SYSTEMS & KERNEL DESIGN',
    'DATABASE INTERNALS & SHARDING',
    'TELEGRAM TOPIC STORAGE CLOUD',
  ]

  return <>
    <section className="hero page-width">
      <div>
        <div className="eyebrow"><span className="live-dot" /> FREESTUDYMATERIAL // QUANTUM KNOWLEDGE CLOUD</div>
        <h1>Architect your engineering mastery.</h1>
        <p>Curated university lecture archives, verified engineering blueprints, and private Telegram cloud infrastructure. Designed for high-performing computer scientists and builders.</p>
        <div className="hero-actions" style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '28px' }}>
          <button className="button button-ink" onClick={signedIn ? onExplore : onSignIn}>
            {signedIn ? 'Access Knowledge Vault' : 'Initialize Access / Sign In'} <ArrowUpRight size={17} />
          </button>
          <button className="button button-ghost" onClick={onExplore} style={{ border: '1.5px solid rgba(0, 242, 254, 0.45)', color: '#38bdf8' }}>
            Browse Catalog
          </button>
        </div>
        <div className="hero-proof">
          <div className="avatar-stack">
            <span style={{ background: 'var(--pink)' }}>AM</span><span style={{ background: 'var(--cyan)' }}>MI</span>
            <span style={{ background: 'var(--yellow)' }}>KS</span><span style={{ background: 'var(--mint)' }}>+8k</span>
          </div>
          <div>
            <strong>8,450+ Engineers Connected</strong>
            <small style={{ display: 'block', color: '#00f2fe', fontWeight: '700' }}>⚡ Telegram Supergroup Sync Live</small>
          </div>
        </div>
      </div>

      <div className="hero-hud-container" aria-hidden="true">
        {/* Main Glassmorphic Cyber Console */}
        <div className="cyber-console">
          <div className="console-header">
            <div className="console-traffic-dots">
              <span className="dot red"></span>
              <span className="dot yellow"></span>
              <span className="dot green"></span>
            </div>
            <div className="console-title">
              <Cpu size={14} className="cyan-icon" />
              <span>NODE-01 // TELEGRAM CLOUD STORAGE MATRIX</span>
            </div>
            <div className="console-badge">
              <span className="ping-beacon"></span>
              <span>12ms // LIVE</span>
            </div>
          </div>

          <div className="console-body">
            <div className="console-code-block">
              <div className="code-line">
                <span className="code-prefix">$</span>
                <span className="code-cmd">freestudymaterial cluster --sync</span>
                <span className="code-flag">--storage=telegram</span>
              </div>
              <div className="code-output success">
                ✓ Supergroup connected: <strong>FREESTUDYMATERIAL STORAGE</strong>
              </div>
              <div className="code-output info">
                ✓ Active Topic Pipeline: <strong>Thread #2 [DBMS & Algorithms]</strong>
              </div>
              <div className="code-output highlight">
                ✓ Streaming Throughput: <strong>84.2 MB/s · Direct Channel</strong>
              </div>
            </div>

            {/* Live Interactive Telemetry Cards */}
            <div className="hud-metric-row">
              <div className="hud-card">
                <div className="hud-card-label">DATABASE NODE</div>
                <div className="hud-card-val cyan">Firestore + TG</div>
                <small className="hud-card-sub">Hybrid Cloud</small>
              </div>
              <div className="hud-card">
                <div className="hud-card-label">COVERAGE</div>
                <div className="hud-card-val gold">1st - 4th Year</div>
                <small className="hud-card-sub">Core Engineering</small>
              </div>
              <div className="hud-card">
                <div className="hud-card-label">SECURITY PROTOCOL</div>
                <div className="hud-card-val mint">Role Verified</div>
                <small className="hud-card-sub">JWT + IP Guarded</small>
              </div>
            </div>

            {/* Featured Subject Module Blueprint */}
            <div className="hud-blueprint-card">
              <div className="blueprint-top">
                <span className="blueprint-tag">MODULE BLUEPRINT</span>
                <span className="blueprint-subject">DSA & ALGORITHMIC COMPLEXITY</span>
              </div>
              <h4 className="blueprint-title">Graph Traversals, Dynamic Programming & Asymptotics</h4>
              <div className="blueprint-foot">
                <span>Unit 1 - 5 Full Coverage</span>
                <span className="verified-pill">✓ Verified by Admins</span>
              </div>
            </div>
          </div>
        </div>

        {/* Ambient Neon Floating Badges */}
        <div className="hud-float-badge badge-1">
          <Zap size={16} />
          <span>Telegram Topic Streaming Active</span>
        </div>
        <div className="hud-float-badge badge-2">
          <ShieldCheck size={16} />
          <span>100% Curated Engineering Blueprints</span>
        </div>
      </div>
    </section>

    <div className="marquee" aria-hidden="true">
      <div className="marquee-track">{[...ticker, ...ticker].map((item, i) => <span key={i}>⚡ {item}</span>)}</div>
    </div>

    <section className="page-width">
      <div className="pillars">
        <div className="pillar">
          <b>Instant Telegram Cloud</b>
          <p>Direct supergroup topics sync with zero file degradation, lightning-fast streaming, and 200MB+ storage capacity.</p>
        </div>
        <div className="pillar">
          <b>Curated Academic Blueprints</b>
          <p>Verified unit-by-unit syllabus breakdowns, code templates, and semester examination question models.</p>
        </div>
        <div className="pillar">
          <b>Granular Access Matrix</b>
          <p>Real-time audit telemetry, year & branch access control, and identity-verified streaming directly to your device.</p>
        </div>
      </div>
    </section>

    {signedIn && (
      <div id="notices" style={{ paddingTop: '16px' }}>
        <NoticeBoard notices={noticeBoard} canManage={false} />
      </div>
    )}

    <section className="page-width" style={{ paddingTop: 0 }}>
      <div className="section-head">
        <div><span className="eyebrow">quantum academic gateway</span><h2>Knowledge worth<br />keeping close.</h2></div>
        <button className="round-btn" onClick={onExplore} aria-label="Go to the library"><ArrowUpRight size={22} /></button>
      </div>
      <div className="teaser-board">
        <div className="teaser-cards" aria-hidden="true"><div className="ghost-note" /><div className="ghost-note" /><div className="ghost-note" /></div>
        <div className="teaser-lock card">
          <span className="icon-tile pink"><LockKeyhole size={22} /></span>
          <div>
            <h3>{signedIn ? 'Your Knowledge Vault is Unlocked.' : 'Authenticate to Unlock the Engineering Vault.'}</h3>
            <p>Access peer-reviewed study notes, syllabus schematics, and direct Telegram cloud downloads. Verified members can contribute and upload.</p>
          </div>
        </div>
      </div>
    </section>
  </>
}

export default App

