import React, { useState, useEffect } from 'react';
import {
  X, LockKeyhole, Mail, AlertCircle, CheckCircle2, User,
  KeyRound, Sparkles, Eye, EyeOff, Loader2, ArrowRight,
  GraduationCap, BookOpen, ShieldCheck
} from 'lucide-react';
import { signIn, signUp, forgotPassword, resetPassword } from '../api';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const years = ['1st year', '2nd year', '3rd year', '4th year'];

export default function AuthModal({ onClose, onSuccess }) {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup' | 'forgot' | 'set-new-pass'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [name, setName] = useState('');
  const [college, setCollege] = useState('');
  const [year, setYear] = useState('4th year');
  const [branch, setBranch] = useState('CSE');
  const [resetToken, setResetToken] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Fast Escape Key Listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

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
      setError(err.message || 'Invalid email or password. Please try again.');
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
        mobile: '',
        college: college.trim() || 'Engineering College',
        year,
        branch: branch.trim() || 'CSE',
        course: 'B.Tech'
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
      setMessage('Account verified! Set your new password below.');
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
      setMessage('Password updated successfully! Logging in...');
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
    setShowPassword(false);
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="modal-container">
        {/* Modal Top Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.25) 0%, rgba(56, 189, 248, 0.15) 100%)',
              border: '1px solid rgba(99, 102, 241, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-cyan)'
            }}>
              {mode === 'signin' ? <LockKeyhole size={19} /> : mode === 'signup' ? <Sparkles size={19} /> : <KeyRound size={19} />}
            </div>
            <div>
              <div className="modal-title">
                {mode === 'signin' ? 'Sign In' : mode === 'signup' ? 'Create Student Account' : 'Account Recovery'}
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                Free Study Material Cloud Portal
              </div>
            </div>
          </div>

          <button
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close modal (Esc)"
            title="Press Esc to close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body">
          {/* Segmented Mode Switcher */}
          {(mode === 'signin' || mode === 'signup') && (
            <div className="modal-tabs-segmented">
              <button
                type="button"
                className={`modal-tab-btn ${mode === 'signin' ? 'active' : ''}`}
                onClick={() => changeMode('signin')}
              >
                <LockKeyhole size={15} />
                <span>Sign In</span>
              </button>
              <button
                type="button"
                className={`modal-tab-btn ${mode === 'signup' ? 'active' : ''}`}
                onClick={() => changeMode('signup')}
              >
                <Sparkles size={15} />
                <span>Create Account</span>
              </button>
            </div>
          )}

          {/* Feedback Alerts */}
          {error && (
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              padding: '12px 14px',
              background: 'rgba(244, 63, 94, 0.12)',
              border: '1px solid rgba(244, 63, 94, 0.35)',
              borderRadius: 'var(--radius-md)',
              marginBottom: '18px',
              color: '#fb7185',
              fontSize: '0.86rem',
              animation: 'modal-fade-in 0.15s ease'
            }}>
              <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ flex: 1 }}>
                <div>{error}</div>
                {error.toLowerCase().includes('create account') && mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => changeMode('signup')}
                    style={{ color: 'var(--accent-cyan)', fontWeight: 700, marginTop: '4px', textDecoration: 'underline' }}
                  >
                    Switch to Create Account →
                  </button>
                )}
              </div>
            </div>
          )}

          {message && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 14px',
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.35)',
              borderRadius: 'var(--radius-md)',
              marginBottom: '18px',
              color: '#34d399',
              fontSize: '0.86rem',
              animation: 'modal-fade-in 0.15s ease'
            }}>
              <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
              <span>{message}</span>
            </div>
          )}

          {/* TAB 1: FAST SIGN IN */}
          {mode === 'signin' && (
            <form onSubmit={submitSignIn}>
              <div className="form-group">
                <label className="form-label">Email Address *</label>
                <div className="input-with-icon-wrapper">
                  <span className="input-icon-lead">
                    <Mail size={16} />
                  </span>
                  <input
                    type="email"
                    className="form-input-icon"
                    placeholder="your.email@gmail.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    autoFocus
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label className="form-label" style={{ margin: 0 }}>Password *</label>
                  <button
                    type="button"
                    onClick={() => changeMode('forgot')}
                    style={{ fontSize: '0.78rem', color: 'var(--accent-cyan)', fontWeight: 500 }}
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="input-with-icon-wrapper">
                  <span className="input-icon-lead">
                    <LockKeyhole size={16} />
                  </span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="form-input-icon"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    className="input-icon-action"
                    onClick={() => setShowPassword(!showPassword)}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="button button-primary"
                style={{ width: '100%', padding: '13px', marginTop: '12px', fontSize: '0.94rem' }}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Signing in securely...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In to Vault</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '18px', fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                <ShieldCheck size={14} style={{ color: '#10b981' }} />
                <span>End-to-End Secure • Fast Cloud Storage</span>
              </div>
            </form>
          )}

          {/* TAB 2: FAST CREATE ACCOUNT */}
          {mode === 'signup' && (
            <form onSubmit={submitSignUp}>
              <div className="form-group">
                <label className="form-label">Full Name *</label>
                <div className="input-with-icon-wrapper">
                  <span className="input-icon-lead">
                    <User size={16} />
                  </span>
                  <input
                    type="text"
                    className="form-input-icon"
                    placeholder="e.g. Gaurav Yadav"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoFocus
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Email Address *</label>
                <div className="input-with-icon-wrapper">
                  <span className="input-icon-lead">
                    <Mail size={16} />
                  </span>
                  <input
                    type="email"
                    className="form-input-icon"
                    placeholder="your.email@gmail.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Create Password (Min 6 chars) *</label>
                <div className="input-with-icon-wrapper">
                  <span className="input-icon-lead">
                    <LockKeyhole size={16} />
                  </span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="form-input-icon"
                    placeholder="Create a strong password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    className="input-icon-action"
                    onClick={() => setShowPassword(!showPassword)}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Academic Year</label>
                  <select
                    className="form-select"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    style={{ width: '100%', padding: '11px 12px' }}
                  >
                    {years.map(y => (
                      <option key={y} value={y} style={{ background: '#0f172a' }}>
                        {y.toUpperCase()}
                      </option>
                    ))}
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
                    style={{ padding: '11px 12px' }}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">College / Institute (Optional)</label>
                <div className="input-with-icon-wrapper">
                  <span className="input-icon-lead">
                    <GraduationCap size={16} />
                  </span>
                  <input
                    type="text"
                    className="form-input-icon"
                    placeholder="e.g. Engineering College"
                    value={college}
                    onChange={(e) => setCollege(e.target.value)}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="button button-primary"
                style={{ width: '100%', padding: '13px', marginTop: '10px', fontSize: '0.94rem' }}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Creating your profile...</span>
                  </>
                ) : (
                  <>
                    <span>Create Account & Join</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
          )}

          {/* TAB 3: FORGOT PASSWORD */}
          {mode === 'forgot' && (
            <form onSubmit={submitForgotPassword}>
              <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', marginBottom: '18px', lineHeight: 1.5 }}>
                Enter your registered email address to verify your student account and choose a new password:
              </p>

              <div className="form-group">
                <label className="form-label">Registered Email *</label>
                <div className="input-with-icon-wrapper">
                  <span className="input-icon-lead">
                    <Mail size={16} />
                  </span>
                  <input
                    type="email"
                    className="form-input-icon"
                    placeholder="your.email@gmail.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoFocus
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                className="button button-primary"
                style={{ width: '100%', padding: '13px', marginTop: '10px' }}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Verifying email...</span>
                  </>
                ) : (
                  <>
                    <span>Find Account & Continue</span>
                    <ArrowRight size={16} />
                  </>
                )}
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

          {/* TAB 4: SET NEW PASSWORD */}
          {mode === 'set-new-pass' && (
            <form onSubmit={submitResetPassword}>
              <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', marginBottom: '18px', lineHeight: 1.5 }}>
                Verified account: <strong style={{ color: 'var(--text-pure)' }}>{email}</strong>. Enter your new password below:
              </p>

              <div className="form-group">
                <label className="form-label">New Password (Min 6 characters) *</label>
                <div className="input-with-icon-wrapper">
                  <span className="input-icon-lead">
                    <LockKeyhole size={16} />
                  </span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="form-input-icon"
                    placeholder="Enter new password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    autoFocus
                    required
                  />
                  <button
                    type="button"
                    className="input-icon-action"
                    onClick={() => setShowPassword(!showPassword)}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="button button-primary"
                style={{ width: '100%', padding: '13px', marginTop: '10px' }}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Saving new password...</span>
                  </>
                ) : (
                  <>
                    <span>Save Password & Sign In</span>
                    <ArrowRight size={16} />
                  </>
                )}
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
