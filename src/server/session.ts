import 'server-only';
import type { Id, MemberRole } from '@/domain/entities';

export interface Actor {
  userId: Id;
  workspaceId: Id;
  role: MemberRole;
}

export type ActorResolution =
  | { status: 'ok'; actor: Actor; displayName: string }
  | { status: 'unauthenticated' }
  | { status: 'forbidden' };

interface VerifiedIdentity {
  tenantId: string;
  subject: string;
}

/** Tenant + object id from the verified Auth.js session. Never from the client. */
async function verifiedIdentity(): Promise<VerifiedIdentity | null> {
  const { auth } = await import('./auth');
  const session = (await auth()) as { tid?: unknown; oid?: unknown } | null;
  if (!session || typeof session.tid !== 'string' || typeof session.oid !== 'string') return null;
  return { tenantId: session.tid, subject: session.oid };
}

/**
 * Resolves the signed-in person to an active membership. With `workspaceId` the
 * membership must be in exactly that workspace (API routes); without it the
 * person's first active membership is used (the app shell).
 */
export async function resolveActor(workspaceId?: Id): Promise<ActorResolution> {
  const { getAppConfig } = await import('./config');
  if (getAppConfig().mode === 'open') {
    const [{ cookies }, { getDb }, open] = await Promise.all([import('next/headers'), import('./db'), import('./open-mode')]);
    const person = (await cookies()).get(open.OPEN_PERSON_COOKIE)?.value;
    return open.resolveOpenActor(getDb(), person, workspaceId);
  }
  const identity = await verifiedIdentity();
  if (!identity) return { status: 'unauthenticated' };
  if (identity.tenantId !== process.env.ALLOWED_TENANT_ID) return { status: 'forbidden' };
  const { getDb } = await import('./db');
  const user = await getDb().user.findUnique({
    where: { tenantId_externalSubject: { tenantId: identity.tenantId, externalSubject: identity.subject } },
    include: { memberships: { where: { active: true, ...(workspaceId ? { workspaceId } : {}) }, orderBy: { createdAt: 'asc' } } },
  });
  const membership = user?.memberships[0];
  if (!user || !membership) return { status: 'forbidden' };
  return {
    status: 'ok',
    actor: { userId: user.id, workspaceId: membership.workspaceId, role: membership.role },
    displayName: user.displayName,
  };
}
