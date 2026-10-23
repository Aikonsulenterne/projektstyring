'use client';

import { useMemo } from 'react';
import { NONE } from '@/domain/entities';
import { hasActiveFilters, selectTasks, toTaskQuery } from '@/domain/selectors';
import { NewTaskButton, PageHeader } from '@/components/shell/AppShell';
import { TaskFilters } from '@/components/filters/TaskFilters';
import { TaskBoard } from '@/components/tasks/TaskBoard';
import { cx } from '@/components/ui/primitives';
import { useProjects, useTasks, useWorkspaceContext } from '@/lib/queries';
import { useTaskFilters } from '@/lib/url-state';
import { EmptyFilterResult, QueryState } from './common';

/** Three ownership cards that filter the same shared tasks; never separate copies. */
export function AreasView() {
  const context = useWorkspaceContext();
  const projects = useProjects();
  const allProjects = useProjects({ includeArchived: true });
  const { filters, setFilters, reset } = useTaskFilters();

  // Card counts use every filter except the area itself, from the same selector.
  const withoutArea = useMemo(() => toTaskQuery({ ...filters, areaId: '' }), [filters]);
  const base = useTasks(withoutArea);
  const query = useMemo(() => toTaskQuery(filters), [filters]);
  const visible = useMemo(() => (base.data ? selectTasks(base.data.items, query) : null), [base.data, query]);

  const areas = context.data?.areas ?? [];
  const members = context.data?.members ?? [];
  const lookups = { members, areas, projects: allProjects.data ?? [] };
  const countFor = (areaId: string) => (base.data ? selectTasks(base.data.items, { ...withoutArea, areaId }).total : null);

  const selectArea = (areaId: string) => setFilters({ areaId: filters.areaId === areaId ? '' : (areaId as typeof filters.areaId) });

  return (
    <>
      <PageHeader
        title="Vores områder"
        actions={<NewTaskButton defaults={{ areaId: filters.areaId && filters.areaId !== NONE ? filters.areaId : null }} />}
      />
      <div className="mb-6">
        <h2 className="text-[30px] font-bold leading-tight tracking-tight sm:text-[34px]">Tre områder. Ét fælles arbejde.</h2>
        <p className="mt-1 text-muted">Områderne går på tværs af projekter. Den, der holder et område samlet, er ikke nødvendigvis ansvarlig for hver opgave.</p>
      </div>

      <div role="group" aria-label="Vælg område" className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {areas.map((area) => {
          const owner = members.find((m) => m.id === area.ownerUserId);
          const selected = filters.areaId === area.id;
          const count = countFor(area.id);
          return (
            <button
              key={area.id}
              type="button"
              aria-pressed={selected}
              onClick={() => selectArea(area.id)}
              className={cx(
                'flex min-h-24 flex-col items-start rounded-card border p-5 text-left transition-colors',
                selected ? 'border-accent bg-raised' : 'border-line bg-surface hover:bg-raised',
              )}
            >
              <span className="text-[18px] font-semibold">{area.label}</span>
              <span className="text-[13px] text-muted">{owner ? owner.displayName : 'Ingen ejer'}</span>
              <span className="mt-2 text-[12px] text-muted">{count === null ? '' : `${count} ${count === 1 ? 'opgave' : 'opgaver'}`}</span>
            </button>
          );
        })}
      </div>
      <div className="mb-5 flex flex-wrap items-center gap-2 text-[13px]">
        <button
          type="button"
          aria-pressed={filters.areaId === NONE}
          onClick={() => selectArea(NONE)}
          className={cx('min-h-9 rounded-full border px-3', filters.areaId === NONE ? 'border-accent bg-raised' : 'border-line hover:bg-raised')}
        >
          Uden område {countFor(NONE) === null ? '' : `(${countFor(NONE)})`}
        </button>
        <span className="text-muted">Klik på et valgt område igen for at se alle.</span>
      </div>

      <div className="mb-5">
        <TaskFilters
          filters={filters}
          onChange={setFilters}
          onReset={reset}
          members={members}
          areas={areas}
          projects={projects.data ?? []}
          count={visible?.total ?? null}
          canReset={hasActiveFilters(filters)}
        />
      </div>

      <QueryState query={base}>
        {visible && visible.total === 0 && hasActiveFilters(filters) ? (
          <EmptyFilterResult onReset={reset} />
        ) : visible && visible.total === 0 ? (
          <p className="rounded-card border border-dashed border-line p-8 text-center">Ingen opgaver her endnu.</p>
        ) : (
          <TaskBoard tasks={visible?.items ?? []} lookups={lookups} />
        )}
      </QueryState>
    </>
  );
}
