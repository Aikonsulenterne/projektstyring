// The single filtering and ordering contract for tasks and thoughts.
// Every view (I dag, Vores områder, project board/list) and the demo repository
// use these functions; the server translates the same normalized query to SQL.

import {
  NONE,
  PRIORITIES,
  TASK_STATUSES,
  type FilterValue,
  type Id,
  type Project,
  type ProjectQuery,
  type Task,
  type TaskQuery,
  type TaskStatus,
  type Thought,
  type ThoughtQuery,
} from './entities';
import { compareRank } from './rank';

export function normalizeSearch(value: string | undefined | null): string {
  return (value ?? '').normalize('NFC').trim().toLocaleLowerCase('da-DK');
}

function matchesAssociation(value: Id | null, filter: FilterValue | undefined): boolean {
  if (filter === undefined || filter === '') return true;
  if (filter === NONE) return value === null;
  return value === filter;
}

function matchesArchive(
  archivedAt: string | null,
  query: { includeArchived?: boolean; archivedOnly?: boolean },
): boolean {
  if (query.archivedOnly) return archivedAt !== null;
  if (query.includeArchived) return true;
  return archivedAt === null;
}

/** Removes empty values so "empty means all" holds for every caller. */
export function normalizeTaskQuery(query: TaskQuery): TaskQuery {
  const normalized: TaskQuery = {};
  if (query.areaId) normalized.areaId = query.areaId;
  if (query.assigneeId) normalized.assigneeId = query.assigneeId;
  if (query.projectId) normalized.projectId = query.projectId;
  const q = query.q?.trim();
  if (q) normalized.q = q;
  if (query.status && query.status.length > 0 && query.status.length < TASK_STATUSES.length) {
    normalized.status = TASK_STATUSES.filter((s) => query.status!.includes(s));
  }
  if (query.archivedOnly) normalized.archivedOnly = true;
  else if (query.includeArchived) normalized.includeArchived = true;
  return normalized;
}

/** AND between area, assignee, project, status and case-insensitive title search. */
export function matchesTask(task: Task, query: TaskQuery): boolean {
  if (!matchesArchive(task.archivedAt, query)) return false;
  if (!matchesAssociation(task.areaId, query.areaId)) return false;
  if (!matchesAssociation(task.assigneeId, query.assigneeId)) return false;
  if (!matchesAssociation(task.projectId, query.projectId)) return false;
  if (query.status && query.status.length > 0 && !query.status.includes(task.status)) return false;
  const q = normalizeSearch(query.q);
  if (q && !normalizeSearch(task.title).includes(q)) return false;
  return true;
}

/** Canonical board order: one sort key per task, id as stable tie-break. */
export function compareBoard(a: Task, b: Task): number {
  return compareRank(a.sortKey, b.sortKey) || compareRank(a.id, b.id);
}

const PRIORITY_RANK: Record<Task['priority'], number> = Object.fromEntries(
  PRIORITIES.map((p, i) => [p, i]),
) as Record<Task['priority'], number>;

/** I dag order: due date ascending (none last), priority high→low, stable id. */
export function compareToday(a: Task, b: Task): number {
  if (a.dueDate !== b.dueDate) {
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  }
  return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || compareRank(a.id, b.id);
}

export interface Selection<T> {
  items: T[];
  total: number;
}

export function selectTasks(
  tasks: readonly Task[],
  query: TaskQuery,
  order: 'board' | 'today' = 'board',
): Selection<Task> {
  const normalized = normalizeTaskQuery(query);
  const items = tasks.filter((t) => matchesTask(t, normalized));
  items.sort(order === 'today' ? compareToday : compareBoard);
  return { items, total: items.length };
}

export function groupByStatus(tasks: readonly Task[]): Record<TaskStatus, Task[]> {
  const groups: Record<TaskStatus, Task[]> = { open: [], in_progress: [], blocked: [], done: [] };
  for (const task of tasks) groups[task.status].push(task);
  return groups;
}

export function countByStatus(tasks: readonly Task[]): Record<TaskStatus, number> {
  const groups = groupByStatus(tasks);
  return {
    open: groups.open.length,
    in_progress: groups.in_progress.length,
    blocked: groups.blocked.length,
    done: groups.done.length,
  };
}

/** Composes the user-facing filters with the implicit scope of a view. */
export interface TaskFilterState {
  areaId: FilterValue | '';
  assigneeId: FilterValue | '';
  projectId: FilterValue | '';
  q: string;
}

export const EMPTY_FILTERS: TaskFilterState = { areaId: '', assigneeId: '', projectId: '', q: '' };

export function toTaskQuery(
  filters: TaskFilterState,
  scope: { projectId?: Id; assigneeId?: Id } = {},
): TaskQuery {
  return normalizeTaskQuery({
    areaId: filters.areaId || undefined,
    // Route project scope always wins over a stale global project filter.
    projectId: scope.projectId ?? (filters.projectId || undefined),
    // An explicit assignee filter replaces the implicit "Mit fokus" scope.
    assigneeId: filters.assigneeId || scope.assigneeId,
    q: filters.q,
  });
}

export function hasActiveFilters(filters: TaskFilterState, ignoreProject = false): boolean {
  return Boolean(filters.areaId || filters.assigneeId || (!ignoreProject && filters.projectId) || filters.q.trim());
}

export function matchesThought(thought: Thought, query: ThoughtQuery): boolean {
  if (!matchesArchive(thought.archivedAt, query)) return false;
  if (query.type && thought.type !== query.type) return false;
  if (!matchesAssociation(thought.projectId, query.projectId)) return false;
  if (!matchesAssociation(thought.areaId, query.areaId)) return false;
  const q = normalizeSearch(query.q);
  if (q && !normalizeSearch(thought.body).includes(q)) return false;
  return true;
}

/** Newest first, id as tie-break. */
export function selectThoughts(thoughts: readonly Thought[], query: ThoughtQuery): Selection<Thought> {
  const items = thoughts.filter((t) => matchesThought(t, query));
  items.sort((a, b) => (a.createdAt === b.createdAt ? compareRank(a.id, b.id) : a.createdAt < b.createdAt ? 1 : -1));
  return { items, total: items.length };
}

export function selectProjects(projects: readonly Project[], query: ProjectQuery): Project[] {
  return projects
    .filter((p) => matchesArchive(p.archivedAt, query))
    .sort((a, b) => a.title.localeCompare(b.title, 'da-DK') || compareRank(a.id, b.id));
}

export interface ProjectProgress {
  total: number;
  done: number;
  blocked: number;
}

/** Task completion only. Not a measure of business value. */
export function projectProgress(tasks: readonly Task[], projectId: Id): ProjectProgress {
  let total = 0;
  let done = 0;
  let blocked = 0;
  for (const task of tasks) {
    if (task.projectId !== projectId || task.archivedAt !== null) continue;
    total++;
    if (task.status === 'done') done++;
    if (task.status === 'blocked') blocked++;
  }
  return { total, done, blocked };
}
