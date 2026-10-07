import React, { useState, useMemo } from 'react';
import { 
  Sparkles, BookOpen, Download, ShieldCheck, Zap, 
  Terminal, ArrowUpRight, Flame, Clock, Award, 
  ChevronRight, Compass, Cpu, Bell, ExternalLink,
  Code2, CheckCircle2, Lock, FileText, Search, X,
  Radio, HardDrive, Filter, Eye, Layers, Share2,
  FolderOpen, UserCheck, TrendingUp, ChevronDown,
  UploadCloud, Activity
} from 'lucide-react';
import UploadDocumentSpace from './UploadDocumentSpace';
import StudentsView from './StudentsView';
import NoticeBoard from './NoticeBoard';

export default function StudentDashboard({ 
  user, 
  notes = [], 
  folders = [], 
  notices = [], 
  token,
  onNavigate, 
  onNoteAccess,
  onUploadSuccess,
  activeView = 'home',
  onViewChange
}) {
  // Navigation tab state: 'overview' | 'vault' | 'radar' | 'network'
  const initialTab = activeView === 'notes' ? 'vault' 
                   : activeView === 'notices' ? 'radar' 
                   : activeView === 'students' ? 'network' 
                   : 'overview';
  const [activeTab, setActiveTab] = useState(initialTab);
  
  // Search and filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('All');
  const [sortBy, setSortBy] = useState('popular'); // 'popular' | 'newest' | 'alphabetical'
  const [uploadDrawerOpen, setUploadDrawerOpen] = useState(false);
  const [previewNote, setPreviewNote] = useState(null);

  const userYear = user?.year || '1st year';
  const userBranch = user?.branch || 'Computer Science & Engineering';
  const userName = user?.name || 'Cadet';
  const initials = userName.slice(0, 2).toUpperCase();

  // Distinct subjects list with item counts
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

  // Notes recommended for the student's year
  const recommendedNotes = useMemo(() => {
    return notes.filter(n => {
      if (!n) return false;
      if (!n.year) return true;
      return n.year.toLowerCase().includes(userYear.toLowerCase()) || 
             userYear.toLowerCase().includes(n.year.toLowerCase());
    });
  }, [notes, userYear]);

  // Filtered & sorted notes
  const filteredNotes = useMemo(() => {
    let result = notes.filter(n => {
      if (!n) return false;
      const matchesSearch = !searchQuery || 
        `${n.title} ${n.subject} ${n.author} ${n.year}`.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesSubject = selectedSubject === 'All' || n.subject === selectedSubject;
      return matchesSearch && matchesSubject;
    });

    if (sortBy === 'popular') {
      result.sort((a, b) => (b.downloadCount || 0) - (a.downloadCount || 0));
    } else if (sortBy === 'newest') {
      result.sort((a, b) => {
        const timeA = a.createdAt?._seconds || (a.createdAt ? new Date(a.createdAt).getTime() : 0);
        const timeB = b.createdAt?._seconds || (b.createdAt ? new Date(b.createdAt).getTime() : 0);
        return timeB - timeA;
      });
    } else if (sortBy === 'alphabetical') {
      result.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    }

    return result;
  }, [notes, searchQuery, selectedSubject, sortBy]);

  // Top trending blueprints
  const topTrendingNotes = useMemo(() => {
    return [...notes]
      .sort((a, b) => (b.downloadCount || 0) - (a.downloadCount || 0))
      .slice(0, 4);
  }, [notes]);

  // Recent urgent notices
  const recentNotices = notices.slice(0, 4);
  const urgentCount = notices.filter(n => n.type === 'alert').length;

  const handleTabSwitch = (tab) => {
    setActiveTab(tab);
    if (onViewChange) {
      if (tab === 'overview') onViewChange('home');
      else if (tab === 'vault') onViewChange('notes');
      else if (tab === 'radar') onViewChange('notices');
      else if (tab === 'network') onViewChange('students');
    }
  };

  return (
    <div className="quantum-dashboard-shell">
      {/* 🌌 AMBIENT BACKGROUND GLOW ENGINE */}
      <div className="ambient-mesh-canvas" aria-hidden="true">
        <div className="mesh-orb orb-cyan" />
        <div className="mesh-orb orb-violet" />
        <div className="mesh-orb orb-amber" />
      </div>

      <div className="dashboard-dynamic-container">
        
        {/* =========================================================
            🚀 1. HOLOGRAPHIC CADET HUD HERO BAR
            ========================================================= */}
        <header className="cadet-hud-banner">
          <div className="hud-glass-surface">
            <div className="hud-left-profile">
              <div className="cadet-holo-avatar-wrap">
                <div className="cadet-holo-avatar">
                  <span>{initials}</span>
                </div>
                <span className="cadet-live-pulse-beacon" title="Cadet Connected & Synced" />
              </div>

              <div className="cadet-info-stack">
                <div className="cadet-tag-row">
                  <span className="cyber-pill pill-cyan">
                    <span className="dot-blink" /> CADET ONLINE
                  </span>
                  <span className="cyber-pill pill-gold">
                    <Award size={12} />
                    {user?.role === 'admin' ? 'SYSTEM PROTOCOL ARCHITECT' : user?.role === 'content_admin' ? 'CONTENT CURATOR' : 'HONOR CADET'}
                  </span>
                  <span className="cyber-pill pill-mono">
                    <Terminal size={12} /> {userYear}
                  </span>
                </div>

                <h1 className="cadet-greeting-title">
                  Greetings, <span className="text-holo-gradient">{userName}</span>
                </h1>
                
                <p className="cadet-subtext">
                  Connected to <strong>FreeStudyMaterial Cloud</strong> for <strong>{userBranch}</strong>. Direct Telegram Supergroup edge stream active with 100% loss-free academic archives.
                </p>
              </div>
            </div>

            {/* Live Telemetry Matrix */}
            <div className="hud-telemetry-cluster">
              <div className="telemetry-node">
                <div className="telemetry-node-top">
                  <Cpu size={14} className="node-icon cyan" />
                  <span className="node-label">STREAM NODE</span>
                </div>
                <div className="node-value">Telegram Supergroup</div>
                <div className="node-status text-cyan">⚡ 12ms // LIVE STREAM</div>
              </div>

              <div className="telemetry-node">
                <div className="telemetry-node-top">
                  <HardDrive size={14} className="node-icon gold" />
                  <span className="node-label">TOTAL REPOSITORY</span>
                </div>
                <div className="node-value">{notes.length} Blueprints</div>
                <div className="node-status text-gold">Across {folders.length} Subjects</div>
              </div>

              <div className="telemetry-node">
                <div className="telemetry-node-top">
                  <Radio size={14} className="node-icon mint" />
                  <span className="node-label">CAMPUS RADAR</span>
                </div>
                <div className="node-value">{notices.length} Transmissions</div>
                <div className="node-status text-mint">
                  {urgentCount > 0 ? `🚨 ${urgentCount} Urgent Alert` : '✓ All Systems Nominal'}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* =========================================================
            🧭 2. DYNAMIC COMMAND DOCK (NAVIGATION MATRIX)
            ========================================================= */}
        <nav className="command-dock-bar" aria-label="Command Center Switcher">
          <div className="dock-pill-track">
            <button 
              className={`dock-pill-btn ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => handleTabSwitch('overview')}
            >
              <Zap size={16} />
              <span>Mission Overview</span>
            </button>

            <button 
              className={`dock-pill-btn ${activeTab === 'vault' ? 'active' : ''}`}
              onClick={() => handleTabSwitch('vault')}
            >
              <BookOpen size={16} />
              <span>Quantum Vault</span>
              <span className="dock-badge">{notes.length}</span>
            </button>

            <button 
              className={`dock-pill-btn ${activeTab === 'radar' ? 'active' : ''}`}
              onClick={() => handleTabSwitch('radar')}
            >
              <Radio size={16} />
              <span>Campus Radar</span>
              {urgentCount > 0 && <span className="dock-badge alert">{urgentCount}</span>}
            </button>

            <button 
              className={`dock-pill-btn ${activeTab === 'network' ? 'active' : ''}`}
              onClick={() => handleTabSwitch('network')}
            >
              <Award size={16} />
              <span>Cadet Network</span>
            </button>

            {(user?.role === 'admin' || user?.role === 'content_admin') && (
              <button 
                className="dock-pill-btn"
                onClick={() => onNavigate && onNavigate('admin')}
                style={{
                  background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.15) 0%, rgba(245, 158, 11, 0.25) 100%)',
                  border: '1px solid rgba(251, 191, 36, 0.5)',
                  color: '#fbbf24',
                  boxShadow: '0 0 12px rgba(251, 191, 36, 0.2)'
                }}
              >
                <ShieldCheck size={16} />
                <span>Admin Operations</span>
              </button>
            )}
          </div>

          <div className="dock-action-wrap">
            <button 
              className="cyber-action-button"
              onClick={() => setUploadDrawerOpen(prev => !prev)}
            >
              <UploadCloud size={16} />
              <span>Contribute Blueprint</span>
            </button>
          </div>
        </nav>

        {/* =========================================================
            📤 3. EXPANDABLE UPLOAD BLUEPRINT DRAWER
            ========================================================= */}
        {uploadDrawerOpen && (
          <section className="dashboard-upload-drawer card">
            <div className="drawer-header">
              <div className="drawer-title-group">
                <span className="icon-tile cyan"><UploadCloud size={20} /></span>
                <div>
                  <h3>Direct Academic Contribution Dock</h3>
                  <p>Upload new lecture notes, exam quantum blueprints, or syllabus modules directly to the archive.</p>
                </div>
              </div>
              <button 
                className="close-drawer-btn" 
                onClick={() => setUploadDrawerOpen(false)}
                aria-label="Close upload drawer"
              >
                <X size={18} />
              </button>
            </div>
            <div className="drawer-content">
              <UploadDocumentSpace folders={folders} token={token} onUploadSuccess={onUploadSuccess} />
            </div>
          </section>
        )}

        {/* =========================================================
            ⚡ TAB 1: MISSION OVERVIEW
            ========================================================= */}
        {activeTab === 'overview' && (
          <div className="overview-tab-view">
            
            {/* Quick Action Stat Grid */}
            <div className="overview-stat-row">
              <div className="cyber-metric-card cyan" onClick={() => handleTabSwitch('vault')}>
                <div className="metric-header">
                  <span className="metric-tag">VAULT BLUEPRINTS</span>
                  <ArrowUpRight size={16} className="metric-arrow" />
                </div>
                <div className="metric-number">{notes.length}</div>
                <p className="metric-sub">Curated exam questions, unit breakdowns & code solutions</p>
              </div>

              <div className="cyber-metric-card violet" onClick={() => handleTabSwitch('vault')}>
                <div className="metric-header">
                  <span className="metric-tag">TAILORED FOR YOU</span>
                  <Sparkles size={16} className="metric-arrow" />
                </div>
                <div className="metric-number">{recommendedNotes.length}</div>
                <p className="metric-sub">Specifically mapped to {userYear} engineering curriculum</p>
              </div>

              <div className="cyber-metric-card amber" onClick={() => handleTabSwitch('radar')}>
                <div className="metric-header">
                  <span className="metric-tag">LIVE BROADCASTS</span>
                  <Radio size={16} className="metric-arrow" />
                </div>
                <div className="metric-number">{notices.length}</div>
                <p className="metric-sub">Official campus announcements, timetables & directives</p>
              </div>
            </div>

            {/* Urgent Campus Radar Preview (If notices exist) */}
            {recentNotices.length > 0 && (
              <section className="overview-section">
                <div className="section-title-bar">
                  <div className="title-left">
                    <span className="live-radar-dot" />
                    <h2>Urgent Campus Radar // Transmissions</h2>
                  </div>
                  <button className="view-more-link" onClick={() => handleTabSwitch('radar')}>
                    View All Transmissions <ChevronRight size={16} />
                  </button>
                </div>

                <div className="urgent-radar-grid">
                  {recentNotices.map((notice, idx) => (
                    <article key={notice.id || idx} className={`radar-card-premium ${notice.type === 'alert' ? 'is-alert' : ''}`}>
                      <div className="radar-card-top">
                        <span className={`radar-badge ${notice.type === 'alert' ? 'badge-alert' : 'badge-general'}`}>
                          {notice.type === 'alert' ? '🚨 EMERGENCY DIRECTIVE' : '📢 CAMPUS BULLETIN'}
                        </span>
                        <span className="radar-date">
                          {notice.createdAt?._seconds 
                            ? new Date(notice.createdAt._seconds * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                            : 'Broadcasted'}
                        </span>
                      </div>
                      <h3 className="radar-card-heading">{notice.title}</h3>
                      <p className="radar-card-text">{notice.message}</p>
                      {notice.link && (
                        <a href={notice.link} target="_blank" rel="noreferrer" className="radar-attach-btn">
                          Open Official Attachment <ExternalLink size={13} />
                        </a>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            )}

            {/* Hot Trending Blueprints Section */}
            <section className="overview-section">
              <div className="section-title-bar">
                <div className="title-left">
                  <Flame size={20} className="flame-icon-hot" />
                  <h2>Top Downloaded Engineering Blueprints</h2>
                </div>
                <button className="view-more-link" onClick={() => handleTabSwitch('vault')}>
                  Explore Complete Vault <ChevronRight size={16} />
                </button>
              </div>

              <div className="blueprint-cards-grid">
                {topTrendingNotes.map((note) => (
                  <BlueprintCard 
                    key={note.id || note.title} 
                    note={note} 
                    onAccess={onNoteAccess}
                    onPreview={setPreviewNote}
                  />
                ))}
              </div>
            </section>

            {/* Fast Subject Quick-Launch Matrix */}
            <section className="overview-section">
              <div className="section-title-bar">
                <div className="title-left">
                  <Layers size={20} className="cyan-icon" />
                  <h2>Subject Clusters</h2>
                </div>
              </div>

              <div className="subject-cluster-strip">
                {subjectList.map((item) => (
                  <button 
                    key={item.name} 
                    className="subject-pill-tile"
                    onClick={() => {
                      setSelectedSubject(item.name);
                      handleTabSwitch('vault');
                    }}
                  >
                    <FolderOpen size={16} className="cluster-icon" />
                    <span className="cluster-name">{item.name}</span>
                    <span className="cluster-count">{item.count}</span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* =========================================================
            📚 TAB 2: QUANTUM VAULT (COMPLETE LIBRARY)
            ========================================================= */}
        {activeTab === 'vault' && (
          <div className="vault-tab-view">
            
            {/* Vault Filter & Search Control Panel */}
            <div className="vault-control-panel card">
              <div className="control-search-row">
                <div className="vault-search-box">
                  <Search size={18} className="search-symbol" />
                  <input 
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by blueprint title, unit number, algorithms, syllabus keywords, or author..."
                  />
                  {searchQuery && (
                    <button className="clear-search-btn" onClick={() => setSearchQuery('')} aria-label="Clear search">
                      <X size={16} />
                    </button>
                  )}
                </div>

                <div className="vault-sort-select-wrap">
                  <TrendingUp size={16} className="sort-symbol" />
                  <select 
                    value={sortBy} 
                    onChange={(e) => setSortBy(e.target.value)}
                    className="vault-select"
                  >
                    <option value="popular">🔥 Sort by Most Downloaded</option>
                    <option value="newest">⚡ Sort by Newest Uploaded</option>
                    <option value="alphabetical">🔤 Sort Alphabetically</option>
                  </select>
                </div>
              </div>

              {/* Dynamic Subject Selector Chips */}
              <div className="vault-subject-carousel">
                {subjectList.map((item) => (
                  <button 
                    key={item.name}
                    className={`subject-chip-btn ${selectedSubject === item.name ? 'active' : ''}`}
                    onClick={() => setSelectedSubject(item.name)}
                  >
                    <span>{item.name}</span>
                    <span className="chip-counter">{item.count}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Results Count & Active Filters Indicator */}
            <div className="vault-results-bar">
              <span className="results-label">
                Displaying <strong>{filteredNotes.length}</strong> academic blueprints
                {selectedSubject !== 'All' && <span> in <em>{selectedSubject}</em></span>}
              </span>

              {(selectedSubject !== 'All' || searchQuery) && (
                <button 
                  className="reset-filter-btn"
                  onClick={() => { setSelectedSubject('All'); setSearchQuery(''); }}
                >
                  <X size={14} /> Reset Filters
                </button>
              )}
            </div>

            {/* Blueprints Grid */}
            {filteredNotes.length > 0 ? (
              <div className="blueprint-cards-grid">
                {filteredNotes.map((note) => (
                  <BlueprintCard 
                    key={note.id || note.title} 
                    note={note} 
                    onAccess={onNoteAccess}
                    onPreview={setPreviewNote}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-vault-state card">
                <FileText size={48} className="empty-icon" />
                <h3>No Academic Blueprints Found</h3>
                <p>We could not find blueprints matching "{searchQuery}". Try selecting "All" subjects or refine your keywords.</p>
                <button 
                  className="button button-ghost"
                  onClick={() => { setSelectedSubject('All'); setSearchQuery(''); }}
                >
                  Clear Search Filters
                </button>
              </div>
            )}
          </div>
        )}

        {/* =========================================================
            📢 TAB 3: CAMPUS RADAR (TRANSMISSIONS)
            ========================================================= */}
        {activeTab === 'radar' && (
          <div className="radar-tab-view">
            <header className="radar-view-header">
              <div>
                <span className="eyebrow"><Radio size={14} /> OFFICIAL CAMPUS BROADCAST SYSTEM</span>
                <h2>Urgent Radar Transmissions</h2>
              </div>
              <span className="radar-status-chip">
                <span className="dot-blink" /> LIVE FEED ACTIVE
              </span>
            </header>

            <NoticeBoard notices={notices} canManage={false} />
          </div>
        )}

        {/* =========================================================
            🛡️ TAB 4: CADET NETWORK (COMMUNITY)
            ========================================================= */}
        {activeTab === 'network' && (
          <div className="network-tab-view">
            <header className="radar-view-header">
              <div>
                <span className="eyebrow"><Award size={14} /> PEER ACADEMIC DIRECTORY</span>
                <h2>Cadet Network & Community</h2>
              </div>
            </header>

            <StudentsView onProfile={() => onNavigate?.('profile')} />
          </div>
        )}

      </div>

      {/* =========================================================
          🔍 BLUEPRINT PREVIEW MODAL
          ========================================================= */}
      {previewNote && (
        <div className="modal-backdrop" onClick={() => setPreviewNote(null)}>
          <div className="modal preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="preview-header-tags">
                <span className="cyber-pill pill-cyan">{previewNote.subject}</span>
                {previewNote.year && <span className="cyber-pill pill-mono">{previewNote.year}</span>}
              </div>
              <button className="icon-button" onClick={() => setPreviewNote(null)} aria-label="Close modal">
                <X size={20} />
              </button>
            </div>

            <div className="preview-modal-body">
              <h2 className="preview-title">{previewNote.title}</h2>
              <div className="preview-meta-row">
                <span>Curated by: <strong>{previewNote.author || 'Academic Contributor'}</strong></span>
                <span>Type: <strong>{previewNote.type || 'DOCUMENT / BLUEPRINT'}</strong></span>
                <span>Downloads: <strong>{previewNote.downloadCount || 0} times</strong></span>
              </div>

              <div className="preview-notice-box">
                <ShieldCheck size={20} className="text-cyan" />
                <div>
                  <strong>Direct Telegram Supergroup Channel</strong>
                  <p>This file is served directly through encrypted Telegram cloud storage without size degradation or rate limiting.</p>
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <button className="button button-ghost" onClick={() => setPreviewNote(null)}>
                Dismiss
              </button>
              <a 
                href={previewNote.driveLink || '#'}
                target="_blank"
                rel="noreferrer"
                className="button button-primary"
                onClick={() => {
                  onNoteAccess?.(previewNote);
                  setPreviewNote(null);
                }}
              >
                <Download size={16} /> Open & Download Blueprint
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 💎 Bespoke, Ultra-Premium Quantum Blueprint Card
 */
function BlueprintCard({ note, onAccess, onPreview }) {
  const subjectAesthetics = {
    'Artificial Intelligence (AI)': { borderGlow: '#10b981', badgeClass: 'pill-mint', dotColor: '#10b981' },
    'Cloud Computing (CC)': { borderGlow: '#00f2fe', badgeClass: 'pill-cyan', dotColor: '#00f2fe' },
    'Cryptography (CNS)': { borderGlow: '#c084fc', badgeClass: 'pill-violet', dotColor: '#c084fc' },
    'Deep Learning': { borderGlow: '#f59e0b', badgeClass: 'pill-amber', dotColor: '#f59e0b' },
  };

  const styleConfig = subjectAesthetics[note.subject] || {
    borderGlow: '#00f2fe',
    badgeClass: 'pill-cyan',
    dotColor: '#00f2fe'
  };

  return (
    <article 
      className="quantum-blueprint-card"
      style={{ '--card-accent': styleConfig.borderGlow }}
    >
      <div className="card-ambient-glow" />

      {/* Card Header */}
      <div className="card-top-row">
        <span className={`blueprint-subject-tag ${styleConfig.badgeClass}`}>
          <span className="tag-dot" style={{ background: styleConfig.dotColor }} />
          {note.subject || 'Engineering Core'}
        </span>
        <span className="blueprint-format-tag">
          {note.type || 'DOCUMENT'}
        </span>
      </div>

      {/* Card Title */}
      <h3 className="blueprint-card-title" title={note.title}>
        {note.title}
      </h3>

      {/* Metadata Row */}
      <div className="blueprint-meta-strip">
        <div className="meta-author">
          <span>By <strong>{note.author || 'Academic Team'}</strong></span>
          {note.year && <span className="year-dot">• {note.year}</span>}
        </div>

        <div className="download-velocity-badge">
          <Flame size={13} className="flame-icon" />
          <span>{note.downloadCount || 0} DLs</span>
        </div>
      </div>

      {/* Card Action Bar */}
      <div className="card-action-bar">
        <button 
          className="preview-btn" 
          onClick={() => onPreview?.(note)}
          title="Preview Details"
        >
          <Eye size={15} /> Details
        </button>

        <a 
          href={note.driveLink || '#'} 
          target="_blank" 
          rel="noreferrer" 
          onClick={() => onAccess?.(note)}
          className="stream-download-btn"
        >
          <Download size={15} /> Stream Blueprint
        </a>
      </div>
    </article>
  );
}
