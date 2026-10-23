import { randomUUID } from 'node:crypto';
import { inject } from 'vitest';
import { createDb, type Db } from '@/server/db';
import { WorkspaceService } from '@/server/services/workspace-service';
import type { Actor } from '@/server/session';

let shared: Db | null = null;

export function testDb(): Db {
  shared ??= createDb(inject('databaseUrl'));
  return shared;
}

export interface WorkspaceFixture {
  workspaceId: string;
  alice: Actor;
  bob: Actor;
  areas: { data: string; model: string; adoption: string };
  projectId: string;
}

/** A fresh, isolated workspace with two members, three areas and one project. */
export async function makeWorkspace(name = 'Test'): Promise<WorkspaceFixture> {
  const db = testDb();
  const workspace = await db.workspace.create({ data: { name } });
  const users = await Promise.all(
    ['Alice', 'Bob'].map((displayName) =>
      db.user.create({ data: { tenantId: 'test-tenant', externalSubject: randomUUID(), displayName } }),
    ),
  );
  for (const user of users) await db.membership.create({ data: { workspaceId: workspace.id, userId: user.id } });
  const areas = await Promise.all(
    (['data', 'model', 'adoption'] as const).map((code) =>
      db.area.create({ data: { workspaceId: workspace.id, code, label: code, ownerUserId: users[0]!.id } }),
    ),
  );
  const project = await db.project.create({ data: { workspaceId: workspace.id, title: `${name} projekt` } });
  const actor = (userId: string): Actor => ({ userId, workspaceId: workspace.id, role: 'member' });
  return {
    workspaceId: workspace.id,
    alice: actor(users[0]!.id),
    bob: actor(users[1]!.id),
    areas: { data: areas[0]!.id, model: areas[1]!.id, adoption: areas[2]!.id },
    projectId: project.id,
  };
}

export function service(actor: Actor): WorkspaceService {
  return new WorkspaceService(testDb(), actor);
}
