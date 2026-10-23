// Membership administration for production mode. Identities are mapped by verified
// Entra tenant id + object id (oid), never by name or e-mail.
//
//   npx tsx scripts/admin.ts create-workspace --name "AI-teamet"
//   npx tsx scripts/admin.ts add-member --workspace <id> --tenant <tid> --subject <oid> --name "Sofie Ihle" [--role admin]
//   npx tsx scripts/admin.ts set-area-owner --workspace <id> --area data|model|adoption --user <userId>
//   npx tsx scripts/admin.ts deactivate-member --workspace <id> --user <userId>
//   npx tsx scripts/admin.ts list --workspace <id>
import { parseArgs } from 'node:util';
import { scriptDb } from './prisma-client';

const AREAS = [
  { code: 'data', label: 'Data' },
  { code: 'model', label: 'Model' },
  { code: 'adoption', label: 'Adoption' },
] as const;

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { values } = parseArgs({
    args: rest,
    options: {
      name: { type: 'string' },
      workspace: { type: 'string' },
      tenant: { type: 'string' },
      subject: { type: 'string' },
      role: { type: 'string' },
      area: { type: 'string' },
      user: { type: 'string' },
    },
  });
  const need = (key: keyof typeof values) => {
    const value = values[key];
    if (!value) throw new Error(`--${key} mangler`);
    return value;
  };
  const db = scriptDb();
  try {
    switch (command) {
      case 'create-workspace': {
        const ws = await db.workspace.create({
          data: { name: need('name'), areas: { create: AREAS.map((a) => ({ code: a.code, label: a.label })) } },
        });
        console.log(`Arbejdsrum oprettet: ${ws.id}`);
        break;
      }
      case 'add-member': {
        const role = values.role === 'admin' ? 'admin' : 'member';
        const user = await db.user.upsert({
          where: { tenantId_externalSubject: { tenantId: need('tenant'), externalSubject: need('subject') } },
          create: { tenantId: need('tenant'), externalSubject: need('subject'), displayName: need('name') },
          update: { displayName: need('name') },
        });
        await db.membership.upsert({
          where: { workspaceId_userId: { workspaceId: need('workspace'), userId: user.id } },
          create: { workspaceId: need('workspace'), userId: user.id, role },
          update: { role, active: true },
        });
        console.log(`Medlem: ${user.displayName} (${user.id}) som ${role}`);
        break;
      }
      case 'set-area-owner': {
        const code = need('area');
        if (!AREAS.some((a) => a.code === code)) throw new Error('--area skal være data, model eller adoption');
        await db.area.update({
          where: { workspaceId_code: { workspaceId: need('workspace'), code: code as 'data' | 'model' | 'adoption' } },
          data: { ownerUserId: need('user') },
        });
        console.log(`Område ${code} ejes nu af ${need('user')}. Eksisterende opgaver er ikke flyttet.`);
        break;
      }
      case 'deactivate-member': {
        await db.membership.update({
          where: { workspaceId_userId: { workspaceId: need('workspace'), userId: need('user') } },
          data: { active: false },
        });
        console.log('Medlemmet er deaktiveret. Historik og forfatterskab er bevaret.');
        break;
      }
      case 'list': {
        const members = await db.membership.findMany({ where: { workspaceId: need('workspace') }, include: { user: true } });
        for (const m of members) console.log(`${m.user.id}\t${m.role}\t${m.active ? 'aktiv' : 'inaktiv'}\t${m.user.displayName}`);
        break;
      }
      default:
        console.error('Ukendt kommando. Se kommentaren øverst i scripts/admin.ts.');
        process.exitCode = 2;
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
