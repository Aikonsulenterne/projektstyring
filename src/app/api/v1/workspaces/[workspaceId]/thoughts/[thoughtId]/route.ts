import { parseId, workspaceRoute } from '@/server/http';

export const PATCH = workspaceRoute<{ workspaceId: string; thoughtId: string }>(async ({ service, body }, { thoughtId }) => ({
  body: await service.updateThought(parseId(thoughtId), await body()),
}));
