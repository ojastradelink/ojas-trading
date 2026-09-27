'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthUser {
  id: string;
  email: string;
  companyId: string;
  isSuperAdmin: boolean;
  roles: string[];
  permissions: string[];
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  // True once the persisted session has been read from storage. Routing must
  // wait for this, or the initial `null` state flip-flops redirects (loop).
  hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;
  setSession: (p: {
    accessToken: string;
    refreshToken: string;
    user: AuthUser;
  }) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  setUser: (user: AuthUser) => void;
  clear: () => void;
  can: (permission: string) => boolean;
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      hasHydrated: false,
      setHasHydrated: (v) => set({ hasHydrated: v }),
      setSession: ({ accessToken, refreshToken, user }) =>
        set({ accessToken, refreshToken, user }),
      setTokens: (accessToken, refreshToken) =>
        set({ accessToken, refreshToken }),
      setUser: (user) => set({ user }),
      clear: () => set({ accessToken: null, refreshToken: null, user: null }),
      can: (permission) => {
        const u = get().user;
        if (!u) return false;
        return u.isSuperAdmin || u.permissions.includes(permission);
      },
    }),
    {
      name: 'ojas-auth',
      // Only persist the session — not the transient hydration flag.
      partialize: (s) => ({
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        user: s.user,
      }),
      onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
    },
  ),
);
