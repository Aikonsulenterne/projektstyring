'use client';

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import type { WorkspaceApp as WorkspaceAppType } from './WorkspaceApp';

// The workspace reads browser storage and session state, so it renders client-only.
const WorkspaceApp = dynamic(() => import('./WorkspaceApp').then((m) => m.WorkspaceApp), {
  ssr: false,
  loading: () => <div className="min-h-screen bg-bg" aria-busy="true" />,
});

export function WorkspaceAppLoader(props: ComponentProps<typeof WorkspaceAppType>) {
  return <WorkspaceApp {...props} />;
}
