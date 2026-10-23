import { parseTaskQuery, workspaceRoute } from '@/server/http';

export const GET = workspaceRoute(async ({ service, req }) => {
  const { query, cursor, limit } = parseTaskQuery(new URL(req.url));
  return { body: await service.listTasks(query, { cursor, limit }) };
});

/** Only the title is required. Idempotency-Key is required for creates. */
export const POST = workspaceRoute(async ({ service, body, idempotencyKey }) => ({
  status: 201,
  body: await service.createTask(await body(), idempotencyKey(true)),
}));
