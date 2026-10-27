# AI Team Space (teamspace.)

Et enkelt fælles arbejdsrum for Sune, Sofie Ihle, Sofie Rasmussen og Nicholas: **I dag**, **Vores områder**, **Projekter** og **Tanker**. Built from the handoff in [`docs/handoff/`](docs/handoff/README.md).

> **Status:** The local demo (browser storage) is complete and tested. The shared mode (PostgreSQL + `/api/v1`) is implemented and tested against a local PostgreSQL, but **Microsoft Entra login has not been verified against a real tenant and nothing is deployed.** See [`docs/DEPLOYMENT_GATES.md`](docs/DEPLOYMENT_GATES.md) and the honest test record in [`docs/TEST_REPORT.md`](docs/TEST_REPORT.md).

## Two modes

| | Demo (`APP_MODE=demo`) | Open (`APP_MODE=open`) | Production (anything else) |
|---|---|---|---|
| Data | This browser only (`localStorage`, key `ai-team-space-v3`) | PostgreSQL, shared | PostgreSQL, shared |
| Who am I | "Vis som · ikke login" selector, clearly not a login | "Vis som · ikke login" selector (a cookie label, **not** a login) | Microsoft Entra ID (single tenant) + explicit membership |
| Who can read/edit | Only this browser | **Anyone with the link** (banner on every page; `noindex`) | Members only |
| Missing config | – | Setup page if `DATABASE_URL` is missing | Fails closed: setup page, API answers 503. No demo fallback. |

**Open mode is the current live setup**, chosen explicitly by the workspace owner (2026-10-27) instead of a login. It creates one workspace with Sune, Sofie Ihle, Sofie Rasmussen and Nicholas and the three areas (Data → Sofie Ihle, Model → Nicholas, Adoption → Sofie Rasmussen) on first use, without example content. Switching to `production` later keeps the data but needs the login setup in `docs/DEPLOYMENT_GATES.md`.

The two never mix: the demo repository is never used in production, and the API is closed (404) in demo mode.

## Quick start (demo)

Requirements: Node 22 (≥22.12) and npm 10 or 11.

```bash
npm ci
cp .env.example .env.local      # APP_MODE=demo is the default there
npm run dev                     # http://localhost:3000
```

Production-like local run of the demo: `npm run build && APP_MODE=demo npm start`.

## Demo on Vercel

1. vercel.com → **Add New → Project** → import `Aikonsulenterne/projektstyring` (framework: Next.js, defaults are fine).
2. **Environment Variables:** `APP_MODE` = `demo` for Production and Preview. Without it the app deliberately shows the setup page instead of the demo.
3. Deploy. Every push then gets its own preview URL.

If the site shows "Teamspace er ikke sat op endnu", `APP_MODE` is missing: add it, then **Redeploy** (environment variables only apply to new builds). `404 DEPLOYMENT_NOT_FOUND` means the opened address has no successful deployment behind it yet – check **Deployments** and use the **Visit** link of a *Ready* build.

Demo mode keeps each visitor's data in their own browser; nothing is shared. Shared mode on Vercel additionally needs a PostgreSQL database (`DATABASE_URL`) and the Entra variables from `.env.example` – see `docs/DEPLOYMENT_GATES.md`.

An optional, manual GitHub Pages workflow also exists (`.github/workflows/pages.yml`, static build via `scripts/prepare-pages.mjs`).

## Database on Supabase

Supabase is plain PostgreSQL, so the schema and migrations are used unchanged.

1. Create a Supabase project (choose an EU region). Supabase → **Connect** shows the connection strings. Use the **Transaction pooler** (port 6543) as `DATABASE_URL` and the **Session pooler** (same host, port 5432) as `DIRECT_URL`. Avoid the `db.<ref>.supabase.co` direct host on Vercel: on the free plan it is IPv6-only. Migrations through port 6543 hang (they need session locks); the Vercel build now stops with an explanation instead.
2. Migrations run automatically: on Vercel, `npm run vercel-build` (`scripts/vercel-build.mjs`) applies them before building, but only for **production** deployments with a database and without `APP_MODE=demo`. Previews never migrate. Manual alternative: `DIRECT_URL='postgresql://…:5432/postgres' npx prisma migrate deploy`.
3. In Vercel set `DATABASE_URL` to the **Transaction pooler** string (port 6543). The app keeps its connection pool small on Vercel (`DATABASE_POOL_MAX` overrides).
4. Create the workspace and members with `scripts/admin.ts` (use `DATABASE_URL=<direct string>`).

Security: Supabase exposes the `public` schema through its REST API to anyone with the project's public key. Migration `20261027090000_enable_row_level_security` enables row level security on every table without policies, which closes that route; the app connects as the table owner and is unaffected (verified locally: a role granted SELECT/INSERT sees 0 rows and cannot insert). Do not add RLS policies or use the Supabase client in the browser for this data.

The database alone does not make the app shared: production mode also needs a login (`DEPLOYMENT_GATES.md`).

## Shared mode locally (PostgreSQL)

```bash
docker compose up -d db                       # or: scripts/test-db.sh start (no Docker)
export DATABASE_URL=postgresql://teamspace:teamspace@localhost:5432/teamspace
npm run db:deploy                             # apply reviewed migrations
SEED_TARGET=local npm run db:seed             # optional example workspace (refuses without SEED_TARGET=local)
```

To use the app in shared mode you also need the Entra variables in `.env.local` (see `.env.example`) and a membership for your identity:

```bash
npx tsx scripts/admin.ts create-workspace --name "AI-teamet"
npx tsx scripts/admin.ts add-member --workspace <id> --tenant <tid> --subject <oid> --name "Sofie Ihle"
npx tsx scripts/admin.ts set-area-owner --workspace <id> --area data --user <userId>
```

People are identified by Entra tenant id + object id (`oid`), never by name or e-mail. Without a real app registration you can verify the gates (setup page, 401/403, `/api/ready`) but not log in.

## Scripts

| Script | What it does |
|---|---|
| `dev` / `build` / `start` | Next.js development, production build, serve |
| `lint` / `typecheck` | ESLint, strict TypeScript |
| `test` | Unit + component tests (Vitest, jsdom) |
| `test:integration` | Service/API tests against an isolated PostgreSQL (`TEST_DATABASE_URL`, or a throwaway cluster via `scripts/test-db.sh`) |
| `test:e2e` | Playwright: acceptance AT-01…AT-16, axe checks, layout checks (builds and serves demo mode on port 3200) |
| `db:migrate` / `db:deploy` | Create migrations in development / apply reviewed migrations |
| `db:seed` | Example workspace for a **local** database only |

Screenshots: `CAPTURE=1 npm run test:e2e -- tests/e2e/screenshots.spec.ts` writes to `docs/screenshots/`. Stress fixtures: `npx tsx scripts/stress.ts` (add `DATABASE_URL` for the PostgreSQL part).

## Layout

```text
src/
  app/                 routes: (workspace)/today|areas|projects|projects/[id]|thoughts|archive, signin, api/v1/…, api/health|ready
  components/          shell, tasks, projects, thoughts, filters, backup, views, ui (accessible primitives)
  domain/              entities, Danish labels, zod schemas, selectors (one filter contract), pure rules, rank keys
  demo/                versioned browser storage, validation, legacy migration, fixtures (flagged "Eksempel")
  server/              config gate, Auth.js, actor resolution, Prisma client, transactional service, HTTP wrapper
  lib/                 repository interface, HTTP client, React Query hooks, URL state
prisma/                schema, reviewed migration (incl. hand-written CHECK constraints), local seed
scripts/               admin CLI, throwaway test database, stress fixtures
tests/                 unit, integration (PostgreSQL), e2e (Playwright)
docs/                  handoff, architecture & ADRs, migration, backup/restore, deployment gates, test report, screenshots
references/            the user's screenshot and canvas excerpts
```

## Documentation

- [Architecture and decisions](docs/ARCHITECTURE.md)
- [Migration from the earlier prototype](docs/MIGRATION.md)
- [Backup and restore](docs/BACKUP_RESTORE.md)
- [Deployment gates (what is not done)](docs/DEPLOYMENT_GATES.md)
- [Test report](docs/TEST_REPORT.md) and [stress results](docs/STRESS_RESULTS.md)
