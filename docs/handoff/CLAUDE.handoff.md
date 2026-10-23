# Claude Code implementation brief

## Opening prompt
Build AI Team Space from this handoff. First read README.md and the numbered specifications. Preserve the Danish UI, information architecture and quiet visual language. Use reference-screen.png for the dark visual reference and 02_SOURCE_OF_TRUTH.md to distinguish the screenshot from the current React canvas. Do not replace the design with your preferred dashboard template.

Implement the core locally using the proposed stack. Treat production hosting, identity and infrastructure as proposals awaiting organizational approval. Do not provision cloud resources or send invitations. No credentials are provided.

Fix the documented bugs rather than copying them. In particular, creating or saving a task must NEVER require a project or an area. Keep one canonical task shared between project and area views. All filters must compose and have consistent counts. Preserve drafts on failed saves and navigation. No automatic overwrite of invalid local data.

Work through the milestones in 12_DELIVERY_PLAN.md. At each milestone run the available tests, record actual outcomes, and distinguish executed checks from planned checks. Provide working code, setup instructions, migration notes, screenshots and a truthful test report. If a cloud integration cannot be verified, keep the local demo usable and identify the exact gate. Do not fake a successful login or silently substitute the demo user selector for authentication.

## Non-negotiable product rules
- Navigation: I dag / Vores områder / Projekter / Tanker.
- Data belongs to Sofie Ihle; Model to Nicholas; Adoption to Sofie Rasmussen.
- Sune is part of the workspace; no extra area is inferred for Sune.
- Area owner is not necessarily the task assignee.
- Project phase is not task status.
- Task completion is not measured business value.
- No employee ranking, scoring, capacity bars or performance analytics.
- No mandatory business case, date, area or project for quick capture.
- Demo content must be visibly identified as examples.
- Keep desktop and mobile fully operable without drag-and-drop.

## Code quality
Use typed domain models, explicit schema validation and a repository boundary. Do not mix local demo and production persistence. Use immutable task IDs, nullable associations, optimistic concurrency, server authorization and accessible native controls. Avoid giant all-in-one components and duplicated filtering logic. Do not execute imported HTML or accept client-provided authorship as identity.

## Delivery report
List: implemented / tested / not tested / blocked. Include exact commands run, test counts, environment assumptions, remaining defects and changed files. Never call the result bulletproof.
