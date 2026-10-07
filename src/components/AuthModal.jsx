import React, { useState } from 'react';
import { X, LockKeyhole, ArrowUpRight, Mail } from 'lucide-react';
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
  const [year, setYear] = useState('');
  const [branch, setBranch] = useState('');
  const [course, setCourse] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const submitSignIn = async () => {
    setError('');
    setMessage('');
    if (!email.trim() || !password.trim()) {
      setError('All fields are mandatory. Please enter both email and password.');
      return;
    }
    if (!email.trim().toLowerCase().includes('@gmail.com')) {
      setError('Enter the email that contain @gmail.com');
      return;
    }
    if (!emailPattern.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setError('A password of at least 8 characters is required.');
      return;
    }

    setLoading(true);
    try {
      onSuccess(await signIn(email.trim(), password));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const validateSignup = () => {
    if ([name, mobile, college, year, branch, course, email, password].some((value) => !value || !value.trim())) {
      setError('All fields are mandatory. Complete every signup field.');
      return false;
    }
    if (!email.trim().toLowerCase().includes('@gmail.com')) {
      setError('Enter the email that contain @gmail.com');
      return false;
    }
    if (!isValidMobile(mobile)) {
      setError('Enter a valid mobile number with 7 to 15 digits.');
      return false;
    }
    if (!emailPattern.test(email.trim())) {
      setError('Enter a valid email address.');
      return false;
    }
    if (password.length < 8) {
      setError('A password of at least 8 characters is required.');
      return false;
    }
    return true;
  };

  const submitSignup = async () => {
    setError('');
    setMessage('');
    if (!code.trim() || code.length !== 6) {
      setError('Please enter the 6-digit verification code sent to your email.');
      return;
    }
    setLoading(true);
    try {
      onSuccess(await verifySignupCode(email.trim(), code.trim(), password, name.trim(), college.trim(), year.trim(), branch.trim(), course.trim(), mobile.trim()));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const sendSignupCode = async () => {
    setError('');
    setMessage('');
    if (!validateSignup()) return;
    setLoading(true);
    try {
      await requestSignupCode(email.trim());
      setStep('otp');
      setError('');
      setMessage(`Verification code sent to ${email.trim()}. Check your spam folder if it isn't in your inbox.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const sendReset = async () => {
    setError('');
    setMessage('');
    if (!email.trim()) {
      setError('All fields are mandatory. Please enter your email.');
      return;
    }
    if (!email.trim().toLowerCase().includes('@gmail.com')) {
      setError('Enter the email that contain @gmail.com');
      return;
    }
    setLoading(true);
    try {
      const result = await forgotPassword(email.trim());
      setMessage(result.message);
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const submitReset = async () => {
    setError('');
    setMessage('');
    if (!resetToken) {
      setError('Password reset link is missing or invalid. Please request a new link.');
      return;
    }
    if (!password || password.length < 8) {
      setError('A password of at least 8 characters is required.');
      return;
    }
    setLoading(true);
    try {
      await resetPassword(resetToken, password);
      setMode('signin');
      setMessage('Password updated successfully! Sign in with your new password.');
      setError('');
      setPassword('');
      if (window.history && window.history.replaceState) {
        const url = new URL(window.location.href);
        url.searchParams.delete('reset');
        window.history.replaceState({}, document.title, url.pathname + (url.search ? url.search : '') + url.hash);
      }
    } catch (requestError) {
      setError(requestError.message);
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

  const renderFields = () => {
    if (mode === 'forgot') {
      return (
        <>
          <h2>Find your way back</h2>
          <p>Enter your Gmail address and we'll send a secure reset link.</p>
          <label className="field">Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@gmail.com" required /></label>
          <button className="button button-block" onClick={sendReset} disabled={loading}>
            {loading ? 'Sending...' : 'Send reset link'} <Mail size={18} />
          </button>
          <button type="button" className="ghost-button" style={{ marginTop: 12, width: '100%', justifyContent: 'center' }} onClick={() => changeMode('signin')}>
            Back to Sign in
          </button>
        </>
      );
    }
    if (mode === 'reset') {
      return (
        <>
          <h2>Set a fresh start</h2>
          {resetToken ? (
            <>
              <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '14px' }}>
                Enter your new secure password below (minimum 8 characters).
              </p>
              <label className="field">New password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" required /></label>
              <button className="button button-block" onClick={submitReset} disabled={loading}>
                {loading ? 'Updating...' : 'Update password'} <ArrowUpRight size={18} />
              </button>
              <button type="button" className="ghost-button" style={{ marginTop: 12, width: '100%', justifyContent: 'center' }} onClick={() => changeMode('signin')}>
                Back to Sign in
              </button>
            </>
          ) : (
            <>
              <p style={{ color: '#f87171', fontSize: '14px', marginBottom: '16px' }}>
                No reset token detected in link. Please request a new recovery link.
              </p>
              <button className="button button-block" onClick={() => changeMode('forgot')}>
                Request new reset link <Mail size={18} />
              </button>
            </>
          )}
        </>
      );
    }
    if (mode === 'signup' && step === 'otp') {
      return (
        <>
          <h2>One last step</h2>
          <p>Enter the code sent to {email} to finish creating your account.</p>
          <label className="field">Signup OTP<input className="otp-input" inputMode="numeric" maxLength="6" value={code} onChange={(e) => setCode(e.target.value)} placeholder="······" required /></label>
          <button className="button button-block" onClick={submitSignup} disabled={loading}>
            {loading ? 'Verifying...' : 'Verify & create account'} <ArrowUpRight size={18} />
          </button>
        </>
      );
    }

    return (
      <>
        <h2>{mode === 'signin' ? 'Sign in to your space' : 'Sign up for your space'}</h2>
        <p>{mode === 'signin' ? 'Welcome back! Please enter your details.' : 'Create your student account with a verified Gmail address.'}</p>

        {mode === 'signup' && (
          <div className="field-row">
            <label className="field field-wide">Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required /></label>
            <label className="field field-wide">Mobile number<input type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="e.g. +91 98765 43210" required /></label>
            <label className="field field-wide">College<input value={college} onChange={(e) => setCollege(e.target.value)} placeholder="Your college" required /></label>
            <label className="field">Year
              <select value={year} onChange={(e) => setYear(e.target.value)} required>
                <option value="">Choose year</option>
                {years.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="field">Branch<input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="Computer Science" required /></label>
            <label className="field field-wide">Course<input value={course} onChange={(e) => setCourse(e.target.value)} placeholder="e.g. B.Tech" required /></label>
          </div>
        )}

        <label className="field">Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@gmail.com" required /></label>
        <label className="field">Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" required /></label>

        <button className="button button-block" onClick={mode === 'signup' ? sendSignupCode : submitSignIn} disabled={loading}>
          {loading ? 'Processing...' : (mode === 'signup' ? 'Send signup OTP' : 'Sign in')} <ArrowUpRight size={18} />
        </button>
      </>
    );
  };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card" role="dialog" aria-modal="true">
        <button className="modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        <span className="icon-tile" style={{ marginBottom: 18 }}><LockKeyhole size={22} /></span>

        {mode !== 'reset' && (
          <div className="seg">
            <button className={mode === 'signin' ? 'on' : ''} onClick={() => changeMode('signin')}>Sign in</button>
            <button className={mode === 'signup' ? 'on' : ''} onClick={() => changeMode('signup')}>Sign up</button>
            <button className={mode === 'forgot' ? 'on' : ''} onClick={() => changeMode('forgot')}>Forgot password</button>
          </div>
        )}

        {renderFields()}

        {error && <div className="form-error">{error}</div>}
        {message && <div className="form-success">{message}</div>}
      </div>
    </div>
  );
}
