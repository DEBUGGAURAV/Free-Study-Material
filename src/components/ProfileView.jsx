import React, { useState } from 'react';
import { ArrowLeft, Check, Settings2, KeyRound, User, AlertCircle, CheckCircle2 } from 'lucide-react';
import { changePassword } from '../api';

const years = ['1st year', '2nd year', '3rd year', '4th year'];
const isValidMobile = (value) => {
  const mobile = value.trim();
  const digitCount = (mobile.match(/\d/g) || []).length;
  return mobile.length <= 20 && /^\+?[0-9][0-9\s().-]*$/.test(mobile) && digitCount >= 7 && digitCount <= 15;
};

export default function ProfileView({ user, onSave, onBack }) {
  const [profile, setProfile] = useState({
    name: user?.name || '',
    mobile: user?.mobile || '',
    college: user?.college || '',
    year: user?.year || '1st year',
    branch: user?.branch || 'CSE',
    course: user?.course || user?.branch || 'B.Tech',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const updateField = (field) => (event) => setProfile((current) => ({ ...current, [field]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setSuccessMsg('');
    setError('');
    if ([profile.name, profile.mobile, profile.college, profile.year, profile.branch].some((v) => !v.trim())) {
      setError('Please fill in all mandatory profile fields.');
      return;
    }
    if (!isValidMobile(profile.mobile)) {
      setError('Enter a valid mobile number with 7 to 15 digits.');
      return;
    }
    setSaving(true);
    try {
      await onSave(profile);
      setSuccessMsg('Profile details successfully saved.');
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const submitPasswordChange = async (event) => {
    event.preventDefault();
    setPasswordError('');
    setPasswordMessage('');
    if (newPassword.length < 6) {
      setPasswordError('New password must have at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }
    setChangingPassword(true);
    try {
      const session = JSON.parse(localStorage.getItem('tech-titan-session') || 'null');
      await changePassword(currentPassword, newPassword, session?.token);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMessage('Password changed successfully.');
    } catch (changeError) {
      setPasswordError(changeError.message);
    } finally {
      setChangingPassword(false);
    }
  };

  const initials = user?.name ? user.name.slice(0, 2).toUpperCase() : 'FS';

  return (
    <section style={{ maxWidth: '980px', margin: '0 auto', padding: '10px 0 50px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
          <div style={{
            width: '60px',
            height: '60px',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--grad-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.4rem',
            fontWeight: 800,
            color: '#fff',
            boxShadow: '0 6px 20px rgba(99, 102, 241, 0.4)'
          }}>
            {initials}
          </div>
          <div>
            <span style={{ fontSize: '0.78rem', color: 'var(--accent-cyan)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Student Profile
            </span>
            <h1 style={{ fontSize: 'clamp(1.6rem, 2.8vw, 2.2rem)' }}>{user?.name || 'Account Settings'}</h1>
            <p style={{ fontSize: '0.88rem' }}>{[user?.branch, user?.year, user?.college].filter(Boolean).join(' • ')}</p>
          </div>
        </div>

        <button className="button button-ghost" onClick={onBack}>
          <ArrowLeft size={16} /> <span>Back to Notes Vault</span>
        </button>
      </div>

      {/* Grid for Settings & Security */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '24px' }}>
        {/* Profile Card */}
        <form 
          onSubmit={submit}
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-card)',
            borderRadius: 'var(--radius-xl)',
            padding: '28px',
            backdropFilter: 'blur(16px)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '22px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-sm)', background: 'rgba(99, 102, 241, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary-light)' }}>
              <Settings2 size={18} />
            </div>
            <h3 style={{ fontSize: '1.15rem' }}>Personal Information</h3>
          </div>

          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'rgba(244, 63, 94, 0.12)', border: '1px solid rgba(244, 63, 94, 0.3)', borderRadius: 'var(--radius-sm)', marginBottom: '16px', color: '#fb7185', fontSize: '0.85rem' }}>
              <AlertCircle size={16} /> <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 'var(--radius-sm)', marginBottom: '16px', color: '#34d399', fontSize: '0.85rem' }}>
              <CheckCircle2 size={16} /> <span>{successMsg}</span>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Email (Read Only)</label>
            <input type="email" className="form-input" value={user?.email || ''} readOnly style={{ opacity: 0.7 }} />
          </div>

          <div className="form-group">
            <label className="form-label">Full Name</label>
            <input className="form-input" value={profile.name} onChange={updateField('name')} required />
          </div>

          <div className="form-group">
            <label className="form-label">Mobile Number</label>
            <input type="tel" className="form-input" value={profile.mobile} onChange={updateField('mobile')} required />
          </div>

          <div className="form-group">
            <label className="form-label">College / Institute</label>
            <input className="form-input" value={profile.college} onChange={updateField('college')} required />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label">Academic Year</label>
              <select className="form-select" value={profile.year} onChange={updateField('year')} required>
                {years.map(y => <option key={y} value={y} style={{ background: '#0f172a' }}>{y.toUpperCase()}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Branch</label>
              <input className="form-input" value={profile.branch} onChange={updateField('branch')} required />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Course / Degree</label>
            <input className="form-input" value={profile.course} onChange={updateField('course')} required />
          </div>

          <button className="button button-primary" type="submit" disabled={saving} style={{ width: '100%', padding: '12px', marginTop: '10px' }}>
            {saving ? 'Saving...' : 'Save Profile Changes'} <Check size={16} />
          </button>
        </form>

        {/* Security & Password Card */}
        <form 
          onSubmit={submitPasswordChange}
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-card)',
            borderRadius: 'var(--radius-xl)',
            padding: '28px',
            backdropFilter: 'blur(16px)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '22px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-sm)', background: 'rgba(56, 189, 248, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-cyan)' }}>
              <KeyRound size={18} />
            </div>
            <h3 style={{ fontSize: '1.15rem' }}>Security & Credentials</h3>
          </div>

          {passwordError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'rgba(244, 63, 94, 0.12)', border: '1px solid rgba(244, 63, 94, 0.3)', borderRadius: 'var(--radius-sm)', marginBottom: '16px', color: '#fb7185', fontSize: '0.85rem' }}>
              <AlertCircle size={16} /> <span>{passwordError}</span>
            </div>
          )}

          {passwordMessage && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 'var(--radius-sm)', marginBottom: '16px', color: '#34d399', fontSize: '0.85rem' }}>
              <CheckCircle2 size={16} /> <span>{passwordMessage}</span>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Current Password</label>
            <input type="password" className="form-input" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
          </div>

          <div className="form-group">
            <label className="form-label">New Password (Min 6 chars)</label>
            <input type="password" className="form-input" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
          </div>

          <div className="form-group">
            <label className="form-label">Confirm New Password</label>
            <input type="password" className="form-input" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
          </div>

          <button className="button button-secondary" type="submit" disabled={changingPassword} style={{ width: '100%', padding: '12px', marginTop: '10px' }}>
            {changingPassword ? 'Updating...' : 'Update Password'} <Check size={16} />
          </button>
        </form>
      </div>
    </section>
  );
}
