import { parseId, workspaceRoute } from '@/server/http';

export const POST = workspaceRoute<{ workspaceId: string; thoughtId: string }>(async ({ service, body }, { thoughtId }) => ({
  body: await service.setThoughtArchived(parseId(thoughtId), true, await body()),
}));
