import React, { useState, useEffect } from 'react';
import { 
  Settings2, Database, Trash2, ChevronDown, ChevronUp, RotateCcw, 
  ArchiveRestore, Clock, ShieldAlert, BookOpen, Folder, Users, 
  Bell, FileText, Search, Tag, CheckCircle2, AlertTriangle, Layers
} from 'lucide-react';
import { API_URL } from '../api';

export default function DatabaseAdminPanel({ token }) {
  const [collections, setCollections] = useState([]);
  const [docs, setDocs] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  
  // Reverse store management state
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [reverseSearch, setReverseSearch] = useState('');
  const [expandedJson, setExpandedJson] = useState({});

  const fetchCollections = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/admin/collections`, { headers: { authorization: 'Bearer ' + token } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to fetch collections');
      setCollections(data);
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  const fetchDocs = async (name) => {
    try {
      const res = await fetch(`${API_URL}/admin/collections/` + name, { headers: { authorization: 'Bearer ' + token } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to fetch documents');
      setDocs(prev => ({ ...prev, [name]: data }));
    } catch (err) { setError(err.message); }
  };

  useEffect(() => { 
    fetchCollections(); 
    // Auto-fetch reverse data so user immediately sees categorized deleted items
    fetchDocs('deletedData');
  }, []);

  const deleteEach = async (name, id) => {
    const isTrash = name === 'deletedData';
    const confirmMsg = isTrash
      ? 'Permanently delete this item from the trash? This CANNOT be reversed.'
      : 'Delete document ' + id + ' from ' + name + '? (It will be safely moved to the Reverse Store for 48 hours).';
    if (!window.confirm(confirmMsg)) return;
    try {
      const res = await fetch(`${API_URL}/admin/collections/` + name + '/' + id, { method: 'DELETE', headers: { authorization: 'Bearer ' + token } });
      if (!res.ok) throw new Error('Delete failed');
      setMessage(isTrash ? 'Permanently deleted item ' + id : 'Deleted ' + id + ' (Safely moved to Reverse Store)');
      fetchCollections();
      fetchDocs(name);
      if (!isTrash) fetchDocs('deletedData');
    } catch (err) { setError(err.message); }
  };

  const deleteAll = async (name) => {
    const isTrash = name === 'deletedData';
    const confirmMsg = isTrash
      ? 'Permanently empty all items from the Reverse Store trash?'
      : 'Delete ALL documents from collection ' + name + '? (They will be moved to the Reverse Store for 48 hours).';
    if (!window.confirm(confirmMsg)) return;
    try {
      const res = await fetch(`${API_URL}/admin/collections/` + name, { method: 'DELETE', headers: { authorization: 'Bearer ' + token } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Delete failed');
      setMessage(isTrash ? 'Emptied trash' : 'Moved ' + data.count + ' documents to Reverse Store');
      fetchCollections();
      setDocs(prev => ({ ...prev, [name]: [] }));
      if (!isTrash) fetchDocs('deletedData');
    } catch (err) { setError(err.message); }
  };

  const restoreEach = async (id, title) => {
    if (!window.confirm('Reverse & restore ' + (title ? '\"' + title + '\"' : 'this document') + ' to its original collection?')) return;
    try {
      const res = await fetch(`${API_URL}/admin/collections/restore/` + id, { method: 'POST', headers: { authorization: 'Bearer ' + token } });
      if (!res.ok) throw new Error('Restore failed');
      setMessage('Successfully reversed & restored: ' + (title || id));
      fetchCollections();
      fetchDocs('deletedData');
    } catch (err) { setError(err.message); }
  };

  const restoreAll = async (category = null) => {
    const isCategory = category && category !== 'all';
    const confirmMsg = isCategory
      ? 'Reverse all ' + category + ' records back to their original collection?'
      : 'Reverse ALL deleted records back to their original database collections?';
    if (!window.confirm(confirmMsg)) return;
    
    try {
      const endpoint = isCategory
        ? `${API_URL}/admin/collections/restore-category/` + category
        : `${API_URL}/admin/collections/restore-all`;
      const res = await fetch(endpoint, { method: 'POST', headers: { authorization: 'Bearer ' + token } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Restore failed');
      setMessage('Successfully reversed ' + data.count + ' ' + (isCategory ? category : 'total') + ' documents!');
      fetchCollections();
      fetchDocs('deletedData');
    } catch (err) { setError(err.message); }
  };

  const toggleDocs = (name) => {
    if (docs[name]) {
      setDocs(prev => ({ ...prev, [name]: null }));
    } else {
      fetchDocs(name);
    }
  };

  const toggleJsonExpand = (id) => {
    setExpandedJson(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const trashCol = collections.find(c => c.name === 'deletedData');
  const trashCount = trashCol ? trashCol.count : 0;
  const regularCollections = collections.filter(c => c.name !== 'deletedData');
  const deletedDocs = docs['deletedData'] || [];

  // Group deleted items by category (originalCollection)
  const categoryCounts = deletedDocs.reduce((acc, doc) => {
    const cat = doc.originalCollection || 'other';
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});

  const availableCategories = Object.keys(categoryCounts);

  // Helper to get friendly category styling & icon
  const getCategoryMeta = (cat) => {
    switch (cat.toLowerCase()) {
      case 'notes':
        return { label: 'Notes', icon: BookOpen, color: '#00f2fe', bg: 'rgba(0, 242, 254, 0.15)', border: '#00f2fe' };
      case 'folders':
        return { label: 'Folders', icon: Folder, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', border: '#f59e0b' };
      case 'users':
        return { label: 'Users', icon: Users, color: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)', border: '#a855f7' };
      case 'noticeboard':
      case 'notices':
        return { label: 'Notices', icon: Bell, color: '#f43f5e', bg: 'rgba(244, 63, 94, 0.15)', border: '#f43f5e' };
      default:
        return { label: cat, icon: Database, color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)', border: '#38bdf8' };
    }
  };

  // Helper to extract human-readable identity from deleted document data
  const getIdentity = (doc) => {
    const data = doc.data || {};
    const cat = (doc.originalCollection || '').toLowerCase();
    
    if (cat === 'notes') {
      return {
        title: data.title || data.fileName || 'Untitled Note',
        subtitle: (data.subject || 'No Subject') + (data.year ? ' • ' + data.year : ''),
        details: [
          data.author && 'Author: ' + data.author,
          data.fileUrl && 'Has PDF Link',
          data.downloadsCount !== undefined && 'Downloads: ' + data.downloadsCount
        ].filter(Boolean)
      };
    }
    if (cat === 'folders') {
      return {
        title: (data.subject || 'Subject Folder'),
        subtitle: data.year ? 'Academic Year: ' + data.year : 'Folder',
        details: [data.noteCount !== undefined && data.noteCount + ' notes'].filter(Boolean)
      };
    }
    if (cat === 'users') {
      return {
        title: data.name || data.email || 'User Account',
        subtitle: data.email || '',
        details: [
          data.role && 'Role: ' + data.role,
          data.year && 'Year: ' + data.year,
          data.blocked && 'Status: Blocked'
        ].filter(Boolean)
      };
    }
    if (cat === 'noticeboard' || cat === 'notices') {
      return {
        title: data.title || 'Notice Announcement',
        subtitle: data.text ? data.text.slice(0, 60) + '...' : '',
        details: [data.date && 'Date: ' + data.date].filter(Boolean)
      };
    }
    // Fallback for custom collections
    const firstKey = Object.keys(data).find(k => typeof data[k] === 'string' && data[k].length < 50);
    return {
      title: firstKey ? data[firstKey] : (doc.originalId || doc.id),
      subtitle: 'Original ID: ' + (doc.originalId || doc.id),
      details: []
    };
  };

  // Filter deleted items by category and search term
  const filteredDeletedDocs = deletedDocs.filter(doc => {
    if (selectedCategory !== 'all' && (doc.originalCollection || 'other') !== selectedCategory) {
      return false;
    }
    if (!reverseSearch) return true;
    const term = reverseSearch.toLowerCase();
    const id = (doc.originalId || doc.id || '').toLowerCase();
    const dataStr = JSON.stringify(doc.data || {}).toLowerCase();
    return id.includes(term) || dataStr.includes(term);
  });

  return (
    <div className="admin-table db-panel">
      <div className="table-title" style={{marginBottom: '20px'}}>
        <div>
          <span className="eyebrow">Advanced Database Management</span>
          <h2>Collections & Categorized Reverse Store</h2>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}
      {message && <p className="form-success">{message}</p>}

      {/* ======================================================== */}
      {/* 🔄 CATEGORIZED REVERSE STORE (TRASH & RESTORE CENTER) */}
      {/* ======================================================== */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(6, 78, 59, 0.25) 100%)',
        border: '2px solid #10b981',
        borderRadius: '16px',
        padding: '24px',
        marginBottom: '36px',
        boxShadow: '0 8px 30px rgba(16, 185, 129, 0.15)'
      }}>
        {/* Banner Header */}
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px'}}>
          <div style={{display: 'flex', alignItems: 'center', gap: '14px'}}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '12px',
              background: '#10b981', color: '#000',
              display: 'grid', placeItems: 'center', fontWeight: '900'
            }}>
              <RotateCcw size={24} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <h3 style={{
                  fontSize: '1.4rem', margin: 0,
                  background: 'linear-gradient(135deg, #10b981 0%, #38bdf8 60%, #a7f3d0 100%)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                  fontWeight: '800'
                }}>
                  Categorized Reverse Store
                </h3>
                <span style={{
                  background: trashCount > 0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(56, 189, 248, 0.12)',
                  color: trashCount > 0 ? '#34d399' : '#38bdf8',
                  border: trashCount > 0 ? '1.5px solid #10b981' : '1.5px solid rgba(56, 189, 248, 0.45)',
                  fontSize: '0.82rem',
                  fontWeight: '800',
                  padding: '4px 14px',
                  borderRadius: '20px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '7px',
                  letterSpacing: '0.4px',
                  boxShadow: trashCount > 0 ? '0 0 12px rgba(16, 185, 129, 0.3)' : '0 0 10px rgba(56, 189, 248, 0.18)'
                }}>
                  <span style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: trashCount > 0 ? '#10b981' : '#38bdf8',
                    boxShadow: trashCount > 0 ? '0 0 8px #10b981' : '0 0 8px #38bdf8',
                    display: 'inline-block'
                  }} />
                  {trashCount} Items to Reverse
                </span>
              </div>
              <p style={{margin: '6px 0 0', color: '#cbd5e1', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px'}}>
                <Clock size={15} style={{color: '#10b981'}} />
                Deleted data is organized by category and stored for <strong>48 hours</strong> with instant 1-click Reverse before auto-deletion.
              </p>
            </div>
          </div>

          {/* Top Quick Actions */}
          <div style={{display: 'flex', gap: '10px', flexWrap: 'wrap'}}>
            <button
              className="button compact-button"
              disabled={trashCount === 0}
              onClick={() => restoreAll(selectedCategory)}
              style={{
                background: trashCount > 0 ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : '#334155',
                color: trashCount > 0 ? '#022c22' : '#94a3b8',
                border: 'none',
                fontWeight: '800',
                padding: '10px 18px',
                boxShadow: trashCount > 0 ? '0 4px 15px rgba(16,185,129,0.4)' : 'none',
                cursor: trashCount > 0 ? 'pointer' : 'not-allowed'
              }}
            >
              <RotateCcw size={15} style={{marginRight: '6px'}} /> 
              {selectedCategory === 'all' 
                ? 'Reverse All Records (' + trashCount + ')' 
                : 'Reverse All ' + selectedCategory + ' (' + (categoryCounts[selectedCategory] || 0) + ')'}
            </button>

            <button
              className="button compact-button danger-button"
              disabled={trashCount === 0}
              onClick={() => deleteAll('deletedData')}
              style={{padding: '10px 16px', fontWeight: '700'}}
            >
              <Trash2 size={15} style={{marginRight: '6px'}} /> Empty Trash
            </button>
          </div>
        </div>

        {/* Category Filter Tabs & Search Bar */}
        <div style={{marginTop: '22px', borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: '18px'}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px'}}>
            
            {/* Category Filter Buttons */}
            <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center'}}>
              <span style={{fontSize: '0.85rem', fontWeight: '700', color: '#94a3b8', marginRight: '4px'}}>
                <Layers size={14} style={{display: 'inline', marginRight: '4px', verticalAlign: 'middle'}} />
                Category:
              </span>

              <button
                onClick={() => setSelectedCategory('all')}
                style={{
                  padding: '6px 14px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: '700', cursor: 'pointer',
                  border: selectedCategory === 'all' ? '2px solid #10b981' : '1px solid rgba(255,255,255,0.15)',
                  background: selectedCategory === 'all' ? '#10b981' : 'rgba(255,255,255,0.05)',
                  color: selectedCategory === 'all' ? '#000' : '#e2e8f0'
                }}
              >
                All Categories ({trashCount})
              </button>

              {availableCategories.map(cat => {
                const meta = getCategoryMeta(cat);
                const IconComponent = meta.icon;
                const isSelected = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      padding: '6px 14px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: '700', cursor: 'pointer',
                      border: isSelected ? '2px solid ' + meta.border : '1px solid rgba(255,255,255,0.15)',
                      background: isSelected ? meta.bg : 'rgba(255,255,255,0.05)',
                      color: isSelected ? meta.color : '#e2e8f0'
                    }}
                  >
                    <IconComponent size={14} />
                    {meta.label} ({categoryCounts[cat]})
                  </button>
                );
              })}
            </div>

            {/* Quick Search */}
            <div style={{display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', padding: '4px 12px', minWidth: '240px'}}>
              <Search size={14} style={{color: '#94a3b8', marginRight: '8px'}} />
              <input
                type="text"
                placeholder="Search deleted records..."
                value={reverseSearch}
                onChange={e => setReverseSearch(e.target.value)}
                style={{background: 'transparent', border: 'none', color: '#e0f2fe', fontSize: '0.85rem', padding: '4px 0', outline: 'none', width: '100%', margin: 0, boxShadow: 'none'}}
              />
            </div>
          </div>

          {/* List of Categorized Deleted Records */}
          <div style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
            {filteredDeletedDocs.length === 0 ? (
              <div style={{padding: '24px', textAlign: 'center', color: '#94a3b8', background: 'rgba(0,0,0,0.2)', borderRadius: '10px'}}>
                {trashCount === 0 
                  ? 'The Reverse Store is currently empty! When you delete any note, folder, or user below, it will appear here organized by category.'
                  : 'No deleted items found matching the selected category or search filter.'}
              </div>
            ) : (
              filteredDeletedDocs.map(doc => {
                const cat = doc.originalCollection || 'other';
                const meta = getCategoryMeta(cat);
                const IconComponent = meta.icon;
                const identity = getIdentity(doc);
                const isJsonExpanded = !!expandedJson[doc.id];

                return (
                  <div key={doc.id} style={{
                    background: 'rgba(15, 23, 42, 0.65)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderLeft: '5px solid ' + meta.border,
                    borderRadius: '12px',
                    padding: '16px 20px',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                  }}>
                    {/* Item Card Header */}
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px'}}>
                      
                      {/* Left Details: Category + Identity */}
                      <div style={{flex: 1, minWidth: '260px'}}>
                        <div style={{display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap'}}>
                          {/* Category Badge */}
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: '5px',
                            background: meta.bg, color: meta.color, border: '1px solid ' + meta.border,
                            padding: '3px 10px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: '800', textTransform: 'uppercase'
                          }}>
                            <IconComponent size={13} />
                            {meta.label}
                          </span>

                          {/* Original Document ID */}
                          <span style={{color: '#94a3b8', fontSize: '0.8rem', fontFamily: 'monospace'}}>
                            ID: {doc.originalId || doc.id}
                          </span>
                        </div>

                        {/* Title & Subtitle */}
                        <h4 style={{fontSize: '1.15rem', margin: '4px 0 2px', color: '#f8fafc', fontWeight: '800'}}>
                          {identity.title}
                        </h4>
                        {identity.subtitle && (
                          <div style={{color: '#94a3b8', fontSize: '0.88rem', marginBottom: '6px'}}>
                            {identity.subtitle}
                          </div>
                        )}

                        {/* Metadata Pills */}
                        {identity.details.length > 0 && (
                          <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px'}}>
                            {identity.details.map((pill, i) => (
                              <span key={i} style={{background: 'rgba(255,255,255,0.06)', color: '#cbd5e1', fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.08)'}}>
                                {pill}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Right Action Buttons */}
                      <div style={{display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap'}}>
                        {/* Toggle JSON inspection */}
                        <button
                          onClick={() => toggleJsonExpand(doc.id)}
                          style={{
                            padding: '6px 12px', background: 'rgba(255,255,255,0.08)', color: '#cbd5e1',
                            borderRadius: '8px', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer', border: 'none'
                          }}
                        >
                          {isJsonExpanded ? 'Hide Raw JSON' : 'Inspect JSON'}
                        </button>

                        {/* 🔄 REVERSE & RESTORE BUTTON */}
                        <button
                          className="button compact-button"
                          onClick={() => restoreEach(doc.id, identity.title)}
                          style={{
                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                            color: '#022c22', border: 'none', padding: '8px 16px', fontSize: '0.85rem', fontWeight: '800',
                            borderRadius: '8px', boxShadow: '0 4px 12px rgba(16,185,129,0.3)', cursor: 'pointer'
                          }}
                        >
                          <RotateCcw size={14} style={{marginRight: '6px'}} /> Reverse & Restore
                        </button>

                        {/* 🗑️ PERMANENT DELETE BUTTON */}
                        <button
                          className="button compact-button danger-button"
                          onClick={() => deleteEach('deletedData', doc.id)}
                          style={{padding: '8px 14px', fontSize: '0.85rem', borderRadius: '8px'}}
                        >
                          <Trash2 size={13} style={{marginRight: '4px'}} /> Delete
                        </button>
                      </div>
                    </div>

                    {/* Expandable Raw JSON */}
                    {isJsonExpanded && (
                      <pre style={{
                        marginTop: '12px', background: 'rgba(0,0,0,0.5)', padding: '12px 16px',
                        borderRadius: '8px', fontSize: '0.78rem', color: '#cbd5e1', overflowX: 'auto',
                        border: '1px solid rgba(255,255,255,0.08)'
                      }}>
                        {JSON.stringify(doc.data || doc, null, 2)}
                      </pre>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 📂 ACTIVE DATABASE COLLECTIONS (NORMAL COLLECTIONS) */}
      {/* ======================================================== */}
      <div style={{marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        <h3 style={{margin: 0, fontSize: '1.25rem'}}>Active Database Collections</h3>
        <small style={{color: '#94a3b8'}}>Deleting any item below automatically categorizes it in the Reverse Store above.</small>
      </div>

      {loading && <div className="empty-state">Loading collections...</div>}

      {!loading && regularCollections.map((col) => {
        const meta = getCategoryMeta(col.name);
        const IconComponent = meta.icon;

        return (
          <div key={col.name} className="db-collection-card" style={{marginBottom: '16px'}}>
            <div className="table-row" style={{display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center'}}>
              <span className="file-dot blue" style={{background: meta.border}}><IconComponent size={16} /></span>
              <div className="row-name" style={{flex: 1}}>
                <b style={{fontSize: '18px'}}>{col.name}</b>
                <small>{col.count} documents</small>
              </div>
              
              <div className="user-row-actions" style={{display: 'flex', gap: '10px'}}>
                <button className="button compact-button" onClick={() => toggleDocs(col.name)}>
                  {docs[col.name] ? 'Hide Docs' : 'View Docs'}
                  {docs[col.name] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                
                <button className="button compact-button danger-button" onClick={() => deleteAll(col.name)}>
                  <Trash2 size={14} /> Delete All (Send to Reverse)
                </button>
              </div>
            </div>
            
            {docs[col.name] && (
              <div className="docs-list">
                {docs[col.name].length === 0 ? (
                  <p className="empty-docs">No documents found.</p>
                ) : (
                  docs[col.name].map(doc => (
                    <div key={doc.id} className="document-item" style={{transition: 'all 0.3s', borderRadius: '12px'}}>
                      <div className="document-item-header" style={{display: 'flex', justifyContent: 'space-between', padding: '10px 15px', borderBottom: '1px solid rgba(255,255,255,0.1)'}}>
                        <span className="doc-id" style={{fontFamily: 'monospace', color: '#00f2fe'}}>{doc.id}</span>
                        
                        <button className="button compact-button danger-button" onClick={() => deleteEach(col.name, doc.id)} style={{padding: '4px 12px', fontSize: '12px'}}>
                          <Trash2 size={12} style={{marginRight: '4px'}} /> Delete (Move to Reverse Store)
                        </button>
                      </div>
                      <pre className="document-data" style={{background: 'rgba(0,0,0,0.4)', padding: '15px', borderRadius: '0 0 12px 12px', overflowX: 'auto', fontSize: '13px', color: '#f8fafc', margin: 0}}>
                        {JSON.stringify(doc, null, 2)}
                      </pre>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
