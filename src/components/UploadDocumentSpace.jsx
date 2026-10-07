import React, { useState } from 'react';
import { UploadCloud, ArrowUpRight, Sparkles, CheckCircle2, FileText, ShieldCheck, Zap, Link as LinkIcon, AlertCircle } from 'lucide-react';
import { uploadNoteFile } from '../api';

const defaultSubjects = ['Cloud Computing (CC)', 'Cryptography (CNS)', 'Artificial Intelligence (AI)', 'Deep Learning', 'Data Structures'];
const yearsList = ['1st year', '2nd year', '3rd year', '4th year'];

export default function UploadDocumentSpace({ folders = [], token, onUploadSuccess }) {
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState(defaultSubjects[0]);
  const [customSubject, setCustomSubject] = useState('');
  const [year, setYear] = useState('1st year');
  const [file, setFile] = useState(null);
  const [uploadMode, setUploadMode] = useState('telegram'); // 'telegram' | 'drive'
  const [driveLink, setDriveLink] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const subjectOptions = folders.length > 0 
    ? [...new Set(folders.map(f => f.subject))] 
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

  const handleUpload = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setUploadResult(null);

    const activeSubject = subject === 'Other' ? (customSubject.trim() || 'General') : subject;
    if (!title.trim()) {
      setErrorMsg('Please enter a note / blueprint title.');
      return;
    }

    if (uploadMode === 'telegram' && !file) {
      setErrorMsg('Please select a PDF or Document file to upload.');
      return;
    }

    if (uploadMode === 'drive' && !driveLink.trim()) {
      setErrorMsg('Please enter a Google Drive link.');
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
        formData.append('branch', 'CSE');
        formData.append('visibility', 'public');

        const res = await uploadNoteFile(formData, token);
        setUploadResult({
          success: true,
          message: res.message || 'Blueprint successfully uploaded to Telegram Storage!',
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
            branch: 'CSE',
            driveLink: driveLink.trim(),
            visibility: 'public'
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to save note');
        setUploadResult({
          success: true,
          message: 'Drive link note published successfully!',
          fileName: title.trim(),
          fileSize: 'Cloud URL'
        });
        if (onUploadSuccess) onUploadSuccess(data);
      }

      // Reset fields
      setTitle('');
      setFile(null);
      setDriveLink('');
    } catch (err) {
      setErrorMsg(err.message || 'Upload failed. Please verify connection and try again.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <section className="creative-upload-space" style={{
      margin: '20px 0 40px',
      position: 'relative',
      background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.9) 100%)',
      border: '2px solid rgba(0, 242, 254, 0.4)',
      borderRadius: '24px',
      padding: 'clamp(20px, 3vw, 36px)',
      boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5), 0 0 30px rgba(0, 242, 254, 0.15)',
      overflow: 'hidden'
    }}>
      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* Top Badges */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)',
              color: '#000', fontWeight: '900', fontSize: '0.8rem',
              padding: '4px 12px', borderRadius: '20px', letterSpacing: '0.5px', textTransform: 'uppercase'
            }}>
              <Zap size={14} /> Telegram Cloud Uploader
            </span>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              background: 'rgba(255, 255, 255, 0.08)', color: '#cbd5e1',
              fontSize: '0.8rem', fontWeight: '700', padding: '4px 12px', borderRadius: '20px', border: '1px solid rgba(255, 255, 255, 0.15)'
            }}>
              <Sparkles size={13} style={{ color: '#f59e0b' }} /> Free Community Drop
            </span>
          </div>

          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {['PDF', 'DOCX', 'PPTX', 'TELEGRAM SYNC'].map((fmt) => (
              <span key={fmt} style={{
                background: 'rgba(0, 0, 0, 0.4)', color: '#94a3b8', fontSize: '0.72rem',
                fontWeight: '800', padding: '3px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)'
              }}>
                {fmt}
              </span>
            ))}
          </div>
        </div>

        {/* Dual Mode Switch */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', maxWidth: '420px', background: 'rgba(11, 18, 38, 0.8)', padding: '4px', borderRadius: '12px', border: '1px solid rgba(0, 242, 254, 0.3)' }}>
          <button
            type="button"
            onClick={() => setUploadMode('telegram')}
            style={{
              flex: 1, padding: '8px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
              fontSize: '0.84rem', fontWeight: '800', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              background: uploadMode === 'telegram' ? 'linear-gradient(135deg, #00f2fe 0%, #38bdf8 100%)' : 'transparent',
              color: uploadMode === 'telegram' ? '#0f172a' : '#94a3b8'
            }}
          >
            <UploadCloud size={15} /> Telegram Storage (Direct File)
          </button>
          <button
            type="button"
            onClick={() => setUploadMode('drive')}
            style={{
              flex: 1, padding: '8px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
              fontSize: '0.84rem', fontWeight: '800', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              background: uploadMode === 'drive' ? 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)' : 'transparent',
              color: uploadMode === 'drive' ? '#0f172a' : '#94a3b8'
            }}
          >
            <LinkIcon size={15} /> Google Drive Link
          </button>
        </div>

        {/* Upload Form Grid */}
        <form onSubmit={handleUpload} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
          <div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <label className="field" style={{ margin: 0 }}>
                <span style={{ color: '#38bdf8', fontSize: '0.85rem', fontWeight: '700' }}>Blueprint / Note Title</span>
                <input
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Unit 3 - Cloud Architecture Notes"
                  style={{ background: 'rgba(8, 14, 26, 0.9)', borderColor: 'rgba(0, 242, 254, 0.35)', color: '#f0fdfa' }}
                />
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <label className="field" style={{ margin: 0 }}>
                  <span style={{ color: '#38bdf8', fontSize: '0.85rem', fontWeight: '700' }}>Subject</span>
                  <select
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    style={{ background: 'rgba(8, 14, 26, 0.9)', borderColor: 'rgba(0, 242, 254, 0.35)', color: '#f0fdfa' }}
                  >
                    {subjectOptions.map(s => <option key={s} value={s}>{s}</option>)}
                    <option value="Other">Other / Custom</option>
                  </select>
                </label>

                <label className="field" style={{ margin: 0 }}>
                  <span style={{ color: '#38bdf8', fontSize: '0.85rem', fontWeight: '700' }}>Student Year</span>
                  <select
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    style={{ background: 'rgba(8, 14, 26, 0.9)', borderColor: 'rgba(0, 242, 254, 0.35)', color: '#f0fdfa' }}
                  >
                    {yearsList.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </label>
              </div>

              {subject === 'Other' && (
                <label className="field" style={{ margin: 0 }}>
                  <span style={{ color: '#38bdf8', fontSize: '0.85rem', fontWeight: '700' }}>Custom Subject Name</span>
                  <input
                    required
                    value={customSubject}
                    onChange={(e) => setCustomSubject(e.target.value)}
                    placeholder="Enter subject name"
                    style={{ background: 'rgba(8, 14, 26, 0.9)', borderColor: 'rgba(0, 242, 254, 0.35)', color: '#f0fdfa' }}
                  />
                </label>
              )}
            </div>
          </div>

          <div>
            {uploadMode === 'telegram' ? (
              <div style={{
                background: 'rgba(8, 14, 26, 0.8)',
                border: '2px dashed rgba(0, 242, 254, 0.4)',
                borderRadius: '16px',
                padding: '24px',
                textAlign: 'center',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center'
              }}>
                <input
                  type="file"
                  id="dashboard-dropzone-input"
                  accept=".pdf,.doc,.docx,.ppt,.pptx"
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />
                <label htmlFor="dashboard-dropzone-input" style={{ cursor: 'pointer', margin: 0, width: '100%' }}>
                  <div style={{
                    width: '54px', height: '54px', borderRadius: '50%',
                    background: 'rgba(0, 242, 254, 0.15)', border: '1.5px solid #00f2fe',
                    display: 'grid', placeItems: 'center', color: '#00f2fe', margin: '0 auto 12px'
                  }}>
                    <FileText size={26} />
                  </div>
                  {file ? (
                    <div>
                      <strong style={{ color: '#00f2fe', display: 'block', fontSize: '0.95rem' }}>{file.name}</strong>
                      <small style={{ color: '#94a3b8', display: 'block', marginTop: '4px' }}>
                        {(file.size / (1024 * 1024)).toFixed(2)} MB • Click to replace file
                      </small>
                    </div>
                  ) : (
                    <div>
                      <strong style={{ color: '#f1f5f9', display: 'block', fontSize: '1rem', marginBottom: '4px' }}>
                        Click to select PDF or Document
                      </strong>
                      <small style={{ color: '#94a3b8' }}>
                        Direct lossless stream to Telegram private channel
                      </small>
                    </div>
                  )}
                </label>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
                <label className="field" style={{ margin: 0 }}>
                  <span style={{ color: '#fbbf24', fontSize: '0.85rem', fontWeight: '700' }}>Google Drive Document URL</span>
                  <div className="input-icon" style={{ marginTop: '6px' }}>
                    <LinkIcon size={18} style={{ color: '#fbbf24' }} />
                    <input
                      required
                      type="url"
                      value={driveLink}
                      onChange={(e) => setDriveLink(e.target.value)}
                      placeholder="https://drive.google.com/file/d/..."
                      style={{ background: 'rgba(8, 14, 26, 0.9)', borderColor: 'rgba(251, 191, 36, 0.35)', color: '#f0fdfa' }}
                    />
                  </div>
                </label>
                <small style={{ color: '#94a3b8', marginTop: '8px', display: 'block' }}>
                  Make sure link sharing is set to "Anyone with the link can view".
                </small>
              </div>
            )}
          </div>

          {/* Full Width Submit & Feedback */}
          <div style={{ gridColumn: '1 / -1' }}>
            {errorMsg && (
              <div style={{
                padding: '10px 14px', borderRadius: '10px', background: 'rgba(244, 63, 94, 0.15)',
                border: '1px solid rgba(244, 63, 94, 0.4)', color: '#fb7185', fontSize: '0.85rem',
                display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px'
              }}>
                <AlertCircle size={16} /> {errorMsg}
              </div>
            )}

            {uploadResult && (
              <div style={{
                padding: '12px 16px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.15)',
                border: '1.5px solid rgba(16, 185, 129, 0.4)', color: '#34d399', fontSize: '0.9rem',
                display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px'
              }}>
                <CheckCircle2 size={18} />
                <div>
                  <strong>{uploadResult.message}</strong>
                  <span style={{ display: 'block', fontSize: '0.78rem', color: '#a7f3d0' }}>
                    Archive record: {uploadResult.fileName} ({uploadResult.fileSize})
                  </span>
                </div>
              </div>
            )}

            <button
              type="submit"
              className="button button-block"
              disabled={isUploading}
              style={{
                background: uploadMode === 'telegram'
                  ? 'linear-gradient(135deg, #00f2fe 0%, #38bdf8 100%)'
                  : 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                color: '#0f172a', fontWeight: '900', padding: '14px 24px', fontSize: '1rem',
                boxShadow: uploadMode === 'telegram' ? '0 4px 20px rgba(0, 242, 254, 0.35)' : '0 4px 20px rgba(251, 191, 36, 0.35)'
              }}
            >
              <UploadCloud size={20} />
              {isUploading 
                ? 'Streaming Blueprint to Telegram Storage...' 
                : uploadMode === 'telegram' ? 'Stream Upload to Telegram Storage' : 'Save Drive Link Note'}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
