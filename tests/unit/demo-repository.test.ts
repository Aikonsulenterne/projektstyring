import { describe, expect, it, vi } from 'vitest';
import { NONE } from '@/domain/entities';
import { LEGACY_KEY, STORAGE_KEY } from '@/demo/format';
import { prepareImport } from '@/demo/migrations';
import { DemoRepository, type StorageLike } from '@/demo/repository';
import { DEMO_IDS } from '@/demo/seed';
import { listAllTasks } from '@/lib/repository';

class MemoryStorage implements StorageLike {
  map = new Map<string, string>();
  failWrites = false;
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new Error('QuotaExceededError');
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}

let n = 0;
const newId = () => `aaaaaaaa-0000-4000-8000-${String(++n).padStart(12, '0')}`;

function repo(storage: StorageLike, user: string = DEMO_IDS.nicholas) {
  const r = new DemoRepository({ storage, newId, currentUserId: () => user });
  return { r, state: r.init() };
}

describe('demo load safety', () => {
  it('seeds only an empty key and marks the data as examples', async () => {
    const storage = new MemoryStorage();
    const { r, state } = repo(storage);
    expect(state).toEqual({ status: 'ok', seeded: true });
    const tasks = await listAllTasks(r, {});
    expect(tasks.items.length).toBeGreaterThan(0);
    expect(tasks.items.every((t) => t.isExample)).toBe(true);
  });

  it.each([
    ['not json', '{oops'],
    ['wrong shape', JSON.stringify({ projects: 'x' })],
    ['dangling reference', 'DANGLING'],
  ])('never overwrites corrupt data (%s)', async (_label, value) => {
    const storage = new MemoryStorage();
    if (value === 'DANGLING') {
      const seeded = repo(new MemoryStorage()).r.exportBackup();
      const env = JSON.parse(seeded);
      env.data.tasks[0].projectId = '99999999-9999-4999-8999-999999999999';
      value = JSON.stringify(env);
    }
    storage.map.set(STORAGE_KEY, value);
    const setItem = vi.spyOn(storage, 'setItem');
    const { r, state } = repo(storage);
    expect(state.status).toBe('corrupt');
    await expect(r.createTask({ title: 'x' })).rejects.toMatchObject({ code: 'STORAGE_CORRUPT' });
    await expect(r.listTasks({})).rejects.toMatchObject({ code: 'STORAGE_CORRUPT' });
    expect(setItem).not.toHaveBeenCalled();
    expect(storage.getItem(STORAGE_KEY)).toBe(value);
    expect(r.exportRaw()).toBe(value);
  });

  it('refuses data written by a newer schema version', () => {
    const storage = new MemoryStorage();
    storage.map.set(STORAGE_KEY, JSON.stringify({ format: 'teamspace-demo', schemaVersion: 99 }));
    const { state } = repo(storage);
    expect(state.status).toBe('unsupported');
  });

  it('does not ingest the legacy key automatically', async () => {
    const storage = new MemoryStorage();
    storage.map.set(LEGACY_KEY, JSON.stringify({ direction: '', projects: [], tasks: [], notes: [] }));
    const { r } = repo(storage);
    expect(r.legacyRaw()).not.toBeNull();
    expect(storage.getItem(LEGACY_KEY)).not.toBeNull();
    const tasks = await listAllTasks(r, {});
    expect(tasks.items.every((t) => t.isExample)).toBe(true);
  });
});

describe('demo mutations', () => {
  it('creates a task with only a title and no project or area', async () => {
    const { r } = repo(new MemoryStorage());
    const created = await r.createTask({ title: 'Kun en titel' });
    expect(created).toMatchObject({ projectId: null, areaId: null, assigneeId: DEMO_IDS.nicholas, status: 'open' });
    const page = await r.listTasks({ projectId: NONE, q: 'kun en' });
    expect(page.items.map((t) => t.id)).toEqual([created.id]);
  });

  it('keeps storage and cache unchanged when a write fails', async () => {
    const storage = new MemoryStorage();
    const { r } = repo(storage);
    const before = storage.getItem(STORAGE_KEY);
    storage.failWrites = true;
    await expect(r.createTask({ title: 'Fejler' })).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' });
    expect(storage.getItem(STORAGE_KEY)).toBe(before);
    expect((await r.listTasks({ q: 'Fejler' })).totalMatching).toBe(0);
    storage.failWrites = false;
    await r.createTask({ title: 'Fejler' }, { idempotencyKey: 'k1' });
    await r.createTask({ title: 'Fejler' }, { idempotencyKey: 'k1' });
    expect((await r.listTasks({ q: 'Fejler' })).totalMatching).toBe(1);
  });

  it('rejects reusing an idempotency key with a different body', async () => {
    const { r } = repo(new MemoryStorage());
    await r.createTask({ title: 'A' }, { idempotencyKey: 'same' });
    await expect(r.createTask({ title: 'B' }, { idempotencyKey: 'same' })).rejects.toMatchObject({ code: 'IDEMPOTENCY_MISMATCH' });
  });

  it('keeps both tabs’ changes to different tasks and conflicts on the same task', async () => {
    const storage = new MemoryStorage();
    const tabA = repo(storage).r;
    const tabB = new DemoRepository({ storage, newId, currentUserId: () => DEMO_IDS.sune });
    tabB.init();
    const [t1, t2] = (await tabA.listTasks({})).items;
    await tabA.updateTask(t1!.id, { expectedVersion: t1!.version, title: 'Fra fane A' });
    await tabB.updateTask(t2!.id, { expectedVersion: t2!.version, title: 'Fra fane B' });
    const after = await tabA.listTasks({});
    expect(after.items.find((t) => t.id === t1!.id)!.title).toBe('Fra fane A');
    expect(after.items.find((t) => t.id === t2!.id)!.title).toBe('Fra fane B');
    await expect(tabB.updateTask(t1!.id, { expectedVersion: t1!.version, title: 'Forældet' })).rejects.toMatchObject({
      code: 'VERSION_CONFLICT',
    });
  });

  it('archives and restores without detaching tasks from a project', async () => {
    const { r } = repo(new MemoryStorage());
    const project = await r.getProject(DEMO_IDS.okai);
    const before = (await r.listTasks({ projectId: DEMO_IDS.okai })).totalMatching;
    const archived = await r.archiveProject(project.id, project.version);
    expect((await r.listProjects()).some((p) => p.id === project.id)).toBe(false);
    expect((await r.listTasks({ projectId: DEMO_IDS.okai })).totalMatching).toBe(before);
    await r.restoreProject(project.id, archived.version);
    expect((await r.listProjects()).some((p) => p.id === project.id)).toBe(true);
  });

  it('converts a thought into a project and keeps the original note', async () => {
    const { r } = repo(new MemoryStorage());
    const thought = await r.createThought({ body: 'Prompt-bibliotek\nMed eksempler' });
    const { project, thought: linked } = await r.convertThought(thought.id, { expectedVersion: 1, title: 'Prompt-bibliotek' }, { idempotencyKey: 'c1' });
    await r.convertThought(thought.id, { expectedVersion: 1, title: 'Prompt-bibliotek' }, { idempotencyKey: 'c1' });
    expect(linked.convertedProjectId).toBe(project.id);
    expect(linked.body).toBe('Prompt-bibliotek\nMed eksempler');
    expect((await r.listProjects()).filter((p) => p.title === 'Prompt-bibliotek')).toHaveLength(1);
  });

  it('moves a task between columns and keeps one canonical record', async () => {
    const { r } = repo(new MemoryStorage());
    const task = (await r.listTasks({ status: ['open'] })).items[0]!;
    const moved = await r.moveTask(task.id, { expectedVersion: task.version, status: 'blocked' });
    expect(moved.status).toBe('blocked');
    const projectView = await listAllTasks(r, { projectId: task.projectId ?? NONE });
    const areaView = await listAllTasks(r, { areaId: task.areaId ?? NONE });
    expect(projectView.items.find((t) => t.id === task.id)).toEqual(areaView.items.find((t) => t.id === task.id));
  });

  it('paginates with an accurate total', async () => {
    const { r } = repo(new MemoryStorage());
    for (let i = 0; i < 7; i++) await r.createTask({ title: `Side ${i}` });
    const first = await r.listTasks({ q: 'side' }, { limit: 3 });
    expect(first.totalMatching).toBe(7);
    expect(first.items).toHaveLength(3);
    const all = await listAllTasks(r, { q: 'side' });
    expect(new Set(all.items.map((t) => t.id)).size).toBe(7);
  });
});

describe('backup and migration', () => {
  it('round-trips an exported backup', () => {
    const { r } = repo(new MemoryStorage());
    const result = prepareImport(r.exportBackup(), new Date().toISOString(), newId);
    expect(result.ok).toBe(true);
  });

  it('migrates canvas v2 data with numeric phases and known aliases', () => {
    const legacy = {
      direction: 'Vores retning',
      projects: [{ id: 'p1', name: 'OKAI', phase: 2, owner: 'Sofie B.' }],
      tasks: [
        { id: 't1', title: 'Med projekt', project: 'p1', area: 'Model', owner: 'Sofie P.', status: 'I gang', due: '2026-11-01' },
        { id: 't2', title: 'Uden projekt', project: '', owner: 'Nicholas', status: 'Åben' },
      ],
      notes: [{ id: 'n1', text: 'En idé', type: 'Idé', author: 'Sune' }],
    };
    const result = prepareImport(JSON.stringify(legacy), '2026-10-23T10:00:00.000Z', newId);
    if (!result.ok) throw new Error(result.errors.join('\n'));
    const { data } = result.preview;
    expect(data.projects[0]).toMatchObject({ title: 'OKAI', phase: 'experiment', ownerUserId: DEMO_IDS.sofieRasmussen });
    expect(data.tasks[0]).toMatchObject({ projectId: data.projects[0]!.id, areaId: DEMO_IDS.areaModel, assigneeId: DEMO_IDS.sofieIhle, status: 'in_progress' });
    // Missing area stays null; it is never inferred from the assignee.
    expect(data.tasks[1]).toMatchObject({ projectId: null, areaId: null, assigneeId: DEMO_IDS.nicholas });
    expect(data.imports[0]!.idMap['task:t1']).toBe(data.tasks[0]!.id);
  });

  it.each([
    ['missing status', { projects: [], tasks: [{ id: 't', title: 'x' }], notes: [] }, 'mangler status'],
    ['dangling project', { projects: [], tasks: [{ id: 't', title: 'x', status: 'Åben', project: 'nope' }], notes: [] }, 'ikke findes'],
    ['duplicate ids', { projects: [], tasks: [{ id: 't', title: 'a', status: 'Åben' }, { id: 't', title: 'b', status: 'Åben' }], notes: [] }, 'Dublet'],
    ['invalid date', { projects: [], tasks: [{ id: 't', title: 'x', status: 'Åben', due: '2026-13-40' }], notes: [] }, 'ugyldig dato'],
    ['unknown person', { projects: [], tasks: [{ id: 't', title: 'x', status: 'Åben', owner: 'Ukendt' }], notes: [] }, 'ukendt person'],
    ['unknown format', { hello: 'world' }, 'Ukendt filformat'],
  ])('rejects %s', (_label, raw, message) => {
    const result = prepareImport(JSON.stringify(raw), '2026-10-23T10:00:00.000Z', newId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toContain(message);
  });

  it('rejects oversized backups before parsing', () => {
    const big = 'x'.repeat(10 * 1024 * 1024 + 1);
    const result = prepareImport(big, '2026-10-23T10:00:00.000Z', newId);
    expect(result).toEqual({ ok: false, errors: ['Filen er større end 10 MB.'] });
  });

  it('rejects backups with dangling references', () => {
    const { r } = repo(new MemoryStorage());
    const env = JSON.parse(r.exportBackup());
    env.data.thoughts[0].authorUserId = '99999999-9999-4999-8999-999999999999';
    const result = prepareImport(JSON.stringify(env), new Date().toISOString(), newId);
    expect(result.ok).toBe(false);
  });
});
