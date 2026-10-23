// Route-handler tests: authorization on every endpoint, error contract, CSRF and
// mode gates. Only identity resolution is replaced (no Entra tenant in tests); the
// membership lookup still runs against the real database.

import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { makeWorkspace, service, testDb, type WorkspaceFixture } from './fixtures';

const state = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock('@/server/session', () => ({
  resolveActor: async (workspaceId?: string) => {
    if (!state.userId) return { status: 'unauthenticated' };
    const { testDb: db } = await import('./fixtures');
    const membership = await db().membership.findFirst({
      where: { userId: state.userId, active: true, ...(workspaceId ? { workspaceId } : {}) },
    });
    return membership
      ? { status: 'ok', actor: { userId: state.userId, workspaceId: membership.workspaceId, role: membership.role }, displayName: 'Test' }
      : { status: 'forbidden' };
  },
}));

const BASE = 'http://localhost:3000';
const ENV = {
  DATABASE_URL: '',
  AUTH_SECRET: 'test-secret',
  AUTH_MICROSOFT_ENTRA_ID_ID: 'test',
  AUTH_MICROSOFT_ENTRA_ID_SECRET: 'test',
  AUTH_MICROSOFT_ENTRA_ID_ISSUER: 'https://login.microsoftonline.com/test/v2.0',
  ALLOWED_TENANT_ID: 'test-tenant',
  APP_BASE_URL: BASE,
};

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

async function routes() {
  const R = '@/app/api/v1/workspaces/[workspaceId]';
  return {
    context: await import(`${R}/route`),
    direction: await import(`${R}/direction/route`),
    activity: await import(`${R}/activity/route`),
    tasks: await import(`${R}/tasks/route`),
    task: await import(`${R}/tasks/[taskId]/route`),
    move: await import(`${R}/tasks/[taskId]/move/route`),
    taskArchive: await import(`${R}/tasks/[taskId]/archive/route`),
    taskRestore: await import(`${R}/tasks/[taskId]/restore/route`),
    projects: await import(`${R}/projects/route`),
    project: await import(`${R}/projects/[projectId]/route`),
    projectArchive: await import(`${R}/projects/[projectId]/archive/route`),
    projectRestore: await import(`${R}/projects/[projectId]/restore/route`),
    thoughts: await import(`${R}/thoughts/route`),
    thought: await import(`${R}/thoughts/[thoughtId]/route`),
    thoughtArchive: await import(`${R}/thoughts/[thoughtId]/archive/route`),
    thoughtRestore: await import(`${R}/thoughts/[thoughtId]/restore/route`),
    convert: await import(`${R}/thoughts/[thoughtId]/convert/route`),
  } as Record<string, Record<string, Handler>>;
}

function call(handler: Handler, method: string, path: string, params: Record<string, string>, body?: unknown, headers: Record<string, string> = {}) {
  return handler(
    new Request(`${BASE}${path}`, {
      method,
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), Origin: BASE, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    { params: Promise.resolve(params) },
  );
}

let R: Awaited<ReturnType<typeof routes>>;
let mine: WorkspaceFixture;
let other: WorkspaceFixture;
let ids: { task: string; thought: string };

beforeAll(async () => {
  const { inject } = await import('vitest');
  Object.assign(process.env, ENV, { DATABASE_URL: inject('databaseUrl') });
  delete process.env.APP_MODE;
  R = await routes();
  mine = await makeWorkspace('Mit');
  other = await makeWorkspace('Andet');
  const t = await service(other.alice).createTask({ title: 'Andet arbejdsrum' }, randomUUID());
  const n = await service(other.alice).createThought({ body: 'Andet arbejdsrum' }, randomUUID());
  ids = { task: t.id, thought: n.id };
});

afterEach(() => {
  state.userId = null;
  delete process.env.APP_MODE;
});

/** Every endpoint, aimed at `ws`. */
function endpoints(ws: WorkspaceFixture) {
  const w = { workspaceId: ws.workspaceId };
  const base = `/api/v1/workspaces/${ws.workspaceId}`;
  const v = { expectedVersion: 1 };
  return [
    ['GET context', () => call(R.context!.GET!, 'GET', base, w)],
    ['PATCH direction', () => call(R.direction!.PATCH!, 'PATCH', `${base}/direction`, w, { expectedVersion: 1, direction: 'x' })],
    ['GET activity', () => call(R.activity!.GET!, 'GET', `${base}/activity`, w)],
    ['GET tasks', () => call(R.tasks!.GET!, 'GET', `${base}/tasks`, w)],
    ['POST tasks', () => call(R.tasks!.POST!, 'POST', `${base}/tasks`, w, { title: 'x' }, { 'Idempotency-Key': randomUUID() })],
    ['GET task', () => call(R.task!.GET!, 'GET', `${base}/tasks/${ids.task}`, { ...w, taskId: ids.task })],
    ['PATCH task', () => call(R.task!.PATCH!, 'PATCH', `${base}/tasks/${ids.task}`, { ...w, taskId: ids.task }, { ...v, title: 'x' })],
    ['PATCH move', () => call(R.move!.PATCH!, 'PATCH', `${base}/tasks/${ids.task}/move`, { ...w, taskId: ids.task }, { ...v, status: 'done' })],
    ['POST task archive', () => call(R.taskArchive!.POST!, 'POST', `${base}/tasks/${ids.task}/archive`, { ...w, taskId: ids.task }, v)],
    ['POST task restore', () => call(R.taskRestore!.POST!, 'POST', `${base}/tasks/${ids.task}/restore`, { ...w, taskId: ids.task }, v)],
    ['GET projects', () => call(R.projects!.GET!, 'GET', `${base}/projects`, w)],
    ['POST projects', () => call(R.projects!.POST!, 'POST', `${base}/projects`, w, { title: 'x' }, { 'Idempotency-Key': randomUUID() })],
    ['GET project', () => call(R.project!.GET!, 'GET', `${base}/projects/${other.projectId}`, { ...w, projectId: other.projectId })],
    ['PATCH project', () => call(R.project!.PATCH!, 'PATCH', `${base}/projects/${other.projectId}`, { ...w, projectId: other.projectId }, { ...v, title: 'x' })],
    ['POST project archive', () => call(R.projectArchive!.POST!, 'POST', `${base}/projects/${other.projectId}/archive`, { ...w, projectId: other.projectId }, v)],
    ['POST project restore', () => call(R.projectRestore!.POST!, 'POST', `${base}/projects/${other.projectId}/restore`, { ...w, projectId: other.projectId }, v)],
    ['GET thoughts', () => call(R.thoughts!.GET!, 'GET', `${base}/thoughts`, w)],
    ['POST thoughts', () => call(R.thoughts!.POST!, 'POST', `${base}/thoughts`, w, { body: 'x' }, { 'Idempotency-Key': randomUUID() })],
    ['PATCH thought', () => call(R.thought!.PATCH!, 'PATCH', `${base}/thoughts/${ids.thought}`, { ...w, thoughtId: ids.thought }, { ...v, body: 'x' })],
    ['POST thought archive', () => call(R.thoughtArchive!.POST!, 'POST', `${base}/thoughts/${ids.thought}/archive`, { ...w, thoughtId: ids.thought }, v)],
    ['POST thought restore', () => call(R.thoughtRestore!.POST!, 'POST', `${base}/thoughts/${ids.thought}/restore`, { ...w, thoughtId: ids.thought }, v)],
    ['POST convert', () => call(R.convert!.POST!, 'POST', `${base}/thoughts/${ids.thought}/convert`, { ...w, thoughtId: ids.thought }, { ...v, title: 'x' }, { 'Idempotency-Key': randomUUID() })],
  ] as const;
}

describe('authorization', () => {
  it('denies every endpoint of another workspace (403) and changes nothing', async () => {
    state.userId = mine.alice.userId;
    const before = await testDb().task.findUniqueOrThrow({ where: { id: ids.task } });
    for (const [name, run] of endpoints(other)) {
      const res = await run();
      expect(res.status, name).toBe(403);
      expect((await res.json()).error.code, name).toBe('FORBIDDEN');
    }
    const after = await testDb().task.findUniqueOrThrow({ where: { id: ids.task } });
    expect(after.version).toBe(before.version);
  });

  it('requires a session on every endpoint (401)', async () => {
    for (const [name, run] of endpoints(mine)) {
      expect((await run()).status, name).toBe(401);
    }
  });

  it('returns 404 for another workspace’s record addressed through my workspace', async () => {
    state.userId = mine.alice.userId;
    const res = await call(R.task!.GET!, 'GET', `/api/v1/workspaces/${mine.workspaceId}/tasks/${ids.task}`, { workspaceId: mine.workspaceId, taskId: ids.task });
    expect(res.status).toBe(404);
  });

  it('rejects cross-site mutations', async () => {
    state.userId = mine.alice.userId;
    const res = await call(R.tasks!.POST!, 'POST', `/api/v1/workspaces/${mine.workspaceId}/tasks`, { workspaceId: mine.workspaceId }, { title: 'CSRF' }, {
      Origin: 'https://evil.example',
      'Idempotency-Key': randomUUID(),
    });
    expect(res.status).toBe(403);
    expect(await testDb().task.count({ where: { title: 'CSRF' } })).toBe(0);
  });
});

describe('contract', () => {
  const tasksPath = () => `/api/v1/workspaces/${mine.workspaceId}/tasks`;

  it('creates with only a title (201) and requires an Idempotency-Key', async () => {
    state.userId = mine.alice.userId;
    const created = await call(R.tasks!.POST!, 'POST', tasksPath(), { workspaceId: mine.workspaceId }, { title: 'Via API' }, { 'Idempotency-Key': randomUUID() });
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ title: 'Via API', projectId: null, areaId: null, version: 1 });
    const missing = await call(R.tasks!.POST!, 'POST', tasksPath(), { workspaceId: mine.workspaceId }, { title: 'Uden nøgle' });
    expect(missing.status).toBe(400);
  });

  it('returns validation errors as 422 with Danish field errors', async () => {
    state.userId = mine.alice.userId;
    const res = await call(R.tasks!.POST!, 'POST', tasksPath(), { workspaceId: mine.workspaceId }, { title: '   ' }, { 'Idempotency-Key': randomUUID() });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatchObject({ code: 'VALIDATION', fieldErrors: { title: 'Skriv et navn.' } });
    expect(body.error.requestId).toBe(res.headers.get('x-request-id'));
  });

  it('returns 409 with the current version on a stale write', async () => {
    state.userId = mine.alice.userId;
    const task = await service(mine.alice).createTask({ title: 'Versioneret' }, randomUUID());
    await service(mine.bob).updateTask(task.id, { expectedVersion: 1, title: 'Bob var her' });
    const res = await call(R.task!.PATCH!, 'PATCH', `${tasksPath()}/${task.id}`, { workspaceId: mine.workspaceId, taskId: task.id }, { expectedVersion: 1, title: 'Forældet' });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: 'VERSION_CONFLICT', message: 'Opgaven er blevet opdateret af en anden. Din kladde er bevaret.' }, currentVersion: 2 });
  });

  it('rejects malformed JSON (400) and invalid filters (400) without leaking internals', async () => {
    state.userId = mine.alice.userId;
    const malformed = await R.tasks!.POST!(
      new Request(`${BASE}${tasksPath()}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE, 'Idempotency-Key': randomUUID() }, body: '{"title":' }),
      { params: Promise.resolve({ workspaceId: mine.workspaceId }) },
    );
    expect(malformed.status).toBe(400);
    const badFilter = await call(R.tasks!.GET!, 'GET', `${tasksPath()}?status=sideways`, { workspaceId: mine.workspaceId });
    expect(badFilter.status).toBe(400);
    expect(JSON.stringify(await badFilter.json())).not.toMatch(/prisma|SELECT|stack/i);
  });

  it('filters with the none sentinel and reports totalMatching before pagination', async () => {
    state.userId = mine.alice.userId;
    const res = await call(R.tasks!.GET!, 'GET', `${tasksPath()}?projectId=none&limit=1`, { workspaceId: mine.workspaceId });
    const page = await res.json();
    expect(page.items).toHaveLength(1);
    expect(page.totalMatching).toBeGreaterThan(1);
    expect(page.nextCursor).toEqual(expect.any(String));
  });

  it('is closed in demo mode and fails closed without configuration', async () => {
    state.userId = mine.alice.userId;
    process.env.APP_MODE = 'demo';
    expect((await call(R.tasks!.GET!, 'GET', tasksPath(), { workspaceId: mine.workspaceId })).status).toBe(404);
    delete process.env.APP_MODE;
    const saved = process.env.AUTH_SECRET;
    delete process.env.AUTH_SECRET;
    expect((await call(R.tasks!.GET!, 'GET', tasksPath(), { workspaceId: mine.workspaceId })).status).toBe(503);
    process.env.AUTH_SECRET = saved;
  });
});
