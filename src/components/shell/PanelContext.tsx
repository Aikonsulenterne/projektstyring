'use client';

import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Id } from '@/domain/entities';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { NewTaskDefaults } from '@/components/tasks/task-draft';
import { useQueryParams } from '@/lib/url-state';

export interface DirtyEditor {
  isDirty: () => boolean;
  save: () => Promise<boolean>;
  discard: () => void;
}

interface PanelApi {
  taskParam: string | null;
  newTaskDefaults: NewTaskDefaults;
  openTask: (id: Id) => void;
  openNewTask: (defaults?: NewTaskDefaults) => void;
  closeTask: () => void;
  /** Editors register so navigation can ask Gem / Kassér / Bliv. */
  registerEditor: (editor: DirtyEditor | null) => void;
  /** The element that opened the task panel, for focus return. */
  taskOpener: () => HTMLElement | null;
  /** Runs `go` immediately, or after the user resolves unsaved changes. */
  guard: (go: () => void) => void;
  navigate: (href: string) => void;
}

const PanelContext = createContext<PanelApi | null>(null);

export function usePanel(): PanelApi {
  const value = useContext(PanelContext);
  if (!value) throw new Error('usePanel must be used inside <PanelProvider>');
  return value;
}

export function PanelProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { params, set } = useQueryParams();
  const [newTaskDefaults, setNewTaskDefaults] = useState<NewTaskDefaults>({});
  const editor = useRef<DirtyEditor | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const rememberOpener = () => {
    const active = document.activeElement;
    opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
  };
  const [pending, setPending] = useState<(() => void) | null>(null);

  const taskParam = params.get('task');

  const guard = useCallback((go: () => void) => {
    if (editor.current?.isDirty()) setPending(() => go);
    else go();
  }, []);

  const api = useMemo<PanelApi>(
    () => ({
      taskParam,
      newTaskDefaults,
      openTask: (id) => {
        rememberOpener();
        guard(() => set({ task: id }));
      },
      openNewTask: (defaults = {}) => {
        rememberOpener();
        guard(() => {
          setNewTaskDefaults(defaults);
          set({ task: 'new' });
        });
      },
      closeTask: () => set({ task: null }),
      registerEditor: (next) => {
        editor.current = next;
      },
      taskOpener: () => (opener.current && document.contains(opener.current) ? opener.current : null),
      guard,
      navigate: (href) => guard(() => router.push(href)),
    }),
    [taskParam, newTaskDefaults, guard, set, router],
  );

  // Reloading or leaving the site with unsaved text asks the browser to confirm.
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (editor.current?.isDirty()) event.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  return (
    <PanelContext.Provider value={api}>
      {children}
      <ConfirmDialog
        open={pending !== null}
        title="Du har ændringer, der ikke er gemt."
        cancelLabel="Bliv"
        onCancel={() => setPending(null)}
        actions={[
          {
            label: 'Kassér',
            variant: 'secondary',
            onSelect: () => {
              const go = pending;
              setPending(null);
              editor.current?.discard();
              go?.();
            },
          },
          {
            label: 'Gem',
            variant: 'primary',
            onSelect: async () => {
              const go = pending;
              setPending(null);
              const saved = (await editor.current?.save()) ?? true;
              if (saved) go?.();
            },
          },
        ]}
      >
        Vil du gemme, før du går videre?
      </ConfirmDialog>
    </PanelContext.Provider>
  );
}
