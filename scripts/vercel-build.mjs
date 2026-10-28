// Vercel runs `npm run vercel-build` instead of `build` when it exists.
// Production deployments with a database apply the reviewed migrations before
// building, so nobody has to run commands from a terminal. Preview deployments
// never migrate (they would otherwise change the production database).
import { execSync } from 'node:child_process';

const run = (command) => execSync(command, { stdio: 'inherit' });
const hasDatabase = Boolean(process.env.DIRECT_URL || process.env.DATABASE_URL);
const isProduction = process.env.VERCEL_ENV === 'production';
const isDemo = (process.env.APP_MODE ?? '').trim().toLowerCase() === 'demo';

// Migrations take session-level advisory locks, which a transaction-mode pooler
// (Supabase port 6543) does not support: `migrate deploy` then hangs until the
// build times out. Fail fast with an explanation instead.
function migrationUrlProblem() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL || '';
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return 'DIRECT_URL/DATABASE_URL is not a valid connection string.';
  }
  // Never print credentials: only which variable, host, port and user name.
  const seen = `${process.env.DIRECT_URL ? 'DIRECT_URL' : 'DATABASE_URL (DIRECT_URL is not set)'} = ${parsed.username}@${parsed.hostname}:${parsed.port || '5432'}`;
  if (parsed.port === '6543') return `migrations need port 5432, but ${seen}.`;
  if (parsed.searchParams.get('pgbouncer') === 'true') return `remove "?pgbouncer=true" from the migration URL (${seen}).`;
  console.log(`Migration connection: ${seen}`);
  return null;
}

if (hasDatabase && isProduction && !isDemo) {
  const problem = migrationUrlProblem();
  if (problem) {
    console.error(`\nCannot apply migrations: ${problem}`);
    console.error('Set DIRECT_URL (Production) to the Supabase "Session pooler" connection string (port 5432), then redeploy.\n');
    process.exit(1);
  }
  console.log('Applying database migrations (prisma migrate deploy)…');
  run('npx prisma migrate deploy');
} else {
  console.log(`Skipping migrations (database: ${hasDatabase}, production: ${isProduction}, demo mode: ${isDemo}).`);
}
run('npx next build');
