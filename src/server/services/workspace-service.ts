// Server-side workspace operations. Every method is scoped to the authenticated
// actor's workspace; client-supplied workspace ids or authors are never trusted.
//
// Writes follow one pattern inside a transaction: load the records involved, let the
// shared domain rules decide the next state, then write with a version guard
// (`WHERE version = <loaded>`) so a concurrent change surfaces as VERSION_CONFLICT
// instead of being overwritten.

import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@/generated/prisma/client';
import {
  NONE,
  type FilterValue,
  type Id,
  type Member,
  type Project,
  type ProjectQuery,
  type Task,
  type TaskPage,
  type TaskQuery,
  type TaskStatus,
  type Thought,
  type ThoughtQuery,
  type Workspace,
  type WorkspaceContext,
} from '@/domain/entities';
import { conflict, DomainError, MESSAGES, notFound } from '@/domain/errors';
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
  type Ranked,
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
import { normalizeTaskQuery } from '@/domain/selectors';
import type { PageRequest, ThoughtPage } from '@/lib/repository';
import type { Db } from '../db';
import {
  dateOnlyToDb,
  TASK_INCLUDE,
  toArea,
  toProject,
  toTask,
  toThought,
  toWorkspace,
} from '../repositories/mappers';
import type { Actor } from '../session';

type Tx = Prisma.TransactionClient;

const RECEIPT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

function hash(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function limitOf(page?: PageRequest): number {
  return Math.min(Math.max(Math.trunc(page?.limit ?? LIMITS.pageDefault), 1), LIMITS.pageMax);
}

/** `undefined` = all, `none` = null association, otherwise the id. */
function association(value: FilterValue | undefined): Id | null | undefined {
  if (value === undefined) return undefined;
  return value === NONE ? null : value;
}

/** Escapes LIKE wildcards so a search for "50%" matches literally. */
function likeEscape(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function archiveWhere(query: { includeArchived?: boolean; archivedOnly?: boolean }) {
  if (query.archivedOnly) return { archivedAt: { not: null } };
  if (query.includeArchived) return {};
  return { archivedAt: null };
}

function decodeCursor(cursor: string | null | undefined): [string, string] | null {
  if (!cursor) return null;
  const at = cursor.lastIndexOf('~');
  if (at <= 0) throw new DomainError('VALIDATION', 'Ugyldig side-markør.');
  return [cursor.slice(0, at), cursor.slice(at + 1)];
}

export class WorkspaceService {
  constructor(
    private readonly db: Db,
    private readonly actor: Actor,
    private readonly requestId: string = randomUUID(),
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private get ws(): Id {
    return this.actor.workspaceId;
  }

  private ruleContext(): RuleContext {
    return { actorId: this.actor.userId, now: this.clock().toISOString(), newId: randomUUID };
  }

  /** Interactive transaction with Prisma errors mapped to domain errors. */
  private async tx<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    try {
      return await this.db.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15_000 });
    } catch (error) {
      throw mapDbError(error);
    }
  }

  private async read<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      throw mapDbError(error);
    }
  }

  private async refs(tx: Tx, ids: { projectId?: Id | null; areaId?: Id | null; memberIds?: Array<Id | null | undefined> }): Promise<ReferenceLookup> {
    const memberIds = (ids.memberIds ?? []).filter((x): x is Id => Boolean(x));
    const [project, area, members] = await Promise.all([
      ids.projectId ? tx.project.findFirst({ where: { workspaceId: this.ws, id: ids.projectId }, select: { id: true, archivedAt: true } }) : null,
      ids.areaId ? tx.area.findFirst({ where: { workspaceId: this.ws, id: ids.areaId }, select: { id: true } }) : null,
      memberIds.length ? tx.membership.findMany({ where: { workspaceId: this.ws, userId: { in: memberIds } }, select: { userId: true, active: true } }) : [],
    ]);
    return {
      project: (id) => (project && project.id === id ? { archived: project.archivedAt !== null } : undefined),
      area: (id) => Boolean(area && area.id === id),
      member: (id) => {
        const m = members.find((x) => x.userId === id);
        return m ? { active: m.active } : undefined;
      },
    };
  }

  private async event(tx: Tx, entityType: string, entityId: Id, action: string, changedFields: string[] = []): Promise<void> {
    await tx.activityEvent.create({
      data: { workspaceId: this.ws, actorUserId: this.actor.userId, entityType, entityId, action, changedFields, requestId: this.requestId },
    });
  }

  /** Returns the earlier result's entity id, or null when the key is new. */
  private async receipt(tx: Tx, key: string | undefined, requestHash: string, entityType: string): Promise<Id | null> {
    if (!key) return null;
    const existing = await tx.idempotencyReceipt.findUnique({
      where: { workspaceId_actorUserId_key: { workspaceId: this.ws, actorUserId: this.actor.userId, key } },
    });
    if (!existing || existing.expiresAt < this.clock()) return null;
    if (existing.requestHash !== requestHash || existing.entityType !== entityType) {
      throw new DomainError('IDEMPOTENCY_MISMATCH', 'Den samme anmodning blev sendt med andet indhold.');
    }
    return existing.entityId;
  }

  private async remember(tx: Tx, key: string | undefined, requestHash: string, entityType: string, entityId: Id): Promise<void> {
    if (!key) return;
    const now = this.clock();
    // Plain insert (never upsert): a concurrent duplicate must fail on the primary key
    // so its whole transaction rolls back and it replays the first result instead.
    await tx.idempotencyReceipt.deleteMany({ where: { workspaceId: this.ws, actorUserId: this.actor.userId, key, expiresAt: { lt: now } } });
    await tx.idempotencyReceipt.create({
      data: { workspaceId: this.ws, actorUserId: this.actor.userId, key, requestHash, entityType, entityId, createdAt: now, expiresAt: new Date(now.getTime() + RECEIPT_TTL_MS) },
    });
  }

  /** Runs an idempotent write; a concurrent duplicate resolves to the first result. */
  private async idempotent<T>(key: string | undefined, entityType: string, request: unknown, run: (tx: Tx, requestHash: string) => Promise<T>, replay: (tx: Tx, entityId: Id) => Promise<T>): Promise<T> {
    const requestHash = hash(request);
    try {
      return await this.tx(async (tx) => {
        const previous = await this.receipt(tx, key, requestHash, entityType);
        if (previous) return replay(tx, previous);
        return run(tx, requestHash);
      });
    } catch (error) {
      // A concurrent request with the same key may have committed first; its write
      // then trips our receipt insert or version guard. Replay its result if so.
      if (key && (error instanceof ReceiptRaceError || (error instanceof DomainError && error.code === 'VERSION_CONFLICT'))) {
        const replayed = await this.tx(async (tx) => {
          const previous = await this.receipt(tx, key, requestHash, entityType);
          return previous ? { value: await replay(tx, previous) } : null;
        });
        if (replayed) return replayed.value;
        if (error instanceof ReceiptRaceError) throw new DomainError('IDEMPOTENCY_MISMATCH', 'Anmodningen behandles allerede. Prøv igen.');
      }
      throw error;
    }
  }

  private async loadTask(tx: Tx, id: Id): Promise<Task> {
    const row = await tx.task.findFirst({ where: { workspaceId: this.ws, id }, include: TASK_INCLUDE });
    if (!row) throw notFound();
    return toTask(row);
  }

  private async column(tx: Tx, status: TaskStatus, excludeId?: Id): Promise<Ranked[]> {
    return tx.task.findMany({
      where: { workspaceId: this.ws, status, archivedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true, sortKey: true },
    });
  }

  private async lastInColumn(tx: Tx, status: TaskStatus, excludeId?: Id): Promise<Ranked[]> {
    const last = await tx.task.findFirst({
      where: { workspaceId: this.ws, status, archivedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
      orderBy: [{ sortKey: 'desc' }, { id: 'desc' }],
      select: { id: true, sortKey: true },
    });
    return last ? [last] : [];
  }

  /** Version-guarded update. Zero rows means someone else changed it first. */
  private async guardedTaskUpdate(tx: Tx, before: Task, data: Prisma.TaskUncheckedUpdateManyInput): Promise<void> {
    const { count } = await tx.task.updateMany({ where: { workspaceId: this.ws, id: before.id, version: before.version }, data });
    if (count === 0) {
      const current = await tx.task.findFirst({ where: { workspaceId: this.ws, id: before.id }, select: { version: true } });
      throw current ? conflict(current.version, MESSAGES.taskConflict) : notFound();
    }
  }

  // ---- context ---------------------------------------------------------------

  async getContext(): Promise<WorkspaceContext> {
    return this.read(async () => {
      const [workspace, memberships, areas] = await Promise.all([
        this.db.workspace.findUnique({ where: { id: this.ws } }),
        this.db.membership.findMany({ where: { workspaceId: this.ws }, include: { user: true }, orderBy: { createdAt: 'asc' } }),
        this.db.area.findMany({ where: { workspaceId: this.ws }, orderBy: { code: 'asc' } }),
      ]);
      if (!workspace) throw notFound();
      const members: Member[] = memberships.map((m) => ({ id: m.userId, displayName: m.user.displayName, role: m.role, active: m.active }));
      return { workspace: toWorkspace(workspace), members, areas: areas.map(toArea), currentUserId: this.actor.userId };
    });
  }

  async updateDirection(input: unknown): Promise<Workspace> {
    const data = parseInput(directionSchema, input);
    return this.tx(async (tx) => {
      const current = await tx.workspace.findUnique({ where: { id: this.ws } });
      if (!current) throw notFound();
      assertVersion(current, data.expectedVersion);
      if (current.direction === data.direction) return toWorkspace(current);
      const { count } = await tx.workspace.updateMany({
        where: { id: this.ws, version: current.version },
        data: { direction: data.direction, version: { increment: 1 }, updatedAt: this.clock() },
      });
      if (count === 0) throw conflict(current.version + 1);
      await this.event(tx, 'workspace', this.ws, 'direction.update', ['direction']);
      return toWorkspace((await tx.workspace.findUnique({ where: { id: this.ws } }))!);
    });
  }

  async listActivity(limit = 50) {
    return this.read(async () => {
      const rows = await this.db.activityEvent.findMany({
        where: { workspaceId: this.ws },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: Math.min(Math.max(limit, 1), 200),
        select: { id: true, actorUserId: true, entityType: true, entityId: true, action: true, changedFields: true, createdAt: true },
      });
      return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
    });
  }

  // ---- tasks -----------------------------------------------------------------

  private taskWhere(query: TaskQuery): Prisma.TaskWhereInput {
    const q = normalizeTaskQuery(query);
    const where: Prisma.TaskWhereInput = { workspaceId: this.ws, ...archiveWhere(q) };
    const area = association(q.areaId);
    const assignee = association(q.assigneeId);
    const project = association(q.projectId);
    if (area !== undefined) where.areaId = area;
    if (assignee !== undefined) where.assigneeUserId = assignee;
    if (project !== undefined) where.projectId = project;
    if (q.status) where.status = { in: q.status };
    if (q.q) where.title = { contains: likeEscape(q.q.normalize('NFC')), mode: 'insensitive' };
    return where;
  }

  async listTasks(query: TaskQuery, page?: PageRequest): Promise<TaskPage> {
    const where = this.taskWhere(query);
    const limit = limitOf(page);
    const cursor = decodeCursor(page?.cursor);
    return this.read(async () => {
      const pageWhere: Prisma.TaskWhereInput = cursor
        ? { AND: [where, { OR: [{ sortKey: { gt: cursor[0] } }, { sortKey: cursor[0], id: { gt: cursor[1] } }] }] }
        : where;
      const [totalMatching, rows] = await Promise.all([
        this.db.task.count({ where }),
        this.db.task.findMany({ where: pageWhere, include: TASK_INCLUDE, orderBy: [{ sortKey: 'asc' }, { id: 'asc' }], take: limit + 1 }),
      ]);
      const items = rows.slice(0, limit).map(toTask);
      const last = items[items.length - 1];
      return {
        items,
        totalMatching,
        nextCursor: rows.length > limit && last ? `${last.sortKey}~${last.id}` : null,
        serverTime: this.clock().toISOString(),
      };
    });
  }

  async getTask(id: Id): Promise<Task> {
    return this.read(async () => {
      const row = await this.db.task.findFirst({ where: { workspaceId: this.ws, id }, include: TASK_INCLUDE });
      if (!row) throw notFound();
      return toTask(row);
    });
  }

  async createTask(input: unknown, idempotencyKey?: string): Promise<Task> {
    const data = parseInput(createTaskSchema, input);
    return this.idempotent(
      idempotencyKey,
      'task',
      { op: 'task.create', input },
      async (tx, requestHash) => {
        const assigneeId = data.assigneeId === undefined ? this.actor.userId : data.assigneeId;
        assertReferences(await this.refs(tx, { projectId: data.projectId, areaId: data.areaId, memberIds: [assigneeId] }), { ...data, assigneeId });
        const task = buildTask(data, this.ruleContext(), await this.lastInColumn(tx, data.status));
        await tx.task.create({
          data: {
            id: task.id,
            workspaceId: this.ws,
            title: task.title,
            description: task.description,
            projectId: task.projectId,
            areaId: task.areaId,
            assigneeUserId: task.assigneeId,
            status: task.status,
            priority: task.priority,
            dueDate: dateOnlyToDb(task.dueDate),
            sortKey: task.sortKey,
            createdAt: new Date(task.createdAt),
            updatedAt: new Date(task.updatedAt),
          },
        });
        if (task.checklist.length) {
          await tx.checklistItem.createMany({ data: task.checklist.map((c) => ({ id: c.id, workspaceId: this.ws, taskId: task.id, text: c.text, done: c.done, position: c.position })) });
        }
        if (task.comments.length) {
          await tx.comment.createMany({ data: task.comments.map((c) => ({ id: c.id, workspaceId: this.ws, taskId: task.id, body: c.body, authorUserId: this.actor.userId })) });
        }
        await this.event(tx, 'task', task.id, 'create');
        await this.remember(tx, idempotencyKey, requestHash, 'task', task.id);
        return this.loadTask(tx, task.id);
      },
      (tx, id) => this.loadTask(tx, id),
    );
  }

  /** Fields, checklist and new comments are saved in one transaction or not at all. */
  async updateTask(id: Id, input: unknown, idempotencyKey?: string): Promise<Task> {
    const patch = parseInput(taskPatchSchema, input);
    return this.idempotent(
      idempotencyKey,
      'task',
      { op: 'task.update', id, input },
      async (tx, requestHash) => {
        const before = await this.loadTask(tx, id);
        const refs = await this.refs(tx, { projectId: patch.projectId, areaId: patch.areaId, memberIds: [patch.assigneeId] });
        const lastTarget = patch.status && patch.status !== before.status ? await this.lastInColumn(tx, patch.status, id) : [];
        const result = applyTaskPatch(before, patch, this.ruleContext(), refs, () => lastTarget);
        if (result.task.version === before.version) return before;
        const next = result.task;
        await this.guardedTaskUpdate(tx, before, {
          title: next.title,
          description: next.description,
          projectId: next.projectId,
          areaId: next.areaId,
          assigneeUserId: next.assigneeId,
          status: next.status,
          priority: next.priority,
          dueDate: dateOnlyToDb(next.dueDate),
          sortKey: next.sortKey,
          version: next.version,
          updatedAt: new Date(next.updatedAt),
        });
        if (result.removedChecklistIds.length) {
          await tx.checklistItem.deleteMany({ where: { workspaceId: this.ws, taskId: id, id: { in: result.removedChecklistIds } } });
        }
        for (const item of result.updatedChecklist) {
          await tx.checklistItem.updateMany({ where: { workspaceId: this.ws, taskId: id, id: item.id }, data: { text: item.text, done: item.done, updatedAt: new Date(next.updatedAt) } });
        }
        if (result.addedChecklist.length) {
          await tx.checklistItem.createMany({ data: result.addedChecklist.map((c) => ({ id: c.id, workspaceId: this.ws, taskId: id, text: c.text, done: c.done, position: c.position })) });
        }
        if (result.addedComments.length) {
          await tx.comment.createMany({
            data: result.addedComments.map((c, i) => ({
              id: c.id,
              workspaceId: this.ws,
              taskId: id,
              body: c.body,
              authorUserId: this.actor.userId,
              clientMutationId: patch.newComments[i]!.clientMutationId,
            })),
          });
        }
        const changed = [...result.changedFields, ...(result.checklistChanged ? ['checklist'] : []), ...(result.addedComments.length ? ['comments'] : [])];
        await this.event(tx, 'task', id, 'update', changed);
        await this.remember(tx, idempotencyKey, requestHash, 'task', id);
        return this.loadTask(tx, id);
      },
      (tx, entityId) => this.loadTask(tx, entityId),
    );
  }

  async moveTask(id: Id, input: unknown): Promise<Task> {
    const data = parseInput(moveTaskSchema, input);
    return this.tx(async (tx) => {
      const before = await this.loadTask(tx, id);
      const next = applyTaskMove(before, data, await this.column(tx, data.status, id), this.ruleContext());
      await this.guardedTaskUpdate(tx, before, { status: next.status, sortKey: next.sortKey, version: next.version, updatedAt: new Date(next.updatedAt) });
      await this.event(tx, 'task', id, 'move', before.status === next.status ? ['position'] : ['status', 'position']);
      return this.loadTask(tx, id);
    });
  }

  async setTaskArchived(id: Id, archived: boolean, input: unknown): Promise<Task> {
    const { expectedVersion } = parseInput(versionOnlySchema, input);
    return this.tx(async (tx) => {
      const before = await this.loadTask(tx, id);
      const next = setArchived(before, archived, expectedVersion, this.ruleContext());
      if (next === before) return before;
      await this.guardedTaskUpdate(tx, before, { archivedAt: next.archivedAt ? new Date(next.archivedAt) : null, version: next.version, updatedAt: new Date(next.updatedAt) });
      await this.event(tx, 'task', id, archived ? 'archive' : 'restore');
      return this.loadTask(tx, id);
    });
  }

  // ---- projects --------------------------------------------------------------

  async listProjects(query: ProjectQuery = {}): Promise<Project[]> {
    return this.read(async () => {
      const rows = await this.db.project.findMany({ where: { workspaceId: this.ws, ...archiveWhere(query) }, orderBy: [{ title: 'asc' }, { id: 'asc' }] });
      return rows.map(toProject).sort((a, b) => a.title.localeCompare(b.title, 'da-DK') || (a.id < b.id ? -1 : 1));
    });
  }

  private async loadProject(tx: Tx | Db, id: Id): Promise<Project> {
    const row = await tx.project.findFirst({ where: { workspaceId: this.ws, id } });
    if (!row) throw notFound();
    return toProject(row);
  }

  async getProject(id: Id): Promise<Project> {
    return this.read(() => this.loadProject(this.db, id));
  }

  async createProject(input: unknown, idempotencyKey?: string): Promise<Project> {
    const data = parseInput(createProjectSchema, input);
    return this.idempotent(
      idempotencyKey,
      'project',
      { op: 'project.create', input },
      async (tx, requestHash) => {
        const ownerUserId = data.ownerUserId === undefined ? this.actor.userId : data.ownerUserId;
        assertReferences(await this.refs(tx, { memberIds: [ownerUserId] }), { assigneeId: ownerUserId });
        const project = buildProject({ ...data, ownerUserId }, this.ruleContext());
        await tx.project.create({ data: this.projectData(project) });
        await this.event(tx, 'project', project.id, 'create');
        await this.remember(tx, idempotencyKey, requestHash, 'project', project.id);
        return this.loadProject(tx, project.id);
      },
      (tx, id) => this.loadProject(tx, id),
    );
  }

  private projectData(project: Project) {
    return {
      id: project.id,
      workspaceId: this.ws,
      title: project.title,
      emoji: project.emoji,
      phase: project.phase,
      lifecycle: project.lifecycle,
      ownerUserId: project.ownerUserId,
      why: project.why,
      goal: project.goal,
      nextStep: project.nextStep,
      learning: project.learning,
      createdAt: new Date(project.createdAt),
      updatedAt: new Date(project.updatedAt),
    };
  }

  private async guardedProjectUpdate(tx: Tx, before: Project, data: Prisma.ProjectUncheckedUpdateManyInput): Promise<void> {
    const { count } = await tx.project.updateMany({ where: { workspaceId: this.ws, id: before.id, version: before.version }, data });
    if (count === 0) {
      const current = await tx.project.findFirst({ where: { workspaceId: this.ws, id: before.id }, select: { version: true } });
      throw current ? conflict(current.version) : notFound();
    }
  }

  async updateProject(id: Id, input: unknown): Promise<Project> {
    const patch = parseInput(projectPatchSchema, input);
    return this.tx(async (tx) => {
      const before = await this.loadProject(tx, id);
      const { project: next, changedFields } = applyProjectPatch(before, patch, this.ruleContext(), await this.refs(tx, { memberIds: [patch.ownerUserId] }));
      if (changedFields.length === 0) return before;
      const { id: _id, workspaceId: _ws, createdAt: _c, ...fields } = this.projectData(next);
      await this.guardedProjectUpdate(tx, before, { ...fields, version: next.version });
      await this.event(tx, 'project', id, 'update', changedFields);
      return this.loadProject(tx, id);
    });
  }

  async setProjectArchived(id: Id, archived: boolean, input: unknown): Promise<Project> {
    const { expectedVersion } = parseInput(versionOnlySchema, input);
    return this.tx(async (tx) => {
      const before = await this.loadProject(tx, id);
      const next = setArchived(before, archived, expectedVersion, this.ruleContext());
      if (next === before) return before;
      // Tasks and notes keep their project link; nothing cascades.
      await this.guardedProjectUpdate(tx, before, { archivedAt: next.archivedAt ? new Date(next.archivedAt) : null, version: next.version, updatedAt: new Date(next.updatedAt) });
      await this.event(tx, 'project', id, archived ? 'archive' : 'restore');
      return this.loadProject(tx, id);
    });
  }

  // ---- thoughts --------------------------------------------------------------

  async listThoughts(query: ThoughtQuery, page?: PageRequest): Promise<ThoughtPage> {
    const where: Prisma.ThoughtWhereInput = { workspaceId: this.ws, ...archiveWhere(query) };
    if (query.type) where.type = query.type;
    const project = association(query.projectId || undefined);
    const area = association(query.areaId || undefined);
    if (project !== undefined) where.projectId = project;
    if (area !== undefined) where.areaId = area;
    const q = query.q?.trim();
    if (q) where.body = { contains: likeEscape(q.normalize('NFC')), mode: 'insensitive' };
    const limit = limitOf(page);
    const cursor = decodeCursor(page?.cursor);
    return this.read(async () => {
      const pageWhere: Prisma.ThoughtWhereInput = cursor
        ? { AND: [where, { OR: [{ createdAt: { lt: new Date(cursor[0]) } }, { createdAt: new Date(cursor[0]), id: { gt: cursor[1] } }] }] }
        : where;
      const [totalMatching, rows] = await Promise.all([
        this.db.thought.count({ where }),
        this.db.thought.findMany({ where: pageWhere, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: limit + 1 }),
      ]);
      const items = rows.slice(0, limit).map(toThought);
      const last = items[items.length - 1];
      return { items, totalMatching, nextCursor: rows.length > limit && last ? `${last.createdAt}~${last.id}` : null };
    });
  }

  private async loadThought(tx: Tx, id: Id): Promise<Thought> {
    const row = await tx.thought.findFirst({ where: { workspaceId: this.ws, id } });
    if (!row) throw notFound();
    return toThought(row);
  }

  private async guardedThoughtUpdate(tx: Tx, before: Thought, data: Prisma.ThoughtUncheckedUpdateManyInput): Promise<void> {
    const { count } = await tx.thought.updateMany({ where: { workspaceId: this.ws, id: before.id, version: before.version }, data });
    if (count === 0) {
      const current = await tx.thought.findFirst({ where: { workspaceId: this.ws, id: before.id }, select: { version: true } });
      throw current ? conflict(current.version) : notFound();
    }
  }

  async createThought(input: unknown, idempotencyKey?: string): Promise<Thought> {
    const data = parseInput(createThoughtSchema, input);
    return this.idempotent(
      idempotencyKey,
      'thought',
      { op: 'thought.create', input },
      async (tx, requestHash) => {
        assertReferences(await this.refs(tx, { projectId: data.projectId, areaId: data.areaId }), data);
        const thought = buildThought(data, this.ruleContext());
        await tx.thought.create({
          data: {
            id: thought.id,
            workspaceId: this.ws,
            body: thought.body,
            type: thought.type,
            projectId: thought.projectId,
            areaId: thought.areaId,
            authorUserId: this.actor.userId,
            createdAt: new Date(thought.createdAt),
            updatedAt: new Date(thought.updatedAt),
          },
        });
        await this.event(tx, 'thought', thought.id, 'create');
        await this.remember(tx, idempotencyKey, requestHash, 'thought', thought.id);
        return this.loadThought(tx, thought.id);
      },
      (tx, id) => this.loadThought(tx, id),
    );
  }

  async updateThought(id: Id, input: unknown): Promise<Thought> {
    const patch = parseInput(thoughtPatchSchema, input);
    return this.tx(async (tx) => {
      const before = await this.loadThought(tx, id);
      const { thought: next, changedFields } = applyThoughtPatch(before, patch, this.ruleContext(), await this.refs(tx, { projectId: patch.projectId, areaId: patch.areaId }));
      if (changedFields.length === 0) return before;
      await this.guardedThoughtUpdate(tx, before, { body: next.body, type: next.type, projectId: next.projectId, areaId: next.areaId, version: next.version, updatedAt: new Date(next.updatedAt) });
      await this.event(tx, 'thought', id, 'update', changedFields);
      return this.loadThought(tx, id);
    });
  }

  async setThoughtArchived(id: Id, archived: boolean, input: unknown): Promise<Thought> {
    const { expectedVersion } = parseInput(versionOnlySchema, input);
    return this.tx(async (tx) => {
      const before = await this.loadThought(tx, id);
      const next = setArchived(before, archived, expectedVersion, this.ruleContext());
      if (next === before) return before;
      await this.guardedThoughtUpdate(tx, before, { archivedAt: next.archivedAt ? new Date(next.archivedAt) : null, version: next.version, updatedAt: new Date(next.updatedAt) });
      await this.event(tx, 'thought', id, archived ? 'archive' : 'restore');
      return this.loadThought(tx, id);
    });
  }

  /** One transaction: create the project, keep the thought and link it. */
  async convertThought(id: Id, input: unknown, idempotencyKey?: string): Promise<{ project: Project; thought: Thought }> {
    const data = parseInput(convertThoughtSchema, input);
    return this.idempotent(
      idempotencyKey,
      'conversion',
      { op: 'thought.convert', id, input },
      async (tx, requestHash) => {
        const before = await this.loadThought(tx, id);
        const result = convertThought(before, data, this.ruleContext());
        await tx.project.create({ data: this.projectData(result.project) });
        await this.guardedThoughtUpdate(tx, before, {
          convertedProjectId: result.thought.convertedProjectId,
          projectId: result.thought.projectId,
          version: result.thought.version,
          updatedAt: new Date(result.thought.updatedAt),
        });
        await this.event(tx, 'project', result.project.id, 'create.fromThought');
        await this.event(tx, 'thought', id, 'convert', ['convertedProjectId', 'projectId']);
        await this.remember(tx, idempotencyKey, requestHash, 'conversion', result.project.id);
        return { project: await this.loadProject(tx, result.project.id), thought: await this.loadThought(tx, id) };
      },
      async (tx, projectId) => ({ project: await this.loadProject(tx, projectId), thought: await this.loadThought(tx, id) }),
    );
  }
}

/** Two requests with the same idempotency key raced; the loser replays the winner. */
class ReceiptRaceError extends Error {
  constructor() {
    super('Idempotency receipt race');
  }
}

/** Maps database errors to domain errors without leaking SQL or internals. */
export function mapDbError(error: unknown): unknown {
  if (error instanceof DomainError) return error;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      const target = JSON.stringify(error.meta ?? {});
      if (target.includes('idempotency_receipt')) return new ReceiptRaceError();
      if (target.includes('client_mutation_id') || target.includes('clientMutationId')) {
        return new DomainError('VERSION_CONFLICT', 'Kommentaren er allerede gemt. Indlæs opgaven igen.');
      }
      return new DomainError('VALIDATION', 'Der findes allerede en post med de samme data.');
    }
    if (error.code === 'P2003') return new DomainError('INVALID_REFERENCE', MESSAGES.invalidReference);
    if (error.code === 'P2025') return notFound();
    if (error.code === 'P2034') return new DomainError('VERSION_CONFLICT', MESSAGES.conflict);
  }
  const message = error instanceof Error ? error.message : '';
  if (/check constraint/i.test(message)) return new DomainError('VALIDATION', 'Ugyldige data.');
  if (/foreign key constraint/i.test(message)) return new DomainError('INVALID_REFERENCE', MESSAGES.invalidReference);
  return error;
}
