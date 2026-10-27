-- Hosted Postgres providers such as Supabase expose the `public` schema through an
-- automatic REST API to anyone holding the project's public (anon) key. This app
-- never uses that API: it connects as the table owner, which bypasses row level
-- security. Enabling RLS without any policy therefore closes the REST route
-- completely while the application keeps working. On plain PostgreSQL it is a no-op
-- for the owner role.
ALTER TABLE "workspace" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "app_user" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "area" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "project" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "task" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "checklist_item" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "comment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "thought" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "activity_event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "idempotency_receipt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
