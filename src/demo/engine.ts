// In-memory implementation of every workspace operation over a DemoData snapshot.
// The demo repository loads the latest persisted snapshot, runs one operation here
// and persists the result. Each entity carries its own version, so concurrent tabs
// conflict per record rather than overwriting each other's unrelated changes.

import type {
  Id,
  Project,
  ProjectQuery,
  Task,
  TaskPage,
  TaskQuery,
  TaskStatus,
  Thought,
  ThoughtQuery,
  Workspace,
  WorkspaceContext,
} from '@/domain/entities';
import { DomainError, notFound } from '@/domain/errors';
import { compareRank } from '@/domain/rank';
import {
  applyProjectPatch,
  applyTaskMove,
  applyTaskPatch,
  applyThoughtPatch,
  assertReferences,
  assertVersion,
  buildProject,
  buildTask,
  buildThought,
  convertThought,
  setArchived,
  type ReferenceLookup,
  type RuleContext,
} from '@/domain/rules';
import {
  convertThoughtSchema,
  createProjectSchema,
  createTaskSchema,
  createThoughtSchema,
  directionSchema,
  LIMITS,
  moveTaskSchema,
  parseInput,
  projectPatchSchema,
  taskPatchSchema,
  thoughtPatchSchema,
  versionOnlySchema,
} from '@/domain/schemas';
import { compareBoard, matchesTask, normalizeTaskQuery, selectProjects, selectThoughts } from '@/domain/selectors';
import type { PageRequest, ThoughtPage } from '@/lib/repository';
import type { DemoData, IdempotencyReceipt } from './format';

const MAX_RECEIPTS = 500;

export function stableHash(value: unknown): string {
  const json = JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
  // FNV-1a, enough to detect "same key, different request" in local demo mode.
  let hash = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    hash ^= json.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

function pageLimit(page?: PageRequest): number {
  return Math.min(Math.max(page?.limit ?? LIMITS.pageDefault, 1), LIMITS.pageMax);
}

export class DemoEngine {
  constructor(
    readonly data: DemoData,
    private readonly ctx: RuleContext,
  ) {}

  private get refs(): ReferenceLookup {
    return {
      project: (id) => {
        const p = this.data.projects.find((x) => x.id === id);
        return p ? { archived: p.archivedAt !== null } : undefined;
      },
      area: (id) => this.data.areas.some((a) => a.id === id),
      member: (id) => {
        const m = this.data.members.find((x) => x.id === id);
        return m ? { active: m.active } : undefined;
      },
    };
  }

  private column(status: TaskStatus): Task[] {
    return this.data.tasks.filter((t) => t.status === status && t.archivedAt === null);
  }

  private replay<T>(key: string | undefined, entityType: IdempotencyReceipt['entityType'], input: unknown, find: (id: Id) => T | undefined): T | undefined {
    if (!key) return undefined;
    const receipt = this.data.receipts.find((r) => r.key === key);
    if (!receipt) return undefined;
    if (receipt.entityType !== entityType || receipt.requestHash !== stableHash(input)) {
      throw new DomainError('IDEMPOTENCY_MISMATCH', 'Den samme anmodning blev sendt med andet indhold.');
    }
    const existing = find(receipt.entityId);
    if (!existing) throw notFound();
    return existing;
  }

  private remember(key: string | undefined, entityType: IdempotencyReceipt['entityType'], input: unknown, entityId: Id): void {
    if (!key) return;
    this.data.receipts.push({ key, requestHash: stableHash(input), entityType, entityId, createdAt: this.ctx.now });
    if (this.data.receipts.length > MAX_RECEIPTS) this.data.receipts.splice(0, this.data.receipts.length - MAX_RECEIPTS);
  }

  private task(id: Id): Task {
    const task = this.data.tasks.find((t) => t.id === id);
    if (!task) throw notFound();
    return task;
  }

  private putTask(next: Task): Task {
    const index = this.data.tasks.findIndex((t) => t.id === next.id);
    if (index < 0) this.data.tasks.push(next);
    else this.data.tasks[index] = next;
    return next;
  }

  private project(id: Id): Project {
    const project = this.data.projects.find((p) => p.id === id);
    if (!project) throw notFound();
    return project;
  }

  private putProject(next: Project): Project {
    const index = this.data.projects.findIndex((p) => p.id === next.id);
    if (index < 0) this.data.projects.push(next);
    else this.data.projects[index] = next;
    return next;
  }

  private thought(id: Id): Thought {
    const thought = this.data.thoughts.find((t) => t.id === id);
    if (!thought) throw notFound();
    return thought;
  }

  private putThought(next: Thought): Thought {
    const index = this.data.thoughts.findIndex((t) => t.id === next.id);
    if (index < 0) this.data.thoughts.push(next);
    else this.data.thoughts[index] = next;
    return next;
  }

  // ---- queries -------------------------------------------------------------

  context(currentUserId: Id): WorkspaceContext {
    return {
      workspace: this.data.workspace,
      members: this.data.members,
      areas: this.data.areas,
      currentUserId,
    };
  }

  listTasks(query: TaskQuery, page?: PageRequest): TaskPage {
    const normalized = normalizeTaskQuery(query);
    const matching = this.data.tasks.filter((t) => matchesTask(t, normalized)).sort(compareBoard);
    let start = 0;
    if (page?.cursor) {
      const [sortKey, id] = page.cursor.split('~');
      start = matching.findIndex((t) => compareRank(t.sortKey, sortKey ?? '') > 0 || (t.sortKey === sortKey && compareRank(t.id, id ?? '') > 0));
      if (start < 0) start = matching.length;
    }
    const limit = pageLimit(page);
    const items = matching.slice(start, start + limit);
    const last = items[items.length - 1];
    const hasMore = start + limit < matching.length;
    return {
      items,
      totalMatching: matching.length,
      nextCursor: hasMore && last ? `${last.sortKey}~${last.id}` : null,
      serverTime: this.ctx.now,
    };
  }

  getTask(id: Id): Task {
    return this.task(id);
  }

  listProjects(query: ProjectQuery = {}): Project[] {
    return selectProjects(this.data.projects, query);
  }

  getProject(id: Id): Project {
    return this.project(id);
  }

  listThoughts(query: ThoughtQuery, page?: PageRequest): ThoughtPage {
    const { items: matching } = selectThoughts(this.data.thoughts, query);
    const start = page?.cursor ? Number.parseInt(page.cursor, 10) || 0 : 0;
    const limit = pageLimit(page);
    const items = matching.slice(start, start + limit);
    return {
      items,
      totalMatching: matching.length,
      nextCursor: start + limit < matching.length ? String(start + limit) : null,
    };
  }

  // ---- workspace -----------------------------------------------------------

  updateDirection(input: unknown): Workspace {
    const data = parseInput(directionSchema, input);
    assertVersion(this.data.workspace, data.expectedVersion);
    if (data.direction === this.data.workspace.direction) return this.data.workspace;
    this.data.workspace = {
      ...this.data.workspace,
      direction: data.direction,
      version: this.data.workspace.version + 1,
      updatedAt: this.ctx.now,
    };
    return this.data.workspace;
  }

  // ---- tasks ---------------------------------------------------------------

  createTask(input: unknown, idempotencyKey?: string): Task {
    const replayed = this.replay(idempotencyKey, 'task', input, (id) => this.data.tasks.find((t) => t.id === id));
    if (replayed) return replayed;
    const data = parseInput(createTaskSchema, input);
    assertReferences(this.refs, { ...data, assigneeId: data.assigneeId ?? null });
    const task = buildTask(data, this.ctx, this.column(data.status));
    this.data.tasks.push(task);
    this.remember(idempotencyKey, 'task', input, task.id);
    return task;
  }

  updateTask(id: Id, input: unknown, idempotencyKey?: string): Task {
    const replayed = this.replay(idempotencyKey, 'task', { id, input }, (taskId) => this.data.tasks.find((t) => t.id === taskId));
    if (replayed) return replayed;
    const patch = parseInput(taskPatchSchema, input);
    const result = applyTaskPatch(this.task(id), patch, this.ctx, this.refs, (status) => this.column(status));
    this.putTask(result.task);
    this.remember(idempotencyKey, 'task', { id, input }, id);
    return result.task;
  }

  moveTask(id: Id, input: unknown): Task {
    const data = parseInput(moveTaskSchema, input);
    return this.putTask(applyTaskMove(this.task(id), data, this.column(data.status), this.ctx));
  }

  setTaskArchived(id: Id, archived: boolean, expectedVersion: number): Task {
    const { expectedVersion: version } = parseInput(versionOnlySchema, { expectedVersion });
    // Restore keeps associations, status and position (sort key ties break on id).
    return this.putTask(setArchived(this.task(id), archived, version, this.ctx));
  }

  // ---- projects ------------------------------------------------------------

  createProject(input: unknown, idempotencyKey?: string): Project {
    const replayed = this.replay(idempotencyKey, 'project', input, (pid) => this.data.projects.find((p) => p.id === pid));
    if (replayed) return replayed;
    const data = parseInput(createProjectSchema, input);
    if (data.ownerUserId) assertReferences(this.refs, { assigneeId: data.ownerUserId });
    const project = buildProject(data, this.ctx);
    this.data.projects.push(project);
    this.remember(idempotencyKey, 'project', input, project.id);
    return project;
  }

  updateProject(id: Id, input: unknown): Project {
    const patch = parseInput(projectPatchSchema, input);
    return this.putProject(applyProjectPatch(this.project(id), patch, this.ctx, this.refs).project);
  }

  setProjectArchived(id: Id, archived: boolean, expectedVersion: number): Project {
    const { expectedVersion: version } = parseInput(versionOnlySchema, { expectedVersion });
    // Tasks and notes keep their link; nothing cascades.
    return this.putProject(setArchived(this.project(id), archived, version, this.ctx));
  }

  // ---- thoughts ------------------------------------------------------------

  createThought(input: unknown, idempotencyKey?: string): Thought {
    const replayed = this.replay(idempotencyKey, 'thought', input, (tid) => this.data.thoughts.find((t) => t.id === tid));
    if (replayed) return replayed;
    const data = parseInput(createThoughtSchema, input);
    assertReferences(this.refs, data);
    const thought = buildThought(data, this.ctx);
    this.data.thoughts.push(thought);
    this.remember(idempotencyKey, 'thought', input, thought.id);
    return thought;
  }

  updateThought(id: Id, input: unknown): Thought {
    const patch = parseInput(thoughtPatchSchema, input);
    return this.putThought(applyThoughtPatch(this.thought(id), patch, this.ctx, this.refs).thought);
  }

  setThoughtArchived(id: Id, archived: boolean, expectedVersion: number): Thought {
    const { expectedVersion: version } = parseInput(versionOnlySchema, { expectedVersion });
    return this.putThought(setArchived(this.thought(id), archived, version, this.ctx));
  }

  convertThought(id: Id, input: unknown, idempotencyKey?: string): { project: Project; thought: Thought } {
    const replayed = this.replay(idempotencyKey, 'conversion', { id, input }, (pid) => this.data.projects.find((p) => p.id === pid));
    if (replayed) return { project: replayed, thought: this.thought(id) };
    const data = parseInput(convertThoughtSchema, input);
    const result = convertThought(this.thought(id), data, this.ctx);
    this.putProject(result.project);
    this.putThought(result.thought);
    this.remember(idempotencyKey, 'conversion', { id, input }, result.project.id);
    return result;
  }
}
