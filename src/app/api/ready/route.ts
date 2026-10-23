import { getAppConfig } from '@/server/config';

/** Readiness: configuration complete and database reachable (production mode). */
export async function GET(): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store' };
  const config = getAppConfig();
  if (config.mode === 'demo') return Response.json({ status: 'ready', mode: 'demo' }, { headers });
  if (config.missing.length) return Response.json({ status: 'not-configured' }, { status: 503, headers });
  try {
    const { getDb } = await import('@/server/db');
    await getDb().$queryRaw`SELECT 1`;
    return Response.json({ status: 'ready', mode: 'server' }, { headers });
  } catch {
    return Response.json({ status: 'database-unavailable' }, { status: 503, headers });
  }
}
