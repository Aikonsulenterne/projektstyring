# 07. Data model

## Entities (proposed production schema)
All IDs are immutable UUIDs. All mutable records have created_at, updated_at, version integer and nullable archived_at. All workspace records carry workspace_id. Timestamps are UTC instants; task due_date is a date-only value.

- Workspace: id, name, direction.
- User: id, tenant_id, external_subject, display_name. Identity key is tenant + subject, never display name.
- Membership: workspace_id, user_id, role (member/admin), active. Unique workspace/user.
- Area: id, workspace_id, code (data/model/adoption), label, owner_user_id nullable. Unique workspace/code.
- Project: id, workspace_id, title, emoji nullable, phase, lifecycle, owner_user_id nullable, why, goal, next_step, learning.
- Task: id, workspace_id, title, description, project_id nullable, area_id nullable, assignee_user_id nullable, status, priority, due_date nullable, sort_key.
- ChecklistItem: id, workspace_id, task_id, text, done, position.
- Comment: id, workspace_id, task_id, body, author_user_id, created_at, updated_at, version, archived_at. Author comes from session.
- Thought: id, workspace_id, body, type, project_id nullable, area_id nullable, author_user_id, converted_project_id nullable.
- ActivityEvent: id, workspace_id, actor_user_id, entity_type, entity_id, action, changed_fields, timestamp, request_id. Minimize content duplication; do not log comment bodies by default.
- IdempotencyReceipt: workspace_id, actor_user_id, key, request_hash, result_reference, expiry. Retention to be approved.

## Enums
ProjectPhase: idea / explore / experiment / prove_value / pilot / scale.
ProjectLifecycle: active / paused / completed. Archive is separate archived_at.
TaskStatus: open / in_progress / blocked / done.
Priority: low / normal / high.
ThoughtType: idea / observation / learning / decision / todo.
UI labels are Danish; database enums are stable identifiers.

## Task association invariant
```ts
type TaskAssociations = {
  projectId: string | null;
  areaId: string | null;
  assigneeId: string | null;
};
```
All eight combinations of presence/absence are valid. Neither UI nor API nor database may require projectId. Assignee defaults to current user but may be cleared. Title is trimmed and nonempty. Blank selector maps to null, not an empty foreign key string.

## Relationships and constraints
Every associated project/area/user must belong to the same workspace and be accessible. Use composite workspace foreign keys or equivalent transactional enforcement plus tests. A workspace member can be inactive; historical authorship remains intact. Area ownership does not auto-reassign existing tasks.

Archive project: retain tasks and links, hide project from active selectors; offer explicit restore. Do not cascade-delete tasks or silently detach them. Archive task: hide from default boards; restore retains associations and state. Production hard deletion is an admin/retention process outside first release.

## Ordering
One canonical status and sort_key per task. Drag between columns changes status and position atomically. Filtered boards may have gaps; preserve relative order of hidden tasks. The same ordering is used in area and project boards; do not invent separate copies of a task for each view. I dag uses due-date/priority ordering rather than board order.

## Suggested indexes
workspace/status/archived; workspace/project/status/sort_key; workspace/area/status/sort_key; workspace/assignee/due_date; workspace/updated_at; task/checklist position; task/comment created_at. Evaluate search index only after actual data volumes justify it.

## Validation limits (proposed)
Task/project title 1-500 characters; note/description/comment 20,000 characters; backup 10 MB and 10,000 records per primary collection. Enforce server and client. Dates must be valid calendar dates. No synthetic precision or automatic project success scores.
