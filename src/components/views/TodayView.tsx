'use client';

import { useMemo } from 'react';
import { PHASE_LABEL } from '@/domain/labels';
import { compareToday, hasActiveFilters, toTaskQuery } from '@/domain/selectors';
import { NewTaskButton, PageHeader, GuardedLink, useGreetingName } from '@/components/shell/AppShell';
import { TaskFilters } from '@/components/filters/TaskFilters';
import { TaskRow } from '@/components/tasks/TaskItems';
import { CaptureBar } from '@/components/thoughts/CaptureBar';
import { Button, Card, cx, SectionHeading } from '@/components/ui/primitives';
import { useProjects, useTasks, useWorkspaceContext } from '@/lib/queries';
import { useTaskFilters } from '@/lib/url-state';
import { EmptyFilterResult, QueryState } from './common';

const PREVIEW = 6;

export function TodayView() {
  const context = useWorkspaceContext();
  const projects = useProjects();
  const { filters, scope, setFilters, setScope, reset, params, set } = useTaskFilters();
  const me = context.data?.currentUserId;
  const showAll = params.get('all') === '1';
  const greetingName = useGreetingName();

  const query = useMemo(
    () => toTaskQuery(filters, { assigneeId: scope === 'mine' ? me : undefined }),
    [filters, scope, me],
  );
  const tasks = useTasks(query, Boolean(me));
  const allProjects = useProjects({ includeArchived: true });

  const sorted = useMemo(() => [...(tasks.data?.items ?? [])].sort(compareToday), [tasks.data]);
  const nextSteps = sorted.filter((t) => t.status === 'open' || t.status === 'in_progress');
  const blocked = sorted.filter((t) => t.status === 'blocked');
  const doneCount = sorted.filter((t) => t.status === 'done').length;
  const total = tasks.data?.totalMatching ?? null;
  const lookups = {
    members: context.data?.members ?? [],
    areas: context.data?.areas ?? [],
    projects: allProjects.data ?? [],
  };
  const filtered = hasActiveFilters(filters);
  const activeProjects = (projects.data ?? []).filter((p) => p.lifecycle === 'active');

  return (
    <>
      <PageHeader title="I dag" actions={<NewTaskButton defaults={{ areaId: filters.areaId && filters.areaId !== 'none' ? filters.areaId : null }} />} />
      <div className="mb-6">
        <h2 className="text-[30px] font-bold leading-tight tracking-tight sm:text-[34px]">
          Hej {greetingName}. Hvad er næste skridt?
        </h2>
        <p className="mt-1 text-muted">Dine opgaver og teamets fælles overblik.</p>
      </div>

      <div className="mb-5">
        <CaptureBar projects={activeProjects} areaId={filters.areaId && filters.areaId !== 'none' ? filters.areaId : null} />
      </div>

      <div className="mb-5 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div role="group" aria-label="Visning" className="inline-flex rounded-control border border-line p-0.5">
            {(['mine', 'team'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={scope === value}
                onClick={() => setScope(value)}
                className={cx('min-h-10 rounded-[10px] px-4 text-[13px]', scope === value ? 'bg-primary font-medium text-on-primary' : 'hover:bg-raised')}
              >
                {value === 'mine' ? 'Mit fokus' : 'Hele teamet'}
              </button>
            ))}
          </div>
          <p className="text-[12px] text-muted">
            {scope === 'mine' ? 'Viser opgaver, hvor du er ansvarlig.' : 'Viser hele teamets opgaver.'}
          </p>
        </div>
        <TaskFilters
          filters={filters}
          onChange={setFilters}
          onReset={reset}
          members={context.data?.members ?? []}
          areas={context.data?.areas ?? []}
          projects={projects.data ?? []}
          count={total}
          canReset={filtered}
        />
      </div>

      <QueryState query={tasks}>
        {total === 0 && filtered ? (
          <EmptyFilterResult onReset={reset} />
        ) : (
          <>
            {showAll ? null : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card aria-labelledby="next-heading">
                <SectionHeading id="next-heading" count={nextSteps.length}>
                  {scope === 'mine' ? 'Mit fokus' : 'Næste skridt'}
                </SectionHeading>
                {nextSteps.length === 0 ? (
                  <p className="mt-4 text-muted">Ingen åbne opgaver i denne visning.</p>
                ) : (
                  <ul className="mt-2">
                    {nextSteps.slice(0, PREVIEW).map((t) => (
                      <TaskRow key={t.id} task={t} lookups={lookups} />
                    ))}
                  </ul>
                )}
                {nextSteps.length > PREVIEW ? (
                  <p className="mt-2 text-[12px] text-muted">
                    Viser {PREVIEW} af {nextSteps.length}.
                  </p>
                ) : null}
              </Card>
              <Card aria-labelledby="blocked-heading">
                <SectionHeading id="blocked-heading" count={blocked.length}>
                  Det skal vi have afklaret
                </SectionHeading>
                {blocked.length === 0 ? (
                  <p className="mt-4 text-muted">Ingen blokerede opgaver i denne visning.</p>
                ) : (
                  <ul className="mt-2">
                    {blocked.map((t) => (
                      <TaskRow key={t.id} task={t} lookups={lookups} />
                    ))}
                  </ul>
                )}
              </Card>
            </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button onClick={() => set({ all: showAll ? null : '1' })} aria-expanded={showAll} aria-controls={showAll ? 'all-tasks' : undefined}>
                {showAll ? 'Vis færre' : `Vis alle opgaver (${total ?? 0})`}
              </Button>
              {!showAll && doneCount > 0 ? <span className="text-[12px] text-muted">Inkl. {doneCount} færdige</span> : null}
            </div>

            {showAll ? (
              <section id="all-tasks" aria-labelledby="all-heading" className="mt-6">
                <div className="mb-3 flex items-baseline gap-2">
                  <SectionHeading id="all-heading" count={total ?? 0}>
                    Alle opgaver
                  </SectionHeading>
                  <span className="text-[12px] text-muted">inkl. {doneCount} færdige</span>
                </div>
                <Card as="div">
                  <ul>
                    {sorted.map((t) => (
                      <TaskRow key={t.id} task={t} lookups={lookups} />
                    ))}
                  </ul>
                </Card>
              </section>
            ) : null}
          </>
        )}
      </QueryState>

      {activeProjects.length ? (
        <section aria-labelledby="continue-heading" className="mt-8">
          <SectionHeading id="continue-heading">Fortsæt i et projekt</SectionHeading>
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {activeProjects.slice(0, 4).map((p) => (
              <li key={p.id}>
                <GuardedLink href={`/projects/${p.id}`} className="block h-full rounded-card border border-line bg-surface p-4 hover:bg-raised">
                  <p className="font-medium">{p.title}</p>
                  <p className="text-[12px] text-muted">{PHASE_LABEL[p.phase]}</p>
                  {p.nextStep ? <p className="mt-2 line-clamp-2 text-[13px]">Næste skridt: {p.nextStep}</p> : null}
                </GuardedLink>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
