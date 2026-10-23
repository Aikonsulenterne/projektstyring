'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { NONE, type Area, type Member, type Project } from '@/domain/entities';
import type { TaskFilterState } from '@/domain/selectors';
import { Button, compactControlClass, cx } from '@/components/ui/primitives';

export interface TaskFiltersProps {
  filters: TaskFilterState;
  onChange: (patch: Partial<TaskFilterState>) => void;
  onReset: () => void;
  members: Member[];
  areas: Area[];
  projects: Project[];
  /** Hidden inside a project route: the route already fixes the project. */
  showProject?: boolean;
  /** Complete matching count, before any preview slicing. */
  count: number | null;
  canReset: boolean;
}

/** One filter contract for every task view: area AND assignee AND project AND title search. */
export function TaskFilters({ filters, onChange, onReset, members, areas, projects, showProject = true, count, canReset }: TaskFiltersProps) {
  const ids = { area: useId(), assignee: useId(), project: useId(), q: useId() };
  const [q, setQ] = useState(filters.q);
  const lastPushed = useRef(filters.q);

  // Keep the field in sync when the URL changes elsewhere (e.g. Nulstil).
  useEffect(() => {
    if (filters.q !== lastPushed.current) {
      lastPushed.current = filters.q;
      setQ(filters.q);
    }
  }, [filters.q]);

  useEffect(() => {
    if (q === lastPushed.current) return;
    const timer = window.setTimeout(() => {
      lastPushed.current = q;
      onChange({ q });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [q, onChange]);

  const label = 'mb-1 block text-[12px] text-muted';
  return (
    <div className="flex flex-wrap items-end gap-x-3 gap-y-2" role="group" aria-label="Filtrér opgaver">
      <div>
        <label htmlFor={ids.area} className={label}>
          Område
        </label>
        <select id={ids.area} className={compactControlClass} value={filters.areaId} onChange={(e) => onChange({ areaId: e.target.value as TaskFilterState['areaId'] })}>
          <option value="">Alle områder</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
          <option value={NONE}>Uden område</option>
        </select>
      </div>
      <div>
        <label htmlFor={ids.assignee} className={label}>
          Ansvarlig
        </label>
        <select id={ids.assignee} className={compactControlClass} value={filters.assigneeId} onChange={(e) => onChange({ assigneeId: e.target.value as TaskFilterState['assigneeId'] })}>
          <option value="">Alle ansvarlige</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
            </option>
          ))}
          <option value={NONE}>Ingen ansvarlig</option>
        </select>
      </div>
      {showProject ? (
        <div>
          <label htmlFor={ids.project} className={label}>
            Projekt
          </label>
          <select id={ids.project} className={compactControlClass} value={filters.projectId} onChange={(e) => onChange({ projectId: e.target.value as TaskFilterState['projectId'] })}>
            <option value="">Alle projekter</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
            <option value={NONE}>Uden projekt</option>
          </select>
        </div>
      ) : null}
      <div>
        <label htmlFor={ids.q} className={label}>
          Søg
        </label>
        <input id={ids.q} type="search" className={cx(compactControlClass, 'w-44')} placeholder="Find opgave" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <Button variant="ghost" size="sm" onClick={onReset} disabled={!canReset} title={canReset ? undefined : 'Ingen filtre at nulstille'}>
        Nulstil
      </Button>
      <p className="pb-2 text-[12px] text-muted" aria-live="polite">
        {count === null ? '' : `${count} ${count === 1 ? 'opgave matcher' : 'opgaver matcher'}`}
      </p>
    </div>
  );
}
