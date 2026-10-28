import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

describe('getAppConfig', () => {
  it('accepts open/demo regardless of case and whitespace', async () => {
    const { getAppConfig } = await import('@/server/config');
    expect(getAppConfig({ APP_MODE: ' Open\n', DATABASE_URL: 'postgresql://x' } as unknown as NodeJS.ProcessEnv)).toEqual({ mode: 'open', missing: [] });
    expect(getAppConfig({ APP_MODE: 'OPEN' } as unknown as NodeJS.ProcessEnv)).toEqual({ mode: 'open', missing: ['DATABASE_URL'] });
    expect(getAppConfig({ APP_MODE: 'Demo ' } as unknown as NodeJS.ProcessEnv)).toEqual({ mode: 'demo' });
  });

  it('still fails closed for anything else', async () => {
    const { getAppConfig } = await import('@/server/config');
    const config = getAppConfig({ APP_MODE: 'opn', DATABASE_URL: 'postgresql://x' } as unknown as NodeJS.ProcessEnv);
    expect(config.mode).toBe('server');
    if (config.mode === 'server') expect(config.missing).toContain('AUTH_SECRET');
  });
});
