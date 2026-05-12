'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Wraps protected routes. Validates the persisted token via /auth/me on mount.
 * - No token at all → redirect to /login.
 * - Token but /me fails (401) → clear store, redirect to /login.
 * - Token valid → render children.
 *
 * Renders a skeleton while validating, so children never see an unauthenticated state.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const status = useAuthStore((s) => s.status);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const setUser = useAuthStore((s) => s.setUser);
  const setStatus = useAuthStore((s) => s.setStatus);
  const clear = useAuthStore((s) => s.clear);

  useEffect(() => {
    if (!hasHydrated) return;

    let cancelled = false;

    if (!token) {
      clear();
      router.replace('/login');
      return;
    }

    setStatus('loading');
    api
      .me()
      .then((user) => {
        if (cancelled) return;
        setUser(user);
        setStatus('authenticated');
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          clear();
          router.replace('/login');
          return;
        }
        // Сеть/5xx — не логаутим, оставляем последнего юзера из persist.
        setStatus('authenticated');
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, hasHydrated]);

  if (!hasHydrated || !token || status === 'loading' || status === 'idle') {
    return <AuthSkeleton />;
  }

  return <>{children}</>;
}

function AuthSkeleton() {
  return (
    <div className="flex min-h-screen">
      <div className="hidden w-64 flex-col gap-4 border-r bg-muted/30 p-4 md:flex">
        <Skeleton className="h-8 w-32" />
        <div className="space-y-2 pt-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      </div>
      <div className="flex-1 space-y-4 p-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}
