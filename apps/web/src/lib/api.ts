/**
 * Typed fetch wrapper for all internal API calls.
 *
 * Usage:
 *   const data = await api.post<MyResponse>('/api/signals', { name: 'test' });
 *
 * Errors throw ApiError which carries the HTTP status and parsed body.
 * Callers can narrow with `err.isTierGate()`, `err.isRateLimit()`, etc.
 */

export class ApiError extends Error {
  constructor(
    public readonly status:  number,
    public readonly body:    unknown,
    message:                 string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  isTierGate(): boolean {
    return this.status === 403 && (this.body as Record<string, unknown>)?.error === 'tier_gate';
  }

  isRateLimit(): boolean {
    return this.status === 429;
  }

  isInsufficientBalance(): boolean {
    return this.status === 402;
  }

  upgradeUrl(): string | null {
    if (!this.isTierGate()) return null;
    return (this.body as Record<string, string>)?.upgradeUrl ?? '/billing/upgrade';
  }
}

interface FetchOptions extends Omit<RequestInit, 'body'> {
  json?: unknown;
}

async function apiFetch<T>(url: string, options: FetchOptions = {}): Promise<T> {
  const { json, ...rest } = options;
  const init: RequestInit = { ...rest };

  if (json !== undefined) {
    init.method  ??= 'POST';
    init.headers  = { 'Content-Type': 'application/json', ...init.headers };
    init.body     = JSON.stringify(json);
  }

  const res  = await fetch(url, init);
  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const msg =
      (body as Record<string, string>)?.message ??
      (body as Record<string, string>)?.error ??
      `HTTP ${res.status}`;
    throw new ApiError(res.status, body, msg);
  }

  return body as T;
}

export const api = {
  get: <T>(url: string, init?: Omit<FetchOptions, 'json'>) =>
    apiFetch<T>(url, { method: 'GET', ...init }),

  post: <T>(url: string, json?: unknown, init?: FetchOptions) =>
    apiFetch<T>(url, { ...init, json }),

  patch: <T>(url: string, json?: unknown, init?: FetchOptions) =>
    apiFetch<T>(url, { method: 'PATCH', ...init, json }),

  delete: <T>(url: string, init?: Omit<FetchOptions, 'json'>) =>
    apiFetch<T>(url, { method: 'DELETE', ...init }),
};
