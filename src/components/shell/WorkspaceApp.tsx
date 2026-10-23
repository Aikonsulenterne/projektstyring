'use client';

import { Suspense, type ReactNode } from 'react';
import { BackupPanel, RecoveryScreen } from '@/components/backup/BackupPanel';
import { ConvertThoughtDialog, DirectionSheet, ProjectSheet } from '@/components/projects/ProjectSheets';
import { TaskSheetHost } from '@/components/tasks/TaskSheet';
import { ThoughtSheet } from '@/components/thoughts/ThoughtSheet';
import { useWorkspaceContext } from '@/lib/queries';
import { AppShell, PageHeader } from './AppShell';
import { PanelProvider } from './PanelContext';
import { ShellProvider, useShell } from './ShellContext';
import { useRuntime, WorkspaceProvider, type SessionInfo } from './WorkspaceProvider';

function DialogHost() {
  const { dialog } = useShell();
  const context = useWorkspaceContext();
  if (!dialog || !context.data) return null;
  switch (dialog.kind) {
    case 'project':
      return <ProjectSheet project={dialog.project} context={context.data} />;
    case 'direction':
      return <DirectionSheet context={context.data} />;
    case 'thought':
      return <ThoughtSheet thought={dialog.thought} context={context.data} />;
    case 'convert':
      return <ConvertThoughtDialog thought={dialog.thought} />;
    case 'backup':
      return <BackupPanel />;
  }
}

function Content({ children }: { children: ReactNode }) {
  const runtime = useRuntime();
  const status = runtime.demoLoadState?.status;
  if (status === 'corrupt' || status === 'unsupported') {
    return (
      <>
        <PageHeader title="Gendannelse" />
        <RecoveryScreen />
      </>
    );
  }
  return (
    <>
      {children}
      <TaskSheetHost />
      <DialogHost />
    </>
  );
}

export function WorkspaceApp({ session, children }: { session: SessionInfo; children: ReactNode }) {
  return (
    <WorkspaceProvider session={session}>
      <Suspense fallback={<div className="min-h-screen bg-bg" aria-busy="true" />}>
        <PanelProvider>
          <ShellProvider>
            <AppShell>
              <Content>{children}</Content>
            </AppShell>
          </ShellProvider>
        </PanelProvider>
      </Suspense>
    </WorkspaceProvider>
  );
}
