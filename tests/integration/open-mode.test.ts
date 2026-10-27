import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DEMO_IDS } from '@/demo/seed';
import { ensureOpenWorkspace, OPEN_WORKSPACE_ID, resolveOpenActor } from '@/server/open-mode';
import { WorkspaceService } from '@/server/services/workspace-service';
import { testDb } from './fixtures';

describe('open access mode (no login)', () => {
  it('creates the shared workspace, four people and three owned areas once', async () => {
    const db = testDb();
    await ensureOpenWorkspace(db);
    await ensureOpenWorkspace(db);
    const members = await db.membership.findMany({ where: { workspaceId: OPEN_WORKSPACE_ID }, include: { user: true } });
    expect(members.map((m) => m.user.displayName).sort()).toEqual(['Nicholas', 'Sofie Ihle', 'Sofie Rasmussen', 'Sune']);
    const areas = await db.area.findMany({ where: { workspaceId: OPEN_WORKSPACE_ID } });
    expect(areas.map((a) => [a.code, a.ownerUserId]).sort()).toEqual([
      ['adoption', DEMO_IDS.sofieRasmussen],
      ['data', DEMO_IDS.sofieIhle],
      ['model', DEMO_IDS.nicholas],
    ]);
  });

  it('acts as the picked person, falls back to Nicholas, and refuses other workspaces', async () => {
    const db = testDb();
    expect(await resolveOpenActor(db, DEMO_IDS.sofieIhle)).toMatchObject({ status: 'ok', displayName: 'Sofie Ihle' });
    expect(await resolveOpenActor(db, undefined)).toMatchObject({ status: 'ok', displayName: 'Nicholas' });
    expect(await resolveOpenActor(db, 'not-a-member')).toMatchObject({ status: 'ok', displayName: 'Nicholas' });
    expect(await resolveOpenActor(db, DEMO_IDS.sune, randomUUID())).toEqual({ status: 'forbidden' });
  });

  it('shares one task list between people', async () => {
    const db = testDb();
    const sofie = await resolveOpenActor(db, DEMO_IDS.sofieIhle);
    const sune = await resolveOpenActor(db, DEMO_IDS.sune);
    if (sofie.status !== 'ok' || sune.status !== 'ok') throw new Error('expected actors');
    const created = await new WorkspaceService(db, sofie.actor).createTask({ title: 'Fælles opgave' }, randomUUID());
    const seen = await new WorkspaceService(db, sune.actor).getTask(created.id);
    expect(seen).toMatchObject({ title: 'Fælles opgave', assigneeId: DEMO_IDS.sofieIhle, projectId: null });
  });
});
