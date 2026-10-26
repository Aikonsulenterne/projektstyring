# AI Team Space (teamspace.)

Et enkelt fælles arbejdsrum for Sune, Sofie Ihle, Sofie Rasmussen og Nicholas: **I dag**, **Vores områder**, **Projekter** og **Tanker**. Built from the handoff in [`docs/handoff/`](docs/handoff/README.md).

> **Status:** The local demo (browser storage) is complete and tested. The shared mode (PostgreSQL + `/api/v1`) is implemented and tested against a local PostgreSQL, but **Microsoft Entra login has not been verified against a real tenant and nothing is deployed.** See [`docs/DEPLOYMENT_GATES.md`](docs/DEPLOYMENT_GATES.md) and the honest test record in [`docs/TEST_REPORT.md`](docs/TEST_REPORT.md).

## Two modes

| | Demo (`APP_MODE=demo`) | Production (anything else) |
|---|---|---|
| Data | This browser only (`localStorage`, key `ai-team-space-v3`) | PostgreSQL, shared |
| Who am I | "Vis som · ikke login" selector, clearly not a login | Microsoft Entra ID (single tenant) + explicit membership |
| Missing config | – | Fails closed: setup page, API answers 503. No demo fallback. |

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

Demo mode keeps each visitor's data in their own browser; nothing is shared. Shared mode on Vercel additionally needs a PostgreSQL database (`DATABASE_URL`) and the Entra variables from `.env.example` – see `docs/DEPLOYMENT_GATES.md`.

An optional, manual GitHub Pages workflow also exists (`.github/workflows/pages.yml`, static build via `scripts/prepare-pages.mjs`).

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
