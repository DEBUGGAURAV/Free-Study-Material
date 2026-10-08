import React, { useState } from 'react';
import { 
  UploadCloud, ArrowUpRight, Sparkles, CheckCircle2, FileText, 
  ShieldCheck, Zap, Link as LinkIcon, AlertCircle, X, ChevronDown, Check
} from 'lucide-react';
import { uploadNoteFile } from '../api';

const defaultSubjects = [
  'Cloud Computing (CC)', 
  'Cryptography (CNS)', 
  'Artificial Intelligence (AI)', 
  'Deep Learning', 
  'Data Structures & Algorithms',
  'Database Management Systems',
  'Operating Systems',
  'Computer Networks'
];
const yearsList = ['1st year', '2nd year', '3rd year', '4th year'];
const branchesList = ['CSE', 'IT', 'ECE', 'EE', 'ME', 'Civil', 'AI & DS'];

export default function UploadDocumentSpace({ folders = [], token, onUploadSuccess }) {
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState(defaultSubjects[0]);
  const [customSubject, setCustomSubject] = useState('');
  const [year, setYear] = useState('1st year');
  const [branch, setBranch] = useState('CSE');
  const [file, setFile] = useState(null);
  const [uploadMode, setUploadMode] = useState('telegram'); // 'telegram' | 'drive'
  const [driveLink, setDriveLink] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const subjectOptions = folders.length > 0 
    ? [...new Set([...folders.map(f => f.subject), ...defaultSubjects])] 
    : defaultSubjects;

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);
      setErrorMsg('');
      if (!title) {
        const cleanName = selected.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
        setTitle(cleanName);
      }
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const dropped = e.dataTransfer.files[0];
      setFile(dropped);
      setErrorMsg('');
      if (!title) {
        const cleanName = dropped.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
        setTitle(cleanName);
      }
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setUploadResult(null);

    const activeSubject = subject === 'Other' ? (customSubject.trim() || 'General Engineering') : subject;
    if (!title.trim()) {
      setErrorMsg('Please specify a title for this note or document.');
      return;
    }

    if (uploadMode === 'telegram' && !file) {
      setErrorMsg('Please select or drop a PDF document file to upload.');
      return;
    }

    if (uploadMode === 'drive' && !driveLink.trim()) {
      setErrorMsg('Please enter a valid Google Drive or document link.');
      return;
    }

    setIsUploading(true);

    try {
      if (uploadMode === 'telegram') {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('title', title.trim());
        formData.append('subject', activeSubject);
        formData.append('year', year);
        formData.append('branch', branch);
        formData.append('visibility', 'public');

        const res = await uploadNoteFile(formData, token);
        setUploadResult({
          success: true,
          message: res.message || 'Note successfully uploaded and synchronized to Free Study Material Cloud!',
          fileName: file.name,
          fileSize: (file.size / (1024 * 1024)).toFixed(2) + ' MB'
        });
        if (onUploadSuccess && res.note) onUploadSuccess(res.note);
      } else {
        // Drive link mode
        const res = await fetch('/api/notes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            title: title.trim(),
            subject: activeSubject,
            year,
            branch,
            driveLink: driveLink.trim(),
            visibility: 'public'
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to save note');
        setUploadResult({
          success: true,
          message: 'Drive link document indexed successfully!',
          fileName: title.trim(),
          fileSize: 'Cloud URL'
        });
        if (onUploadSuccess) onUploadSuccess(data);
      }

      // Reset
      setTitle('');
      setFile(null);
      setDriveLink('');
    } catch (err) {
      setErrorMsg(err.message || 'Upload failed. Please check your network and try again.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="upload-card-wrapper">
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '28px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '5px 14px', background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.25)', borderRadius: 'var(--radius-full)', fontSize: '0.78rem', fontWeight: 600, color: 'var(--primary-light)', marginBottom: '14px' }}>
          <Sparkles size={14} />
          <span>Free Study Material Contribution Studio</span>
        </div>
        <h2 style={{ fontSize: 'clamp(1.6rem, 2.8vw, 2.2rem)', marginBottom: '8px' }}>
          Publish & Share Study Materials
        </h2>
        <p style={{ maxWidth: '540px', margin: '0 auto', fontSize: '0.92rem' }}>
          Share class lecture notes, past exam papers, and syllabus blueprints with fellow students across the university.
        </p>
      </div>

      {/* Engine Mode Selector */}
      <div className="engine-mode-selector">
        <button
          type="button"
          className={`engine-mode-btn ${uploadMode === 'telegram' ? 'active' : ''}`}
          onClick={() => setUploadMode('telegram')}
        >
          <Zap size={18} />
          <span>Telegram Cloud Storage (File Upload)</span>
        </button>

        <button
          type="button"
          className={`engine-mode-btn ${uploadMode === 'drive' ? 'active' : ''}`}
          onClick={() => setUploadMode('drive')}
        >
          <LinkIcon size={18} />
          <span>Google Drive / Cloud Link</span>
        </button>
      </div>

      {/* Success Notification */}
      {uploadResult && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          padding: '16px 20px',
          background: 'rgba(16, 185, 129, 0.1)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          borderRadius: 'var(--radius-md)',
          marginBottom: '24px'
        }}>
          <CheckCircle2 size={24} style={{ color: '#10b981', flexShrink: 0 }} />
          <div>
            <strong style={{ color: '#34d399', display: 'block', fontSize: '0.94rem' }}>
              {uploadResult.message}
            </strong>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {uploadResult.fileName} • {uploadResult.fileSize} • Live in student vault now
            </span>
          </div>
        </div>
      )}

      {/* Error Alert */}
      {errorMsg && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '14px 18px',
          background: 'rgba(244, 63, 94, 0.1)',
          border: '1px solid rgba(244, 63, 94, 0.3)',
          borderRadius: 'var(--radius-md)',
          marginBottom: '24px',
          color: '#fb7185',
          fontSize: '0.9rem'
        }}>
          <AlertCircle size={20} style={{ flexShrink: 0 }} />
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleUpload}>
        {/* Document Title */}
        <div className="form-group">
          <label className="form-label">Document / Note Title *</label>
          <input
            type="text"
            className="form-input"
            placeholder="e.g. Unit 3 Cloud Virtualization & Containers"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>

        {/* Subject & Year Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div className="form-group">
            <label className="form-label">Academic Year</label>
            <select
              className="form-select"
              value={year}
              onChange={(e) => setYear(e.target.value)}
            >
              {yearsList.map(y => (
                <option key={y} value={y} style={{ background: '#0f172a', color: '#fff' }}>
                  {y.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Engineering Branch</label>
            <select
              className="form-select"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
            >
              {branchesList.map(b => (
                <option key={b} value={b} style={{ background: '#0f172a', color: '#fff' }}>
                  {b}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Subject Dropdown */}
        <div className="form-group">
          <label className="form-label">Subject / Course Module</label>
          <select
            className="form-select"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          >
            {subjectOptions.map(s => (
              <option key={s} value={s} style={{ background: '#0f172a', color: '#fff' }}>
                {s}
              </option>
            ))}
            <option value="Other" style={{ background: '#0f172a', color: '#fff' }}>+ Add Custom Subject</option>
          </select>
        </div>

        {subject === 'Other' && (
          <div className="form-group">
            <label className="form-label">Enter Custom Subject Name</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Microprocessors 8086"
              value={customSubject}
              onChange={(e) => setCustomSubject(e.target.value)}
            />
          </div>
        )}

        {/* Upload Mode 1: File Dropzone */}
        {uploadMode === 'telegram' ? (
          <div>
            <label className="form-label">Document File (PDF, DOCX, ZIP) *</label>
            
            {file ? (
              <div className="selected-file-box">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <FileText size={22} style={{ color: '#10b981' }} />
                  <div>
                    <strong style={{ color: 'var(--text-pure)', fontSize: '0.92rem', display: 'block' }}>
                      {file.name}
                    </strong>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                      {(file.size / (1024 * 1024)).toFixed(2)} MB • Ready for Telegram Cloud
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setFile(null)}
                  style={{ color: 'var(--text-dim)', padding: '6px' }}
                >
                  <X size={18} />
                </button>
              </div>
            ) : (
              <div 
                className="file-dropzone"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={() => document.getElementById('file-upload-input').click()}
              >
                <input 
                  type="file" 
                  id="file-upload-input" 
                  style={{ display: 'none' }} 
                  onChange={handleFileChange}
                  accept=".pdf,.doc,.docx,.ppt,.pptx,.zip,.txt"
                />
                <div className="dropzone-icon">
                  <UploadCloud size={28} />
                </div>
                <div className="dropzone-title">
                  Click to select file or drag & drop here
                </div>
                <div className="dropzone-hint">
                  PDF, DOCX, PPTX or ZIP up to 2GB • Stored directly on Telegram Cloud
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Upload Mode 2: Google Drive Link */
          <div className="form-group">
            <label className="form-label">Google Drive or External Resource Link *</label>
            <input
              type="url"
              className="form-input"
              placeholder="https://drive.google.com/file/d/..."
              value={driveLink}
              onChange={(e) => setDriveLink(e.target.value)}
              required
            />
            <small style={{ display: 'block', marginTop: '6px', color: 'var(--text-dim)', fontSize: '0.78rem' }}>
              Ensure link sharing is set to "Anyone with the link can view"
            </small>
          </div>
        )}

        {/* Submit Button */}
        <div style={{ marginTop: '28px' }}>
          <button
            type="submit"
            className="button button-primary"
            style={{ width: '100%', padding: '14px', fontSize: '1rem' }}
            disabled={isUploading}
          >
            {isUploading ? (
              <>
                <Zap size={18} className="animate-spin" />
                <span>Uploading to Free Study Material Cloud...</span>
              </>
            ) : (
              <>
                <UploadCloud size={18} />
                <span>Publish Study Material</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
