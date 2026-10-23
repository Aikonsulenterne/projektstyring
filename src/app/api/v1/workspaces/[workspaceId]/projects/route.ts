import { workspaceRoute } from '@/server/http';

export const GET = workspaceRoute(async ({ service, req }) => {
  const params = new URL(req.url).searchParams;
  return {
    body: await service.listProjects({
      includeArchived: params.get('includeArchived') === 'true',
      archivedOnly: params.get('archivedOnly') === 'true',
    }),
  };
});

export const POST = workspaceRoute(async ({ service, body, idempotencyKey }) => ({
  status: 201,
  body: await service.createProject(await body(), idempotencyKey(true)),
}));
