import { parseId, workspaceRoute } from '@/server/http';

export const PATCH = workspaceRoute<{ workspaceId: string; taskId: string }>(async ({ service, body }, { taskId }) => ({
  body: await service.moveTask(parseId(taskId), await body()),
}));
