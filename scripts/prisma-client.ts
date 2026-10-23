// Prisma client for CLI scripts (outside Next.js, so no `server-only` guard).
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

export function scriptDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL mangler.');
    process.exit(1);
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}
