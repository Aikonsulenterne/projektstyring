import { parseId, workspaceRoute } from '@/server/http';

type Params = { workspaceId: string; projectId: string };

export const GET = workspaceRoute<Params>(async ({ service }, { projectId }) => ({ body: await service.getProject(parseId(projectId)) }));

export const PATCH = workspaceRoute<Params>(async ({ service, body }, { projectId }) => ({
  body: await service.updateProject(parseId(projectId), await body()),
}));
