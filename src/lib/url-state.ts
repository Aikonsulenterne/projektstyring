'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import type { FilterValue } from '@/domain/entities';
import { EMPTY_FILTERS, type TaskFilterState } from '@/domain/selectors';

type Params = Record<string, string | null | undefined>;

/** Reads and replaces query parameters without adding history entries. */
export function useQueryParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const set = useCallback(
    (updates: Params) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === undefined || value === '') next.delete(key);
        else next.set(key, value);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  return { params: searchParams, set };
}

export type FocusScope = 'mine' | 'team';

export function useTaskFilters() {
  const { params, set } = useQueryParams();

  const filters = useMemo<TaskFilterState>(
    () => ({
      areaId: (params.get('area') ?? '') as FilterValue | '',
      assigneeId: (params.get('assignee') ?? '') as FilterValue | '',
      projectId: (params.get('project') ?? '') as FilterValue | '',
      q: params.get('q') ?? '',
    }),
    [params],
  );
  const scope: FocusScope = params.get('scope') === 'team' ? 'team' : 'mine';

  const setFilters = useCallback(
    (patch: Partial<TaskFilterState>) => {
      const updates: Params = {};
      if ('areaId' in patch) updates.area = patch.areaId;
      if ('assigneeId' in patch) {
        updates.assignee = patch.assigneeId;
        // An explicit assignee contradicts "Mit fokus"; switch to the whole team.
        if (patch.assigneeId) updates.scope = 'team';
      }
      if ('projectId' in patch) updates.project = patch.projectId;
      if ('q' in patch) updates.q = patch.q;
      set(updates);
    },
    [set],
  );

  const setScope = useCallback(
    (next: FocusScope) => set({ scope: next === 'team' ? 'team' : null, ...(next === 'mine' ? { assignee: null } : {}) }),
    [set],
  );

  /** Clears optional filters; keeps the route scope and the focus/team mode. */
  const reset = useCallback(() => set({ area: null, assignee: null, project: null, q: null }), [set]);

  return { filters: filters ?? EMPTY_FILTERS, scope, setFilters, setScope, reset, params, set };
}
