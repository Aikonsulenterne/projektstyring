import 'server-only';

export type AppConfig =
  | { mode: 'demo' }
  | { mode: 'open'; missing: string[] }
  | { mode: 'server'; missing: string[] };

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
 * Modes must be chosen explicitly:
 * - `demo`: browser-only prototype data.
 * - `open`: shared database with NO login – anyone with the link can read and
 *   edit. Chosen explicitly by the workspace owner; the UI says so on every page.
 * - anything else: production with Entra login, failing closed when identity or
 *   database configuration is missing. Never a silent fallback to another mode.
 */
export function getAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  // Tolerate case and stray whitespace from dashboards ("Open ", "demo\n").
  const mode = appModeValue(env);
  if (mode === 'demo') return { mode: 'demo' };
  if (mode === 'open') return { mode: 'open', missing: env.DATABASE_URL?.trim() ? [] : ['DATABASE_URL'] };
  const missing = REQUIRED_SERVER_ENV.filter((key) => !env[key]?.trim());
  return { mode: 'server', missing };
}

/** Normalised APP_MODE as configured (lower-case, trimmed); '' when unset. */
export function appModeValue(env: NodeJS.ProcessEnv = process.env): string {
  return (env.APP_MODE ?? '').trim().toLowerCase();
}
