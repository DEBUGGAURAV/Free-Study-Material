import React, { useEffect } from 'react';
import { 
  LayoutDashboard, BookOpen, Users, ShieldCheck, Zap, X, 
  Settings2, LogOut, ArrowUpRight, GraduationCap, Building2, Mail, Bell, UploadCloud
} from 'lucide-react';

export default function Sidebar({
  sidebarOpen, setSidebarOpen, mobileNavOpen, setMobileNavOpen, view, setView, canManageContent,
  signedIn, session, handleSignOut, navigate, scrollTo, setAuthOpen
}) {
  const isOpen = sidebarOpen !== undefined ? sidebarOpen : Boolean(mobileNavOpen);
  const setIsOpen = setSidebarOpen || setMobileNavOpen;

  const items = [
    ['home', 'Notes Vault', BookOpen],
    ['upload', 'Upload Notes', UploadCloud],
    ['notices', 'Notice Board', Bell],
    ['students', 'Student Community', Users],
    ...(canManageContent || session?.user?.role === 'admin' || session?.user?.role === 'content_admin' ? [['admin', 'Admin Center', ShieldCheck]] : []),
  ];

  // Auto-close on ESC key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, setIsOpen]);

  const handleNavClick = (key) => {
    setView(key);
    if (window.innerWidth <= 1024 && setIsOpen) {
      setIsOpen(false);
    }
  };

  const user = session?.user;
  const initials = user?.name ? user.name.slice(0, 2).toUpperCase() : 'FS';

  if (!isOpen) return null;

  return (
    <aside style={{
      position: 'fixed',
      top: 0,
      left: 0,
      bottom: 0,
      width: '280px',
      background: 'rgba(10, 15, 28, 0.96)',
      borderRight: '1px solid var(--border-card)',
      zIndex: 300,
      backdropFilter: 'blur(20px)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: '24px 20px',
      boxShadow: '0 0 50px rgba(0, 0, 0, 0.7)'
    }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="brand-icon-wrapper" style={{ width: '36px', height: '36px' }}>
              <BookOpen size={18} />
            </div>
            <div>
              <div style={{ fontSize: '0.96rem', fontWeight: 800, color: 'var(--text-pure)' }}>Free Study Material</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--accent-cyan)' }}>Academic Cloud</div>
            </div>
          </div>
          <button onClick={() => setIsOpen && setIsOpen(false)} style={{ color: 'var(--text-dim)' }}>
            <X size={20} />
          </button>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {items.map(([key, label, Icon]) => {
            const isActive = view === key;
            return (
              <button
                key={key}
                onClick={() => handleNavClick(key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '11px 16px',
                  borderRadius: 'var(--radius-md)',
                  background: isActive ? 'var(--grad-primary)' : 'transparent',
                  color: isActive ? '#fff' : 'var(--text-muted)',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  transition: 'all 0.15s ease',
                  textAlign: 'left',
                  width: '100%'
                }}
              >
                <Icon size={18} />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div>
        {signedIn ? (
          <div style={{
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
              <div style={{ width: '34px', height: '34px', borderRadius: 'var(--radius-sm)', background: 'var(--grad-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.82rem', fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                {initials}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--text-pure)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user?.name || 'Student'}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{user?.year || 'Member'}</div>
              </div>
            </div>

            <button onClick={handleSignOut} title="Sign Out" style={{ color: 'var(--text-dim)', padding: '6px' }}>
              <LogOut size={16} />
            </button>
          </div>
        ) : (
          <button 
            className="button button-primary"
            style={{ width: '100%', padding: '12px' }}
            onClick={() => { if (setIsOpen) setIsOpen(false); setAuthOpen(true); }}
          >
            <span>Sign In / Join</span>
          </button>
        )}
      </div>
    </aside>
  );
}
