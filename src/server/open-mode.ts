import 'server-only';
import { AREA_CODES } from '@/domain/entities';
import { demoAreas, demoMembers, DEMO_IDS } from '@/demo/seed';
import type { Db } from './db';
import type { ActorResolution } from './session';

/**
 * Open access mode (APP_MODE=open): one shared workspace in the database and no
 * login. The person picker ("Vis som · ikke login") is a convenience label stored
 * in a cookie, not an identity: anyone with the link can act as anyone.
 */
export const OPEN_PERSON_COOKIE = 'teamspace-person';
export const OPEN_WORKSPACE_ID = DEMO_IDS.workspace;
const OPEN_TENANT = 'open-access';
const DEFAULT_PERSON = DEMO_IDS.nicholas;

let ensured: Promise<void> | null = null;

/** Creates the workspace, the four people and the three areas once. Idempotent. */
export function ensureOpenWorkspace(db: Db): Promise<void> {
  ensured ??= (async () => {
    await db.workspace.upsert({ where: { id: OPEN_WORKSPACE_ID }, create: { id: OPEN_WORKSPACE_ID, name: 'AI-teamet' }, update: {} });
    for (const member of demoMembers()) {
      await db.user.upsert({
        where: { tenantId_externalSubject: { tenantId: OPEN_TENANT, externalSubject: member.id } },
        create: { id: member.id, tenantId: OPEN_TENANT, externalSubject: member.id, displayName: member.displayName },
        update: {},
      });
      await db.membership.upsert({
        where: { workspaceId_userId: { workspaceId: OPEN_WORKSPACE_ID, userId: member.id } },
        create: { workspaceId: OPEN_WORKSPACE_ID, userId: member.id, role: member.role },
        update: {},
      });
    }
    for (const area of demoAreas()) {
      if (!AREA_CODES.includes(area.code)) continue;
      // Owner is only set when the area is created; later changes are kept.
      await db.area.upsert({
        where: { workspaceId_code: { workspaceId: OPEN_WORKSPACE_ID, code: area.code } },
        create: { id: area.id, workspaceId: OPEN_WORKSPACE_ID, code: area.code, label: area.label, ownerUserId: area.ownerUserId },
        update: {},
      });
    }
  })().catch((error: unknown) => {
    ensured = null;
    throw error;
  });
  return ensured;
}

/** The person picked in this browser, or the default person. Never "unauthenticated". */
export async function resolveOpenActor(db: Db, personId: string | undefined, workspaceId?: string): Promise<ActorResolution> {
  await ensureOpenWorkspace(db);
  if (workspaceId && workspaceId !== OPEN_WORKSPACE_ID) return { status: 'forbidden' };
  const memberships = await db.membership.findMany({
    where: { workspaceId: OPEN_WORKSPACE_ID, active: true },
    include: { user: true },
  });
  const chosen = memberships.find((m) => m.userId === personId) ?? memberships.find((m) => m.userId === DEFAULT_PERSON) ?? memberships[0];
  if (!chosen) return { status: 'forbidden' };
  return {
    status: 'ok',
    actor: { userId: chosen.userId, workspaceId: OPEN_WORKSPACE_ID, role: chosen.role },
    displayName: chosen.user.displayName,
  };
}
