# Architecture and decisions

The handoff (`docs/handoff/05_STACK_AND_ARCHITECTURE.md`) proposed the stack; this file records what was actually built and why. Everything about hosting and identity remains a proposal awaiting approval (`DEPLOYMENT_GATES.md`).

## Layers

```text
UI (React client components)
  └─ WorkspaceRepository  ── DemoRepository ── browser storage (demo only)
                          └─ HttpRepository ── /api/v1 route handlers
                                                 └─ workspaceRoute(): mode gate → session → membership of URL workspace → CSRF → body limits
                                                    └─ WorkspaceService (transactions, version guards, idempotency, audit)
                                                       └─ Prisma 7 + @prisma/adapter-pg → PostgreSQL
Shared by both sides: src/domain (zod schemas, pure rules, selectors, rank keys, Danish labels)
```

## Pinned stack (installed 2026-10-23)

| Package | Version | Note |
|---|---|---|
| next | 16.4.2 | 16.4.0 carried critical advisories (GHSA-2464-fhr4-w9xw et al.); 16.4.2 is the patched release |
| react / react-dom | 19.3.0 | |
| typescript | 6.0.3 | strict + `noUncheckedIndexedAccess`; TS 7 not used (Next.js tooling compatibility unverified) |
| tailwindcss | 4.3.3 | tokens from the handoff as CSS variables, `@theme inline` |
| @tanstack/react-query | 5.104.1 | server state; URL holds filters; no second entity store |
| zod | 4.6.5 | input, import and query validation |
| prisma / @prisma/client / @prisma/adapter-pg | 7.10.1 | 7.10.0 had transitive advisories; generated client in `src/generated/prisma` (git-ignored) |
| next-auth | 5.0.0-beta.32 | **beta** – Auth.js v5 is the line that supports the App Router; re-evaluate before production |
| @radix-ui/react-dialog | 1.2.0 | focus trap/return for sheets and dialogs; everything else is native controls |
| lucide-react | 1.53.0 | small functional icons only |
| vitest / Testing Library / Playwright / axe | 4.1.12 / 16.3.3 / 1.56.1 / 4.13.0 | Playwright pinned to the pre-installed Chromium build |

`npm audit --omit=dev`: 0 known vulnerabilities at delivery. Six remain in dev-only lint tooling (transitive `braces`/`micromatch` via `eslint-config-next`, and an `esbuild` dev-server issue that only affects Windows).

## Decisions

**ADR-01 One canonical task.** Area and project boards are filters over the same task rows. Verified by AT-04 (browser) and the selector-parity integration test.

**ADR-02 Nullable, independent associations.** `projectId`, `areaId`, `assigneeId` are each nullable everywhere: zod (`'' → null`), rules, API, and DB columns. All eight combinations are tested (unit and integration).

**ADR-03 Versioned writes.** Every mutable record has `version`. The server writes with `WHERE id = … AND version = loaded`; zero rows means a 409 with `currentVersion`. The demo applies the same rules per record after re-reading storage, so two tabs only conflict on the same record.

**ADR-04 No full-dataset writes in production.** The API changes single records inside transactions. The demo store writes its whole (validated) snapshot per change – acceptable for a single-browser prototype and measured in `STRESS_RESULTS.md`.

**ADR-05 Soft archive.** `archived_at` on projects, tasks, thoughts (and comments, reserved). No delete in the UI; archiving a project keeps its tasks and notes linked; new links to an archived project are rejected.

**ADR-06 No AI integration** in the first release.

**ADR-07 Workspace-scoped composite foreign keys.** Associations reference `(workspace_id, id)`, and people are referenced through `membership(workspace_id, user_id)`. A row from one workspace physically cannot point at another workspace's project, area or member (tested by inserting directly).

**ADR-08 Shared rules, two persistence layers.** `src/domain/rules.ts` decides every state change (validation, version check, references, rank keys, conversion). The demo engine and the server service both call it; neither re-implements business rules.

**ADR-09 One filter contract.** `normalizeTaskQuery` / `matchesTask` / `selectTasks` define AND-composition, the explicit `none` sentinel and case-insensitive Danish title search. The server builds its `WHERE` from the same normalised query; an integration test compares server and client results for a set of combinations. Counts are always `totalMatching` before any preview slicing.

**ADR-10 Fractional rank keys.** One `sort_key` per task (`COLLATE "C"`, CHECK-constrained), generated between visible neighbours so hidden (filtered) tasks keep their relative order. API pages are ordered by `(sort_key, id)` with a keyset cursor; I dag re-sorts client-side by due date → priority → id.

**ADR-11 Undo = inverse mutation.** After a confirmed write the client offers "Fortryd", which sends the inverse change with the version it just received. If anyone changed the record since, undo fails with a conflict message instead of overwriting their change. Panel saves that touched checklist or comments offer no undo (comments are append-only).

**ADR-12 Idempotency.** Creates and conversion require `Idempotency-Key`; panel saves send one too. Receipts are inserted (never upserted) inside the write transaction, so a concurrent duplicate fails and then replays the first result. New comments also carry a client mutation id with a unique constraint.

**ADR-13 Fail closed.** Demo mode must be explicit. Any other mode with missing configuration renders a setup page, `/api/*` returns 503 and Auth endpoints are disabled. Production never falls back to demo storage.

**ADR-14 Client-only workspace UI.** The workspace renders in the browser (`next/dynamic`, `ssr: false`) because demo state lives in browser storage and the shell depends on the session. The server still decides mode and identity per request (`connection()` in the layout).

**ADR-15 Collaboration model.** Server-confirmed mutations, cache invalidation, refetch on focus and 20-second polling only while the page is visible, "Opdateret hh:mm" plus manual refresh. Not real-time co-editing; an open, dirty editor is never replaced by a refetch.

## Security notes (implemented)

- Identity from Auth.js session only (`tid` + `oid`); tenant allowlist at sign-in and again per request; membership checked against the workspace in the URL for every endpoint.
- Author and workspace always come from the session; client-sent values are ignored (tested).
- CSRF: `SameSite` Auth.js cookies plus an Origin / `Sec-Fetch-Site` check on every mutation.
- Input: zod at every boundary; JSON body ≤ 1 MB; text limits mirrored as DB CHECK constraints; LIKE wildcards escaped in search.
- Output: React text rendering only (no `dangerouslySetInnerHTML` except the static theme script); CSP with `default-src 'self'`, `frame-ancestors 'none'`; errors carry a request id and never SQL or stack traces.
- Logging: structured error lines with request id; no request bodies. Activity events store field names, not content.
- Not implemented: rate limiting (429) – proposed at the gateway/host level; scheduled cleanup of expired idempotency receipts (they are only replaced lazily).
