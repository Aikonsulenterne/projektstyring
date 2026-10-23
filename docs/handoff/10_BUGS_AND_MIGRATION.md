# 10. Known bugs and migration

These findings come from the current React canvas text supplied in context. They are code-review findings, not a claim that a browser stress test was executed.

## P0: remove project requirement everywhere
The canvas contains all four blockers:
```js
if(mode==='task'&&!draft.project)return;
if(!p)return;
disabled={!quick.trim()||(kind==='Opgave'&&!pid&&!quickProject)}
disabled={!(modal.mode==='note'||modal.mode==='direction'?draft.text:draft.title)?.trim()||(modal.mode==='task'&&!draft.project)}
```
Remove project guards; keep trimmed-title validation. Also allow null project in API, schema and DB. Test panel and quick capture separately. Changing only the label is not a fix.

## P0: protect data on load
load() only checks arrays; failed parsing falls back to seed. useEffect then writes data back to the same key. Replace with explicit load result (ok/empty/corrupt/unavailable), validated migration, no writes while corrupt, recovery/export flow. Do not overwrite user data with demo seed.

## P1: missing controls and inconsistent filtering
`filters` is defined but not rendered. Area cards use `type`, the same state as note type. Project tasks use `matches`, area board and today use separate logic. `openProject` does not reset note type. Implement independent task filters and thought filters, shared query builder and consistent count. Project route must not be contradicted by a stale global project filter.

## P1: area field missing
Area board reads task.area, but task editor has no area input in the current canvas. Add optional area selector. Area ownership and task assignment remain independent. Never infer existing task area solely from its assignee.

## P1: pending input lost
save() uses draft but excludes separate sub/comment input state. close() checks only draft. Include pending text atomically on Save and in dirty-state detection. Add mutation IDs so retries cannot duplicate comments.

## P1: invalid local collaboration model
Whole-dataset writes have no multi-tab concurrency protection. Production must use server mutations with version checks. Demo needs persisted revision comparison. A storage event warning alone does not prevent overwrite.

## P2: undo and routing
Full snapshot undo can remove the project currently open, leaving an empty page. Revalidate route after every mutation/undo. Production undo must not overwrite unrelated changes.

## P2: access and completion
Current role=dialog does not implement focus trapping/restoration. Demo user selector is not authentication. Backup export has no import counterpart in canvas. Existing alias names conflict with explicit user names. Fix all before production.

## Migration contract
Legacy canvas key: ai-team-space-v2. Shape: direction, projects[], tasks[], notes[]. Project phase is numeric index 0..5. Legacy aliases: Sofie B. -> Sofie Rasmussen; Sofie P. -> Sofie Ihle, based on the conversation's established labels. Preserve original IDs in an import map. Tasks may omit area, due, description, checklist, comments: default safely. Empty project -> null. Missing area -> null. Do not invent area from owner. Missing task status -> reject or show explicit repair preview, not silent guess.

Earlier HTML format may have version=1, string phase and full names. Validate separately. Unknown format is rejected with an export/recovery option. Production import requires preview, member identity mapping, transaction, duplicate detection and idempotency. No auto-import on login. Original backup remains unchanged.

## No fake status
Prototype examples are not verified project facts. Preserve labels only as demo fixtures. Do not populate real production workspace with invented owners, statuses or deadlines without explicit review.
