# 08. API contracts

Proposed JSON API under /api/v1. Every route requires a session and workspace authorization in production. API shapes below are contracts to implement, not existing endpoints.

## Queries
GET /workspaces/:workspaceId/tasks
Query: areaId, assigneeId, projectId, q, status, includeArchived, cursor, limit.
Omitted filter = all. Literal `none` = null association. `q` searches title, case-insensitively. Route project scope is included in projectId. Limit defaults 50, maximum 200. Return items, totalMatching, nextCursor and serverTime. totalMatching is before pagination. Use stable cursor ordering.

GET /workspaces/:id/projects
GET /workspaces/:id/areas
GET /workspaces/:id/thoughts (type, projectId, areaId, q, cursor)
GET /workspaces/:id/tasks/:taskId (task + checklist + comments)
GET /workspaces/:id/activity (restricted minimal event view)

## Create task
POST /workspaces/:id/tasks
Idempotency-Key required for create mutations.
```json
{
  "title": "Afklar kvalitetskriterier",
  "projectId": null,
  "areaId": null,
  "assigneeId": null,
  "status": "open",
  "priority": "normal",
  "dueDate": null,
  "description": "",
  "checklist": [],
  "pendingComment": null
}
```
Only title is required in the body. Omitted optional associations normalize to null. Omitted assignee may default to current user; explicit null stays unassigned. Server supplies identity, workspace, timestamps and version. Return 201 with canonical entity and version.

## Update and atomic panel save
PATCH /workspaces/:id/tasks/:taskId
Body: expectedVersion + changed fields + checklist mutations + optional new comments with clientMutationId. Use one transaction so task/checklist/comments either all save or none save. New comments are append operations; never replace the entire comment collection from a stale client snapshot. Unique clientMutationId prevents duplicates on retry.

PATCH /workspaces/:id/tasks/:taskId/move
Body: expectedVersion, status, beforeTaskId nullable, afterTaskId nullable. Validate neighbors within workspace and target status; recompute rank transactionally. Return canonical task and version.

POST /.../tasks/:taskId/archive
POST /.../tasks/:taskId/restore
Equivalent create/update/archive/restore endpoints for projects and thoughts. Direction update uses workspace version. Thought conversion endpoint creates project + links note atomically, with idempotency key.

## Errors
```json
{
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "Opgaven er blevet opdateret af en anden.",
    "fieldErrors": {},
    "requestId": "opaque-id"
  },
  "currentVersion": 8
}
```
400 malformed; 401 unauthenticated; 403 unauthorized; 404 inaccessible/missing record; 409 stale version or idempotency mismatch; 422 validation; 429 throttled; 500 unexpected. No raw SQL, stack traces or secrets in response.

## Undo
Production undo is a new authorized inverse mutation with expectedVersion, not replacement of an old full-workspace snapshot. If entity changed again, show conflict. Undo creation archives it; undo archive restores it. Do not undo other people's subsequent changes. Demo can use bounded snapshots only within one local session and stale-write guard.

## Client behavior
Disable repeated submission while pending, preserve drafts on errors, rollback optimistic UI on failure, invalidate affected project/area/today queries after success. Announce success only after confirmed persistence. Never remove a failed draft because a toast was shown.
