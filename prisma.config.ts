import { defineConfig } from 'prisma/config';

// Only migrate/seed commands need a URL; `prisma generate` runs without it.
// Migrations prefer DIRECT_URL (a direct/session connection) because poolers in
// transaction mode, such as Supabase's port 6543, are meant for the app, not DDL.
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  ...(url ? { datasource: { url } } : {}),
});
