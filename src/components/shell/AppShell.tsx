'use client';

import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { Archive, FolderKanban, Lightbulb, Map as MapIcon, Menu, Moon, Plus, RefreshCw, Save, Sun, SunMedium, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import { useMemo, useState, type ReactNode } from 'react';
import { firstName } from '@/domain/labels';
import { MESSAGES } from '@/domain/errors';
import { Button, cx } from '@/components/ui/primitives';
import { useProjects, useTasks, useWorkspaceContext } from '@/lib/queries';
import { usePanel } from './PanelContext';
import { useShell } from './ShellContext';
import { useRuntime } from './WorkspaceProvider';

export const NAV = [
  { href: '/today', label: 'I dag', icon: SunMedium },
  { href: '/areas', label: 'Vores områder', icon: MapIcon },
  { href: '/projects', label: 'Projekter', icon: FolderKanban },
  { href: '/thoughts', label: 'Tanker', icon: Lightbulb },
] as const;

/** Links that respect unsaved task drafts (Gem / Kassér / Bliv). */
export function GuardedLink({ href, className, children, onNavigate, ...rest }: { href: string; className?: string; children: ReactNode; onNavigate?: () => void; 'aria-current'?: 'page' | undefined }) {
  const { navigate } = usePanel();
  return (
    <Link
      href={href}
      className={className}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        onNavigate?.();
        navigate(href);
      }}
      {...rest}
    >
      {children}
    </Link>
  );
}

function Brand() {
  return (
    <div className="px-3">
      <p className="text-[18px] font-bold tracking-tight">
        teamspace<span className="text-accent">.</span>
      </p>
      <p className="text-[12px] text-muted">Fire mennesker. Én retning.</p>
    </div>
  );
}

function ThemeToggle() {
  // The shell renders client-only, so the attribute set by the inline script is readable here.
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
  );
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem('teamspace-theme', next);
    } catch {
      // Viewer preference only.
    }
    setTheme(next);
  };
  return (
    <Button variant="ghost" size="sm" onClick={toggle} aria-pressed={theme === 'light'} className="w-full justify-start">
      {theme === 'dark' ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
      {theme === 'dark' ? 'Lyst tema' : 'Mørkt tema'}
    </Button>
  );
}

function AccountBlock() {
  const runtime = useRuntime();
  const context = useWorkspaceContext();
  if (runtime.session.mode === 'server') {
    return (
      <div className="px-3 text-[13px]">
        <p className="text-muted">Logget ind som</p>
        <p className="font-medium">{runtime.session.account?.displayName}</p>
        <a href="/api/auth/signout" className="mt-1 inline-flex min-h-9 items-center text-accent underline-offset-2 hover:underline">
          Log ud
        </a>
      </div>
    );
  }
  const members = context.data?.members.filter((m) => m.active) ?? [];
  return (
    <div className="px-3">
      <label htmlFor="demo-user" className="mb-1 block text-[12px] text-muted">
        Vis som · ikke login
      </label>
      <select
        id="demo-user"
        className="control min-h-11 w-full px-3 text-[14px]"
        value={context.data?.currentUserId ?? ''}
        onChange={(e) => runtime.setDemoUser(e.target.value)}
      >
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.displayName}
          </option>
        ))}
      </select>
    </div>
  );
}

function RefreshStatus() {
  const runtime = useRuntime();
  const queryClient = useQueryClient();
  const fetching = useIsFetching();
  const context = useWorkspaceContext();
  if (runtime.session.mode !== 'server') return null;
  const updated = context.dataUpdatedAt ? new Date(context.dataUpdatedAt) : null;
  return (
    <div className="flex items-center justify-between px-3 text-[12px] text-muted">
      <span aria-live="polite">{updated ? `Opdateret ${updated.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' })}` : ''}</span>
      <Button variant="ghost" size="sm" aria-label="Opdatér nu" onClick={() => void queryClient.invalidateQueries()} disabled={fetching > 0}>
        <RefreshCw size={14} aria-hidden className={fetching ? 'animate-spin' : undefined} />
      </Button>
    </div>
  );
}

function ProjectShortcuts({ onNavigate }: { onNavigate?: () => void }) {
  const context = useWorkspaceContext();
  const projects = useProjects();
  const tasks = useTasks({});
  const pathname = usePathname();
  const me = context.data?.currentUserId;
  const mine = useMemo(() => {
    const list = (projects.data ?? []).filter((p) => p.lifecycle !== 'completed');
    const withMyTasks = new Set((tasks.data?.items ?? []).filter((t) => t.assigneeId === me && t.status !== 'done' && t.projectId).map((t) => t.projectId));
    return list.filter((p) => p.ownerUserId === me || withMyTasks.has(p.id));
  }, [projects.data, tasks.data, me]);
  return (
    <div className="px-1">
      <p className="mb-1 px-2 text-[11px] font-semibold tracking-wider text-muted">DINE PROJEKTER</p>
      {mine.length === 0 ? (
        <p className="px-2 text-[12px] text-muted">Ingen endnu.</p>
      ) : (
        <ul>
          {mine.map((p) => {
            const href = `/projects/${p.id}`;
            const active = pathname === href;
            return (
              <li key={p.id}>
                <GuardedLink
                  href={href}
                  onNavigate={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={cx('flex min-h-9 items-center rounded-control px-2 text-[13px] hover:bg-raised', active && 'bg-raised font-medium')}
                >
                  <span className="truncate">
                    {p.emoji ? `${p.emoji} ` : ''}
                    {p.title}
                  </span>
                </GuardedLink>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const shell = useShell();
  const runtime = useRuntime();
  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto py-6">
      <Brand />
      <nav aria-label="Hovedmenu" className="px-1">
        <ul className="flex flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <li key={href}>
                <GuardedLink
                  href={href}
                  onNavigate={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    'flex min-h-11 items-center gap-2 rounded-control px-3 text-[14px]',
                    active ? 'bg-primary font-medium text-on-primary' : 'hover:bg-raised',
                  )}
                >
                  <Icon size={16} aria-hidden />
                  {label}
                </GuardedLink>
              </li>
            );
          })}
        </ul>
      </nav>
      <ProjectShortcuts onNavigate={onNavigate} />
      <div className="px-1">
        <Button
          variant="ghost"
          className="w-full justify-start"
          onClick={() => {
            onNavigate?.();
            shell.openProject(null);
          }}
        >
          <Plus size={16} aria-hidden /> Nyt projekt
        </Button>
      </div>
      <div className="mt-auto flex flex-col gap-2">
        <div className="px-1">
          <GuardedLink
            href="/archive"
            onNavigate={onNavigate}
            className={cx('flex min-h-9 items-center gap-2 rounded-control px-3 text-[13px] hover:bg-raised', pathname === '/archive' && 'bg-raised font-medium')}
          >
            <Archive size={14} aria-hidden /> Arkiv
          </GuardedLink>
          {runtime.session.mode === 'demo' ? (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => {
                onNavigate?.();
                shell.openBackup();
              }}
            >
              <Save size={14} aria-hidden /> Backup
            </Button>
          ) : null}
          <ThemeToggle />
        </div>
        <RefreshStatus />
        <AccountBlock />
      </div>
    </div>
  );
}

function MobileBar() {
  const [open, setOpen] = useState(false);
  return (
    <div className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-bg px-4 py-2 md:hidden">
      <Brand />
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger asChild>
          <Button variant="ghost" aria-label="Åbn menu">
            <Menu size={20} aria-hidden />
          </Button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay" />
          <Dialog.Content className="fixed inset-y-0 left-0 z-50 w-[85vw] max-w-[300px] border-r border-line bg-bg focus:outline-none" aria-describedby={undefined}>
            <Dialog.Title className="sr-only">Menu</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" aria-label="Luk menu" className="absolute right-2 top-2">
                <X size={18} aria-hidden />
              </Button>
            </Dialog.Close>
            <SidebarContent onNavigate={() => setOpen(false)} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

/** Local-only banner in demo mode; real storage problems only, never seeded. */
export function WorkspaceBanner() {
  const runtime = useRuntime();
  if (runtime.session.mode !== 'demo') return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="rounded-control bg-warning px-4 py-2.5 text-[13px] text-on-warning">
        Lokal prototype. Data gemmes kun i denne browser, ikke fælles mellem jer. Startindhold er eksempler. Eksportér jævnligt backup.
      </p>
      {runtime.demoLoadState?.status === 'unavailable' ? (
        <p role="alert" className="rounded-control bg-danger px-4 py-2.5 text-[13px] text-on-danger">
          {MESSAGES.storageUnavailable}
        </p>
      ) : null}
    </div>
  );
}

export function PageHeader({ title, actions, headingLevel = 1 }: { title: string; actions?: ReactNode; headingLevel?: 1 | 2 }) {
  const context = useWorkspaceContext();
  const members = context.data?.members.filter((m) => m.active).map((m) => m.displayName).join(' · ');
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  return (
    <header className="mb-6 flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[12px] text-muted">{members}</p>
          <Heading className="mt-1 text-[17px] font-semibold">{title}</Heading>
        </div>
        <div className="flex shrink-0 gap-2">{actions}</div>
      </div>
      <WorkspaceBanner />
    </header>
  );
}

export function NewTaskButton({ defaults, label = 'Opgave' }: { defaults?: Parameters<ReturnType<typeof usePanel>['openNewTask']>[0]; label?: string }) {
  const { openNewTask } = usePanel();
  return (
    <Button variant="primary" onClick={() => openNewTask(defaults)} aria-label={label === 'Opgave' ? 'Ny opgave' : undefined}>
      <Plus size={16} aria-hidden /> {label}
    </Button>
  );
}

export function useGreetingName(): string {
  const context = useWorkspaceContext();
  const me = context.data?.members.find((m) => m.id === context.data?.currentUserId);
  return me ? firstName(me.displayName) : '';
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only-focusable fixed left-2 top-2 z-[90] rounded-control bg-primary px-3 py-2 text-on-primary">
        Spring til indhold
      </a>
      <aside className="fixed inset-y-0 left-0 hidden w-[232px] border-r border-line bg-bg md:block" aria-label="Sidepanel">
        <SidebarContent />
      </aside>
      <div className="md:pl-[232px]">
        <MobileBar />
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1500px] px-4 py-6 focus:outline-none sm:px-8 sm:py-8 lg:px-10">
          {children}
        </main>
      </div>
    </div>
  );
}
