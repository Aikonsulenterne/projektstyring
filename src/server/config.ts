import 'server-only';

export type AppConfig = { mode: 'demo' } | { mode: 'server'; missing: string[] };

/** Variables production mode cannot run without. Never read from NEXT_PUBLIC_*. */
export const REQUIRED_SERVER_ENV = [
  'DATABASE_URL',
  'AUTH_SECRET',
  'AUTH_MICROSOFT_ENTRA_ID_ID',
  'AUTH_MICROSOFT_ENTRA_ID_SECRET',
  'AUTH_MICROSOFT_ENTRA_ID_ISSUER',
  'ALLOWED_TENANT_ID',
  'APP_BASE_URL',
] as const;

/**
 * Demo mode must be chosen explicitly. Anything else is production, which fails
 * closed when identity or database configuration is missing: no demo fallback.
 */
export function getAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  if (env.APP_MODE === 'demo') return { mode: 'demo' };
  const missing = REQUIRED_SERVER_ENV.filter((key) => !env[key]?.trim());
  return { mode: 'server', missing };
}
