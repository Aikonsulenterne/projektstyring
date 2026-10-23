import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { WorkspaceAppLoader as WorkspaceApp } from '@/components/shell/WorkspaceAppLoader';
import { GateScreen } from '@/components/shell/GateScreen';
import { getAppConfig } from '@/server/config';
import { resolveActor } from '@/server/session';

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  // Mode and identity are decided per request, never baked in at build time.
  await connection();
  const config = getAppConfig();
  if (config.mode === 'demo') {
    return <WorkspaceApp session={{ mode: 'demo', account: null, workspaceId: null }}>{children}</WorkspaceApp>;
  }
  if (config.missing.length > 0) {
    return (
      <GateScreen title="Teamspace er ikke sat op endnu">
        <p>Produktionstilstand kræver godkendt login og database. Følgende indstillinger mangler:</p>
        <ul className="mt-2 list-disc pl-5 font-mono text-[13px]">
          {config.missing.map((key) => (
            <li key={key}>{key}</li>
          ))}
        </ul>
        <p className="mt-3">Der er ingen automatisk demo-reserve. Sæt APP_MODE=demo for at køre den lokale prototype.</p>
      </GateScreen>
    );
  }
  const resolution = await resolveActor();
  if (resolution.status === 'unauthenticated') redirect('/signin');
  if (resolution.status === 'forbidden') {
    return (
      <GateScreen title="Du har ikke adgang endnu">
        <p>Du er logget ind, men er ikke medlem af arbejdsrummet. Bed en administrator om at tilføje dig.</p>
        <a href="/api/auth/signout" className="mt-3 inline-block text-accent underline">
          Log ud
        </a>
      </GateScreen>
    );
  }
  return (
    <WorkspaceApp session={{ mode: 'server', account: { displayName: resolution.displayName }, workspaceId: resolution.actor.workspaceId }}>
      {children}
    </WorkspaceApp>
  );
}
