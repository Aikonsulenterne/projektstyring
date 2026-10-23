# Test report

Delivery date: 2026-10-23. Everything below marked **executed** was run in the delivery environment and passed as stated. Nothing here is a claim of production readiness.

## Environment

- Linux cloud VM, 4 vCPU (Intel Xeon @ 2.10 GHz), 16 GiB RAM; Node v22.22.0; npm 10.9.4 (lockfile also verified with npm 11.6.2).
- PostgreSQL 16 (local throwaway cluster via `scripts/test-db.sh`, locale `C.UTF-8`).
- Chromium build 1194 (pre-installed, driven by Playwright 1.56.1), headless, locale `da-DK`, timezone Europe/Copenhagen.
- No Docker daemon, no Entra tenant, no cloud access.

## Summary

| | Status |
|---|---|
| **Implemented** | Four views + project detail (Kanban / Liste / Retning & læring / Noter) + Arkiv; task, project, direction and thought editors; quick capture; combined filters; area cards; journey; checklist and comments; archive/restore; versioned undo; thought → project conversion; dark/light theme; mobile menu; demo repository with safe load, multi-tab guard, backup export/restore, legacy import preview; PostgreSQL schema + migration; transactional service; `/api/v1`; Auth.js Entra wiring; fail-closed config gate; health/readiness; admin CLI; local seed; Dockerfile and compose (unbuilt) |
| **Tested (executed)** | lint, strict typecheck, production build, 62 unit/component tests, 32 integration tests on PostgreSQL, 74 Playwright tests (18 acceptance, 14 axe, 42 layout), acceptance suite repeated 3× (54/54), production-mode smoke, stress fixtures |
| **Not tested** | Real Microsoft login; shared mode in a real browser (no login possible); Docker image build/run; Firefox/Safari/real phones; screen readers and manual contrast review; pointer drag-and-drop (keyboard and select alternatives are tested); legacy import with a genuine old export (only reconstructed fixtures) |
| **Blocked** | Entra app registration and tenant values, hosting, managed database, production migrations, restore drill, deployment smoke test (`DEPLOYMENT_GATES.md`) |

## Commands and results (final run)

| Command | Result |
|---|---|
| `npm run lint` | 0 errors, 0 warnings |
| `npm run typecheck` | pass |
| `npx next build` | pass (all workspace routes dynamic) |
| `npm test` | **62 passed** (4 files) |
| `npm run test:integration` | **32 passed** (3 files) against PostgreSQL 16 |
| `CI=1 npm run test:e2e` | **74 passed** (1.1 min) |
| `CI=1 npx playwright test tests/e2e/acceptance.spec.ts --repeat-each=3` | **54 passed**, no flakes |
| `CAPTURE=1 CI=1 npx playwright test tests/e2e/screenshots.spec.ts` | 42 passed, 42 screenshots written |
| `npx tsx scripts/stress.ts` (with `DATABASE_URL`) | see `STRESS_RESULTS.md` |
| `npm audit --omit=dev` | 0 vulnerabilities (6 in dev-only lint tooling, see ARCHITECTURE.md) |
| `npm ci` with npm 10.9.4 and 11.6.2 on a clean copy | pass |

## Browser acceptance (demo mode)

| ID | Test | Result |
|---|---|---|
| AT-01 | Title-only task, project left empty, survives reload, shown under "Uden projekt"; stored with `projectId`/`areaId` null | pass |
| AT-02 | Quick-create Opgave without project with Enter and with the button | pass |
| AT-03 | Model task without project appears once on the area board, not on the OKAI board | pass |
| AT-04 | Same task linked to OKAI; status changed on the area board shows on the project board and list | pass |
| AT-05 | Model + Nicholas + OKAI + "KVALITET": "1 opgave matcher" and exactly one card; Nulstil on a project route keeps the route (3 tasks) | pass |
| AT-06 | Comment and checklist text typed without Tilføj, Gem, reopen: both present exactly once | pass |
| AT-07 | Dirty panel: Escape and backdrop ask Gem/Kassér/Bliv, Bliv keeps the draft, Kassér closes, focus returns to the opener | pass |
| AT-07b | Navigation with a dirty editor asks; Bliv stays on the page with the draft | pass |
| AT-08 | Forced storage failure: error text, no "Gemt." toast, draft kept; retry saves exactly one task | pass |
| AT-09 | Two tabs edit the same task: second save shows the conflict text and keeps its draft; "Brug nyeste og anvend mine ændringer" then saves | pass (see note) |
| AT-10 | Export, change, restore with confirmation (safety copy downloaded) → change gone; invalid backup → data untouched | pass |
| AT-11 | Malformed storage → recovery screen, value unchanged after reload; fresh start shows no error | pass |
| AT-12 | Archive/restore task (counts 8 → 7 → 8) and project (tasks stay linked) | pass |
| AT-13 | Thought type filter does not affect the area board; navigation drops stale filters | pass |
| AT-14 | Theme toggle persists; all four destinations on desktop and at 390 px via the menu | pass |
| AT-15 | Keyboard only: create, search, change status, open, Escape returns focus | pass |
| AT-15b | Kanban card moves with Alt+→ and keeps focus | pass |
| AT-16 | `<img onerror>` and `<script>` content shown as text, nothing executed | pass |

**Note on AT-09:** the handoff asks for two browser *contexts*. In demo mode separate contexts do not share storage, so the demo test uses two tabs in one context (the demo's real collaboration surface). Concurrent edits between different users are covered against PostgreSQL (`concurrent PATCH … exactly one wins`, `undo cannot erase another person's later update`, API 409 contract). A two-context browser run in shared mode is **not executed** because it needs a working login.

## Unit and component tests (62)

Domain: all eight association combinations; blank/whitespace title rejected and trimmed title accepted; invalid calendar dates; AND filters; `none` vs all; Danish case-insensitive search; route scope beats stale project filter; explicit assignee replaces focus scope; archived handling; I dag ordering (due → priority → id); phase/status enums disjoint; atomic patch with pending comment/checklist; stale version rejected without mutation; unknown references rejected; rank keys always between neighbours, short on append, correct with hidden tasks.
Demo repository: seeds only an empty key; corrupt JSON / wrong shape / dangling reference never written over; newer schema refused; legacy key not ingested; title-only create; failed write leaves storage and cache untouched and retry is idempotent; idempotency mismatch; two tabs keep unrelated changes and conflict on the same record; project archive keeps tasks; conversion keeps the note (idempotent); one canonical task across views; pagination totals.
Backup/migration: round-trip; canvas v2 numeric phases and aliases (`Sofie B.` → Rasmussen, `Sofie P.` → Ihle), missing area stays null, id map kept; rejects missing status, dangling project, duplicate ids, invalid dates, unknown person, unknown format, files > 10 MB, backups with dangling references.
Task draft: defaults (no project/area, current user), inherits area without assigning its owner, typed-but-not-added text counts as dirty, pending comment/checklist included exactly once with stable mutation ids, only changed fields, checklist update/remove ops, conflict re-apply.
Component: `<TaskFilters>` labelled native controls, `none` options, count text, hidden project filter on project routes.

## Integration tests on PostgreSQL (32)

Service (21): title-only create with null associations; all eight combinations; cross-workspace associations rejected (service) and impossible (DB composite FKs); no IDOR across workspaces; atomic save with a forced mid-transaction failure leaves no partial write; author from session only; idempotent create under 10 concurrent requests and mismatch rejection; 10 concurrent creates; 10 concurrent PATCH → exactly one wins; undo cannot erase a later change; moves between visible neighbours with hidden tasks; keyset pagination over 120 tasks; **server filters match the shared client selector** for 8 query shapes; LIKE wildcards literal; project archive keeps links and blocks new ones; task archive/restore keeps state; conversion creates exactly one project under a concurrent duplicate and keeps the note; thought without project/area; activity log without content; versioned direction.
API (10): **every one of 22 endpoints** returns 403 for another workspace and changes nothing; every endpoint returns 401 without a session; 404 for a foreign record via my workspace; cross-site mutation rejected; 201 + required `Idempotency-Key`; 422 with Danish field errors and request id; 409 with `currentVersion`; 400 for malformed JSON and invalid filters without internals; `none` filter and `totalMatching` before pagination; API closed in demo mode, 503 without configuration.
Contract (1): the browser's `HttpRepository` driven through the real route handlers for create (with replay), atomic panel save, conflict, move, filters, archive/restore, project CRUD, thought update/convert, direction.

Identity in these tests is substituted at `resolveActor` (no Entra tenant); the membership lookup still runs against the database.

## Accessibility

Executed: axe (WCAG 2.0/2.1 A + AA rule sets) on I dag, Vores områder, Projekter, project kanban, Tanker, the open task editor and Arkiv, in dark and light themes: **no serious or critical violations**. Keyboard-only flows (AT-15/15b), focus trap and focus return (AT-07), native selects throughout, 44 px targets for primary controls, visible focus rings, status always shown as text, `prefers-reduced-motion` honoured.
Not executed: screen-reader testing (VoiceOver/NVDA), manual contrast review, zoom/reflow at 200–400 %.

## Visual comparison

42 screenshots in `docs/screenshots/` (six screens × 1440×1000, 1024×768, 390×844 in dark and light, plus 320×740 dark). Every capture also asserted **no page-level horizontal overflow** and, for the editor, that **Gem is in the viewport**. Side-by-side: `docs/screenshots/compare-reference-vs-build-today.png`.

Differences from `references/reference-screen.png` (deliberate unless noted):
- The reference shows "Gemte data kunne ikke læses…" on a normal screen. The build shows it only when stored data really is unreadable (recovery screen), per handoff 02.
- The reference lists "Alle opgaver" permanently; the build follows the canvas: Mit fokus / Hele teamet, "Det skal vi have afklaret", and "Vis alle opgaver (N)" which shows every matching task including finished ones.
- Added from the canvas/spec: "DINE PROJEKTER" shortcuts, scope explanation, optional project in quick capture, "Fortsæt i et projekt", Arkiv / Backup / theme in the sidebar, small nav icons, "Eksempel" tags, richer card metadata (area, due date, priority, checklist and comment counts).
- Status pills are native selects styled as pills (changeable in place), not static labels.
- The reference was captured at a smaller zoom; the build uses the handoff's type scale (14 px base, 34 px greeting) and a 232 px sidebar (spec 224–240 px), so it reads larger.
- The first list card is titled "Mit fokus" in focus mode and "Næste skridt" in team mode.
- Not pixel-identical, by design (handoff 02, "Meaning of 1:1").

## Production-mode smoke (executed, `next start`)

| Setup | Observed |
|---|---|
| `APP_MODE` unset, no variables | `/today` shows "Teamspace er ikke sat op endnu" with the missing variable names; `/api/ready` 503; `/api/v1/…` 503 `NOT_CONFIGURED`; `/api/auth/session` 503 |
| Local DB + placeholder Entra values | `/today` → 307 to `/signin` ("Log ind med Microsoft"); `/api/v1/…` 401; `/api/ready` 200; CSP, `nosniff`, `Referrer-Policy` headers present |

## Handoff bugs (10_BUGS_AND_MIGRATION.md) and where they are fixed

| Finding | Fix | Evidence |
|---|---|---|
| P0 project required in four places | Title-only validation in schema, rules, UI, API and nullable DB columns; Save never disabled for an empty project | AT-01, AT-02, unit + integration combination tests |
| P0 load overwrites data with seed | Explicit load states; corrupt/unsupported data is read-only; recovery screen | AT-11, unit "never overwrites" tests |
| P1 filters not rendered, area cards share note-type state, three filter implementations | One `TaskFilters` component and one selector; separate thought filters; cards and dropdown share the URL area state | AT-05, AT-13, parity integration test |
| P1 no area field | Optional area selector with owner hint (owner ≠ assignee) | AT-03, AT-04 |
| P1 pending input lost | Pending comment/checklist saved once; dirty state includes them | AT-06, unit draft tests |
| P1 whole-dataset multi-tab overwrite | Re-read before write + per-record versions (demo); version-guarded rows (server) | AT-09, unit two-tab test, integration concurrency |
| P2 snapshot undo can remove the open project | Undo is an inverse versioned mutation; an archived project page shows a restore banner | integration undo test; AT-12 |
| P2 dialog without focus management; no import; alias names | Radix focus trap + explicit focus return; backup restore and legacy import; real names everywhere | AT-07, AT-10, migration tests |

## Defects found and fixed during this work

- Focus did not return to the opener when the task panel first showed a loading state (AT-07/AT-15) – the opener is now captured when the panel is requested.
- Enter in the editor's name field did not save (multiple fields prevent implicit form submission) – explicit handler.
- After an Alt+arrow move the card lost focus – refocus waits for the card in its new column.
- Two concurrent conversions with the same idempotency key: the loser raised a conflict instead of replaying – it now re-checks for a committed receipt.
- Next.js 16.4.0 and Prisma 7.10.0 had published advisories – upgraded to 16.4.2 / 7.10.1.

## Known limitations and remaining defects

- With ~1,000 tasks a status change takes ~2 s in demo mode (all queries invalidated, whole board re-rendered).
- Panel saves that change checklist or comments have no undo; comments cannot be edited or archived in the UI (append-only).
- The activity endpoint has no UI. Membership and area ownership are managed with the CLI only.
- Production import of legacy data is not built; legacy field names are reconstructed assumptions (`MIGRATION.md`).
- No rate limiting; no scheduled cleanup of expired idempotency receipts.
- Date inputs display in the browser's locale format.
- Auth.js v5 is a beta release.
- In shared mode two people never see each other's changes faster than the 20-second poll, focus refetch or manual refresh.

## Release checklist (handoff 11)

- [x] lint, strict typecheck and build pass
- [x] unit / integration / browser tests pass with report (this file)
- [ ] keyboard and contrast checks complete – keyboard and automated axe done; manual contrast and screen-reader review not done
- [x] task-without-project regression verified
- [x] backup restore verified (demo)
- [ ] auth and workspace isolation verified – isolation verified against PostgreSQL; real Entra login **not** verified
- [ ] deployment configuration reviewed – blocked (`DEPLOYMENT_GATES.md`)
- [x] remaining limitations documented
