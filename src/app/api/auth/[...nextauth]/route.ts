import { getAppConfig } from '@/server/config';

// Auth endpoints exist only in production mode with complete configuration.
async function handle(req: Request): Promise<Response> {
  const config = getAppConfig();
  if (config.mode !== 'server' || config.missing.length > 0) {
    return new Response(JSON.stringify({ error: { code: 'NOT_CONFIGURED', message: 'Login er ikke sat op.' } }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
  const { handlers } = await import('@/server/auth');
  return req.method === 'POST' ? handlers.POST(req as never) : handlers.GET(req as never);
}

export const GET = handle;
export const POST = handle;
