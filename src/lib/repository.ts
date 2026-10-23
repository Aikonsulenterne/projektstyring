// The boundary between the UI and persistence. The demo repository (browser storage)
// and the HTTP repository (server API) both implement it; the UI never knows which.

import type {
  Id,
  Project,
  ProjectQuery,
  Task,
  TaskPage,
  TaskQuery,
  Thought,
  ThoughtQuery,
  Workspace,
  WorkspaceContext,
} from '@/domain/entities';
import type {
  ConvertThoughtInput,
  CreateProjectInput,
  CreateTaskInput,
  CreateThoughtInput,
  DirectionInput,
  MoveTaskInput,
  ProjectPatchInput,
  TaskPatchInput,
  ThoughtPatchInput,
} from '@/domain/schemas';

export type AppMode = 'demo' | 'server';

export interface MutationOptions {
  /** Same key + same request = same result; prevents duplicates on retry. */
  idempotencyKey?: string;
}

export interface PageRequest {
  cursor?: string | null;
  limit?: number;
}

export interface ThoughtPage {
  items: Thought[];
  totalMatching: number;
  nextCursor: string | null;
}

export interface WorkspaceRepository {
  readonly mode: AppMode;
  getContext(): Promise<WorkspaceContext>;
  updateDirection(input: DirectionInput): Promise<Workspace>;

  listTasks(query: TaskQuery, page?: PageRequest): Promise<TaskPage>;
  getTask(id: Id): Promise<Task>;
  createTask(input: CreateTaskInput, options?: MutationOptions): Promise<Task>;
  updateTask(id: Id, patch: TaskPatchInput, options?: MutationOptions): Promise<Task>;
  moveTask(id: Id, input: MoveTaskInput): Promise<Task>;
  archiveTask(id: Id, expectedVersion: number): Promise<Task>;
  restoreTask(id: Id, expectedVersion: number): Promise<Task>;

  listProjects(query?: ProjectQuery): Promise<Project[]>;
  getProject(id: Id): Promise<Project>;
  createProject(input: CreateProjectInput, options?: MutationOptions): Promise<Project>;
  updateProject(id: Id, patch: ProjectPatchInput): Promise<Project>;
  archiveProject(id: Id, expectedVersion: number): Promise<Project>;
  restoreProject(id: Id, expectedVersion: number): Promise<Project>;

  listThoughts(query: ThoughtQuery, page?: PageRequest): Promise<ThoughtPage>;
  createThought(input: CreateThoughtInput, options?: MutationOptions): Promise<Thought>;
  updateThought(id: Id, patch: ThoughtPatchInput): Promise<Thought>;
  archiveThought(id: Id, expectedVersion: number): Promise<Thought>;
  restoreThought(id: Id, expectedVersion: number): Promise<Thought>;
  convertThought(
    id: Id,
    input: ConvertThoughtInput,
    options?: MutationOptions,
  ): Promise<{ project: Project; thought: Thought }>;
}

/** Follows cursors until the complete matching set is loaded. */
export async function listAllTasks(repo: WorkspaceRepository, query: TaskQuery): Promise<TaskPage> {
  const first = await repo.listTasks(query, { limit: 200 });
  const items = [...first.items];
  let cursor = first.nextCursor;
  let last = first;
  while (cursor) {
    last = await repo.listTasks(query, { cursor, limit: 200 });
    items.push(...last.items);
    cursor = last.nextCursor;
  }
  return { items, totalMatching: first.totalMatching, nextCursor: null, serverTime: last.serverTime };
}

export async function listAllThoughts(repo: WorkspaceRepository, query: ThoughtQuery): Promise<ThoughtPage> {
  const first = await repo.listThoughts(query, { limit: 200 });
  const items = [...first.items];
  let cursor = first.nextCursor;
  while (cursor) {
    const next = await repo.listThoughts(query, { cursor, limit: 200 });
    items.push(...next.items);
    cursor = next.nextCursor;
  }
  return { items, totalMatching: first.totalMatching, nextCursor: null };
}
