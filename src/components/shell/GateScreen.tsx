import type { ReactNode } from 'react';

/** Full-page message for configuration and access gates. Never a fake login. */
export function GateScreen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-12">
      <p className="mb-6 text-[18px] font-bold tracking-tight">
        teamspace<span className="text-accent">.</span>
      </p>
      <h1 className="mb-3 text-[26px] font-bold tracking-tight">{title}</h1>
      <div className="text-muted">{children}</div>
    </main>
  );
}
