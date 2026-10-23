# AI Team Space: Claude Code handoff

## Start here
This package is an implementation specification, not a deployed app or a tested repository. The user requested a faithful handoff of the current prototype, including design, stack, structure and fixes. Technical documents are written in English for implementation; every visible product string must remain natural Danish.

Read in this order:
1. `CLAUDE.md`
2. `01_PRODUCT_AND_SCOPE.md`
3. `02_SOURCE_OF_TRUTH.md`
4. `03_DESIGN_SYSTEM.md` and `04_SCREENS_AND_INTERACTIONS.md`
5. `05_STACK_AND_ARCHITECTURE.md` and `06_REPOSITORY_AND_SETUP.md`
6. `07_DATA_MODEL.md` and `08_API_CONTRACTS.md`
7. `09_SECURITY_AND_COLLABORATION.md`
8. `10_BUGS_AND_MIGRATION.md`
9. `11_TESTS_AND_ACCEPTANCE.md`
10. `12_DELIVERY_PLAN.md` and `13_COPY_AND_COMPONENTS.md`

## What to build
A simple shared workspace for Sune, Sofie Ihle, Sofie Rasmussen and Nicholas. Four main destinations: **I dag**, **Vores områder**, **Projekter**, **Tanker**. Projects have kanban tasks. Cross-project responsibility areas are Data, Model and Adoption. A task may have a project, an area, both or neither. Only its title is required from the person creating it.

## Package contents
- Fifteen Markdown files: this README, CLAUDE.md, and thirteen numbered specifications.
- `reference-screen.png`: the actual screenshot supplied by the user.
- `reference-canvas-excerpts.txt`: selected exact excerpts from the current React canvas, not a complete compilable source file.
- `manifest.json`: file sizes and SHA-256 checksums.

## Important fidelity limitation
The attached Page could not be read through the file tool. Its current React content was supplied in conversation context and is the code basis for this handoff. The previously generated HTML file could not be recovered in this environment. It is NOT included. Do not pretend this package contains a byte-identical HTML export or the complete React source. The screenshot and React canvas also differ. `02_SOURCE_OF_TRUTH.md` explains how to resolve that without guessing.

## Working agreement
Reproduce the product and its visual language, not its bugs. Do not redesign into a generic enterprise dashboard. Do not claim production readiness, browser test results or cloud deployment unless actually executed and verified. No new feature is authorized merely because it is fashionable.

## How to give this to Claude Code
Unzip into an empty working directory, then give Claude Code the opening prompt in `CLAUDE.md`. Keep the reference files with the specs. Implement locally first. No tenant IDs, credentials, production resources or company permissions are supplied.

## Completion standard
All acceptance tests in `11_TESTS_AND_ACCEPTANCE.md` must pass. Produce screenshots for all four main views, a project kanban and the task editor. Compare with the supplied reference, report differences and record any unresolved integration gates. The handoff itself has only been checked for internal consistency and packaging, not executed as an application.
