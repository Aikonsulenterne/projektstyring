// Contract test: the browser's HttpRepository against the real route handlers and
// database. Proves URLs, methods, headers and payloads line up end to end.
// (Identity is substituted as in api.test.ts; the browser never sees this shim.)

import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { NONE } from '@/domain/entities';
import { HttpRepository } from '@/lib/api-client';
import { listAllTasks } from '@/lib/repository';
import { makeWorkspace, type WorkspaceFixture } from './fixtures';

const state = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock('@/server/session', () => ({
  resolveActor: async (workspaceId?: string) => {
    if (!state.userId) return { status: 'unauthenticated' };
    const { testDb } = await import('./fixtures');
    const m = await testDb().membership.findFirst({ where: { userId: state.userId, active: true, ...(workspaceId ? { workspaceId } : {}) } });
    return m ? { status: 'ok', actor: { userId: state.userId, workspaceId: m.workspaceId, role: m.role }, displayName: 'Test' } : { status: 'forbidden' };
  },
}));

const BASE = 'http://localhost:3000';
type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
const ROUTES: Array<[RegExp, string, string[]]> = [
  [/^\/api\/v1\/workspaces\/([^/]+)$/, '', ['workspaceId']],
  [/^\/api\/v1\/workspaces\/([^/]+)\/direction$/, '/direction', ['workspaceId']],
  [/^\/api\/v1\/workspaces\/([^/]+)\/tasks$/, '/tasks', ['workspaceId']],
  [/^\/api\/v1\/workspaces\/([^/]+)\/tasks\/([^/]+)$/, '/tasks/[taskId]', ['workspaceId', 'taskId']],
  [/^\/api\/v1\/workspaces\/([^/]+)\/tasks\/([^/]+)\/(move|archive|restore)$/, '/tasks/[taskId]/$3', ['workspaceId', 'taskId']],
  [/^\/api\/v1\/workspaces\/([^/]+)\/projects$/, '/projects', ['workspaceId']],
  [/^\/api\/v1\/workspaces\/([^/]+)\/projects\/([^/]+)$/, '/projects/[projectId]', ['workspaceId', 'projectId']],
  [/^\/api\/v1\/workspaces\/([^/]+)\/projects\/([^/]+)\/(archive|restore)$/, '/projects/[projectId]/$3', ['workspaceId', 'projectId']],
  [/^\/api\/v1\/workspaces\/([^/]+)\/thoughts$/, '/thoughts', ['workspaceId']],
  [/^\/api\/v1\/workspaces\/([^/]+)\/thoughts\/([^/]+)$/, '/thoughts/[thoughtId]', ['workspaceId', 'thoughtId']],
  [/^\/api\/v1\/workspaces\/([^/]+)\/thoughts\/([^/]+)\/(archive|restore|convert)$/, '/thoughts/[thoughtId]/$3', ['workspaceId', 'thoughtId']],
];

/** A same-origin fetch that dispatches to the Next.js route modules. */
const fetchShim: typeof fetch = async (input, init) => {
  const url = new URL(String(input), BASE);
  for (const [pattern, file, names] of ROUTES) {
    const match = url.pathname.match(pattern);
    if (!match) continue;
    const resolved = file.replace('$3', match[3] ?? '');
    const mod = (await import(/* @vite-ignore */ `@/app/api/v1/workspaces/[workspaceId]${resolved}/route`)) as Record<string, Handler>;
    const handler = mod[(init?.method ?? 'GET').toUpperCase()];
    if (!handler) return new Response(null, { status: 405 });
    const params = Object.fromEntries(names.map((n, i) => [n, match[i + 1]!]));
    const headers = new Headers(init?.headers);
    headers.set('Origin', BASE);
    return handler(new Request(url, { ...init, headers }), { params: Promise.resolve(params) });
  }
  return new Response(null, { status: 404 });
};

let ws: WorkspaceFixture;
let repo: HttpRepository;

beforeAll(async () => {
  const { inject } = await import('vitest');
  Object.assign(process.env, {
    DATABASE_URL: inject('databaseUrl'),
    AUTH_SECRET: 'x',
    AUTH_MICROSOFT_ENTRA_ID_ID: 'x',
    AUTH_MICROSOFT_ENTRA_ID_SECRET: 'x',
    AUTH_MICROSOFT_ENTRA_ID_ISSUER: 'https://login.microsoftonline.com/x/v2.0',
    ALLOWED_TENANT_ID: 'test-tenant',
    APP_BASE_URL: BASE,
  });
  delete process.env.APP_MODE;
  ws = await makeWorkspace('Klient');
  state.userId = ws.alice.userId;
  repo = new HttpRepository(ws.workspaceId, fetchShim);
});

describe('HttpRepository ↔ /api/v1', () => {
  it('runs the core journeys through the HTTP contract', async () => {
    const context = await repo.getContext();
    expect(context.currentUserId).toBe(ws.alice.userId);
    expect(context.areas).toHaveLength(3);

    const key = randomUUID();
    const task = await repo.createTask({ title: 'Fra browseren' }, { idempotencyKey: key });
    expect(await repo.createTask({ title: 'Fra browseren' }, { idempotencyKey: key })).toMatchObject({ id: task.id });
    expect(task).toMatchObject({ projectId: null, areaId: null });

    const saved = await repo.updateTask(task.id, {
      expectedVersion: task.version,
      projectId: ws.projectId,
      areaId: ws.areas.model,
      checklist: { add: [{ text: 'Delopgave' }], update: [], remove: [] },
      newComments: [{ clientMutationId: randomUUID(), body: 'Kommentar' }],
    });
    expect(saved).toMatchObject({ version: 2, projectId: ws.projectId, areaId: ws.areas.model });
    expect(saved.checklist).toHaveLength(1);
    expect(saved.comments).toHaveLength(1);

    await expect(repo.updateTask(task.id, { expectedVersion: 1, title: 'Forældet' })).rejects.toMatchObject({
      code: 'VERSION_CONFLICT',
      details: { currentVersion: 2 },
    });

    const moved = await repo.moveTask(task.id, { expectedVersion: saved.version, status: 'blocked' });
    expect((await listAllTasks(repo, { areaId: ws.areas.model, projectId: ws.projectId, q: 'BROWSER' })).items.map((t) => t.status)).toEqual(['blocked']);
    expect((await repo.listTasks({ projectId: NONE })).items.some((t) => t.id === task.id)).toBe(false);

    const archived = await repo.archiveTask(task.id, moved.version);
    expect((await repo.listTasks({ archivedOnly: true })).items.map((t) => t.id)).toContain(task.id);
    await repo.restoreTask(task.id, archived.version);

    const project = await repo.createProject({ title: 'Nyt projekt' });
    const renamed = await repo.updateProject(project.id, { expectedVersion: project.version, nextStep: 'Tal med brugerne' });
    expect(renamed.nextStep).toBe('Tal med brugerne');
    const archivedProject = await repo.archiveProject(project.id, renamed.version);
    expect((await repo.listProjects({ archivedOnly: true })).map((p) => p.id)).toContain(project.id);
    await repo.restoreProject(project.id, archivedProject.version);

    const thought = await repo.createThought({ body: 'En idé' });
    const typed = await repo.updateThought(thought.id, { expectedVersion: 1, type: 'learning' });
    const converted = await repo.convertThought(thought.id, { expectedVersion: typed.version, title: 'Idé-projekt' });
    expect(converted.thought.convertedProjectId).toBe(converted.project.id);
    expect((await repo.listThoughts({ type: 'learning' })).items.map((t) => t.id)).toContain(thought.id);

    const direction = await repo.updateDirection({ expectedVersion: context.workspace.version, direction: 'Fælles retning' });
    expect(direction.direction).toBe('Fælles retning');
  });
});
