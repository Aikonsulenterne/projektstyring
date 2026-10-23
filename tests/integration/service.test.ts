// Integration tests against a real PostgreSQL (docs/handoff/11 "API/database integration").

import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { NONE, type TaskQuery } from '@/domain/entities';
import { selectTasks } from '@/domain/selectors';
import { listAllTasks } from '@/lib/repository';
import { makeWorkspace, service, testDb } from './fixtures';

describe('tasks', () => {
  it('creates a task with only a title and persists null project and area', async () => {
    const ws = await makeWorkspace();
    const created = await service(ws.alice).createTask({ title: '  Kun titel  ' }, randomUUID());
    expect(created).toMatchObject({ title: 'Kun titel', projectId: null, areaId: null, assigneeId: ws.alice.userId, status: 'open', version: 1 });
    const row = await testDb().task.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.projectId).toBeNull();
    expect(row.areaId).toBeNull();
  });

  it('accepts all eight combinations of project, area and assignee', async () => {
    const ws = await makeWorkspace();
    const s = service(ws.alice);
    for (const project of [null, ws.projectId])
      for (const area of [null, ws.areas.model])
        for (const assignee of [null, ws.bob.userId]) {
          const t = await s.createTask({ title: 'Kombination', projectId: project, areaId: area, assigneeId: assignee }, randomUUID());
          expect([t.projectId, t.areaId, t.assigneeId]).toEqual([project, area, assignee]);
        }
  });

  it('rejects associations that belong to another workspace', async () => {
    const mine = await makeWorkspace('A');
    const other = await makeWorkspace('B');
    const s = service(mine.alice);
    await expect(s.createTask({ title: 'x', projectId: other.projectId }, randomUUID())).rejects.toMatchObject({ code: 'INVALID_REFERENCE' });
    await expect(s.createTask({ title: 'x', areaId: other.areas.data }, randomUUID())).rejects.toMatchObject({ code: 'INVALID_REFERENCE' });
    await expect(s.createTask({ title: 'x', assigneeId: other.alice.userId }, randomUUID())).rejects.toMatchObject({ code: 'INVALID_REFERENCE' });
  });

  it('enforces workspace consistency in the database itself', async () => {
    const mine = await makeWorkspace('A');
    const other = await makeWorkspace('B');
    await expect(
      testDb().task.create({ data: { workspaceId: mine.workspaceId, title: 'Direkte', sortKey: 'i', projectId: other.projectId } }),
    ).rejects.toThrow();
  });

  it('cannot read or change a task in another workspace (no IDOR)', async () => {
    const mine = await makeWorkspace('A');
    const other = await makeWorkspace('B');
    const foreign = await service(other.alice).createTask({ title: 'Hemmelig' }, randomUUID());
    const s = service(mine.alice);
    await expect(s.getTask(foreign.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(s.updateTask(foreign.id, { expectedVersion: 1, title: 'Hacket' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(s.setTaskArchived(foreign.id, true, { expectedVersion: 1 })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await s.listTasks({ q: 'Hemmelig' })).totalMatching).toBe(0);
  });

  it('saves fields, checklist and comments atomically; a forced failure leaves no partial write', async () => {
    const ws = await makeWorkspace();
    const s = service(ws.alice);
    const task = await s.createTask({ title: 'Atomar' }, randomUUID());
    const commentId = randomUUID();
    const v2 = await s.updateTask(task.id, { expectedVersion: 1, newComments: [{ clientMutationId: commentId, body: 'Første' }] });
    // Same client mutation id again: the comment insert fails after the title and
    // checklist writes inside the transaction, so everything must roll back.
    await expect(
      s.updateTask(task.id, {
        expectedVersion: v2.version,
        title: 'Må ikke gemmes',
        checklist: { add: [{ text: 'Må ikke gemmes' }] },
        newComments: [{ clientMutationId: commentId, body: 'Dublet' }],
      }),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    const after = await s.getTask(task.id);
    expect(after.title).toBe('Atomar');
    expect(after.checklist).toHaveLength(0);
    expect(after.comments.map((c) => c.body)).toEqual(['Første']);
    expect(after.version).toBe(v2.version);
  });

  it('records the author from the session, never from the client', async () => {
    const ws = await makeWorkspace();
    const task = await service(ws.alice).createTask({ title: 'Forfatter' }, randomUUID());
    const updated = await service(ws.bob).updateTask(task.id, {
      expectedVersion: 1,
      newComments: [{ clientMutationId: randomUUID(), body: 'Fra Bob', authorUserId: ws.alice.userId } as never],
    });
    expect(updated.comments[0]!.authorUserId).toBe(ws.bob.userId);
  });

  it('same idempotency key and body yields one task; a different body is rejected', async () => {
    const ws = await makeWorkspace();
    const s = service(ws.alice);
    const key = randomUUID();
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => s.createTask({ title: 'Én gang' }, key)));
    const ok = results.filter((r) => r.status === 'fulfilled').map((r) => (r as PromiseFulfilledResult<{ id: string }>).value.id);
    expect(new Set(ok).size).toBe(1);
    expect(await testDb().task.count({ where: { workspaceId: ws.workspaceId, title: 'Én gang' } })).toBe(1);
    await expect(s.createTask({ title: 'Noget andet' }, key)).rejects.toMatchObject({ code: 'IDEMPOTENCY_MISMATCH' });
  });

  it('ten concurrent creates with distinct keys create ten tasks without losing any', async () => {
    const ws = await makeWorkspace();
    const s = service(ws.alice);
    await Promise.all(Array.from({ length: 10 }, (_, i) => s.createTask({ title: `Samtidig ${i}` }, randomUUID())));
    const page = await listAllTasks(s, { q: 'Samtidig' });
    expect(page.totalMatching).toBe(10);
    expect(new Set(page.items.map((t) => t.sortKey)).size).toBeGreaterThan(0);
  });

  it('concurrent PATCH with the same expected version: exactly one wins', async () => {
    const ws = await makeWorkspace();
    const task = await service(ws.alice).createTask({ title: 'Kapløb' }, randomUUID());
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) => service(i % 2 ? ws.bob : ws.alice).updateTask(task.id, { expectedVersion: 1, title: `Vinder ${i}` })),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected.every((r) => (r.reason as { code?: string }).code === 'VERSION_CONFLICT')).toBe(true);
    expect((await service(ws.alice).getTask(task.id)).version).toBe(2);
  });

  it('undo cannot erase another person’s later update', async () => {
    const ws = await makeWorkspace();
    const alice = service(ws.alice);
    const task = await alice.createTask({ title: 'Original' }, randomUUID());
    const mine = await alice.updateTask(task.id, { expectedVersion: 1, title: 'Alices ændring' });
    await service(ws.bob).updateTask(task.id, { expectedVersion: mine.version, title: 'Bobs ændring' });
    // Alice's undo is an inverse mutation guarded by the version she saw.
    await expect(alice.updateTask(task.id, { expectedVersion: mine.version, title: 'Original' })).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    expect((await alice.getTask(task.id)).title).toBe('Bobs ændring');
  });

  it('moves between columns and between visible neighbours with hidden tasks in between', async () => {
    const ws = await makeWorkspace();
    const s = service(ws.alice);
    const t1 = await s.createTask({ title: 'A' }, randomUUID());
    const t2 = await s.createTask({ title: 'Skjult', areaId: ws.areas.data }, randomUUID());
    const t3 = await s.createTask({ title: 'B' }, randomUUID());
    const mover = await s.createTask({ title: 'Flyt', status: 'blocked' }, randomUUID());
    const moved = await s.moveTask(mover.id, { expectedVersion: 1, status: 'open', beforeTaskId: t1.id, afterTaskId: t3.id });
    const order = (await listAllTasks(s, { status: ['open'] })).items.map((t) => t.title);
    expect(order.indexOf('Flyt')).toBeGreaterThan(order.indexOf('A'));
    expect(order.indexOf('Flyt')).toBeLessThan(order.indexOf('B'));
    expect(order).toContain(t2.title);
    expect(moved.status).toBe('open');
    await expect(s.moveTask(mover.id, { expectedVersion: 1, status: 'done' })).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
  });

  it('paginates with a stable cursor and an accurate total', async () => {
    const ws = await makeWorkspace();
    const s = service(ws.alice);
    for (let i = 0; i < 120; i++) await s.createTask({ title: `Side ${i}` }, randomUUID());
    const first = await s.listTasks({ q: 'Side' }, { limit: 50 });
    expect(first.totalMatching).toBe(120);
    expect(first.items).toHaveLength(50);
    const all = await listAllTasks(s, { q: 'Side' });
    expect(all.items).toHaveLength(120);
    expect(new Set(all.items.map((t) => t.id)).size).toBe(120);
  });

  it('server filtering matches the shared client selector for every filter combination', async () => {
    const ws = await makeWorkspace();
    const s = service(ws.alice);
    const projects = [null, ws.projectId];
    const areas = [null, ws.areas.data, ws.areas.model];
    const people = [null, ws.alice.userId, ws.bob.userId];
    let i = 0;
    for (const projectId of projects)
      for (const areaId of areas)
        for (const assigneeId of people)
          await s.createTask({ title: `${i++ % 2 ? 'Æble' : 'pære'} ${i}`, projectId, areaId, assigneeId, status: (['open', 'in_progress', 'blocked', 'done'] as const)[i % 4] }, randomUUID());
    const archived = await s.createTask({ title: 'Æble arkiveret' }, randomUUID());
    await s.setTaskArchived(archived.id, true, { expectedVersion: 1 });

    const everything = await listAllTasks(s, { includeArchived: true });
    const queries: TaskQuery[] = [
      {},
      { projectId: NONE },
      { projectId: ws.projectId, areaId: ws.areas.model },
      { areaId: NONE, assigneeId: NONE },
      { assigneeId: ws.bob.userId, q: 'æBLE' },
      { q: 'ÆBLE', status: ['open', 'blocked'] },
      { archivedOnly: true },
      { includeArchived: true, q: 'æble' },
    ];
    for (const query of queries) {
      const server = await listAllTasks(s, query);
      const client = selectTasks(everything.items, query);
      expect(server.items.map((t) => t.id), JSON.stringify(query)).toEqual(client.items.map((t) => t.id));
      expect(server.totalMatching).toBe(client.total);
    }
  });

  it('treats LIKE wildcards in search literally', async () => {
    const ws = await makeWorkspace();
    const s = service(ws.alice);
    await s.createTask({ title: '50% klar' }, randomUUID());
    await s.createTask({ title: '500 klar' }, randomUUID());
    await s.createTask({ title: 'a_b' }, randomUUID());
    await s.createTask({ title: 'axb' }, randomUUID());
    expect((await s.listTasks({ q: '50%' })).items.map((t) => t.title)).toEqual(['50% klar']);
    expect((await s.listTasks({ q: 'a_b' })).items.map((t) => t.title)).toEqual(['a_b']);
  });
});

describe('projects and thoughts', () => {
  it('archiving a project keeps its tasks and links; restore brings it back', async () => {
    const ws = await makeWorkspace();
    const s = service(ws.alice);
    const task = await s.createTask({ title: 'I projektet', projectId: ws.projectId }, randomUUID());
    const project = await s.getProject(ws.projectId);
    const archived = await s.setProjectArchived(project.id, true, { expectedVersion: project.version });
    expect((await s.listProjects()).some((p) => p.id === project.id)).toBe(false);
    expect((await s.getTask(task.id)).projectId).toBe(project.id);
    await expect(s.createTask({ title: 'Nyt i arkiveret', projectId: project.id }, randomUUID())).rejects.toMatchObject({ code: 'INVALID_REFERENCE' });
    await s.setProjectArchived(project.id, false, { expectedVersion: archived.version });
    expect((await s.listProjects()).some((p) => p.id === project.id)).toBe(true);
  });

  it('archiving and restoring a task keeps its associations and state', async () => {
    const ws = await makeWorkspace();
    const s = service(ws.alice);
    const task = await s.createTask({ title: 'Arkiv', projectId: ws.projectId, areaId: ws.areas.data, status: 'blocked' }, randomUUID());
    const archived = await s.setTaskArchived(task.id, true, { expectedVersion: 1 });
    expect((await s.listTasks({ projectId: ws.projectId })).totalMatching).toBe(0);
    const restored = await s.setTaskArchived(task.id, false, { expectedVersion: archived.version });
    expect(restored).toMatchObject({ projectId: ws.projectId, areaId: ws.areas.data, status: 'blocked', archivedAt: null });
  });

  it('converts a thought into exactly one project and keeps the original note', async () => {
    const ws = await makeWorkspace();
    const s = service(ws.alice);
    const thought = await s.createThought({ body: 'Prompt-bibliotek for teamet' }, randomUUID());
    const key = randomUUID();
    const [a, b] = await Promise.all([
      s.convertThought(thought.id, { expectedVersion: 1, title: 'Prompt-bibliotek' }, key),
      s.convertThought(thought.id, { expectedVersion: 1, title: 'Prompt-bibliotek' }, key),
    ]);
    expect(a.project.id).toBe(b.project.id);
    expect(await testDb().project.count({ where: { workspaceId: ws.workspaceId, title: 'Prompt-bibliotek' } })).toBe(1);
    const linked = (await s.listThoughts({})).items.find((t) => t.id === thought.id)!;
    expect(linked).toMatchObject({ body: 'Prompt-bibliotek for teamet', convertedProjectId: a.project.id, projectId: a.project.id });
  });

  it('thoughts may have neither project nor area', async () => {
    const ws = await makeWorkspace();
    const thought = await service(ws.bob).createThought({ body: 'Løs tanke' }, randomUUID());
    expect(thought).toMatchObject({ projectId: null, areaId: null, type: 'idea', authorUserId: ws.bob.userId });
  });

  it('records minimal activity without content', async () => {
    const ws = await makeWorkspace();
    const s = service(ws.alice);
    const task = await s.createTask({ title: 'Fortroligt indhold' }, randomUUID());
    await s.updateTask(task.id, { expectedVersion: 1, newComments: [{ clientMutationId: randomUUID(), body: 'Hemmelig kommentar' }] });
    const events = await s.listActivity();
    expect(events.map((e) => e.action)).toEqual(['update', 'create']);
    expect(JSON.stringify(events)).not.toContain('Hemmelig');
    expect(JSON.stringify(events)).not.toContain('Fortroligt');
  });

  it('direction updates are versioned', async () => {
    const ws = await makeWorkspace();
    const s = service(ws.alice);
    const updated = await s.updateDirection({ expectedVersion: 1, direction: 'Ny retning' });
    expect(updated.version).toBe(2);
    await expect(service(ws.bob).updateDirection({ expectedVersion: 1, direction: 'Forældet' })).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
  });
});
