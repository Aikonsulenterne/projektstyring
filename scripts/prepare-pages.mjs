// Rewrites the checkout into a demo-only static site for GitHub Pages.
//
// GitHub Pages serves files only: no API, no login, no per-request mode decision.
// This script removes the server routes and swaps three route files for static,
// demo-only versions. It changes files in place, so it only runs in CI (a
// throwaway checkout) unless you pass --force. Then build with:
//   STATIC_EXPORT=1 NEXT_PUBLIC_STATIC_DEMO=1 PAGES_BASE_PATH=/<repo> npx next build
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

if (!process.env.CI && !process.argv.includes('--force')) {
  console.error('Afvist: scriptet omskriver filer. Kør det i CI eller i en midlertidig kopi med --force.');
  process.exit(1);
}

const app = 'src/app';
rmSync(`${app}/api`, { recursive: true, force: true });
rmSync(`${app}/signin`, { recursive: true, force: true });
rmSync(`${app}/(workspace)/projects/[id]`, { recursive: true, force: true });

writeFileSync(
  `${app}/(workspace)/layout.tsx`,
  `import type { ReactNode } from 'react';
import { WorkspaceAppLoader } from '@/components/shell/WorkspaceAppLoader';

// Static GitHub Pages build: always demo mode, data stays in each visitor's browser.
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <WorkspaceAppLoader session={{ mode: 'demo', account: null, workspaceId: null }}>{children}</WorkspaceAppLoader>;
}
`,
);

writeFileSync(
  `${app}/page.tsx`,
  `'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function Home() {
  const router = useRouter();
  useEffect(() => router.replace('/today'), [router]);
  return (
    <main className="p-8">
      <Link href="/today">Gå til teamspace</Link>
    </main>
  );
}
`,
);

mkdirSync(`${app}/(workspace)/projects/view`, { recursive: true });
writeFileSync(
  `${app}/(workspace)/projects/view/page.tsx`,
  `'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { ProjectDetailView } from '@/components/views/ProjectDetailView';

function ProjectFromQuery() {
  const id = useSearchParams().get('id') ?? '';
  return <ProjectDetailView key={id} projectId={id} />;
}

export default function ProjectPage() {
  return (
    <Suspense>
      <ProjectFromQuery />
    </Suspense>
  );
}
`,
);

console.log('Klar til statisk demo-build.');
