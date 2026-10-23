import { parseId, workspaceRoute } from '@/server/http';

/** Creates a project from the thought and links it, in one transaction. */
export const POST = workspaceRoute<{ workspaceId: string; thoughtId: string }>(async ({ service, body, idempotencyKey }, { thoughtId }) => ({
  status: 201,
  body: await service.convertThought(parseId(thoughtId), await body(), idempotencyKey(true)),
}));
