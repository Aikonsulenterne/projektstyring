# 01. Product and scope

## Confirmed user intent
A workspace for four people, not a PMO system. It must be easy to capture unfinished thoughts, see where the team is going, understand how projects are progressing and do the work inside each project. The user's Apple/Tesla reference means clarity and low interaction cost, not imitation of trademarks or proprietary UI assets.

## People and areas
| Person | Confirmed area |
|---|---|
| Sofie Ihle | Data |
| Nicholas | Model |
| Sofie Rasmussen | Adoption |
| Sune | Shared team overview; no dedicated area specified |

These are responsibility areas, not project folders and not stages. Each can contain tasks across projects and tasks with no project. Do not infer organizational hierarchy or approval rights from area ownership.

## Core user journeys
1. Capture a thought in one text field and press Enter.
2. Create a task with only a title. Project and area remain optional.
3. Open Vores områder, select Model, see relevant tasks across projects.
4. Open Projekter, see the journey, open OKAI, work in its kanban.
5. Filter by area + assignee + project + search together.
6. Open a task in the side panel, change status, add a checklist/comment and save.
7. Read project purpose, goal, next step and learning.
8. Turn an unassigned idea into a project without losing the original note.
9. Undo a change; export and restore a backup in demo mode.
10. Work with shared data after production identity and storage are configured.

## Release scope
Required: four views, project details/tabs, CRUD for tasks/projects/notes, archive/restore, checklists/comments, filters, shared canonical task state, local demo mode, backup import/export, clear errors, responsive layout, keyboard support, production repository/auth boundary.

Production gate: actual Entra login, tenant allowlist, database migrations, authorization tests, deployment and restore verification. These must not be described as already configured.

## Explicitly out of scope for first release
AI-generated status summaries, autonomous agents, Planner/Teams/SharePoint synchronization, email notifications, Gantt, timesheets, workload scoring, dependency graphs, rich text, file uploads and complex recurring tasks. Links may be plain validated URLs. Do not add integrations without a separate requirement.

## Simplicity guardrail
New task: title first; details progressively disclosed. Common actions on cards: open, change status, change assignee. No full-screen wizard. Keep the same vocabulary in every view.
