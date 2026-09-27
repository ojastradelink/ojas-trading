'use client';

import axios, {
  AxiosError,
  AxiosInstance,
  InternalAxiosRequestConfig,
} from 'axios';
import { useAuth } from './auth-store';

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Attach access token
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuth.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Transparent refresh on 401 (single-flight per tab)
let refreshing: Promise<string | null> | null = null;

/** Tokens as persisted in storage — another tab may have rotated them since this tab loaded. */
function storedTokens(): { accessToken: string; refreshToken: string } | null {
  try {
    const s = JSON.parse(window.localStorage.getItem('ojas-auth') ?? 'null')?.state;
    return s?.accessToken && s?.refreshToken ? s : null;
  } catch {
    return null;
  }
}

async function doRefresh(): Promise<string | null> {
  const { refreshToken, setTokens, clear } = useAuth.getState();
  if (!refreshToken) return null;
  // Refresh tokens are single-use. If another tab already rotated ours, use its new pair.
  const adoptNewer = () => {
    const s = storedTokens();
    if (!s || s.refreshToken === refreshToken) return null;
    setTokens(s.accessToken, s.refreshToken);
    return s.accessToken;
  };
  const newer = adoptNewer();
  if (newer) return newer;
  try {
    const res = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken });
    const data = res.data?.data ?? res.data;
    setTokens(data.accessToken, data.refreshToken);
    return data.accessToken as string;
  } catch {
    const raced = adoptNewer(); // lost a race with another tab's refresh
    if (raced) return raced;
    clear();
    return null;
  }
}

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };
    if (
      error.response?.status === 401 &&
      original &&
      !original._retry &&
      // /auth/me (checked on every page load) refreshes too; only the token endpoints don't.
      !/\/auth\/(login|refresh|logout)/.test(original.url ?? '')
    ) {
      original._retry = true;
      refreshing = refreshing ?? doRefresh();
      const newToken = await refreshing;
      refreshing = null;
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }
      if (typeof window !== 'undefined') window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

/** Unwraps the { success, data } envelope. */
export function unwrap<T>(payload: any): T {
  return (payload?.data ?? payload) as T;
}

// ── typed helpers ───────────────────────────────────────────────────────────
export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}
export interface Paginated<T> {
  items: T[];
  meta: PageMeta;
}

export async function apiGet<T>(url: string, params?: any): Promise<T> {
  const res = await api.get(url, { params });
  return unwrap<T>(res.data);
}
export async function apiPost<T>(url: string, body?: any): Promise<T> {
  const res = await api.post(url, body);
  return unwrap<T>(res.data);
}
export async function apiPatch<T>(url: string, body?: any): Promise<T> {
  const res = await api.patch(url, body);
  return unwrap<T>(res.data);
}
export async function apiPut<T>(url: string, body?: any): Promise<T> {
  const res = await api.put(url, body);
  return unwrap<T>(res.data);
}
export async function apiDelete<T>(url: string): Promise<T> {
  const res = await api.delete(url);
  return unwrap<T>(res.data);
}
