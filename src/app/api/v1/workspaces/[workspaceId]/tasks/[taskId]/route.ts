import { parseId, workspaceRoute } from '@/server/http';

type Params = { workspaceId: string; taskId: string };

export const GET = workspaceRoute<Params>(async ({ service }, { taskId }) => ({ body: await service.getTask(parseId(taskId)) }));

/** expectedVersion + changed fields + checklist ops + new comments, atomically. */
export const PATCH = workspaceRoute<Params>(async ({ service, body, idempotencyKey }, { taskId }) => ({
  body: await service.updateTask(parseId(taskId), await body(), idempotencyKey(false)),
}));
