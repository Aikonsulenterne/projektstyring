import 'server-only';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';

export type Db = InstanceType<typeof PrismaClient>;

export function createDb(connectionString: string): Db {
  // Serverless hosts run many small instances; keep each pool small so a hosted
  // pooler (e.g. Supabase) is not exhausted. Override with DATABASE_POOL_MAX.
  const max = Number(process.env.DATABASE_POOL_MAX) || (process.env.VERCEL ? 3 : 10);
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, max }) });
}

const globalForDb = globalThis as unknown as { teamspaceDb?: Db };

/** One pooled client per process. Throws when DATABASE_URL is missing (fail closed). */
export function getDb(): Db {
  if (globalForDb.teamspaceDb) return globalForDb.teamspaceDb;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured');
  globalForDb.teamspaceDb = createDb(url);
  return globalForDb.teamspaceDb;
}
