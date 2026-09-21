export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';

let accessToken: string | null = localStorage.getItem('accessToken');
let refreshToken: string | null = localStorage.getItem('refreshToken');

export function setTokens(access: string, refresh: string) {
  accessToken = access;
  refreshToken = refresh;
  localStorage.setItem('accessToken', access);
  localStorage.setItem('refreshToken', refresh);
}

export function clearTokens() {
  accessToken = null;
  refreshToken = null;
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
}

export function getAccessToken() {
  return accessToken;
}

async function refreshAccessToken(): Promise<boolean> {
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) {
      clearTokens();
      return false;
    }

    const data = await res.json();
    if (data.success && data.data?.tokens) {
      setTokens(data.data.tokens.accessToken, data.data.tokens.refreshToken);
      return true;
    }
    return false;
  } catch {
    clearTokens();
    return false;
  }
}

// In-memory cache for GET requests to conserve free-tier API quota and speed up navigation
interface CacheEntry {
  data: any;
  expiresAt: number;
}
const apiCache = new Map<string, CacheEntry>();

export function invalidateApiCache(prefix?: string) {
  if (!prefix) {
    apiCache.clear();
    return;
  }
  for (const key of apiCache.keys()) {
    if (key.startsWith(prefix)) {
      apiCache.delete(key);
    }
  }
}

export interface ApiOptions extends RequestInit {
  noCache?: boolean;
  ttlMs?: number;
}

export async function api<T = unknown>(
  endpoint: string,
  options: ApiOptions = {}
): Promise<{ success: boolean; data?: T; error?: string; total?: number; page?: number; limit?: number }> {
  const method = (options.method || 'GET').toUpperCase();

  // For GET requests, check in-memory cache unless explicitly bypassed
  if (method === 'GET' && !options.noCache) {
    const cached = apiCache.get(endpoint);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  // Don't set Content-Type for FormData (browser sets it with boundary)
  if (options.body instanceof FormData) {
    delete headers['Content-Type'];
  }

  let res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  // Auto-refresh on 401
  if (res.status === 401 && refreshToken) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${accessToken}`;
      res = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers,
      });
    }
  }

  const data = await res.json();

  // Cache successful GET responses
  if (method === 'GET' && data.success && !options.noCache) {
    const ttl = options.ttlMs || 30000; // 30 seconds default TTL
    apiCache.set(endpoint, {
      data,
      expiresAt: Date.now() + ttl,
    });
  }

  // Any mutating method automatically invalidates the cache
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
    invalidateApiCache();
  }

  return data;
}

// Convenience methods
export const apiGet = <T = unknown>(endpoint: string, options?: { noCache?: boolean; ttlMs?: number }) =>
  api<T>(endpoint, { method: 'GET', ...options });
export const apiPost = <T = unknown>(endpoint: string, body?: unknown) =>
  api<T>(endpoint, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
export const apiPatch = <T = unknown>(endpoint: string, body?: unknown) =>
  api<T>(endpoint, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined });
export const apiDelete = <T = unknown>(endpoint: string) => api<T>(endpoint, { method: 'DELETE' });

// File upload
export const apiUpload = <T = unknown>(endpoint: string, formData: FormData) =>
  api<T>(endpoint, { method: 'POST', body: formData });

// Format paise to INR string — presentation layer only
export function formatCurrency(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

// Format date: always DD/MM/YYYY (date/month/year)
export function formatDate(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

// Format date and time: always DD/MM/YYYY, HH:mm
export function formatDateTime(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year}, ${hours}:${minutes}`;
}

// Format month: MM/YYYY (month/year)
export function formatMonth(monthStr: string | null | undefined): string {
  if (!monthStr) return '—';
  const parts = monthStr.split('-');
  if (parts.length === 2) {
    const [year, month] = parts;
    return `${month}/${year}`;
  }
  return monthStr;
}
