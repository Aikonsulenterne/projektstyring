'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Project, Thought } from '@/domain/entities';

type Dialog =
  | { kind: 'project'; project: Project | null }
  | { kind: 'direction' }
  | { kind: 'thought'; thought: Thought }
  | { kind: 'convert'; thought: Thought }
  | { kind: 'backup' }
  | null;

interface ShellApi {
  dialog: Dialog;
  openProject: (project: Project | null) => void;
  openDirection: () => void;
  openThought: (thought: Thought) => void;
  openConvert: (thought: Thought) => void;
  openBackup: () => void;
  close: () => void;
}

const ShellContext = createContext<ShellApi | null>(null);

export function useShell(): ShellApi {
  const value = useContext(ShellContext);
  if (!value) throw new Error('useShell must be used inside <ShellProvider>');
  return value;
}

export function ShellProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const api = useMemo<ShellApi>(
    () => ({
      dialog,
      openProject: (project) => setDialog({ kind: 'project', project }),
      openDirection: () => setDialog({ kind: 'direction' }),
      openThought: (thought) => setDialog({ kind: 'thought', thought }),
      openConvert: (thought) => setDialog({ kind: 'convert', thought }),
      openBackup: () => setDialog({ kind: 'backup' }),
      close: () => setDialog(null),
    }),
    [dialog],
  );
  return <ShellContext.Provider value={api}>{children}</ShellContext.Provider>;
}
