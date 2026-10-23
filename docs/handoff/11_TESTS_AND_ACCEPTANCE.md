# 11. Tests and acceptance

This file is the required test plan. None of these application tests were executed as part of generating this handoff. Claude Code must implement and run them, then report actual results.

## Unit tests
- All eight null/non-null combinations of project, area, assignee are accepted.
- Empty/whitespace title rejected; trimmed valid title accepted.
- AND filters compose; none sentinel distinct from all.
- Case-insensitive Danish title search; stable ordering with missing dates.
- Phase and status are separate enums.
- Pending comment/checklist included exactly once on Save.
- Corrupt load never schedules a seed overwrite.
- Migration handles numeric phases and known aliases; rejects unknown data.
- Duplicate IDs, dangling references, invalid dates and oversized imports rejected.

## API/database integration
- Create task with only title returns persisted task and null project/area.
- Unauthorized workspace access denied for every endpoint.
- Cross-workspace associations rejected.
- Task + checklist + comment save is atomic; forced failure leaves no partial write.
- Same idempotency key/request yields one task; mismatched body rejected.
- Two PATCH requests with same expectedVersion: one succeeds, one conflicts.
- Conversion creates one project and retains original thought.
- Archive/restore preserves links; no cascading task deletion.
- Undo cannot erase another user's later update.

## Browser acceptance scenarios
AT-01: Open task panel, enter only title, leave project empty, save, reload, find task under I dag/all tasks and Uden projekt filter.
AT-02: Quick-create Opgave without project; Enter and button both work.
AT-03: Create Model task without project, select Model area, see it once in area board; project boards do not show it.
AT-04: Link same task to OKAI, change status in area board, verify project board and list show same state.
AT-05: Combine Model + Nicholas + OKAI + title search; result count and cards match; reset retains project route scope.
AT-06: Write a comment and checklist text without Tilføj, press Gem, reopen: both present once.
AT-07: Dirty panel -> Escape/backdrop/navigation -> cancel discard -> draft retained. Keyboard focus returns correctly after actual close.
AT-08: Force failed save/offline -> no success toast, draft retained, retry succeeds without duplicates.
AT-09: Two browser contexts edit same task -> conflict shown; second draft preserved.
AT-10: Export, modify data, restore backup -> original data restored after explicit confirmation. Invalid backup leaves current data untouched.
AT-11: Inject malformed localStorage -> recovery banner, no overwrite; no fake normal error on fresh startup.
AT-12: Archive and restore task/project; counts and filters update.
AT-13: Note-type filter never affects area board; navigation does not retain contradictory filters.
AT-14: Theme toggle; desktop and mobile all four destinations work.
AT-15: Keyboard-only create, filter, change status, save, close. Dragging is not required.
AT-16: HTML-like task/note content displayed as text; no script execution.

## Visual acceptance
Capture at 1440x1000, 1024x768, 390x844 and 320x740. Check dark and light themes. Compare sidebar hierarchy, main padding, capture bar, filter row, focus cards, task rows, project journey, four-column board and right sheet. No page-level horizontal overflow. No hidden Save button. Include reference-vs-build screenshots; do not claim pixel-perfect automatically.

## Proposed stress checks
Seed 1,000 tasks, 100 projects, 1,000 notes in an isolated test workspace. Measure load/filter/mutation behavior on documented hardware. Verify pagination, no duplicate cards, no dropped updates and no full-dataset client rewrites. Test 10 concurrent mutation requests and repeated retries. These are test fixtures, not real workload claims. Set performance budgets after measuring a baseline; do not invent pass times.

## Release checklist
- [ ] lint, strict typecheck and build pass
- [ ] unit/integration/browser tests pass with report
- [ ] keyboard and contrast checks complete
- [ ] task-without-project regression verified
- [ ] backup restore verified
- [ ] auth and workspace isolation verified
- [ ] deployment configuration reviewed
- [ ] remaining limitations documented
