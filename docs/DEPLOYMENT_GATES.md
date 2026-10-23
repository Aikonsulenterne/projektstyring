# Deployment gates – what is not done

None of the following was configured, provisioned or verified. No cloud resources were created and no invitations were sent.

| Gate | State | What is needed |
|---|---|---|
| Entra app registration | **Missing** | Single-tenant registration approved by IT; redirect URI `<APP_BASE_URL>/api/auth/callback/microsoft-entra-id`; client id/secret in approved secret storage |
| `AUTH_MICROSOFT_ENTRA_ID_ISSUER`, `ALLOWED_TENANT_ID` | **Missing** | Tenant-specific issuer (`https://login.microsoftonline.com/<tenant>/v2.0`) and tenant id from IT. Not guessed. |
| Real login | **Not verified** | Sign in once with a member, once with a non-member (expect "Du har ikke adgang endnu"), once from another tenant (expect rejection) |
| Membership | **Missing** | Each person's verified `tid` + `oid`, added with `scripts/admin.ts add-member`; area owners set with `set-area-owner`; roles approved (member/admin is a proposal) |
| `AUTH_SECRET`, `APP_BASE_URL` | **Missing** | Generated secret; the real HTTPS base URL |
| Hosting | **Not chosen** | Proposal: container (`Dockerfile`) on an approved Azure application host. Region, network rules, cost: not decided. The Dockerfile has **not** been built (no Docker daemon in the delivery environment). |
| Database | **Not provisioned** | Managed PostgreSQL 16+, UTF-8 locale (Danish case-insensitive search depends on it), TLS, backups, PITR |
| Migrations in production | **Not run** | `npm run db:deploy` from a reviewed release |
| Restore drill | **Not done** | See `BACKUP_RESTORE.md` |
| Rate limiting (429) | **Not implemented** | Gateway or host feature |
| Idempotency receipt retention | **Proposal: 7 days** | Approve and add a scheduled cleanup |
| Privacy / lawful processing / retention | **Not established** | Organisation decision; the app stores work items, comments and an activity log without content |
| CSP `form-action` for Microsoft login | **Unverified** | Allows `https://login.microsoftonline.com`; confirm during the first real login |
| Auth.js version | **Beta** (5.0.0-beta.32) | Re-check for a stable release before go-live |

## What can be verified today without those values

- `APP_MODE` unset → setup page listing missing variables; `/api/ready` → 503; `/api/v1/*` → 503; auth endpoints → 503.
- With database and placeholder auth values → `/today` redirects to `/signin`; `/api/v1/*` → 401; `/api/ready` → 200 when the database answers.

Both were executed locally (see `TEST_REPORT.md`, "Production-mode smoke").
