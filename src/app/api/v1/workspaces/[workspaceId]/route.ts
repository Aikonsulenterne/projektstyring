import { workspaceRoute } from '@/server/http';

/** Workspace context: workspace, members, areas and the current member. */
export const GET = workspaceRoute(async ({ service }) => ({ body: await service.getContext() }));
