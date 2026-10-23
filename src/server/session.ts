import 'server-only';
import type { Id } from '@/domain/entities';

export interface Actor {
  userId: Id;
  workspaceId: Id;
  role: 'member' | 'admin';
}

export type ActorResolution =
  | { status: 'ok'; actor: Actor; displayName: string }
  | { status: 'unauthenticated' }
  | { status: 'forbidden' };

/** Placeholder until the server milestone wires Auth.js; fails closed. */
export async function resolveActor(): Promise<ActorResolution> {
  return { status: 'unauthenticated' };
}
