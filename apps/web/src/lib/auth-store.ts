import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AuthUser } from '@art-garage/shared';

// TODO(security): Token lives in localStorage. Acceptable for an internal CRM,
// but if this ever goes public-facing, migrate to httpOnly cookies + CSRF.

type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  status: AuthStatus;
  hasHydrated: boolean;
  setSession: (token: string, user: AuthUser) => void;
  setUser: (user: AuthUser) => void;
  setStatus: (status: AuthStatus) => void;
  setHasHydrated: (v: boolean) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      status: 'idle',
      hasHydrated: false,
      setSession: (token, user) => set({ token, user, status: 'authenticated' }),
      setUser: (user) => set({ user }),
      setStatus: (status) => set({ status }),
      setHasHydrated: (v) => set({ hasHydrated: v }),
      clear: () => set({ token: null, user: null, status: 'unauthenticated' }),
    }),
    {
      name: 'art-garage-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ token: state.token, user: state.user }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return useAuthStore.getState().token;
}
