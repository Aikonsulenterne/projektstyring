# 04. Screens and interactions

## Navigation and routes (proposed)
- `/today`: I dag
- `/areas`: Vores områder
- `/projects`: Projekter / Vores rejse
- `/projects/:id`: project; tab query = board/list/direction/notes
- `/thoughts`: Tanker
- `/archive`: secondary destination, not a fifth main nav item
Task panel may use `?task=:id` for shareable links. Preserve base route and filters when closing.

## I dag
Greeting: Hej Nicholas. Hvad er næste skridt? Use signed-in display name in production; demo selector only in demo mode. Quick capture supports Tanke/Opgave. Project association is optional. Area/assignee/project/search filters are visible. Mit fokus defaults to current user; Hele teamet removes that implicit restriction. Selecting an explicit assignee switches to Hele teamet to avoid contradictory filters. Show a small explanation of scope.

Next steps: open tasks ordered by due date ascending (no due date last), priority high/normal/low, stable ID as final tie-break. A six-task preview may be used only with a visible show-all control and accurate total. Blocked section uses the same scope and filters. Show-all includes completed tasks with explicit labeling.

## Vores områder
Three selectable cards: Data / Sofie Ihle; Model / Nicholas; Adoption / Sofie Rasmussen. They are filters over the same tasks, not separate copies. Clicking selected area clears it. Dropdown and cards share one area-filter state. Show all areas and unassigned area. Kanban states: Åben, I gang, Blokeret, Færdig. Include tasks without project. New task inherits selected area but does not force a project or area owner as assignee.

## Projekter
Common direction card with edit action. Journey phases: Idé, Udforsk, Eksperiment, Bevis værdi, Pilot, Skalér. Project cards show title, phase, owner, next step, task completion count and blocked indicator. A progress bar, if used, is task completion only; label it accordingly. Project lifecycle (active/paused/completed) is separate from phase; archive is a separate flag.

## Project details
Header: title, purpose, phase, status, edit. Tabs: Kanban, Liste, Retning & læring, Noter. Kanban and list use the same query. Project filter is locked to current project; other filters remain usable. Direction tab: why, goal, next step, learning. Notes are project-linked notes, not copies.

## Tanker
Quick free-text capture; default type Idé. Search and type filter. Notes can have optional project and optional area. Do not require either before saving. Edit note, archive, restore. Convert idea to project in one transaction, retain original note and link it to the new project. Conversion is explicit, not automatic.

## Task panel
Required input: title only. Assignee defaults to current user and may be cleared. Status defaults open. Project: Uden projekt. Area: Uden område. Details disclose description/blocker, date, priority, checklist and comments. Save also includes text typed into pending comment/checklist fields even if Tilføj was not pressed. Prevent duplicate submission. On failure keep panel and draft open. On conflict offer reload/copy draft; do not silently overwrite.

## Filters: exact semantics
AND between area, assignee, project and case-insensitive title search. Empty means all. Explicit sentinels represent unassigned area/assignee/project; never use display strings as IDs. Project route adds its project scope. Nulstil clears optional filters but retains project route scope and current focus/team mode. Count equals complete matching set before preview slicing. Filter controls and board counts derive from the same selector/query. No reuse of note-type state for area selection.

## Drafts and errors
Maintain capture text across rerenders and filter changes. On navigation with a dirty task panel ask Gem / Kassér / Bliv. Demo draft may be persisted separately; never confuse draft with saved task. Toasts announce actual results only. Provide inline errors and retry. Empty result includes Nulstil filtre, not an apparent broken screen.
