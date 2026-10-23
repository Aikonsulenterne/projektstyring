// Stress fixtures (docs/handoff/11 "Proposed stress checks"). Seeds 1,000 tasks,
// 100 projects and 1,000 notes into an isolated workspace and measures load,
// filter and mutation behaviour. Numbers are observations on the machine it runs
// on, not performance budgets.
//
//   npx tsx scripts/stress.ts                      # demo repository only
//   DATABASE_URL=postgresql://... npx tsx scripts/stress.ts   # + PostgreSQL service
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import { DemoRepository, type StorageLike } from '../src/demo/repository';
import { DEMO_IDS } from '../src/demo/seed';
import type { Task } from '../src/domain/entities';
import { listAllTasks } from '../src/lib/repository';
import { WorkspaceService } from '../src/server/services/workspace-service';
import { scriptDb } from './prisma-client';

const COUNTS = { tasks: 1000, projects: 100, notes: 1000 };
const STATUSES = ['open', 'in_progress', 'blocked', 'done'] as const;

async function time<T>(label: string, results: Array<[string, string]>, run: () => Promise<T>): Promise<T> {
  const start = performance.now();
  const value = await run();
  results.push([label, `${(performance.now() - start).toFixed(0)} ms`]);
  return value;
}

class MemoryStorage implements StorageLike {
  map = new Map<string, string>();
  getItem = (k: string) => this.map.get(k) ?? null;
  setItem = (k: string, v: string) => void this.map.set(k, v);
  removeItem = (k: string) => void this.map.delete(k);
}

async function demo(): Promise<Array<[string, string]>> {
  const results: Array<[string, string]> = [];
  const storage = new MemoryStorage();
  const repo = new DemoRepository({ storage, currentUserId: () => DEMO_IDS.nicholas });
  repo.init();
  const projects: Array<{ id: string }> = [];
  await time(`seed ${COUNTS.projects} projects + ${COUNTS.tasks} tasks + ${COUNTS.notes} notes (one write each)`, results, async () => {
    for (let i = 0; i < COUNTS.projects; i++) projects.push(await repo.createProject({ title: `Stress-projekt ${i}` }));
    for (let i = 0; i < COUNTS.tasks; i++) {
      await repo.createTask({ title: `Stress-opgave ${i}`, projectId: i % 3 ? projects[i % projects.length]!.id : null, areaId: i % 4 ? DEMO_IDS.areaModel : null, status: STATUSES[i % 4] });
    }
    for (let i = 0; i < COUNTS.notes; i++) await repo.createThought({ body: `Stress-note ${i}` });
  });
  results.push(['stored size', `${(storage.getItem('ai-team-space-v3')!.length / 1024).toFixed(0)} KiB`]);
  await time('cold start: parse + full validation of stored data', results, async () => {
    const fresh = new DemoRepository({ storage, currentUserId: () => DEMO_IDS.nicholas });
    if (fresh.init().status !== 'ok') throw new Error('stored data did not validate');
  });
  const all = await time('load all tasks (all pages)', results, () => listAllTasks(repo, {}));
  results.push(['tasks loaded / distinct ids', `${all.items.length} / ${new Set(all.items.map((t) => t.id)).size}`]);
  await time('filtered list (area + project + search)', results, () => listAllTasks(repo, { areaId: DEMO_IDS.areaModel, projectId: projects[1]!.id, q: 'opgave 1' }));
  const target = all.items[10]!;
  await time('one mutation (full validated snapshot write)', results, () => repo.updateTask(target.id, { expectedVersion: target.version, title: 'Ændret' }));
  return results;
}

async function server(): Promise<Array<[string, string]>> {
  const results: Array<[string, string]> = [];
  const db = scriptDb();
  try {
    const workspace = await db.workspace.create({ data: { name: `Stress ${new Date().toISOString()}` } });
    const users = await Promise.all(
      ['A', 'B', 'C', 'D'].map((n) => db.user.create({ data: { tenantId: 'stress', externalSubject: randomUUID(), displayName: `Stress ${n}` } })),
    );
    for (const u of users) await db.membership.create({ data: { workspaceId: workspace.id, userId: u.id } });
    const area = await db.area.create({ data: { workspaceId: workspace.id, code: 'model', label: 'Model' } });
    const s = new WorkspaceService(db, { userId: users[0]!.id, workspaceId: workspace.id, role: 'member' });
    const projects: Array<{ id: string }> = [];
    await time(`seed ${COUNTS.projects} projects + ${COUNTS.tasks} tasks + ${COUNTS.notes} notes via service (10 parallel)`, results, async () => {
      for (let i = 0; i < COUNTS.projects; i += 10) {
        projects.push(...(await Promise.all(Array.from({ length: 10 }, (_, j) => s.createProject({ title: `Stress-projekt ${i + j}` }, randomUUID())))));
      }
      for (let i = 0; i < COUNTS.tasks; i += 10) {
        await Promise.all(
          Array.from({ length: 10 }, (_, j) => {
            const n = i + j;
            return s.createTask({ title: `Stress-opgave ${n}`, projectId: n % 3 ? projects[n % projects.length]!.id : null, areaId: n % 4 ? area.id : null, status: STATUSES[n % 4] }, randomUUID());
          }),
        );
      }
      for (let i = 0; i < COUNTS.notes; i += 10) {
        await Promise.all(Array.from({ length: 10 }, (_, j) => s.createThought({ body: `Stress-note ${i + j}` }, randomUUID())));
      }
    });
    const all = await time('load all tasks (5 pages × 200)', results, () => listAllTasks(s, {}));
    results.push(['tasks loaded / distinct ids / totalMatching', `${all.items.length} / ${new Set(all.items.map((t) => t.id)).size} / ${all.totalMatching}`]);
    await time('filtered list (area + project + search)', results, () => listAllTasks(s, { areaId: area.id, projectId: projects[1]!.id, q: 'opgave 1' }));
    const target = all.items[10] as Task;
    const outcomes = await time('10 concurrent PATCH on the same version', results, () =>
      Promise.allSettled(Array.from({ length: 10 }, (_, i) => s.updateTask(target.id, { expectedVersion: target.version, title: `Samtidig ${i}` }))),
    );
    results.push(['  → succeeded / conflicted', `${outcomes.filter((o) => o.status === 'fulfilled').length} / ${outcomes.filter((o) => o.status === 'rejected').length}`]);
    const key = randomUUID();
    await time('10 retries of one create (same idempotency key)', results, () =>
      Promise.allSettled(Array.from({ length: 10 }, () => s.createTask({ title: 'Gentaget' }, key))),
    );
    results.push(['  → tasks created', String(await db.task.count({ where: { workspaceId: workspace.id, title: 'Gentaget' } }))]);
    results.push(['stress workspace id (isolated, safe to delete)', workspace.id]);
  } finally {
    await db.$disconnect();
  }
  return results;
}

async function main() {
  const cpu = os.cpus()[0]?.model ?? 'unknown';
  console.log(`# Stress run ${new Date().toISOString()}`);
  console.log(`Hardware: ${cpu}, ${os.cpus().length} vCPU, ${(os.totalmem() / 2 ** 30).toFixed(0)} GiB RAM, Node ${process.version}\n`);
  const print = (title: string, rows: Array<[string, string]>) => {
    console.log(`## ${title}\n\n| Measurement | Result |\n|---|---|`);
    for (const [k, v] of rows) console.log(`| ${k} | ${v} |`);
    console.log('');
  };
  print('Demo repository (in-memory storage stand-in)', await demo());
  if (process.env.DATABASE_URL) print('PostgreSQL service layer (local, same machine)', await server());
  else console.log('PostgreSQL part skipped: DATABASE_URL not set.');
}

void main();
