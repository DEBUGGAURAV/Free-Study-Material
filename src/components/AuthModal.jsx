import React, { useState } from 'react';
import { X, LockKeyhole, ArrowUpRight, Mail, AlertCircle, CheckCircle2 } from 'lucide-react';
import { signIn, verifySignupCode, requestSignupCode, forgotPassword, resetPassword } from '../api';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const years = ['1st year', '2nd year', '3rd year', '4th year'];
const isValidMobile = (value) => {
  const mobile = value.trim();
  const digitCount = (mobile.match(/\d/g) || []).length;
  return mobile.length <= 20 && /^\+?[0-9][0-9\s().-]*$/.test(mobile) && digitCount >= 7 && digitCount <= 15;
};

export default function AuthModal({ onClose, onSuccess }) {
  const [step, setStep] = useState('form');
  const [resetToken] = useState(() => new URLSearchParams(window.location.search).get('reset') || '');
  const [mode, setMode] = useState(resetToken ? 'reset' : new URLSearchParams(window.location.search).get('signup') === '1' ? 'signup' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [college, setCollege] = useState('');
  const [year, setYear] = useState('1st year');
  const [branch, setBranch] = useState('CSE');
  const [course, setCourse] = useState('B.Tech');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

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
    if (password.length < 6) {
      setError('A password of at least 6 characters is required.');
      return;
    }

    setLoading(true);
    try {
      const authResult = await signIn(email.trim(), password);
      onSuccess(authResult);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const validateSignup = () => {
    if (!name.trim()) return 'Please enter your full name.';
    if (!mobile.trim() || !isValidMobile(mobile)) return 'Please enter a valid mobile number (7-15 digits).';
    if (!college.trim()) return 'Please specify your university / college name.';
    if (!year) return 'Please choose your academic year.';
    if (!branch.trim()) return 'Please enter your engineering branch (e.g. CSE).';
    if (!email.trim() || !emailPattern.test(email.trim())) return 'Please provide a valid email address.';
    if (password.length < 6) return 'Password must be at least 6 characters long.';
    return '';
  };

  const sendSignupCode = async (e) => {
    e?.preventDefault();
    setError('');
    setMessage('');
    const validationError = validateSignup();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      await requestSignupCode({
        email: email.trim(),
        name: name.trim(),
        mobile: mobile.trim(),
        college: college.trim(),
        year,
        branch: branch.trim(),
        course: course.trim(),
        password
      });
      setStep('otp');
      setMessage(`Verification code sent to ${email.trim()}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const submitSignup = async (e) => {
    e?.preventDefault();
    if (!code.trim() || code.trim().length !== 6) {
      setError('Please enter the 6-digit OTP code.');
      return;
    }
    setLoading(true);
    try {
      const result = await verifySignupCode({ email: email.trim(), code: code.trim() });
      onSuccess(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const sendReset = async (e) => {
    e?.preventDefault();
    if (!email.trim() || !emailPattern.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    setLoading(true);
    try {
      await forgotPassword(email.trim());
      setMessage('Password reset instructions have been sent to your email.');
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const submitReset = async (e) => {
    e?.preventDefault();
    if (password.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      await resetPassword(resetToken, password);
      setMode('signin');
      setMessage('Password updated successfully. Please sign in with your new credentials.');
      setError('');
      setPassword('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const changeMode = (nextMode) => {
    setMode(nextMode);
    setStep('form');
    setError('');
    setMessage('');
    setCode('');
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
                {mode === 'signin' ? 'Sign In to Account' : mode === 'signup' ? 'Create Student Account' : 'Password Recovery'}
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-dim)' }}>Free Study Material Portal</div>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {/* Tabs */}
          {mode !== 'reset' && (
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', background: 'rgba(244, 63, 94, 0.12)', border: '1px solid rgba(244, 63, 94, 0.3)', borderRadius: 'var(--radius-sm)', marginBottom: '16px', color: '#fb7185', fontSize: '0.86rem' }}>
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {message && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 'var(--radius-sm)', marginBottom: '16px', color: '#34d399', fontSize: '0.86rem' }}>
              <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
              <span>{message}</span>
            </div>
          )}

          {/* Form Content */}
          {mode === 'forgot' ? (
            <form onSubmit={sendReset}>
              <div className="form-group">
                <label className="form-label">Email Address *</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="your.email@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="button button-primary" style={{ width: '100%', padding: '12px' }} disabled={loading}>
                {loading ? 'Sending...' : 'Send Recovery Link'}
              </button>

              <button type="button" className="button button-ghost" style={{ width: '100%', marginTop: '10px' }} onClick={() => changeMode('signin')}>
                Back to Sign In
              </button>
            </form>
          ) : mode === 'signup' && step === 'otp' ? (
            <form onSubmit={submitSignup}>
              <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                Enter the 6-digit confirmation code delivered to <strong>{email}</strong>:
              </p>

              <div className="form-group">
                <label className="form-label">Verification OTP</label>
                <input
                  type="text"
                  maxLength="6"
                  className="form-input"
                  style={{ textAlign: 'center', letterSpacing: '6px', fontSize: '1.2rem', fontWeight: 700 }}
                  placeholder="••••••"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="button button-primary" style={{ width: '100%', padding: '12px' }} disabled={loading}>
                {loading ? 'Verifying...' : 'Complete Registration'}
              </button>
            </form>
          ) : (
            <form onSubmit={mode === 'signup' ? sendSignupCode : submitSignIn}>
              {mode === 'signup' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Full Name *</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Rahul Sharma"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div className="form-group">
                      <label className="form-label">Mobile Number *</label>
                      <input
                        type="tel"
                        className="form-input"
                        placeholder="+91 9876543210"
                        value={mobile}
                        onChange={(e) => setMobile(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Academic Year</label>
                      <select className="form-select" value={year} onChange={(e) => setYear(e.target.value)}>
                        {years.map(y => <option key={y} value={y} style={{ background: '#0f172a' }}>{y.toUpperCase()}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">College / Institute *</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Delhi Technological University"
                      value={college}
                      onChange={(e) => setCollege(e.target.value)}
                      required
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div className="form-group">
                      <label className="form-label">Branch *</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="e.g. CSE / IT"
                        value={branch}
                        onChange={(e) => setBranch(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Course</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="e.g. B.Tech"
                        value={course}
                        onChange={(e) => setCourse(e.target.value)}
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="form-group">
                <label className="form-label">Email Address *</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="student@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label className="form-label" style={{ margin: 0 }}>Password *</label>
                  {mode === 'signin' && (
                    <button type="button" onClick={() => changeMode('forgot')} style={{ fontSize: '0.78rem', color: 'var(--accent-cyan)' }}>
                      Forgot password?
                    </button>
                  )}
                </div>
                <input
                  type="password"
                  className="form-input"
                  placeholder="Minimum 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <button
                type="submit"
                className="button button-primary"
                style={{ width: '100%', padding: '12px', marginTop: '10px' }}
                disabled={loading}
              >
                {loading ? 'Please wait...' : mode === 'signup' ? 'Proceed to Verification' : 'Sign In'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
