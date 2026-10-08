import React, { useState } from 'react';
import { X, LockKeyhole, ArrowUpRight, Mail, AlertCircle, CheckCircle2, User, KeyRound, Sparkles } from 'lucide-react';
import { signIn, signUp, forgotPassword, resetPassword } from '../api';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const years = ['1st year', '2nd year', '3rd year', '4th year'];

export default function AuthModal({ onClose, onSuccess }) {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup' | 'forgot' | 'set-new-pass'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [college, setCollege] = useState('');
  const [year, setYear] = useState('1st year');
  const [branch, setBranch] = useState('CSE');
  const [course, setCourse] = useState('B.Tech');
  const [resetToken, setResetToken] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // 1. Submit Sign In
  const submitSignIn = async (e) => {
    e?.preventDefault();
    setError('');
    setMessage('');

    if (!email.trim() || !password.trim()) {
      setError('Please enter both your email address and password.');
      return;
    }
    if (!emailPattern.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    try {
      const authResult = await signIn(email.trim(), password);
      onSuccess(authResult);
    } catch (err) {
      setError(err.message || 'Unable to sign in. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  // 2. Submit Direct Sign Up
  const submitSignUp = async (e) => {
    e?.preventDefault();
    setError('');
    setMessage('');

    if (!name.trim()) {
      setError('Please enter your full name.');
      return;
    }
    if (!email.trim() || !emailPattern.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!password.trim() || password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);
    try {
      const authResult = await signUp({
        name: name.trim(),
        email: email.trim(),
        password: password.trim(),
        mobile: mobile.trim(),
        college: college.trim() || 'Engineering College',
        year,
        branch: branch.trim() || 'CSE',
        course: course.trim() || 'B.Tech'
      });
      onSuccess(authResult);
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // 3. Initiate Password Reset
  const submitForgotPassword = async (e) => {
    e?.preventDefault();
    setError('');
    setMessage('');

    if (!email.trim() || !emailPattern.test(email.trim())) {
      setError('Please enter your registered email address.');
      return;
    }

    setLoading(true);
    try {
      const res = await forgotPassword(email.trim());
      setResetToken(res.resetToken || '');
      setMode('set-new-pass');
      setMessage('Account found! Please enter your new password below.');
    } catch (err) {
      setError(err.message || 'Email not found. Please create an account.');
    } finally {
      setLoading(false);
    }
  };

  // 4. Save New Password & Auto Sign In
  const submitResetPassword = async (e) => {
    e?.preventDefault();
    setError('');
    setMessage('');

    if (!newPassword.trim() || newPassword.length < 6) {
      setError('New password must be at least 6 characters long.');
      return;
    }

    setLoading(true);
    try {
      const authResult = await resetPassword({
        email: email.trim(),
        password: newPassword.trim(),
        token: resetToken
      });
      setMessage('Password updated successfully! Logging you in...');
      setTimeout(() => {
        onSuccess(authResult);
      }, 500);
    } catch (err) {
      setError(err.message || 'Failed to update password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const changeMode = (nextMode) => {
    setMode(nextMode);
    setError('');
    setMessage('');
  };

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-container" style={{ maxWidth: '460px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-sm)', background: 'rgba(99, 102, 241, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary-light)' }}>
              <LockKeyhole size={18} />
            </div>
            <div>
              <div className="modal-title" style={{ fontSize: '1.1rem' }}>
                {mode === 'signin' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Reset Password'}
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-dim)' }}>Free Study Material Portal</div>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {/* Segmented Control Tabs */}
          {(mode === 'signin' || mode === 'signup') && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '6px',
              background: 'rgba(255, 255, 255, 0.04)',
              padding: '4px',
              borderRadius: 'var(--radius-md)',
              marginBottom: '20px'
            }}>
              <button
                type="button"
                className={`engine-mode-btn ${mode === 'signin' ? 'active' : ''}`}
                style={{ padding: '8px' }}
                onClick={() => changeMode('signin')}
              >
                Sign In
              </button>
              <button
                type="button"
                className={`engine-mode-btn ${mode === 'signup' ? 'active' : ''}`}
                style={{ padding: '8px' }}
                onClick={() => changeMode('signup')}
              >
                Create Account
              </button>
            </div>
          )}

          {error && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px 14px', background: 'rgba(244, 63, 94, 0.12)', border: '1px solid rgba(244, 63, 94, 0.3)', borderRadius: 'var(--radius-sm)', marginBottom: '16px', color: '#fb7185', fontSize: '0.86rem' }}>
              <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ flex: 1 }}>
                <div>{error}</div>
                {error.toLowerCase().includes('create account') && mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => changeMode('signup')}
                    style={{ color: '#38bdf8', fontWeight: 700, marginTop: '4px', textDecoration: 'underline' }}
                  >
                    Switch to Create Account →
                  </button>
                )}
              </div>
            </div>
          )}

          {message && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 'var(--radius-sm)', marginBottom: '16px', color: '#34d399', fontSize: '0.86rem' }}>
              <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
              <span>{message}</span>
            </div>
          )}

          {/* TAB 1: SIGN IN */}
          {mode === 'signin' && (
            <form onSubmit={submitSignIn}>
              <div className="form-group">
                <label className="form-label">Email Address *</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="your.email@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>

              <div className="form-group">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label className="form-label" style={{ margin: 0 }}>Password *</label>
                  <button 
                    type="button" 
                    onClick={() => changeMode('forgot')} 
                    style={{ fontSize: '0.78rem', color: 'var(--accent-cyan)' }}
                  >
                    Forgot password?
                  </button>
                </div>
                <input
                  type="password"
                  className="form-input"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>

              <button
                type="submit"
                className="button button-primary"
                style={{ width: '100%', padding: '12px', marginTop: '10px' }}
                disabled={loading}
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>

              <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '0.82rem', color: 'var(--text-dim)' }}>
                Don't have an account yet?{' '}
                <button
                  type="button"
                  onClick={() => changeMode('signup')}
                  style={{ color: 'var(--primary-light)', fontWeight: 600 }}
                >
                  Create one now
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: CREATE ACCOUNT */}
          {mode === 'signup' && (
            <form onSubmit={submitSignUp}>
              <div className="form-group">
                <label className="form-label">Full Name *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Gaurav Yadav"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Email Address *</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="your.email@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Create Password (Min 6 chars) *</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="Enter a secure password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Academic Year</label>
                  <select className="form-select" value={year} onChange={(e) => setYear(e.target.value)}>
                    {years.map(y => <option key={y} value={y} style={{ background: '#0f172a' }}>{y.toUpperCase()}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Branch</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. CSE / IT"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">College / Institute (Optional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. GNIT / DTU"
                  value={college}
                  onChange={(e) => setCollege(e.target.value)}
                />
              </div>

              <button
                type="submit"
                className="button button-primary"
                style={{ width: '100%', padding: '12px', marginTop: '10px' }}
                disabled={loading}
              >
                {loading ? 'Creating account...' : 'Create Account & Sign In'}
              </button>

              <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '0.82rem', color: 'var(--text-dim)' }}>
                Already registered?{' '}
                <button
                  type="button"
                  onClick={() => changeMode('signin')}
                  style={{ color: 'var(--primary-light)', fontWeight: 600 }}
                >
                  Sign in here
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: FORGOT PASSWORD (STEP 1: ENTER EMAIL) */}
          {mode === 'forgot' && (
            <form onSubmit={submitForgotPassword}>
              <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                Enter your registered email address to verify your account and set a new password:
              </p>

              <div className="form-group">
                <label className="form-label">Registered Email Address *</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="your.email@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <button
                type="submit"
                className="button button-primary"
                style={{ width: '100%', padding: '12px', marginTop: '10px' }}
                disabled={loading}
              >
                {loading ? 'Checking account...' : 'Find Account & Continue'}
              </button>

              <button
                type="button"
                className="button button-ghost"
                style={{ width: '100%', marginTop: '10px' }}
                onClick={() => changeMode('signin')}
              >
                Back to Sign In
              </button>
            </form>
          )}

          {/* TAB 4: SET NEW PASSWORD (STEP 2: ENTER NEW PASSWORD) */}
          {mode === 'set-new-pass' && (
            <form onSubmit={submitResetPassword}>
              <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                Resetting password for <strong>{email}</strong>:
              </p>

              <div className="form-group">
                <label className="form-label">New Password (Min 6 characters) *</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="Enter your new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>

              <button
                type="submit"
                className="button button-primary"
                style={{ width: '100%', padding: '12px', marginTop: '10px' }}
                disabled={loading}
              >
                {loading ? 'Updating password...' : 'Save New Password & Sign In'}
              </button>

              <button
                type="button"
                className="button button-ghost"
                style={{ width: '100%', marginTop: '10px' }}
                onClick={() => changeMode('signin')}
              >
                Cancel
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
