# CLAUDE.md – working on AI Team Space

Read `README.md`, then `docs/handoff/` (the original specification) and `docs/ARCHITECTURE.md`. `docs/handoff/CLAUDE.handoff.md` is the original brief.

## Non-negotiable product rules
- Navigation: I dag / Vores områder / Projekter / Tanker. Archive is secondary, not a fifth nav item.
- Data → Sofie Ihle, Model → Nicholas, Adoption → Sofie Rasmussen. Sune has no area. Area owner ≠ assignee.
- A task needs only a title. Project, area, assignee and date are always optional (UI, schema, API, DB).
- One canonical task shown in area and project views. Project phase ≠ task status. Completion ≠ business value.
- No ranking, scoring, capacity bars or performance analytics. Demo content is flagged "Eksempel".
- Every visible string is natural Danish. Technical docs and code are English.

## How the code is organised
- `src/domain/` is pure and shared: schemas (zod) → rules (decide next state) → selectors (the only filter/order logic). Do not duplicate filtering in components or SQL; the server translates `normalizeTaskQuery` and an integration test checks parity with `selectTasks`.
- The UI only talks to `WorkspaceRepository` (`src/lib/repository.ts`): `DemoRepository` (browser) or `HttpRepository` (API). Never read browser storage in production code paths.
- Server writes: load → rule → `updateMany … WHERE version = loaded` → activity event, inside one transaction (`src/server/services/workspace-service.ts`).
- Undo is an inverse, version-guarded mutation built by the client (`useMutationRunner`), never a snapshot restore.

## Commands
```bash
npm run lint && npm run typecheck && npm test        # fast checks
npm run test:integration                             # needs PostgreSQL (scripts/test-db.sh starts one)
npm run test:e2e                                     # builds + serves demo mode on :3200
```
Playwright is pinned to 1.56.x to match the pre-installed Chromium in cloud sessions (`overrides.playwright-core`).

## Next.js 16 notes
`params`/`searchParams` are Promises; the workspace layout calls `connection()` so mode/identity are decided per request; the workspace UI renders client-only (`WorkspaceAppLoader`). Read `node_modules/next/dist/docs/` before relying on memory (see `AGENTS.md`).

## Do not
- Provision cloud resources, send invitations, or guess tenant ids / redirect URLs.
- Fake a login or let the demo selector authorise anything.
- Seed example data into a non-local database (`db:seed` refuses without `SEED_TARGET=local`).
- Overwrite unreadable demo data; recovery is always explicit.
- Claim test results you did not run. Update `docs/TEST_REPORT.md` with actual outcomes.
