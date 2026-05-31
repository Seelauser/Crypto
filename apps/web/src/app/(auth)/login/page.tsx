'use client';

import { Suspense, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const callbackUrl = params.get('callbackUrl') ?? '/dashboard';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError('Invalid email or password.');
      return;
    }
    router.push(callbackUrl);
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ color: '#22d3ee', fontSize: 22, fontWeight: 600, marginBottom: 4 }}>
            Sign in
          </h1>
          <p style={{ color: '#8a8f9b', fontSize: 13 }}>
            New here?{' '}
            <Link href="/register" style={{ color: '#22d3ee', textDecoration: 'none' }}>
              Create account
            </Link>
          </p>
        </div>

        {params.get('verified') === '1' && (
          <div className="success-box">Email verified — you can now sign in.</div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="field">
            <label className="field-label">Email</label>
            <input
              className="input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <label className="field-label">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                className="input"
                type={showPw ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#8a8f9b', display: 'flex' }}
                onClick={() => setShowPw(v => !v)}
                tabIndex={-1}
              >
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {error && <div className="error-box">{error}</div>}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? <Loader2 size={16} className="spin" /> : 'Sign In'}
          </button>
        </form>
      </div>

      <style>{`
        .auth-container { min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0b;padding:24px; }
        .auth-card { background:#13141a;border:1px solid #1f2128;border-radius:8px;padding:32px;width:100%;max-width:420px; }
        .field { display:flex;flex-direction:column;gap:6px; }
        .field-label { font-size:12px;color:#8a8f9b;text-transform:uppercase;letter-spacing:0.05em; }
        .input { width:100%;background:#0a0a0b;border:1px solid #1f2128;border-radius:6px;color:#e6e8ee;padding:9px 36px 9px 12px;font-size:13px;outline:none;transition:border-color 150ms;box-sizing:border-box; }
        .input:focus { border-color:#22d3ee; }
        .btn-primary { background:#22d3ee;color:#0a0a0b;border:none;border-radius:6px;padding:11px 20px;font-weight:600;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:opacity 150ms;margin-top:4px; }
        .btn-primary:disabled { opacity:0.4;cursor:not-allowed; }
        .error-box { background:#ef444415;border:1px solid #ef4444;border-radius:6px;padding:10px 12px;font-size:13px;color:#ef4444; }
        .success-box { background:#22c55e15;border:1px solid #22c55e;border-radius:6px;padding:10px 12px;font-size:13px;color:#22c55e;margin-bottom:16px; }
        .spin { animation:spin 600ms linear infinite; }
        @keyframes spin { to { transform:rotate(360deg); } }
      `}</style>
    </div>
  );
}
