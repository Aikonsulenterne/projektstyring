'use client';

import { ArrowLeft, Pencil } from 'lucide-react';
import { useMemo, type KeyboardEvent } from 'react';
import { TASK_STATUSES, type Id, type Project } from '@/domain/entities';
import { LIFECYCLE_LABEL, PHASE_LABEL } from '@/domain/labels';
import { compareBoard, hasActiveFilters, toTaskQuery } from '@/domain/selectors';
import { GuardedLink, NewTaskButton, PageHeader } from '@/components/shell/AppShell';
import { useShell } from '@/components/shell/ShellContext';
import { TaskFilters } from '@/components/filters/TaskFilters';
import { TaskBoard } from '@/components/tasks/TaskBoard';
import { TaskRow } from '@/components/tasks/TaskItems';
import { CaptureBar } from '@/components/thoughts/CaptureBar';
import { ThoughtList } from '@/components/thoughts/ThoughtCard';
import { Button, Card, ExampleTag, Pill, cx } from '@/components/ui/primitives';
import { errorMessage, useMutationRunner, useProject, useProjects, useTasks, useThoughts, useWorkspaceContext } from '@/lib/queries';
import { useTaskFilters } from '@/lib/url-state';
import { EmptyFilterResult, QueryState } from './common';

const TABS = [
  { id: 'board', label: 'Kanban' },
  { id: 'list', label: 'Liste' },
  { id: 'direction', label: 'Retning & læring' },
  { id: 'notes', label: 'Noter' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export function ProjectDetailView({ projectId }: { projectId: Id }) {
  const project = useProject(projectId);
  if (project.isError) {
    return (
      <>
        <PageHeader title="Projekt" />
        <div role="alert" className="rounded-card border border-line p-6">
          <p className="mb-3">{errorMessage(project.error)}</p>
          <GuardedLink href="/projects" className="text-accent underline">
            Tilbage til projekter
          </GuardedLink>
        </div>
      </>
    );
  }
  if (!project.data) return <p className="py-8 text-muted">Henter projektet…</p>;
  return <ProjectDetail project={project.data} />;
}

function ProjectDetail({ project }: { project: Project }) {
  const context = useWorkspaceContext();
  const projects = useProjects({ includeArchived: true });
  const shell = useShell();
  const run = useMutationRunner();
  const { filters, setFilters, reset, params, set } = useTaskFilters();
  const tabParam = params.get('tab');
  const tab: TabId = TABS.some((t) => t.id === tabParam) ? (tabParam as TabId) : 'board';

  const query = useMemo(() => toTaskQuery(filters, { projectId: project.id }), [filters, project.id]);
  const tasks = useTasks(query);
  const members = context.data?.members ?? [];
  const areas = context.data?.areas ?? [];
  const lookups = { members, areas, projects: projects.data ?? [] };
  const owner = members.find((m) => m.id === project.ownerUserId);
  const archived = project.archivedAt !== null;
  const filtered = hasActiveFilters(filters, true);

  const listOrder = useMemo(
    () =>
      [...(tasks.data?.items ?? [])].sort(
        (a, b) => TASK_STATUSES.indexOf(a.status) - TASK_STATUSES.indexOf(b.status) || compareBoard(a, b),
      ),
    [tasks.data],
  );

  const onTabKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = TABS.findIndex((t) => t.id === tab);
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = TABS[(index + delta + TABS.length) % TABS.length]!;
    set({ tab: next.id === 'board' ? null : next.id });
    requestAnimationFrame(() => document.getElementById(`tab-${next.id}`)?.focus());
  };

  return (
    <>
      <PageHeader title="Projekt" actions={archived ? null : <NewTaskButton defaults={{ projectId: project.id }} />} />
      <GuardedLink href="/projects" className="mb-3 inline-flex min-h-9 items-center gap-1 text-[13px] text-muted hover:text-text">
        <ArrowLeft size={14} aria-hidden /> Projekter
      </GuardedLink>

      {archived ? (
        <div role="status" className="mb-4 flex flex-wrap items-center gap-3 rounded-control bg-raised px-4 py-3">
          <span>Projektet er arkiveret. Opgaver og noter er bevaret.</span>
          <Button
            size="sm"
            onClick={() =>
              void run((r) => r.restoreProject(project.id, project.version), {
                success: 'Projektet er gendannet.',
                undo: (p, r) => () => r.archiveProject(p.id, p.version),
              }).catch(() => undefined)
            }
          >
            Gendan
          </Button>
        </div>
      ) : null}

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-[30px] font-bold leading-tight tracking-tight sm:text-[34px]">
            {project.emoji ? `${project.emoji} ` : ''}
            {project.title}
          </h2>
          {project.why ? <p className="mt-1 max-w-3xl whitespace-pre-wrap text-muted">{project.why}</p> : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Pill tone="accent">Fase: {PHASE_LABEL[project.phase]}</Pill>
            <Pill>{LIFECYCLE_LABEL[project.lifecycle]}</Pill>
            <span className="text-[13px] text-muted">Ejer: {owner?.displayName ?? 'Ingen'}</span>
            {project.isExample ? <ExampleTag /> : null}
          </div>
        </div>
        <Button onClick={() => shell.openProject(project)}>
          <Pencil size={14} aria-hidden /> Redigér projekt
        </Button>
      </div>

      <div role="tablist" aria-label="Projektvisninger" className="mb-5 flex gap-1 overflow-x-auto border-b border-line" onKeyDown={onTabKey}>
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => set({ tab: t.id === 'board' ? null : t.id })}
            className={cx('min-h-11 whitespace-nowrap border-b-2 px-3 text-[14px]', tab === t.id ? 'border-accent font-medium' : 'border-transparent text-muted hover:text-text')}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'board' || tab === 'list' ? (
          <>
            <div className="mb-5">
              <TaskFilters
                filters={filters}
                onChange={setFilters}
                onReset={reset}
                members={members}
                areas={areas}
                projects={[]}
                showProject={false}
                count={tasks.data?.totalMatching ?? null}
                canReset={filtered}
              />
            </div>
            <QueryState query={tasks}>
              {tasks.data?.totalMatching === 0 && filtered ? (
                <EmptyFilterResult onReset={reset} />
              ) : tasks.data?.totalMatching === 0 ? (
                <p className="rounded-card border border-dashed border-line p-8 text-center">Ingen opgaver her endnu.</p>
              ) : tab === 'board' ? (
                <TaskBoard tasks={tasks.data?.items ?? []} lookups={lookups} hideProject />
              ) : (
                <Card as="div">
                  <ul>
                    {listOrder.map((t) => (
                      <TaskRow key={t.id} task={t} lookups={lookups} hideProject />
                    ))}
                  </ul>
                </Card>
              )}
            </QueryState>
          </>
        ) : tab === 'direction' ? (
          <DirectionPanel project={project} onEdit={() => shell.openProject(project)} />
        ) : (
          <ProjectNotes project={project} />
        )}
      </div>
    </>
  );
}

function DirectionPanel({ project, onEdit }: { project: Project; onEdit: () => void }) {
  const fields: Array<[string, string]> = [
    ['Hvorfor', project.why],
    ['Mål', project.goal],
    ['Næste skridt', project.nextStep],
    ['Læring', project.learning],
  ];
  return (
    <Card>
      <dl className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[12px] font-semibold tracking-wide text-muted">{label}</dt>
            <dd className="mt-1 whitespace-pre-wrap">{value || <span className="text-muted">Ikke beskrevet endnu.</span>}</dd>
          </div>
        ))}
      </dl>
      <Button className="mt-6" onClick={onEdit}>
        <Pencil size={14} aria-hidden /> Redigér retning & læring
      </Button>
    </Card>
  );
}

function ProjectNotes({ project }: { project: Project }) {
  const thoughts = useThoughts({ projectId: project.id });
  return (
    <div className="flex flex-col gap-5">
      {project.archivedAt ? null : <CaptureBar projects={[]} lockedProjectId={project.id} />}
      <QueryState query={thoughts}>
        <ThoughtList thoughts={thoughts.data?.items ?? []} empty="Ingen noter til projektet endnu." />
      </QueryState>
    </div>
  );
}
