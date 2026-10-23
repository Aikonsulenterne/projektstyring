'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Id } from '@/domain/entities';
import { DemoRepository, type LoadState } from '@/demo/repository';
import { HttpRepository } from '@/lib/api-client';
import type { AppMode, WorkspaceRepository } from '@/lib/repository';
import { ToastProvider } from '@/components/ui/Toasts';

const DEMO_USER_KEY = 'teamspace-demo-user';
const DEFAULT_DEMO_USER = '00000000-0000-4000-8000-0000000000a4'; // Nicholas, as in the reference.

export interface SessionInfo {
  mode: AppMode;
  /** Server mode: the authenticated account. Demo mode: null (no login). */
  account: { displayName: string } | null;
  workspaceId: Id | null;
}

interface WorkspaceRuntime {
  repo: WorkspaceRepository;
  session: SessionInfo;
  demo: DemoRepository | null;
  demoLoadState: LoadState | null;
  setDemoUser: (id: Id) => void;
  /** Re-reads storage after a restore/reset in demo mode. */
  reloadDemo: () => void;
}

const RuntimeContext = createContext<WorkspaceRuntime | null>(null);

export function useRuntime(): WorkspaceRuntime {
  const value = useContext(RuntimeContext);
  if (!value) throw new Error('useRuntime must be used inside <WorkspaceProvider>');
  return value;
}

export function useRepo(): WorkspaceRepository {
  return useRuntime().repo;
}

function safeStorage(): Storage | null {
  try {
    const storage = window.localStorage;
    storage.getItem('teamspace-probe');
    return storage;
  } catch {
    return null;
  }
}

function readDemoUser(): Id {
  try {
    return window.localStorage.getItem(DEMO_USER_KEY) ?? DEFAULT_DEMO_USER;
  } catch {
    return DEFAULT_DEMO_USER;
  }
}

export function WorkspaceProvider({ session, children }: { session: SessionInfo; children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: session.mode === 'server' ? 1 : false,
            staleTime: session.mode === 'server' ? 5_000 : 0,
            // Shared mode: refetch on focus and poll every 20 s only while visible.
            refetchOnWindowFocus: session.mode === 'server',
            refetchInterval: session.mode === 'server' ? 20_000 : false,
            refetchIntervalInBackground: false,
          },
          mutations: { retry: false },
        },
      }),
  );
  const [demoUser, setDemoUserState] = useState<Id>(DEFAULT_DEMO_USER);
  const [generation, setGeneration] = useState(0);
  const [runtime, setRuntime] = useState<Pick<WorkspaceRuntime, 'repo' | 'demo' | 'demoLoadState'> | null>(null);

  // Created after mount: browser storage does not exist during server rendering.
  useEffect(() => {
    if (session.mode === 'server') {
      setRuntime({ repo: new HttpRepository(session.workspaceId!), demo: null, demoLoadState: null });
      return;
    }
    const demo = new DemoRepository({ storage: safeStorage(), currentUserId: () => readDemoUser() });
    const demoLoadState = demo.init();
    setDemoUserState(readDemoUser());
    setRuntime({ repo: demo, demo, demoLoadState });
  }, [session.mode, session.workspaceId, generation]);

  useEffect(() => {
    if (!runtime?.demo) return;
    // Another tab changed the demo data: refetch, never touch open drafts.
    return runtime.demo.subscribe(() => void queryClient.invalidateQueries());
  }, [runtime, queryClient]);

  const value = useMemo<WorkspaceRuntime | null>(() => {
    if (!runtime) return null;
    return {
      ...runtime,
      session,
      setDemoUser: (id: Id) => {
        try {
          window.localStorage.setItem(DEMO_USER_KEY, id);
        } catch {
          // Viewer preference only; ignore when storage is blocked.
        }
        setDemoUserState(id);
        void queryClient.invalidateQueries();
      },
      reloadDemo: () => {
        setGeneration((g) => g + 1);
        queryClient.clear();
      },
    };
    // demoUser is read through the repository; included to refresh consumers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtime, session, queryClient, demoUser]);

  if (!value) {
    return <div className="min-h-screen bg-bg" aria-busy="true" />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <RuntimeContext.Provider value={value}>
        <ToastProvider>{children}</ToastProvider>
      </RuntimeContext.Provider>
    </QueryClientProvider>
  );
}
