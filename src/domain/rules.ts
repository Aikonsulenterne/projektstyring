// Pure business rules shared by the demo repository and the server services.
// Persistence layers load the records involved, call these functions to decide the
// next state, and write the result. Nothing here performs I/O.

import type {
  ChecklistItem,
  Comment,
  Id,
  Project,
  Task,
  TaskStatus,
  Thought,
} from './entities';
import { DomainError, conflict, invalidReference, MESSAGES, notFound } from './errors';
import { compareRank, rankBetween } from './rank';
import type {
  ConvertThoughtData,
  CreateProjectData,
  CreateTaskData,
  CreateThoughtData,
  MoveTaskData,
  ProjectPatchData,
  TaskPatchData,
  ThoughtPatchData,
} from './schemas';

export interface RuleContext {
  actorId: Id;
  now: string;
  newId: () => Id;
}

/** What the persistence layer knows about valid association targets. */
export interface ReferenceLookup {
  project(id: Id): { archived: boolean } | undefined;
  area(id: Id): boolean;
  member(id: Id): { active: boolean } | undefined;
}

type Assoc = { projectId?: Id | null; areaId?: Id | null; assigneeId?: Id | null };

/**
 * New associations must point at active records in the same workspace. An unchanged
 * association to a since-archived project or inactive member stays valid.
 */
export function assertReferences(refs: ReferenceLookup, next: Assoc, current: Assoc = {}): void {
  if (next.projectId && next.projectId !== current.projectId) {
    const project = refs.project(next.projectId);
    if (!project || project.archived) throw invalidReference('projectId');
  }
  if (next.areaId && next.areaId !== current.areaId && !refs.area(next.areaId)) {
    throw invalidReference('areaId');
  }
  if (next.assigneeId && next.assigneeId !== current.assigneeId) {
    const member = refs.member(next.assigneeId);
    if (!member || !member.active) throw invalidReference('assigneeId');
  }
}

export function assertVersion(entity: { version: number }, expectedVersion: number, message?: string): void {
  if (entity.version !== expectedVersion) throw conflict(entity.version, message);
}

export function lastKey(column: readonly Task[]): string | null {
  let max: string | null = null;
  for (const task of column) if (max === null || compareRank(task.sortKey, max) > 0) max = task.sortKey;
  return max;
}

export function buildTask(
  data: CreateTaskData,
  ctx: RuleContext,
  column: readonly Task[],
  extra: { isExample?: boolean } = {},
): Task {
  const id = ctx.newId();
  const comments: Comment[] = data.pendingComment
    ? [{ id: ctx.newId(), body: data.pendingComment, authorUserId: ctx.actorId, createdAt: ctx.now }]
    : [];
  return {
    id,
    title: data.title,
    description: data.description,
    projectId: data.projectId ?? null,
    areaId: data.areaId ?? null,
    // Omitted assignee defaults to the creator; explicit null stays unassigned.
    assigneeId: data.assigneeId === undefined ? ctx.actorId : data.assigneeId,
    status: data.status,
    priority: data.priority,
    dueDate: data.dueDate ?? null,
    sortKey: rankBetween(lastKey(column), null),
    isExample: extra.isExample ?? false,
    checklist: data.checklist.map((item, position) => ({ id: ctx.newId(), text: item.text, done: item.done, position })),
    comments,
    createdAt: ctx.now,
    updatedAt: ctx.now,
    version: 1,
    archivedAt: null,
  };
}

const TASK_SCALARS = [
  'title',
  'description',
  'projectId',
  'areaId',
  'assigneeId',
  'status',
  'priority',
  'dueDate',
] as const;
type TaskScalar = (typeof TASK_SCALARS)[number];

export interface TaskPatchResult {
  task: Task;
  changedFields: string[];
  checklistChanged: boolean;
  addedComments: Comment[];
  addedChecklist: ChecklistItem[];
  removedChecklistIds: Id[];
  updatedChecklist: ChecklistItem[];
  /** True when the status changed and the task needs a new position at the end of its column. */
  statusChanged: boolean;
}

/**
 * Applies a validated patch atomically to an in-memory task. Fields, checklist and
 * comments either all change or the function throws before returning anything.
 */
export function applyTaskPatch(
  task: Task,
  patch: TaskPatchData,
  ctx: RuleContext,
  refs: ReferenceLookup,
  targetColumn: (status: TaskStatus) => readonly Task[],
): TaskPatchResult {
  if (task.archivedAt) throw new DomainError('ARCHIVED', 'Opgaven er arkiveret. Gendan den først.');
  assertVersion(task, patch.expectedVersion, MESSAGES.taskConflict);
  assertReferences(refs, patch, task);

  const next: Task = { ...task, checklist: task.checklist.map((c) => ({ ...c })), comments: [...task.comments] };
  const changedFields: string[] = [];
  for (const field of TASK_SCALARS) {
    const value = patch[field];
    if (value === undefined || value === task[field]) continue;
    (next as Record<TaskScalar, unknown>)[field] = value;
    changedFields.push(field);
  }

  const statusChanged = next.status !== task.status;
  if (statusChanged) {
    const column = targetColumn(next.status).filter((t) => t.id !== task.id);
    next.sortKey = rankBetween(lastKey(column), null);
  }

  const ops = patch.checklist ?? { add: [], update: [], remove: [] };
  const byId = new Map(next.checklist.map((item) => [item.id, item]));
  for (const id of ops.remove) {
    if (!byId.has(id)) throw notFound();
  }
  const updatedChecklist: ChecklistItem[] = [];
  for (const change of ops.update) {
    const item = byId.get(change.id);
    if (!item) throw notFound();
    if (ops.remove.includes(change.id)) continue;
    let touched = false;
    if (change.text !== undefined && change.text !== item.text) {
      item.text = change.text;
      touched = true;
    }
    if (change.done !== undefined && change.done !== item.done) {
      item.done = change.done;
      touched = true;
    }
    if (touched) updatedChecklist.push(item);
  }
  next.checklist = next.checklist.filter((item) => !ops.remove.includes(item.id));
  let position = next.checklist.reduce((max, item) => Math.max(max, item.position), -1);
  const addedChecklist = ops.add.map((item) => ({ id: ctx.newId(), text: item.text, done: item.done, position: ++position }));
  next.checklist.push(...addedChecklist);
  if (next.checklist.length > 200) {
    throw new DomainError('VALIDATION', 'For mange delopgaver.', { fieldErrors: { checklist: 'Højst 200.' } });
  }

  const addedComments: Comment[] = patch.newComments.map((c) => ({
    id: ctx.newId(),
    body: c.body,
    authorUserId: ctx.actorId,
    createdAt: ctx.now,
  }));
  next.comments.push(...addedComments);

  const checklistChanged = addedChecklist.length > 0 || updatedChecklist.length > 0 || ops.remove.length > 0;
  if (changedFields.length > 0 || checklistChanged || addedComments.length > 0) {
    next.version = task.version + 1;
    next.updatedAt = ctx.now;
  }
  return {
    task: next,
    changedFields,
    checklistChanged,
    addedComments,
    addedChecklist,
    removedChecklistIds: ops.remove,
    updatedChecklist,
    statusChanged,
  };
}

/**
 * Computes the new sort key for a move. `column` is every non-archived task in the
 * target status (including ones hidden by filters), excluding the moved task.
 */
export function computeMoveKey(column: readonly Task[], input: MoveTaskData): string {
  const find = (id: Id | null) => {
    if (id === null) return null;
    const neighbour = column.find((t) => t.id === id);
    if (!neighbour) {
      throw new DomainError('VALIDATION', 'Placeringen er ikke længere gyldig. Prøv igen.', {
        fieldErrors: { position: 'Nabo-opgaven findes ikke i den kolonne.' },
      });
    }
    return neighbour;
  };
  const before = find(input.beforeTaskId);
  const after = find(input.afterTaskId);
  if (!before && !after) return rankBetween(lastKey(column), null);

  const sorted = [...column].sort((a, b) => compareRank(a.sortKey, b.sortKey) || compareRank(a.id, b.id));
  let lower = before?.sortKey ?? null;
  let upper = after?.sortKey ?? null;
  if (lower === null && upper !== null) {
    // Placing above `after`: the lower bound is whatever currently precedes it.
    const index = sorted.findIndex((t) => t.id === after!.id);
    lower = index > 0 ? sorted[index - 1]!.sortKey : null;
  }
  if (lower !== null && (upper === null || compareRank(lower, upper) >= 0)) {
    // Inconsistent or open-ended neighbours: go directly after `lower`.
    upper = sorted.find((t) => compareRank(t.sortKey, lower!) > 0)?.sortKey ?? null;
  }
  if (lower !== null && upper !== null && lower === upper) upper = null;
  return rankBetween(lower, upper);
}

export function applyTaskMove(task: Task, input: MoveTaskData, column: readonly Task[], ctx: RuleContext): Task {
  if (task.archivedAt) throw new DomainError('ARCHIVED', 'Opgaven er arkiveret. Gendan den først.');
  assertVersion(task, input.expectedVersion, MESSAGES.taskConflict);
  const others = column.filter((t) => t.id !== task.id);
  return {
    ...task,
    status: input.status,
    sortKey: computeMoveKey(others, input),
    version: task.version + 1,
    updatedAt: ctx.now,
  };
}

export function setArchived<T extends { version: number; archivedAt: string | null; updatedAt: string }>(
  entity: T,
  archived: boolean,
  expectedVersion: number,
  ctx: RuleContext,
): T {
  assertVersion(entity, expectedVersion);
  if (archived === (entity.archivedAt !== null)) return entity;
  return {
    ...entity,
    archivedAt: archived ? ctx.now : null,
    version: entity.version + 1,
    updatedAt: ctx.now,
  };
}

export function buildProject(data: CreateProjectData, ctx: RuleContext, extra: { isExample?: boolean } = {}): Project {
  return {
    id: ctx.newId(),
    title: data.title,
    emoji: data.emoji ?? null,
    phase: data.phase,
    lifecycle: data.lifecycle,
    ownerUserId: data.ownerUserId === undefined ? ctx.actorId : data.ownerUserId,
    why: data.why,
    goal: data.goal,
    nextStep: data.nextStep,
    learning: data.learning,
    isExample: extra.isExample ?? false,
    createdAt: ctx.now,
    updatedAt: ctx.now,
    version: 1,
    archivedAt: null,
  };
}

const PROJECT_FIELDS = ['title', 'emoji', 'phase', 'lifecycle', 'ownerUserId', 'why', 'goal', 'nextStep', 'learning'] as const;

export function applyProjectPatch(
  project: Project,
  patch: ProjectPatchData,
  ctx: RuleContext,
  refs: ReferenceLookup,
): { project: Project; changedFields: string[] } {
  if (project.archivedAt) throw new DomainError('ARCHIVED', 'Projektet er arkiveret. Gendan det først.');
  assertVersion(project, patch.expectedVersion);
  if (patch.ownerUserId && patch.ownerUserId !== project.ownerUserId) {
    const member = refs.member(patch.ownerUserId);
    if (!member || !member.active) throw invalidReference('ownerUserId');
  }
  const next = { ...project };
  const changedFields: string[] = [];
  for (const field of PROJECT_FIELDS) {
    const value = patch[field];
    if (value === undefined || value === project[field]) continue;
    (next as Record<string, unknown>)[field] = value;
    changedFields.push(field);
  }
  if (changedFields.length > 0) {
    next.version = project.version + 1;
    next.updatedAt = ctx.now;
  }
  return { project: next, changedFields };
}

export function buildThought(data: CreateThoughtData, ctx: RuleContext, extra: { isExample?: boolean } = {}): Thought {
  return {
    id: ctx.newId(),
    body: data.body,
    type: data.type,
    projectId: data.projectId ?? null,
    areaId: data.areaId ?? null,
    authorUserId: ctx.actorId,
    convertedProjectId: null,
    isExample: extra.isExample ?? false,
    createdAt: ctx.now,
    updatedAt: ctx.now,
    version: 1,
    archivedAt: null,
  };
}

export function applyThoughtPatch(
  thought: Thought,
  patch: ThoughtPatchData,
  ctx: RuleContext,
  refs: ReferenceLookup,
): { thought: Thought; changedFields: string[] } {
  if (thought.archivedAt) throw new DomainError('ARCHIVED', 'Tanken er arkiveret. Gendan den først.');
  assertVersion(thought, patch.expectedVersion);
  assertReferences(refs, patch, thought);
  const next = { ...thought };
  const changedFields: string[] = [];
  for (const field of ['body', 'type', 'projectId', 'areaId'] as const) {
    const value = patch[field];
    if (value === undefined || value === thought[field]) continue;
    (next as Record<string, unknown>)[field] = value;
    changedFields.push(field);
  }
  if (changedFields.length > 0) {
    next.version = thought.version + 1;
    next.updatedAt = ctx.now;
  }
  return { thought: next, changedFields };
}

/** Creates a project from a thought; the original thought is kept and linked. */
export function convertThought(
  thought: Thought,
  data: ConvertThoughtData,
  ctx: RuleContext,
): { project: Project; thought: Thought } {
  if (thought.archivedAt) throw new DomainError('ARCHIVED', 'Tanken er arkiveret. Gendan den først.');
  assertVersion(thought, data.expectedVersion);
  if (thought.convertedProjectId) {
    throw new DomainError('VALIDATION', 'Tanken er allerede blevet til et projekt.');
  }
  const project = buildProject(
    {
      title: data.title,
      emoji: null,
      phase: data.phase,
      lifecycle: 'active',
      ownerUserId: ctx.actorId,
      why: thought.body,
      goal: '',
      nextStep: '',
      learning: '',
    },
    ctx,
  );
  return {
    project,
    thought: {
      ...thought,
      convertedProjectId: project.id,
      projectId: thought.projectId ?? project.id,
      version: thought.version + 1,
      updatedAt: ctx.now,
    },
  };
}
