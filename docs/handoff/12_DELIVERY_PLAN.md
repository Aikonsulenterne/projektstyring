# 12. Implementation milestones

## M0: establish reference and contracts
Read package, record source conflicts, choose compatible dependency versions, create repository and domain types. Preserve screenshot. Document stack as proposed. No cloud actions.
Exit: README, lockfile, scripts, typed entities, baseline fixture and decisions log.

## M1: faithful local interface
Build shell, four routes, project shortcuts, dark/light tokens, cards, task sheet, quick capture and canonical task selector. Use demo repository. Include project-optional create from day one.
Exit: all views navigable; screenshot set; AT-01/02/03/05/14/15 run locally.

## M2: complete behavior and data safety
Add project CRUD, direction, thoughts, conversion, checklist/comments, archive/restore, undo, safe local import/export and legacy migration. Protect dirty drafts and corrupted storage.
Exit: AT-04/06/07/10/11/12/13/16 and unit tests run.

## M3: shared persistence
Implement PostgreSQL migrations, repositories, transactional services, API validation, concurrency, idempotency and cache invalidation. Keep demo mode isolated.
Exit: integration tests and two-context collaboration tests pass against local DB.

## M4: identity and approved deployment
Configure Entra only with approved registration/tenant values. Apply membership rules, server authorization, logging and backup plan. Deploy only with explicit authorization.
Exit: actual login and isolation tests, restore drill and deployment smoke test. If blocked, report exact missing configuration; do not mark complete.

## M5: release candidate
Run full test suite, accessibility review, visual comparison and stress fixtures. Resolve P0/P1 issues. Provide actual test report and known limitations.

## Required final deliverables from Claude Code
Working repository; local setup README; .env.example without secrets; migrations and demo seed; automated tests; screenshots; architecture decisions; migration guide; backup/restore guide; actual test report; unresolved gates. Do not replace implementation with another planning document.

## Change control
No redesign, platform integration, AI agent, ranking feature or new required field without explicit user request. If implementation reveals a conflict, preserve user intent and record the resolution. Avoid repeated broad rewrites that lose working functionality.
