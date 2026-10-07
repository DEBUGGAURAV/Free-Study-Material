import React, { useState } from 'react';
import { Plus, UploadCloud, ArrowUpRight, X, Pencil, Check, Folder, Link as LinkIcon, FileText, CheckCircle2 } from 'lucide-react';

const years = ['1st year', '2nd year', '3rd year', '4th year'];
const subjects = ['Cloud Computing (CC)', 'Cryptography (CNS)', 'Artificial Intelligence (AI)', 'Deep Learning'];

export function FolderForm({ onSubmit }) {
  const [folder, setFolder] = useState({ subject: '', year: years[0] });

  return (
    <form className="card" onSubmit={(e) => { e.preventDefault(); onSubmit(folder); setFolder({ ...folder, subject: '' }); }}>
      <div className="card-head">
        <span className="icon-tile cyan"><Folder size={20} /></span>
        <h3>New subject folder</h3>
      </div>

      <label className="field">Subject name
        <input required value={folder.subject} onChange={(e) => setFolder({ ...folder, subject: e.target.value })} placeholder="e.g. Data Structures" />
      </label>

      <label className="field">Student year
        <select value={folder.year} onChange={(e) => setFolder({ ...folder, year: e.target.value })}>
          {years.map((year) => <option key={year}>{year}</option>)}
        </select>
      </label>

      <button className="button button-block" type="submit"><Plus size={18} /> Add subject folder</button>
    </form>
  );
}

export function AdminNoteForm({ folders, onSubmit }) {
  const [note, setNote] = useState({ title: '', folderId: '', driveLink: '' });
  const [uploadMode, setUploadMode] = useState('telegram'); // 'telegram' | 'drive'
  const [selectedFile, setSelectedFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedFolder = folders.find((f) => f.id === note.folderId);
  const canPublish = Boolean(
    note.title.trim() &&
    selectedFolder &&
    (uploadMode === 'telegram' ? selectedFile : note.driveLink.trim())
  );

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      if (!note.title) {
        // Auto-fill title from clean filename
        const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
        setNote(prev => ({ ...prev, title: cleanName }));
      }
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!selectedFolder) return;
    setIsSubmitting(true);
    try {
      const payload = {
        ...note,
        year: selectedFolder.year,
        subject: selectedFolder.subject,
        file: uploadMode === 'telegram' ? selectedFile : null,
      };
      const saved = await onSubmit(payload);
      if (saved) {
        setNote({ title: '', folderId: '', driveLink: '' });
        setSelectedFile(null);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="card" onSubmit={submit}>
      <div className="card-head">
        <span className="icon-tile pink"><UploadCloud size={20} /></span>
        <h3>Publish a note</h3>
      </div>

      {/* Upload Mode Selector */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', background: 'rgba(15, 23, 42, 0.6)', padding: '4px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
        <button
          type="button"
          onClick={() => setUploadMode('telegram')}
          style={{
            flex: 1, padding: '8px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer',
            fontSize: '0.82rem', fontWeight: '800', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            background: uploadMode === 'telegram' ? 'linear-gradient(135deg, #00f2fe 0%, #38bdf8 100%)' : 'transparent',
            color: uploadMode === 'telegram' ? '#0f172a' : '#94a3b8'
          }}
        >
          <UploadCloud size={14} /> Telegram Storage (Direct File)
        </button>
        <button
          type="button"
          onClick={() => setUploadMode('drive')}
          style={{
            flex: 1, padding: '8px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer',
            fontSize: '0.82rem', fontWeight: '800', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            background: uploadMode === 'drive' ? 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)' : 'transparent',
            color: uploadMode === 'drive' ? '#0f172a' : '#94a3b8'
          }}
        >
          <LinkIcon size={14} /> Google Drive Link
        </button>
      </div>

      <div className="drop-zone">
        <label className="field">Note title
          <input required value={note.title} onChange={(e) => setNote({ ...note, title: e.target.value })} placeholder="e.g. Graph algorithms" />
        </label>

        <label className="field">Subject folder
          <select required value={note.folderId} onChange={(e) => setNote({ ...note, folderId: e.target.value })} disabled={folders.length === 0}>
            <option value="">{folders.length ? 'Choose folder' : 'Create a folder first'}</option>
            {folders.map((f) => <option key={f.id} value={f.id}>{f.subject} • {f.year}</option>)}
          </select>
        </label>

        {uploadMode === 'telegram' ? (
          <label className="field" style={{ marginBottom: 0 }}>
            <span>Upload Document File (PDF, DOCX)</span>
            <div style={{
              marginTop: '6px', padding: '16px', border: '1.5px dashed rgba(0, 242, 254, 0.4)',
              borderRadius: '12px', background: 'rgba(0, 242, 254, 0.04)', textAlign: 'center', cursor: 'pointer'
            }}>
              <input
                type="file"
                accept=".pdf,.doc,.docx,.ppt,.pptx"
                onChange={handleFileChange}
                style={{ display: 'none' }}
                id="admin-file-picker"
              />
              <label htmlFor="admin-file-picker" style={{ cursor: 'pointer', margin: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                <FileText size={28} style={{ color: selectedFile ? '#00f2fe' : '#94a3b8' }} />
                {selectedFile ? (
                  <div>
                    <strong style={{ color: '#00f2fe', display: 'block', fontSize: '0.9rem' }}>{selectedFile.name}</strong>
                    <small style={{ color: '#94a3b8' }}>{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Ready for Telegram stream</small>
                  </div>
                ) : (
                  <div>
                    <strong style={{ color: '#e0f2fe', display: 'block', fontSize: '0.9rem' }}>Choose PDF / Document file</strong>
                    <small style={{ color: '#94a3b8' }}>Uploaded straight into Telegram Supergroup storage</small>
                  </div>
                )}
              </label>
            </div>
          </label>
        ) : (
          <label className="field" style={{ marginBottom: 0 }}>Google Drive link
            <div className="input-icon">
              <LinkIcon size={18} />
              <input required type="url" value={note.driveLink} onChange={(e) => setNote({ ...note, driveLink: e.target.value })} placeholder="https://drive.google.com/..." />
            </div>
          </label>
        )}
      </div>

      <button className="button button-block" type="submit" disabled={!canPublish || isSubmitting} style={{ marginTop: '16px' }}>
        <UploadCloud size={18} /> {isSubmitting ? 'Uploading to Telegram...' : 'Publish note'}
      </button>
    </form>
  );
}

export function AddNoteModal({ onClose, onSubmit }) {
  const [note, setNote] = useState({ title: '', subject: 'Data Structures', driveLink: '' });
  const [uploadMode, setUploadMode] = useState('telegram');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      if (!note.title) {
        const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
        setNote(prev => ({ ...prev, title: cleanName }));
      }
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await onSubmit({
        ...note,
        file: uploadMode === 'telegram' ? selectedFile : null,
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit = Boolean(note.title.trim() && (uploadMode === 'telegram' ? selectedFile : note.driveLink.trim()));

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card" role="dialog" aria-modal="true">
        <button className="modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        <span className="eyebrow">share knowledge</span>
        <h2>Add a new note.</h2>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', background: 'rgba(15, 23, 42, 0.6)', padding: '4px', borderRadius: '12px' }}>
          <button
            type="button"
            onClick={() => setUploadMode('telegram')}
            style={{
              flex: 1, padding: '7px 10px', borderRadius: '8px', border: 'none', cursor: 'pointer',
              fontSize: '0.8rem', fontWeight: '800',
              background: uploadMode === 'telegram' ? 'linear-gradient(135deg, #00f2fe 0%, #38bdf8 100%)' : 'transparent',
              color: uploadMode === 'telegram' ? '#0f172a' : '#94a3b8'
            }}
          >
            Telegram File
          </button>
          <button
            type="button"
            onClick={() => setUploadMode('drive')}
            style={{
              flex: 1, padding: '7px 10px', borderRadius: '8px', border: 'none', cursor: 'pointer',
              fontSize: '0.8rem', fontWeight: '800',
              background: uploadMode === 'drive' ? 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)' : 'transparent',
              color: uploadMode === 'drive' ? '#0f172a' : '#94a3b8'
            }}
          >
            Drive Link
          </button>
        </div>

        <label className="field">Note title
          <input value={note.title} onChange={(e) => setNote({ ...note, title: e.target.value })} placeholder="e.g. CN unit 3 cheat sheet" />
        </label>

        <label className="field">Subject
          <select value={note.subject} onChange={(e) => setNote({ ...note, subject: e.target.value })}>
            {subjects.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>

        {uploadMode === 'telegram' ? (
          <label className="field">
            <span>Upload PDF / Document File</span>
            <input
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={handleFileChange}
              style={{ marginTop: '6px' }}
            />
            {selectedFile && (
              <small style={{ color: '#00f2fe', display: 'block', marginTop: '4px' }}>
                Selected: {selectedFile.name} ({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)
              </small>
            )}
          </label>
        ) : (
          <label className="field">Drive link
            <input type="url" value={note.driveLink} onChange={(e) => setNote({ ...note, driveLink: e.target.value })} placeholder="Paste your Google Drive link" />
          </label>
        )}

        <button className="button button-block" disabled={!canSubmit || isSubmitting} onClick={handleSubmit} style={{ marginTop: '16px' }}>
          {isSubmitting ? 'Uploading to Telegram...' : 'Submit for review'} <ArrowUpRight size={18} />
        </button>
      </div>
    </div>
  );
}

export function EditPublishedNoteModal({ note, folders, canChangeFolder, onClose, onSave }) {
  const matchingFolder = folders.find((f) => f.id === note.folderId) || folders.find((f) => f.subject === note.subject && f.year === note.year);
  const [title, setTitle] = useState(note.title || '');
  const [driveLink, setDriveLink] = useState(note.driveLink || '');
  const [folderId, setFolderId] = useState(matchingFolder?.id || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const folder = folders.find((item) => item.id === folderId);
    if (canChangeFolder && !folder) { setError('Choose a subject folder.'); return; }
    setSaving(true);
    setError('');
    const changes = { id: note.id, title: title.trim(), driveLink: driveLink.trim() };
    if (canChangeFolder) Object.assign(changes, { folderId: folder.id, subject: folder.subject, year: folder.year });
    const saved = await onSave(changes);
    setSaving(false);
    if (saved) onClose();
    else setError('The note could not be saved. Please try again.');
  };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="modal-card" role="dialog" aria-modal="true" onSubmit={submit}>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        <span className="eyebrow"><Pencil size={16} /> manage published content</span>
        <h2>Edit this note.</h2>

        <label className="field">Note title
          <input required value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>

        <label className="field">Drive link
          <input required type="url" value={driveLink} onChange={(e) => setDriveLink(e.target.value)} />
        </label>

        {canChangeFolder && (
          <label className="field">Subject folder
            <select required value={folderId} onChange={(e) => setFolderId(e.target.value)}>
              <option value="">Choose folder</option>
              {folders.map((f) => <option key={f.id} value={f.id}>{f.subject} • {f.year}</option>)}
            </select>
          </label>
        )}

        {error && <div className="form-error">{error}</div>}

        <button className="button button-block" type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Save changes'} <Check size={18} />
        </button>
      </form>
    </div>
  );
}
