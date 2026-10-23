// Starts (or reuses) an isolated PostgreSQL, resets it and applies the reviewed
// migrations. Uses TEST_DATABASE_URL when set; never touches DATABASE_URL.
import { execFileSync } from 'node:child_process';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

export default function setup(project: TestProject) {
  const url = process.env.TEST_DATABASE_URL ?? execFileSync('scripts/test-db.sh', ['start'], { encoding: 'utf8' }).trim();
  const env = { ...process.env, DATABASE_URL: url };
  execFileSync('psql', [url, '-q', '-c', 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;'], { env, stdio: 'pipe' });
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], { env, stdio: 'pipe' });
  project.provide('databaseUrl', url);
}
