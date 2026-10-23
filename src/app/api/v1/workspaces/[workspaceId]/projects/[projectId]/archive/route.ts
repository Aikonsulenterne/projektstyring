import { parseId, workspaceRoute } from '@/server/http';

export const POST = workspaceRoute<{ workspaceId: string; projectId: string }>(async ({ service, body }, { projectId }) => ({
  body: await service.setProjectArchived(parseId(projectId), true, await body()),
}));
