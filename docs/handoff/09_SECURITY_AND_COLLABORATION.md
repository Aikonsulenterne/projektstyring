# 09. Security, privacy and shared use

## Identity
Production: approved single-tenant Entra OIDC integration, server session, tenant verification and explicit workspace membership. Resolve the four people by verified tenant identities during setup; names are labels, not authorization. Do not guess email addresses, tenant IDs, object IDs or redirect URLs.

Proposed roles: member can manage workspace content; admin can manage membership and workspace configuration. This is a proposal, not a confirmed company policy. Area owner does not gain admin rights. Demo selector must never authorize production requests.

## Server enforcement
Authorize every read and mutation, including exports, comments, restore and conversion. Prevent cross-workspace foreign keys and insecure direct object references. Client-provided author/workspace values cannot override session scope. Use parameterized ORM operations, input schemas and safe text rendering. Do not render imported content as HTML.

## Browser and transport
HTTPS in deployed environments, secure HttpOnly session cookies, SameSite/CSRF protection appropriate to chosen auth/API setup, restrictive CSP compatible with chosen libraries, no wildcard CORS. No credentials or auth tokens in localStorage. Local demo storage contains task content only and is explicitly not a production datastore.

## Privacy
The app tracks work items, not employee performance. No individual productivity ranking, sentiment inference, time surveillance or protected-characteristic fields. Minimize logging of task text. Do not put customer data, secrets or credentials in demo examples. Retention and lawful processing must be approved by the organization; this package does not establish compliance.

## Concurrency
Every update carries expectedVersion. Two users editing same version: first succeeds, second gets 409 and keeps draft. Never silently use last-write-wins. Refresh does not replace an open dirty panel. On conflict show current server version and let user copy/reapply their changes explicitly. Multi-tab demo detects changed persisted revision before writing.

## Backups
Demo: validate entire import before writing; export current data first; reject malformed, oversized, duplicate-ID or dangling-reference data; never overwrite corrupt existing data on startup. Use versioned schema migration. Import is explicit. New app must not silently ingest unknown localStorage keys.

Production: managed DB backup/restore plan, access controls, retention and a restore drill are deployment gates. Browser export is not a disaster-recovery plan. Export requires membership; imported authorship is historical data, not identity or permission.

## Observability
Structured request IDs, error codes, failed mutation counts and health checks. No body logging by default. Keep user-facing errors actionable and separate from technical diagnostics. Record actual security test outcomes before release.
