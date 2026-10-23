import { workspaceRoute } from '@/server/http';

export const PATCH = workspaceRoute(async ({ service, body }) => ({ body: await service.updateDirection(await body()) }));
