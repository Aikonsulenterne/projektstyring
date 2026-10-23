// Local demo fixtures for a development database. Refuses to run unless the target
// is explicitly marked local, so example owners/statuses never reach production.
//
//   SEED_TARGET=local DATABASE_URL=postgresql://... npm run db:seed
import { createDemoData } from '../src/demo/seed';
import { scriptDb } from '../scripts/prisma-client';

const LOCAL_TENANT = 'local-dev';

async function main() {
  if (process.env.SEED_TARGET !== 'local') {
    console.error('Afvist: sæt SEED_TARGET=local for at indlæse eksempeldata i en lokal database.');
    process.exit(1);
  }
  const db = scriptDb();
  const demo = createDemoData();
  try {
    const exists = await db.workspace.findUnique({ where: { id: demo.workspace.id } });
    if (exists) {
      console.log('Eksempel-arbejdsrummet findes allerede. Intet ændret.');
      return;
    }
    await db.$transaction(async (tx) => {
      await tx.workspace.create({ data: { id: demo.workspace.id, name: demo.workspace.name, direction: demo.workspace.direction } });
      for (const m of demo.members) {
        // Local-only identities (tenant "local-dev"); they cannot sign in through Entra.
        await tx.user.create({ data: { id: m.id, tenantId: LOCAL_TENANT, externalSubject: m.id, displayName: m.displayName } });
        await tx.membership.create({ data: { workspaceId: demo.workspace.id, userId: m.id, role: m.role } });
      }
      for (const a of demo.areas) {
        await tx.area.create({ data: { id: a.id, workspaceId: demo.workspace.id, code: a.code, label: a.label, ownerUserId: a.ownerUserId } });
      }
      for (const p of demo.projects) {
        const { archivedAt: _a, createdAt: _c, updatedAt: _u, version: _v, ...rest } = p;
        await tx.project.create({ data: { ...rest, workspaceId: demo.workspace.id } });
      }
      for (const t of demo.tasks) {
        await tx.task.create({
          data: {
            id: t.id,
            workspaceId: demo.workspace.id,
            title: t.title,
            description: t.description,
            projectId: t.projectId,
            areaId: t.areaId,
            assigneeUserId: t.assigneeId,
            status: t.status,
            priority: t.priority,
            dueDate: t.dueDate ? new Date(`${t.dueDate}T00:00:00.000Z`) : null,
            sortKey: t.sortKey,
            isExample: true,
          },
        });
        await tx.checklistItem.createMany({
          data: t.checklist.map((c) => ({ id: c.id, workspaceId: demo.workspace.id, taskId: t.id, text: c.text, done: c.done, position: c.position })),
        });
      }
      for (const n of demo.thoughts) {
        await tx.thought.create({
          data: { id: n.id, workspaceId: demo.workspace.id, body: n.body, type: n.type, projectId: n.projectId, areaId: n.areaId, authorUserId: n.authorUserId, isExample: true },
        });
      }
    });
    console.log(`Eksempeldata indlæst i arbejdsrum ${demo.workspace.id}.`);
  } finally {
    await db.$disconnect();
  }
}

void main();
