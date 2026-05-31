'use client';

import { Component, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error) => void;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    this.props.onError?.(error);
    if (process.env.NODE_ENV === 'development') {
      console.error('[ErrorBoundary]', error);
    }
  }

  render() {
    if (this.state.error) {
      return this.props.fallback ?? (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 32,
          gap: 12,
          background: '#13141a',
          border: '1px solid #1f2128',
          borderRadius: 8,
          minHeight: 120,
        }}>
          <AlertTriangle size={24} color="#fbbf24" />
          <p style={{ color: '#8a8f9b', fontSize: 13, textAlign: 'center', margin: 0 }}>
            Something went wrong loading this component.
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            style={{ background: 'none', border: '1px solid #2a2d36', borderRadius: 6, padding: '6px 14px', color: '#8a8f9b', fontSize: 12, cursor: 'pointer' }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
