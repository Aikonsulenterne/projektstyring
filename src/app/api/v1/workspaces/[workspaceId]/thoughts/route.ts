import { parseThoughtQuery, workspaceRoute } from '@/server/http';

export const GET = workspaceRoute(async ({ service, req }) => {
  const { query, cursor, limit } = parseThoughtQuery(new URL(req.url));
  return { body: await service.listThoughts(query, { cursor, limit }) };
});

export const POST = workspaceRoute(async ({ service, body, idempotencyKey }) => ({
  status: 201,
  body: await service.createThought(await body(), idempotencyKey(true)),
}));
