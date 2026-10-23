# 06. Repository structure and setup

This is the target repository layout to implement, not files already present in this handoff.

```text
ai-team-space/
  README.md
  CLAUDE.md
  docs/                     # this handoff, ADRs, test report
  references/               # screenshot, canvas excerpts
  src/
    app/
      (workspace)/today/page.tsx
      (workspace)/areas/page.tsx
      (workspace)/projects/page.tsx
      (workspace)/projects/[id]/page.tsx
      (workspace)/thoughts/page.tsx
      api/v1/.../route.ts
      layout.tsx
    components/
      shell/                # Sidebar, Header, WorkspaceBanner
      tasks/                # Board, TaskCard, TaskSheet, Checklist
      projects/             # Journey, ProjectCard, DirectionPanel
      thoughts/             # CaptureBar, ThoughtCard
      filters/              # shared controls and count
      ui/                   # accessible primitives
    domain/
      entities.ts
      schemas.ts
      selectors.ts
      permissions.ts
      services/
    server/
      auth.ts
      db.ts
      repositories/
      services/
    demo/
      repository.ts
      migrations.ts
      seed.ts
    lib/
      api-client.ts
      dates.ts
      errors.ts
  prisma/
    schema.prisma
    migrations/
    seed.ts
  tests/
    unit/
    integration/
    e2e/
    fixtures/
  public/
  .env.example
  compose.yaml
  Dockerfile
  package.json
  package-lock.json
  playwright.config.ts
  vitest.config.ts
```

## Proposed environment contract
```dotenv
APP_MODE=demo
DATABASE_URL=
AUTH_SECRET=
AUTH_MICROSOFT_ENTRA_ID_ID=
AUTH_MICROSOFT_ENTRA_ID_SECRET=
AUTH_MICROSOFT_ENTRA_ID_ISSUER=
ALLOWED_TENANT_ID=
APP_BASE_URL=
```
These are proposed application variable names. Verify provider-specific names against the chosen Auth.js version. No secrets in NEXT_PUBLIC variables, source control, logs or this package. APP_BASE_URL must be configured, not guessed.

## Required npm scripts to implement
- dev: local application
- build / start: production build and serving
- lint / typecheck
- test: unit/component
- test:integration: isolated PostgreSQL integration tests
- test:e2e: Playwright
- db:migrate: development migrations
- db:deploy: apply reviewed migrations
- db:seed: explicit demo fixtures only

## Setup sequence after implementation
1. Install supported Node LTS and Docker, according to chosen package versions.
2. Copy .env.example to .env.local; select demo mode or configure local DB/auth.
3. Install locked dependencies with npm ci after a lockfile exists.
4. Start local PostgreSQL, run migrations, seed only the demo workspace.
5. Start app and execute tests.
6. Document actual commands and observed output in the delivered README.

Do not describe these commands as executable today: the repository has not yet been generated. Do not run production seeds or migrations without approval. Use separate test DB credentials. Include health/readiness checks and safe shutdown in deployment work.
