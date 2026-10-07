import React, { useState } from 'react';
import { Plus, UploadCloud, ArrowUpRight, X, Pencil, Check, Folder, Link as LinkIcon, FileText } from 'lucide-react';

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
  const selectedFolder = folders.find((f) => f.id === note.folderId);
  const canPublish = Boolean(note.title.trim() && selectedFolder && note.driveLink.trim());

  const submit = async (e) => {
    e.preventDefault();
    if (!selectedFolder) return;
    const saved = await onSubmit({ ...note, year: selectedFolder.year, subject: selectedFolder.subject });
    if (saved) setNote({ title: '', folderId: '', driveLink: '' });
  };

  return (
    <form className="card" onSubmit={submit}>
      <div className="card-head">
        <span className="icon-tile pink"><UploadCloud size={20} /></span>
        <h3>Publish a note</h3>
      </div>

      <div className="drop-zone">
        <FileText size={30} style={{ marginBottom: 8 }} />
        <p>Enter details below to publish directly to the student room.</p>

        <label className="field">Note title
          <input required value={note.title} onChange={(e) => setNote({ ...note, title: e.target.value })} placeholder="e.g. Graph algorithms" />
        </label>

        <label className="field">Subject folder
          <select required value={note.folderId} onChange={(e) => setNote({ ...note, folderId: e.target.value })} disabled={folders.length === 0}>
            <option value="">{folders.length ? 'Choose folder' : 'Create a folder first'}</option>
            {folders.map((f) => <option key={f.id} value={f.id}>{f.subject} • {f.year}</option>)}
          </select>
        </label>

        <label className="field" style={{ marginBottom: 0 }}>Drive link
          <div className="input-icon">
            <LinkIcon size={18} />
            <input required type="url" value={note.driveLink} onChange={(e) => setNote({ ...note, driveLink: e.target.value })} placeholder="Paste Google Drive link" />
          </div>
        </label>
      </div>

      <button className="button button-block" type="submit" disabled={!canPublish}>
        <UploadCloud size={18} /> Publish note
      </button>
    </form>
  );
}

export function AddNoteModal({ onClose, onSubmit }) {
  const [note, setNote] = useState({ title: '', subject: 'Data Structures', driveLink: '' });

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card" role="dialog" aria-modal="true">
        <button className="modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        <span className="eyebrow">share knowledge</span>
        <h2>Add a new note.</h2>

        <label className="field">Note title
          <input value={note.title} onChange={(e) => setNote({ ...note, title: e.target.value })} placeholder="e.g. CN unit 3 cheat sheet" />
        </label>

        <label className="field">Subject
          <select value={note.subject} onChange={(e) => setNote({ ...note, subject: e.target.value })}>
            {subjects.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>

        <label className="field">Drive link
          <input type="url" value={note.driveLink} onChange={(e) => setNote({ ...note, driveLink: e.target.value })} placeholder="Paste your Google Drive link" />
        </label>

        <button className="button button-block" disabled={!note.title || !note.driveLink} onClick={() => onSubmit(note)}>
          Submit for review <ArrowUpRight size={18} />
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
