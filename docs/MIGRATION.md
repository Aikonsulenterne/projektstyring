# Migration from the earlier prototype

Nothing is imported automatically. The current demo uses a new storage key (`ai-team-space-v3`); the canvas key `ai-team-space-v2` is left untouched. When it is present, **Backup → Data fra den tidligere prototype** offers a preview, and only an explicit confirmation imports it. The current data is downloaded first.

## Supported sources

| Source | Detected by | Notes |
|---|---|---|
| teamspace backup | `format: "teamspace-demo"`, `schemaVersion: 3` | Full schema + referential validation |
| Canvas prototype (`ai-team-space-v2`) | `{ direction, projects[], tasks[], notes[] }`, no `version` | Phase is a number 0–5 |
| Earlier HTML export | same arrays plus `version: 1` | Phase is a label (e.g. "Eksperiment") |

Anything else is rejected with "Ukendt filformat".

## Mapping rules

- **People:** `Sofie B.` → Sofie Rasmussen, `Sofie P.` → Sofie Ihle (aliases as established in the conversation); full names and `Sune`, `Nicholas` map directly. Unknown names are rejected, never guessed.
- **IDs:** every record gets a new UUID. The original → new mapping is kept in `imports[].idMap` (`task:<old id>` etc.). Duplicate original ids are rejected.
- **Project reference on a task/note:** matched by original id first, then by project title (reported as a warning). Empty → no project. Anything else is rejected as dangling.
- **Area:** `Data` / `Model` / `Adoption` (case-insensitive). Missing → no area. **Never inferred from the assignee.**
- **Status:** Danish label (`Åben`, `I gang`, `Blokeret`, `Færdig`) or the English id. **Missing status rejects the whole import** with the affected tasks listed; nothing is guessed.
- **Dates:** `due` must be a valid calendar date (`YYYY-MM-DD`).
- **Optional fields** (`description`, `due`, `checklist`/`sub`, `comments`, `area`) default safely when missing.
- **Comments without an author** are kept, prefixed "(Importeret, ukendt forfatter)" and attributed to the importer, with a warning in the preview.
- **Notes without a type** become "Idé" (warning).
- Limits: 10 MB per file, 10,000 records per collection.

## Assumptions to confirm

The complete canvas source and the earlier HTML file were not available (`docs/handoff/02_SOURCE_OF_TRUTH.md`). The field names above (`title|name`, `owner`, `project`, `area`, `status`, `due`, `checklist|subtasks|sub`, `comments`, `text|body`, `type`) are reconstructed from the excerpts. Test the importer with a real export before relying on it; anything it cannot map is reported, not silently dropped.

## Production import (not built)

Importing into the shared database needs a preview, member identity mapping (names → verified tenant identities), one transaction, duplicate detection and idempotency (handoff 10). That tool is not part of this delivery. Until then: import into demo mode, review, then re-enter or script a reviewed load.
