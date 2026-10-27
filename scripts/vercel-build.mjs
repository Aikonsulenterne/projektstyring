// Vercel runs `npm run vercel-build` instead of `build` when it exists.
// Production deployments with a database apply the reviewed migrations before
// building, so nobody has to run commands from a terminal. Preview deployments
// never migrate (they would otherwise change the production database).
import { execSync } from 'node:child_process';

const run = (command) => execSync(command, { stdio: 'inherit' });
const hasDatabase = Boolean(process.env.DIRECT_URL || process.env.DATABASE_URL);
const isProduction = process.env.VERCEL_ENV === 'production';
const isDemo = process.env.APP_MODE === 'demo';

if (hasDatabase && isProduction && !isDemo) {
  console.log('Applying database migrations (prisma migrate deploy)…');
  run('npx prisma migrate deploy');
} else {
  console.log(`Skipping migrations (database: ${hasDatabase}, production: ${isProduction}, demo mode: ${isDemo}).`);
}
run('npx next build');
