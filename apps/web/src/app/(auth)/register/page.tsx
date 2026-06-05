'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { Loader2, Check, X, Eye, EyeOff, AlertCircle } from 'lucide-react';

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

type UsernameState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

function getPasswordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 10) score++;
  if (pw.length >= 14) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong'];
  const colors = ['', '#ef4444', '#fbbf24', '#60a5fa', '#22c55e', '#22d3ee'];
  return { score, label: labels[score] ?? '', color: colors[score] ?? '' };
}

export default function RegisterPage() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [usernameState, setUsernameState] = useState<UsernameState>('idle');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const debouncedUsername = useDebounce(username, 300);

  useEffect(() => {
    if (!debouncedUsername) { setUsernameState('idle'); return; }
    if (!/^[a-z0-9_]{3,20}$/.test(debouncedUsername)) { setUsernameState('invalid'); return; }
    setUsernameState('checking');
    fetch(`/api/auth/check-username?u=${encodeURIComponent(debouncedUsername)}`)
      .then(r => r.json())
      .then(d => setUsernameState(d.available ? 'available' : 'taken'))
      .catch(() => setUsernameState('idle'));
  }, [debouncedUsername]);

  const pwStrength = getPasswordStrength(password);
  const confirmMatch = confirm.length > 0 && confirm === password;
  const canSubmit =
    usernameState === 'available' &&
    email.includes('@') &&
    pwStrength.score >= 2 &&
    confirmMatch &&
    !submitting;

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!canSubmit) return;
      setSubmitting(true);
      setError('');
      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, email, password }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error ?? 'Registration failed'); return; }
        setDone(true);
      } catch {
        setError('Network error. Please try again.');
      } finally {
        setSubmitting(false);
      }
    },
    [canSubmit, username, email, password]
  );

  if (done) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <Check size={40} color="#22c55e" style={{ marginBottom: 16 }} />
          <h2 style={{ color: '#e6e8ee', marginBottom: 8 }}>Check your email</h2>
          <p style={{ color: '#8a8f9b' }}>
            We sent a verification link to <strong style={{ color: '#e6e8ee' }}>{email}</strong>.
          </p>
        </div>
      </div>
    );
  }

  const usernameIcon = {
    idle: null,
    checking: <Loader2 size={14} color="#8a8f9b" className="spin" />,
    available: <Check size={14} color="#22c55e" />,
    taken: <X size={14} color="#ef4444" />,
    invalid: <X size={14} color="#fbbf24" />,
  }[usernameState];

  const usernameHint = {
    idle: '',
    checking: 'Checking...',
    available: 'Available',
    taken: 'Already taken',
    invalid: '3–20 chars, lowercase/numbers/underscore',
  }[usernameState];

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ color: '#e6e8ee', fontSize: 22, fontWeight: 600, marginBottom: 4 }}>
            Create your account
          </h1>
          <p style={{ color: '#8a8f9b', fontSize: 13 }}>
            Already have one?{' '}
            <Link href="/login" style={{ color: '#22d3ee', textDecoration: 'none', transition: 'opacity 150ms' }} className="link-hover">
              Sign in
            </Link>
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Username */}
          <div className="field">
            <label className="field-label">Username</label>
            <div className="input-wrap">
              <input
                className="input"
                type="text"
                autoComplete="username"
                placeholder="trader123"
                value={username}
                onChange={e => setUsername(e.target.value.toLowerCase())}
                maxLength={20}
              />
              {usernameIcon && (
                <span className="input-icon">{usernameIcon}</span>
              )}
            </div>
            {usernameHint && (
              <span
                className="field-hint"
                style={{
                  color:
                    usernameState === 'available' ? '#22c55e' :
                    usernameState === 'taken' ? '#ef4444' :
                    '#8a8f9b',
                }}
              >
                {usernameHint}
              </span>
            )}
          </div>

          {/* Email */}
          <div className="field">
            <label className="field-label">Email</label>
            <input
              className="input"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>

          {/* Password */}
          <div className="field">
            <label className="field-label">Password</label>
            <div className="input-wrap">
              <input
                className="input"
                type={showPw ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Min 10 characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="input-icon btn-ghost"
                onClick={() => setShowPw(v => !v)}
                onMouseEnter={e => (e.currentTarget.style.color = '#e6e8ee')}
                onMouseLeave={e => (e.currentTarget.style.color = '#8a8f9b')}
                tabIndex={-1}
              >
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            {password.length > 0 && (
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, height: 3, background: '#1f2128', borderRadius: 2 }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${(pwStrength.score / 5) * 100}%`,
                      background: pwStrength.color,
                      borderRadius: 2,
                      transition: 'width 200ms, background 200ms',
                    }}
                  />
                </div>
                <span style={{ fontSize: 11, color: pwStrength.color, minWidth: 60 }}>
                  {pwStrength.label}
                </span>
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <div className="field">
            <label className="field-label">Confirm Password</label>
            <div className="input-wrap">
              <input
                className="input"
                type={showPw ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Repeat password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
              />
              {confirm.length > 0 && (
                <span className="input-icon">
                  {confirmMatch
                    ? <Check size={14} color="#22c55e" />
                    : <X size={14} color="#ef4444" />}
                </span>
              )}
            </div>
          </div>

          {error && (
            <div className="error-box">
              <AlertCircle size={16} style={{ marginRight: 8 }} />
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn-primary"
            disabled={!canSubmit}
          >
            {submitting ? <Loader2 size={16} className="spin" /> : 'Create Account'}
          </button>
        </form>
      </div>

      <style>{`
        .auth-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #0a0a0b;
          padding: 24px;
        }
        .auth-card {
          background: #13141a;
          border: 1px solid #1f2128;
          border-radius: 8px;
          padding: 32px;
          width: 100%;
          max-width: 420px;
        }
        .field { display: flex; flex-direction: column; gap: 6px; }
        .field-label { font-size: 12px; color: #8a8f9b; text-transform: uppercase; letter-spacing: 0.05em; }
        .field-hint { font-size: 11px; }
        .input-wrap { position: relative; }
        .input {
          width: 100%;
          background: #0a0a0b;
          border: 1px solid #1f2128;
          border-radius: 6px;
          color: #e6e8ee;
          padding: 9px 36px 9px 12px;
          font-size: 13px;
          outline: none;
          transition: border-color 150ms, background-color 150ms, box-shadow 150ms;
          box-sizing: border-box;
        }
        .input:focus { 
          border-color: #22d3ee;
          background-color: #13141a;
          box-shadow: 0 0 0 2px rgba(34, 211, 238, 0.1);
        }
        .input-icon {
          position: absolute;
          right: 10px;
          top: 50%;
          transform: translateY(-50%);
          display: flex;
          align-items: center;
          color: #8a8f9b;
          background: none;
          border: none;
          cursor: pointer;
          padding: 0;
          transition: color 150ms;
        }
        .btn-ghost { background: none; border: none; cursor: pointer; color: #8a8f9b; }
        .btn-primary {
          background: #22d3ee;
          color: #0a0a0b;
          border: none;
          border-radius: 6px;
          padding: 11px 20px;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: opacity 150ms, transform 150ms;
          margin-top: 4px;
          width: 100%;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .btn-primary:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
        .btn-primary:active:not(:disabled) { transform: translateY(0); }
        .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
        .error-box {
          background: #ef444415;
          border: 1px solid #ef4444;
          border-radius: 6px;
          padding: 10px 12px;
          font-size: 13px;
          color: #ef4444;
          display: flex;
          align-items: center;
        }
        .link-hover { opacity: 1; }
        .link-hover:hover { opacity: 0.8; }
        .spin { animation: spin 600ms linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 640px) { .auth-card { padding: 24px; } }
      `}</style>
    </div>
  );
}
