# 05. Proposed stack and architecture

Everything in this file is a recommended implementation decision, not a claim about approved OK infrastructure. The current prototype is client-side React. Do not transfer the user's Vercel preference for another project to this project automatically.

## Proposed production baseline
- TypeScript, strict mode.
- Next.js App Router with React, one full-stack application initially.
- Tailwind CSS with explicit design tokens; Radix/shadcn-style accessible primitives customized to this design, not a default theme.
- lucide-react for small UI icons; Motion optional, not required for functionality.
- PostgreSQL as shared canonical storage; Prisma for typed access and migrations.
- Zod at input and import boundaries.
- Auth.js with Microsoft Entra ID single-tenant OIDC, subject to IT approval and integration verification.
- TanStack Query for mutation/cache coordination; URL state for filters. Do not duplicate server entities in a second global store.
- dnd-kit optional for pointer dragging; native status selector remains mandatory.
- Vitest + Testing Library for logic/components; Playwright for browser flows; axe checks for accessibility.

Pin compatible versions at implementation time and commit the lockfile. No latest-version claims or exact package versions are supplied here. Check official documentation for selected versions before implementation.

## Deployment proposal
Containerized Next.js app on an approved Azure application host; managed PostgreSQL; secrets via approved secret management; Entra tenant login. Exact service, region, network rules, retention, cost and app registration are approval gates. No cloud resources should be created from this handoff alone. Local Docker PostgreSQL supports development.

## Layers
UI -> typed API client -> route handler -> authorization -> domain service -> repository -> PostgreSQL.
Domain service owns transitions, filtering, transactions and concurrency. UI does not decide workspace membership. Production repository never reads browser localStorage as authoritative data.

## Demo mode
Explicit `APP_MODE=demo` or a separate local demo build. Demo user selector is visibly labeled, never rendered as a real login. Demo repository may use versioned local storage with validation, safe backup/restore and stale-write detection. Show local-only banner. Production mode must fail closed if identity/database configuration is missing; no silent demo fallback.

## Shared collaboration
Initial implementation: server-confirmed mutations, cache invalidation, refetch on focus and bounded polling only while the page is visible. Proposed polling interval 20 seconds, configurable. Show last refresh and manual refresh. This is not real-time co-editing. Add SSE/WebSocket only if justified later.

## State ownership
Server: projects, tasks, notes, comments, checklist items, memberships, area ownership and audit records.
Client: panel state, unsaved draft, current tab, selected filters, theme, toast and last undo receipt.
URL: route, project, task panel ID, optional filters. Do not put note bodies or secrets in URL.

## Architecture decisions
ADR-01: one task entity shared by area and project views.
ADR-02: project and area are nullable independent associations.
ADR-03: concurrency version checked on every write.
ADR-04: no full-dataset browser writes in production.
ADR-05: soft archive and restore, not irreversible UI deletion.
ADR-06: no AI integration in first release.
