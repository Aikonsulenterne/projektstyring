# Backup and restore

## Demo mode (browser)

Data lives only in the current browser profile. **Backup** in the sidebar:

- **Eksportér backup** downloads `teamspace-backup-<time>.json` (format `teamspace-demo`, schema 3).
- **Gendan backup** reads a file, validates all of it (schema, dates, duplicate ids, dangling references, 10 MB / 10,000 records), shows a preview, and only after **explicit confirmation** replaces the data. A copy of the current data is downloaded first. An invalid file leaves the current data untouched.
- **Start forfra med eksempeldata** replaces everything with the examples, also after downloading a copy.

If stored data cannot be read on startup, the app shows a recovery screen instead of the views and **does not write anything**: export the unreadable data, restore a valid backup, or explicitly start over. Data saved by a newer schema version is treated the same way.

Browser export is not a disaster-recovery plan.

## Production (PostgreSQL)

Not set up – this is a deployment gate:

1. Managed PostgreSQL with automated backups and point-in-time recovery; retention approved by the organisation.
2. Access to backups restricted to named operators.
3. A **restore drill** before go-live: restore to a separate database, run `npx prisma migrate status` and the read-only smoke checks (`/api/ready`, list tasks for a test membership), record the time taken.
4. Migrations are applied with `npm run db:deploy` from reviewed files in `prisma/migrations/`; never `db:migrate` against production; take a backup before each deploy.
