import { workspaceRoute } from '@/server/http';

/** Minimal audit view: who changed which record and which fields, never the content. */
export const GET = workspaceRoute(async ({ service, req }) => {
  const limit = Number(new URL(req.url).searchParams.get('limit') ?? '50');
  return { body: await service.listActivity(Number.isFinite(limit) ? limit : 50) };
});
