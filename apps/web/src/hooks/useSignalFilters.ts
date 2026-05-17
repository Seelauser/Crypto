'use client';

import { useState, useMemo } from 'react';

export type SignalStatus = 'active' | 'paused' | 'archived' | 'all';
export type SignalSort   = 'created_at' | 'last_triggered' | 'name';

interface Signal {
  id:               string;
  name:             string;
  status:           'active' | 'paused' | 'archived';
  createdAt:        string;
  lastTriggeredAt?: string | null;
}

export function useSignalFilters(signals: Signal[]) {
  const [status, setStatus] = useState<SignalStatus>('all');
  const [sortBy, setSortBy] = useState<SignalSort>('created_at');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    return signals
      .filter(s => {
        if (status !== 'all' && s.status !== status) return false;
        if (search.trim()) {
          return s.name.toLowerCase().includes(search.trim().toLowerCase());
        }
        return true;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case 'name':
            return a.name.localeCompare(b.name);
          case 'last_triggered':
            return (b.lastTriggeredAt ?? '').localeCompare(a.lastTriggeredAt ?? '');
          default:
            return b.createdAt.localeCompare(a.createdAt);
        }
      });
  }, [signals, status, sortBy, search]);

  return { filtered, status, setStatus, sortBy, setSortBy, search, setSearch };
}
