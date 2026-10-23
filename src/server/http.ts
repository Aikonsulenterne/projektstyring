import 'server-only';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { NONE, TASK_STATUSES, THOUGHT_TYPES, type TaskQuery, type ThoughtQuery } from '@/domain/entities';
import { DomainError, isDomainError, MESSAGES, type DomainErrorCode } from '@/domain/errors';
import { getAppConfig } from './config';
import { getDb } from './db';
import { WorkspaceService } from './services/workspace-service';
import { resolveActor, type Actor } from './session';

const STATUS: Record<DomainErrorCode, number> = {
  VALIDATION: 422,
  INVALID_REFERENCE: 422,
  NOT_FOUND: 404,
  VERSION_CONFLICT: 409,
  IDEMPOTENCY_MISMATCH: 409,
  ARCHIVED: 409,
  STORAGE_CORRUPT: 500,
  STORAGE_UNAVAILABLE: 500,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_CONFIGURED: 503,
  NETWORK: 502,
  UNEXPECTED: 500,
};

const MAX_BODY_BYTES = 1024 * 1024;

export interface RouteContext {
  req: Request;
  service: WorkspaceService;
  actor: Actor;
  requestId: string;
  body: () => Promise<unknown>;
  idempotencyKey: (required: boolean) => string | undefined;
}

function json(status: number, payload: unknown, requestId: string): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Request-Id': requestId },
  });
}

export function errorResponse(error: unknown, requestId: string): Response {
  if (isDomainError(error)) {
    return json(
      STATUS[error.code],
      {
        error: { code: error.code, message: error.message, fieldErrors: error.details.fieldErrors ?? {}, requestId },
        ...(error.details.currentVersion !== undefined ? { currentVersion: error.details.currentVersion } : {}),
      },
      requestId,
    );
  }
  // Structured log without request bodies or stack details in the response.
  console.error(JSON.stringify({ level: 'error', requestId, message: error instanceof Error ? error.message : 'unknown error' }));
  return json(500, { error: { code: 'UNEXPECTED', message: MESSAGES.unexpected, fieldErrors: {}, requestId } }, requestId);
}

/** Rejects cross-site mutations (CSRF) in addition to SameSite session cookies. */
function assertSameOrigin(req: Request): void {
  if (req.method === 'GET' || req.method === 'HEAD') return;
  const expected = process.env.APP_BASE_URL ? new URL(process.env.APP_BASE_URL).origin : new URL(req.url).origin;
  const origin = req.headers.get('origin');
  if (origin && origin !== expected) throw new DomainError('FORBIDDEN', 'Anmodningen kom fra et andet website.');
  if (!origin && req.headers.get('sec-fetch-site') === 'cross-site') throw new DomainError('FORBIDDEN', 'Anmodningen kom fra et andet website.');
}

/**
 * Wraps a workspace API handler: mode/config gate, authentication, membership of the
 * workspace in the URL, CSRF check, body limits and error mapping.
 */
export function workspaceRoute<P extends { workspaceId: string }>(
  handler: (ctx: RouteContext, params: P) => Promise<{ status?: number; body: unknown }>,
) {
  return async (req: Request, { params }: { params: Promise<P> }): Promise<Response> => {
    const requestId = randomUUID();
    try {
      const config = getAppConfig();
      if (config.mode === 'demo') throw new DomainError('NOT_FOUND', 'API er ikke aktiv i demo-tilstand.');
      if (config.missing.length) throw new DomainError('NOT_CONFIGURED', 'Serveren er ikke konfigureret.');
      const resolved = await params;
      if (!z.uuid().safeParse(resolved.workspaceId).success) throw new DomainError('NOT_FOUND', MESSAGES.notFound);
      assertSameOrigin(req);
      const resolution = await resolveActor(resolved.workspaceId);
      if (resolution.status === 'unauthenticated') throw new DomainError('UNAUTHENTICATED', 'Log ind for at fortsætte.');
      if (resolution.status === 'forbidden') throw new DomainError('FORBIDDEN', 'Du har ikke adgang til dette arbejdsrum.');
      const actor = resolution.actor;
      const service = new WorkspaceService(getDb(), actor, requestId);
      const ctx: RouteContext = {
        req,
        service,
        actor,
        requestId,
        body: async () => {
          const length = Number(req.headers.get('content-length') ?? '0');
          if (length > MAX_BODY_BYTES) throw new DomainError('VALIDATION', 'Anmodningen er for stor.');
          if (!(req.headers.get('content-type') ?? '').includes('application/json')) {
            throw new DomainError('VALIDATION', 'Forventede JSON.');
          }
          const text = await req.text();
          if (text.length > MAX_BODY_BYTES) throw new DomainError('VALIDATION', 'Anmodningen er for stor.');
          try {
            return JSON.parse(text) as unknown;
          } catch {
            throw new MalformedRequest();
          }
        },
        idempotencyKey: (required) => {
          const key = req.headers.get('idempotency-key')?.trim();
          if (!key) {
            if (required) throw new MalformedRequest('Idempotency-Key mangler.');
            return undefined;
          }
          if (key.length > 200) throw new MalformedRequest('Idempotency-Key er for lang.');
          return key;
        },
      };
      const result = await handler(ctx, resolved);
      return json(result.status ?? 200, result.body, requestId);
    } catch (error) {
      if (error instanceof MalformedRequest) {
        return json(400, { error: { code: 'MALFORMED', message: error.message, fieldErrors: {}, requestId } }, requestId);
      }
      return errorResponse(error, requestId);
    }
  };
}

class MalformedRequest extends Error {
  constructor(message = 'Ugyldig anmodning.') {
    super(message);
  }
}

const filterValue = z.union([z.literal(NONE), z.uuid()]).optional();
const bool = z.enum(['true', 'false']).optional().transform((v) => v === 'true');

export function parseTaskQuery(url: URL): { query: TaskQuery; cursor: string | undefined; limit: number | undefined } {
  const p = Object.fromEntries(url.searchParams);
  const parsed = z
    .object({
      areaId: filterValue,
      assigneeId: filterValue,
      projectId: filterValue,
      q: z.string().max(500).optional(),
      status: z
        .string()
        .optional()
        .transform((v) => (v ? v.split(',') : undefined))
        .pipe(z.array(z.enum(TASK_STATUSES)).optional()),
      includeArchived: bool,
      archivedOnly: bool,
      cursor: z.string().max(600).optional(),
      limit: z.coerce.number().int().min(1).max(200).optional(),
    })
    .safeParse(p);
  if (!parsed.success) throw new MalformedRequest('Ugyldige filtre.');
  const { cursor, limit, ...query } = parsed.data;
  return { query, cursor, limit };
}

export function parseThoughtQuery(url: URL): { query: ThoughtQuery; cursor: string | undefined; limit: number | undefined } {
  const parsed = z
    .object({
      type: z.enum(THOUGHT_TYPES).optional(),
      projectId: filterValue,
      areaId: filterValue,
      q: z.string().max(500).optional(),
      includeArchived: bool,
      archivedOnly: bool,
      cursor: z.string().max(600).optional(),
      limit: z.coerce.number().int().min(1).max(200).optional(),
    })
    .safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) throw new MalformedRequest('Ugyldige filtre.');
  const { cursor, limit, ...query } = parsed.data;
  return { query, cursor, limit };
}

export function parseId(id: string): string {
  if (!z.uuid().safeParse(id).success) throw new DomainError('NOT_FOUND', MESSAGES.notFound);
  return id;
}
