-- CreateEnum
CREATE TYPE "ProjectPhase" AS ENUM ('idea', 'explore', 'experiment', 'prove_value', 'pilot', 'scale');

-- CreateEnum
CREATE TYPE "ProjectLifecycle" AS ENUM ('active', 'paused', 'completed');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('open', 'in_progress', 'blocked', 'done');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('high', 'normal', 'low');

-- CreateEnum
CREATE TYPE "ThoughtType" AS ENUM ('idea', 'observation', 'learning', 'decision', 'todo');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('member', 'admin');

-- CreateEnum
CREATE TYPE "AreaCode" AS ENUM ('data', 'model', 'adoption');

-- CreateTable
CREATE TABLE "workspace" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_user" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "external_subject" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership" (
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "MemberRole" NOT NULL DEFAULT 'member',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_pkey" PRIMARY KEY ("workspace_id","user_id")
);

-- CreateTable
CREATE TABLE "area" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "code" "AreaCode" NOT NULL,
    "label" TEXT NOT NULL,
    "owner_user_id" UUID,

    CONSTRAINT "area_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "emoji" TEXT,
    "phase" "ProjectPhase" NOT NULL DEFAULT 'idea',
    "lifecycle" "ProjectLifecycle" NOT NULL DEFAULT 'active',
    "owner_user_id" UUID,
    "why" TEXT NOT NULL DEFAULT '',
    "goal" TEXT NOT NULL DEFAULT '',
    "next_step" TEXT NOT NULL DEFAULT '',
    "learning" TEXT NOT NULL DEFAULT '',
    "is_example" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "project_id" UUID,
    "area_id" UUID,
    "assignee_user_id" UUID,
    "status" "TaskStatus" NOT NULL DEFAULT 'open',
    "priority" "Priority" NOT NULL DEFAULT 'normal',
    "due_date" DATE,
    "sort_key" TEXT COLLATE "C" NOT NULL,
    "is_example" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_item" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checklist_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comment" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "author_user_id" UUID NOT NULL,
    "client_mutation_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "thought" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "type" "ThoughtType" NOT NULL DEFAULT 'idea',
    "project_id" UUID,
    "area_id" UUID,
    "author_user_id" UUID NOT NULL,
    "converted_project_id" UUID,
    "is_example" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "thought_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_event" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "changed_fields" TEXT[],
    "request_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_receipt" (
    "workspace_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "idempotency_receipt_pkey" PRIMARY KEY ("workspace_id","actor_user_id","key")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_user_tenant_id_external_subject_key" ON "app_user"("tenant_id", "external_subject");

-- CreateIndex
CREATE UNIQUE INDEX "area_workspace_id_code_key" ON "area"("workspace_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "area_workspace_id_id_key" ON "area"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "project_workspace_id_archived_at_idx" ON "project"("workspace_id", "archived_at");

-- CreateIndex
CREATE UNIQUE INDEX "project_workspace_id_id_key" ON "project"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "task_workspace_id_status_archived_at_idx" ON "task"("workspace_id", "status", "archived_at");

-- CreateIndex
CREATE INDEX "task_workspace_id_project_id_status_sort_key_idx" ON "task"("workspace_id", "project_id", "status", "sort_key");

-- CreateIndex
CREATE INDEX "task_workspace_id_area_id_status_sort_key_idx" ON "task"("workspace_id", "area_id", "status", "sort_key");

-- CreateIndex
CREATE INDEX "task_workspace_id_assignee_user_id_due_date_idx" ON "task"("workspace_id", "assignee_user_id", "due_date");

-- CreateIndex
CREATE INDEX "task_workspace_id_updated_at_idx" ON "task"("workspace_id", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "task_workspace_id_id_key" ON "task"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "checklist_item_task_id_position_idx" ON "checklist_item"("task_id", "position");

-- CreateIndex
CREATE INDEX "comment_task_id_created_at_idx" ON "comment"("task_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "comment_task_id_client_mutation_id_key" ON "comment"("task_id", "client_mutation_id");

-- CreateIndex
CREATE INDEX "thought_workspace_id_created_at_idx" ON "thought"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "activity_event_workspace_id_created_at_idx" ON "activity_event"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "idempotency_receipt_expires_at_idx" ON "idempotency_receipt"("expires_at");

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "area" ADD CONSTRAINT "area_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "area" ADD CONSTRAINT "area_workspace_id_owner_user_id_fkey" FOREIGN KEY ("workspace_id", "owner_user_id") REFERENCES "membership"("workspace_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_workspace_id_owner_user_id_fkey" FOREIGN KEY ("workspace_id", "owner_user_id") REFERENCES "membership"("workspace_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_workspace_id_project_id_fkey" FOREIGN KEY ("workspace_id", "project_id") REFERENCES "project"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_workspace_id_area_id_fkey" FOREIGN KEY ("workspace_id", "area_id") REFERENCES "area"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_workspace_id_assignee_user_id_fkey" FOREIGN KEY ("workspace_id", "assignee_user_id") REFERENCES "membership"("workspace_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_item" ADD CONSTRAINT "checklist_item_workspace_id_task_id_fkey" FOREIGN KEY ("workspace_id", "task_id") REFERENCES "task"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment" ADD CONSTRAINT "comment_workspace_id_task_id_fkey" FOREIGN KEY ("workspace_id", "task_id") REFERENCES "task"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment" ADD CONSTRAINT "comment_workspace_id_author_user_id_fkey" FOREIGN KEY ("workspace_id", "author_user_id") REFERENCES "membership"("workspace_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thought" ADD CONSTRAINT "thought_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thought" ADD CONSTRAINT "thought_workspace_id_project_id_fkey" FOREIGN KEY ("workspace_id", "project_id") REFERENCES "project"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thought" ADD CONSTRAINT "thought_workspace_id_area_id_fkey" FOREIGN KEY ("workspace_id", "area_id") REFERENCES "area"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thought" ADD CONSTRAINT "thought_workspace_id_author_user_id_fkey" FOREIGN KEY ("workspace_id", "author_user_id") REFERENCES "membership"("workspace_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thought" ADD CONSTRAINT "thought_workspace_id_converted_project_id_fkey" FOREIGN KEY ("workspace_id", "converted_project_id") REFERENCES "project"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written constraints (not expressible in schema.prisma). They mirror the
-- application validation limits in src/domain/schemas.ts as a last line of defence.
ALTER TABLE "task" ADD CONSTRAINT "task_title_check" CHECK (char_length(btrim("title")) BETWEEN 1 AND 500);
ALTER TABLE "task" ADD CONSTRAINT "task_description_check" CHECK (char_length("description") <= 20000);
ALTER TABLE "task" ADD CONSTRAINT "task_sort_key_check" CHECK ("sort_key" ~ '^[0-9a-z]*[1-9a-z]$');
ALTER TABLE "project" ADD CONSTRAINT "project_title_check" CHECK (char_length(btrim("title")) BETWEEN 1 AND 500);
ALTER TABLE "project" ADD CONSTRAINT "project_text_check" CHECK (
  char_length("why") <= 20000 AND char_length("goal") <= 20000 AND char_length("next_step") <= 20000 AND char_length("learning") <= 20000
);
ALTER TABLE "thought" ADD CONSTRAINT "thought_body_check" CHECK (char_length(btrim("body")) BETWEEN 1 AND 20000);
ALTER TABLE "comment" ADD CONSTRAINT "comment_body_check" CHECK (char_length(btrim("body")) BETWEEN 1 AND 20000);
ALTER TABLE "checklist_item" ADD CONSTRAINT "checklist_item_text_check" CHECK (char_length(btrim("text")) BETWEEN 1 AND 500);
ALTER TABLE "workspace" ADD CONSTRAINT "workspace_direction_check" CHECK (char_length("direction") <= 20000);
