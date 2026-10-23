// Typed client for the /api/v1 contract (docs/handoff/08_API_CONTRACTS.md).

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
import { DomainError, MESSAGES, type DomainErrorCode } from '@/domain/errors';
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
import type { MutationOptions, PageRequest, ThoughtPage, WorkspaceRepository } from './repository';

interface ErrorBody {
  error?: { code?: string; message?: string; fieldErrors?: Record<string, string>; requestId?: string };
  currentVersion?: number;
}

function newKey(): string {
  return crypto.randomUUID();
}

export class HttpRepository implements WorkspaceRepository {
  readonly mode = 'server' as const;

  constructor(
    private readonly workspaceId: Id,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {}

  private url(path: string, params?: Record<string, string | undefined>): string {
    const base = `/api/v1/workspaces/${encodeURIComponent(this.workspaceId)}${path}`;
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params ?? {})) if (value) search.set(key, value);
    const qs = search.toString();
    return qs ? `${base}?${qs}` : base;
  }

  private async request<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}, params?: Record<string, string | undefined>): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(this.url(path, params), {
        method,
        credentials: 'same-origin',
        headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new DomainError('NETWORK', method === 'GET' ? 'Ingen forbindelse. Prøv igen.' : MESSAGES.saveFailed);
    }
    if (response.ok) return (await response.json()) as T;
    let payload: ErrorBody = {};
    try {
      payload = (await response.json()) as ErrorBody;
    } catch {
      // Non-JSON error (proxy, crash). Fall through to a generic message.
    }
    const code = (payload.error?.code as DomainErrorCode | undefined) ?? (response.status >= 500 ? 'UNEXPECTED' : 'VALIDATION');
    throw new DomainError(code, payload.error?.message ?? MESSAGES.unexpected, {
      fieldErrors: payload.error?.fieldErrors,
      currentVersion: payload.currentVersion,
      requestId: payload.error?.requestId,
    });
  }

  getContext() {
    return this.request<WorkspaceContext>('GET', '');
  }
  updateDirection(input: DirectionInput) {
    return this.request<Workspace>('PATCH', '/direction', input);
  }

  listTasks(query: TaskQuery, page?: PageRequest) {
    return this.request<TaskPage>('GET', '/tasks', undefined, {}, {
      areaId: query.areaId,
      assigneeId: query.assigneeId,
      projectId: query.projectId,
      q: query.q,
      status: query.status?.join(','),
      includeArchived: query.includeArchived ? 'true' : undefined,
      archivedOnly: query.archivedOnly ? 'true' : undefined,
      cursor: page?.cursor ?? undefined,
      limit: page?.limit ? String(page.limit) : undefined,
    });
  }
  getTask(id: Id) {
    return this.request<Task>('GET', `/tasks/${id}`);
  }
  createTask(input: CreateTaskInput, options?: MutationOptions) {
    return this.request<Task>('POST', '/tasks', input, { 'Idempotency-Key': options?.idempotencyKey ?? newKey() });
  }
  updateTask(id: Id, patch: TaskPatchInput, options?: MutationOptions) {
    return this.request<Task>('PATCH', `/tasks/${id}`, patch, options?.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {});
  }
  moveTask(id: Id, input: MoveTaskInput) {
    return this.request<Task>('PATCH', `/tasks/${id}/move`, input);
  }
  archiveTask(id: Id, expectedVersion: number) {
    return this.request<Task>('POST', `/tasks/${id}/archive`, { expectedVersion });
  }
  restoreTask(id: Id, expectedVersion: number) {
    return this.request<Task>('POST', `/tasks/${id}/restore`, { expectedVersion });
  }

  listProjects(query: ProjectQuery = {}) {
    return this.request<Project[]>('GET', '/projects', undefined, {}, {
      includeArchived: query.includeArchived ? 'true' : undefined,
      archivedOnly: query.archivedOnly ? 'true' : undefined,
    });
  }
  getProject(id: Id) {
    return this.request<Project>('GET', `/projects/${id}`);
  }
  createProject(input: CreateProjectInput, options?: MutationOptions) {
    return this.request<Project>('POST', '/projects', input, { 'Idempotency-Key': options?.idempotencyKey ?? newKey() });
  }
  updateProject(id: Id, patch: ProjectPatchInput) {
    return this.request<Project>('PATCH', `/projects/${id}`, patch);
  }
  archiveProject(id: Id, expectedVersion: number) {
    return this.request<Project>('POST', `/projects/${id}/archive`, { expectedVersion });
  }
  restoreProject(id: Id, expectedVersion: number) {
    return this.request<Project>('POST', `/projects/${id}/restore`, { expectedVersion });
  }

  listThoughts(query: ThoughtQuery, page?: PageRequest) {
    return this.request<ThoughtPage>('GET', '/thoughts', undefined, {}, {
      type: query.type,
      projectId: query.projectId,
      areaId: query.areaId,
      q: query.q,
      includeArchived: query.includeArchived ? 'true' : undefined,
      archivedOnly: query.archivedOnly ? 'true' : undefined,
      cursor: page?.cursor ?? undefined,
      limit: page?.limit ? String(page.limit) : undefined,
    });
  }
  createThought(input: CreateThoughtInput, options?: MutationOptions) {
    return this.request<Thought>('POST', '/thoughts', input, { 'Idempotency-Key': options?.idempotencyKey ?? newKey() });
  }
  updateThought(id: Id, patch: ThoughtPatchInput) {
    return this.request<Thought>('PATCH', `/thoughts/${id}`, patch);
  }
  archiveThought(id: Id, expectedVersion: number) {
    return this.request<Thought>('POST', `/thoughts/${id}/archive`, { expectedVersion });
  }
  restoreThought(id: Id, expectedVersion: number) {
    return this.request<Thought>('POST', `/thoughts/${id}/restore`, { expectedVersion });
  }
  convertThought(id: Id, input: ConvertThoughtInput, options?: MutationOptions) {
    return this.request<{ project: Project; thought: Thought }>('POST', `/thoughts/${id}/convert`, input, {
      'Idempotency-Key': options?.idempotencyKey ?? newKey(),
    });
  }
}
