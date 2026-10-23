import { parseId, workspaceRoute } from '@/server/http';

export const POST = workspaceRoute<{ workspaceId: string; taskId: string }>(async ({ service, body }, { taskId }) => ({
  body: await service.setTaskArchived(parseId(taskId), true, await body()),
}));
