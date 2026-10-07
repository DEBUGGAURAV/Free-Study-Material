import React, { useState } from 'react';
import { ArrowUpRight, Check, Settings2, KeyRound } from 'lucide-react';
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
    year: user?.year || '',
    branch: user?.branch || '',
    course: user?.course || user?.branch || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const updateField = (field) => (event) => setProfile((current) => ({ ...current, [field]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    if ([profile.name, profile.mobile, profile.college, profile.year, profile.branch, profile.course].some((v) => !v.trim())) {
      setError('Complete every profile field before saving.');
      return;
    }
    if (!isValidMobile(profile.mobile)) {
      setError('Enter a valid mobile number with 7 to 15 digits.');
      return;
    }
    setSaving(true); setError('');
    try { await onSave(profile); } catch (saveError) { setError(saveError.message); } finally { setSaving(false); }
  };

  const submitPasswordChange = async (event) => {
    event.preventDefault();
    setPasswordError(''); setPasswordMessage('');
    if (newPassword.length < 8) { setPasswordError('Use at least 8 characters for the new password.'); return; }
    if (newPassword !== confirmPassword) { setPasswordError('The new passwords do not match.'); return; }
    setChangingPassword(true);
    try {
      await changePassword(currentPassword, newPassword, JSON.parse(localStorage.getItem('tech-titan-session') || 'null')?.token);
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setPasswordMessage('Password changed successfully.');
    } catch (changeError) { setPasswordError(changeError.message); } finally { setChangingPassword(false); }
  };

  return (
    <section className="page-width" style={{ maxWidth: 1000 }}>
      <div className="profile-head">
        <div className="avatar-circle big">{user?.name?.slice(0, 2).toUpperCase() || 'TT'}</div>
        <div>
          <span className="eyebrow">your account</span>
          <h1>{user?.name || 'Profile'}</h1>
          <p>{[user?.branch, user?.year].filter(Boolean).join(' • ')}</p>
        </div>
        <button className="button button-ghost" onClick={onBack}>Back to the room <ArrowUpRight size={16} /></button>
      </div>

      <div className="grid-2">
        <form className="card" onSubmit={submit}>
          <div className="card-head">
            <span className="icon-tile"><Settings2 size={20} /></span>
            <h3>Edit your details</h3>
          </div>

          <label className="field">Email<input type="email" value={user?.email || ''} readOnly /></label>
          <label className="field">Full name<input value={profile.name} onChange={updateField('name')} required /></label>
          <label className="field">Mobile number<input type="tel" value={profile.mobile} onChange={updateField('mobile')} required /></label>
          <label className="field">College<input value={profile.college} onChange={updateField('college')} required /></label>

          <div className="field-row">
            <label className="field">Year
              <select value={profile.year} onChange={updateField('year')} required>
                <option value="">Choose year</option>
                {years.map((year) => <option key={year}>{year}</option>)}
              </select>
            </label>
            <label className="field">Branch<input value={profile.branch} onChange={updateField('branch')} required /></label>
          </div>

          <label className="field">Course<input value={profile.course} onChange={updateField('course')} required /></label>

          {error && <div className="form-error">{error}</div>}

          <button className="button button-block" type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save profile changes'} <Check size={18} />
          </button>
        </form>

        <form className="card" onSubmit={submitPasswordChange}>
          <div className="card-head">
            <span className="icon-tile cyan"><KeyRound size={20} /></span>
            <h3>Security & password</h3>
          </div>

          <label className="field">Current password<input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required /></label>
          <label className="field">New password<input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} required /></label>
          <label className="field">Confirm new password<input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={8} required /></label>

          {passwordError && <div className="form-error">{passwordError}</div>}
          {passwordMessage && <div className="form-success">{passwordMessage}</div>}

          <button className="button button-block" type="submit" disabled={changingPassword}>
            {changingPassword ? 'Updating...' : 'Change password'} <Check size={18} />
          </button>
        </form>
      </div>
    </section>
  );
}
