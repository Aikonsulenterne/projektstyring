# Stress results

Observations from one run in the delivery environment (shared cloud VM). They are not performance budgets; set budgets after measuring on the target host.

Command: `DATABASE_URL=$(scripts/test-db.sh url) npx tsx scripts/stress.ts`

**Hardware:** Intel(R) Xeon(R) Processor @ 2.10GHz, 4 vCPU, 16 GiB RAM, Node v22.22.0

### Demo repository (in-memory storage stand-in)

| Measurement | Result |
|---|---|
| seed 100 projects + 1000 tasks + 1000 notes (one write each) | 9160 ms |
| stored size | 793 KiB |
| cold start: parse + full validation of stored data | 30 ms |
| load all tasks (all pages) | 7 ms |
| tasks loaded / distinct ids | 1008 / 1008 |
| filtered list (area + project + search) | 0 ms |
| one mutation (full validated snapshot write) | 8 ms |

### PostgreSQL service layer (local, same machine)

| Measurement | Result |
|---|---|
| seed 100 projects + 1000 tasks + 1000 notes via service (10 parallel) | 9765 ms |
| load all tasks (5 pages × 200) | 51 ms |
| tasks loaded / distinct ids / totalMatching | 1000 / 1000 / 1000 |
| filtered list (area + project + search) | 8 ms |
| 10 concurrent PATCH on the same version | 47 ms |
|   → succeeded / conflicted | 1 / 9 |
| 10 retries of one create (same idempotency key) | 94 ms |
|   → tasks created | 1 |
| stress workspace id (isolated, safe to delete) | 941c3d7d-2ec3-487e-9c82-aa88c8e58fde |

### Browser rendering with 1,000 tasks (demo mode, production build)

Ad-hoc Playwright measurement (headless Chromium 1440×1000, same VM): 1,000 tasks injected into browser storage, then each view loaded.

| Measurement | Result |
|---|---|
| `/areas` until all 1,000 kanban cards rendered | 966 ms |
| `/today?scope=team&all=1` | 846 ms |
| `/projects` | 940 ms |
| Status change on a card until "Flyttet" toast | 2,048 ms |

**Observation:** at 1,000 tasks a single status change takes about 2 s in demo mode, because every mutation invalidates all queries and the whole board re-renders. Fine at the expected scale (four people), but if real data grows: narrow invalidation to affected query keys and virtualise long columns.

### What was checked
- No duplicate cards: loaded ids are distinct (1,008 / 1,008 demo; 1,000 / 1,000 PostgreSQL) and `totalMatching` equals the loaded count.
- No dropped updates: 10 concurrent PATCHes on one version → exactly 1 succeeds, 9 receive `VERSION_CONFLICT`.
- Retries: 10 concurrent creates with one idempotency key → exactly 1 task.
- Pagination: 5 pages × 200 via keyset cursor.
- No full-dataset writes in production: the service writes single rows; the demo store writes its snapshot per change by design (ADR-04).
