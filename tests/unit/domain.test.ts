import { describe, expect, it } from 'vitest';
import { NONE, PROJECT_PHASES, TASK_STATUSES, type Task } from '@/domain/entities';
import { DomainError } from '@/domain/errors';
import { compareRank, initialRanks, isValidRankKey, rankBetween } from '@/domain/rank';
import { applyTaskPatch, buildTask, computeMoveKey, type ReferenceLookup, type RuleContext } from '@/domain/rules';
import { createTaskSchema, parseInput, taskPatchSchema } from '@/domain/schemas';
import { compareToday, matchesTask, selectTasks, toTaskQuery, EMPTY_FILTERS } from '@/domain/selectors';

const P = '11111111-1111-4111-8111-111111111111';
const A = '22222222-2222-4222-8222-222222222222';
const U = '33333333-3333-4333-8333-333333333333';
const U2 = '44444444-4444-4444-8444-444444444444';

let counter = 0;
const ctx: RuleContext = {
  actorId: U,
  now: '2026-10-23T10:00:00.000Z',
  newId: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
};
const refs: ReferenceLookup = {
  project: (id) => (id === P ? { archived: false } : undefined),
  area: (id) => id === A,
  member: (id) => (id === U || id === U2 ? { active: true } : undefined),
};

function task(partial: Partial<Task>): Task {
  return {
    ...buildTask(parseInput(createTaskSchema, { title: partial.title ?? 'Opgave' }), ctx, []),
    ...partial,
  };
}

describe('task associations', () => {
  const combos = [null, 'set'] as const;
  for (const project of combos)
    for (const area of combos)
      for (const assignee of combos) {
        it(`accepts project=${project ?? 'null'} area=${area ?? 'null'} assignee=${assignee ?? 'null'}`, () => {
          const data = parseInput(createTaskSchema, {
            title: 'Afklar kvalitetskriterier',
            projectId: project && P,
            areaId: area && A,
            assigneeId: assignee && U2,
          });
          const built = buildTask(data, ctx, []);
          expect(built.projectId).toBe(project ? P : null);
          expect(built.areaId).toBe(area ? A : null);
          expect(built.assigneeId).toBe(assignee ? U2 : null);
        });
      }

  it('defaults an omitted assignee to the creator but keeps explicit null', () => {
    expect(buildTask(parseInput(createTaskSchema, { title: 'x' }), ctx, []).assigneeId).toBe(U);
    expect(buildTask(parseInput(createTaskSchema, { title: 'x', assigneeId: null }), ctx, []).assigneeId).toBeNull();
  });

  it('maps blank selector values to null, never empty strings', () => {
    const data = parseInput(createTaskSchema, { title: 'x', projectId: '', areaId: '', assigneeId: '', dueDate: '' });
    expect(data.projectId).toBeNull();
    expect(data.areaId).toBeNull();
    expect(data.assigneeId).toBeNull();
    expect(data.dueDate).toBeNull();
  });
});

describe('title validation', () => {
  it.each(['', '   ', '\n\t'])('rejects blank title %j', (title) => {
    expect(() => parseInput(createTaskSchema, { title })).toThrow(DomainError);
  });

  it('trims a valid title', () => {
    expect(parseInput(createTaskSchema, { title: '  Ny opgave  ' }).title).toBe('Ny opgave');
  });

  it('rejects invalid calendar dates', () => {
    expect(() => parseInput(createTaskSchema, { title: 'x', dueDate: '2026-02-30' })).toThrow(DomainError);
    expect(parseInput(createTaskSchema, { title: 'x', dueDate: '2028-02-29' }).dueDate).toBe('2028-02-29');
  });
});

describe('filters', () => {
  const tasks = [
    task({ id: 'a', title: 'Model med OKAI', projectId: P, areaId: A, assigneeId: U, sortKey: 'a' }),
    task({ id: 'b', title: 'Uden noget', projectId: null, areaId: null, assigneeId: null, sortKey: 'b' }),
    task({ id: 'c', title: 'Model alene', projectId: null, areaId: A, assigneeId: U2, sortKey: 'c' }),
    task({ id: 'd', title: 'Arkiveret', projectId: P, areaId: A, assigneeId: U, sortKey: 'd', archivedAt: ctx.now }),
  ];

  it('composes with AND and excludes archived by default', () => {
    expect(selectTasks(tasks, { areaId: A, assigneeId: U, projectId: P, q: 'okai' }).items.map((t) => t.id)).toEqual(['a']);
    expect(selectTasks(tasks, { areaId: A }).total).toBe(2);
  });

  it('distinguishes the none sentinel from all', () => {
    expect(selectTasks(tasks, { projectId: NONE }).items.map((t) => t.id)).toEqual(['b', 'c']);
    expect(selectTasks(tasks, {}).total).toBe(3);
    expect(selectTasks(tasks, { areaId: NONE, assigneeId: NONE }).items.map((t) => t.id)).toEqual(['b']);
  });

  it('searches titles case-insensitively including Danish letters', () => {
    const danish = [task({ title: 'ÆBLER og ØL på Ålborg' })];
    expect(matchesTask(danish[0]!, { q: 'æbler' })).toBe(true);
    expect(matchesTask(danish[0]!, { q: 'øl PÅ ålborg' })).toBe(true);
    expect(matchesTask(danish[0]!, { q: 'oel' })).toBe(false);
  });

  it('lets the project route scope win over a stale project filter', () => {
    const query = toTaskQuery({ ...EMPTY_FILTERS, projectId: NONE }, { projectId: P });
    expect(query.projectId).toBe(P);
  });

  it('lets an explicit assignee replace the implicit focus scope', () => {
    expect(toTaskQuery({ ...EMPTY_FILTERS, assigneeId: U2 }, { assigneeId: U }).assigneeId).toBe(U2);
    expect(toTaskQuery(EMPTY_FILTERS, { assigneeId: U }).assigneeId).toBe(U);
  });

  it('includes archived tasks only when asked', () => {
    expect(selectTasks(tasks, { archivedOnly: true }).items.map((t) => t.id)).toEqual(['d']);
    expect(selectTasks(tasks, { includeArchived: true }).total).toBe(4);
  });
});

describe('today ordering', () => {
  it('orders by due date, missing dates last, then priority, then id', () => {
    const list = [
      task({ id: 'n1', dueDate: null, priority: 'high' }),
      task({ id: 'd2', dueDate: '2026-11-02', priority: 'low' }),
      task({ id: 'd1b', dueDate: '2026-11-01', priority: 'normal' }),
      task({ id: 'd1a', dueDate: '2026-11-01', priority: 'normal' }),
      task({ id: 'd1h', dueDate: '2026-11-01', priority: 'high' }),
      task({ id: 'n0', dueDate: null, priority: 'low' }),
    ];
    expect([...list].sort(compareToday).map((t) => t.id)).toEqual(['d1h', 'd1a', 'd1b', 'd2', 'n1', 'n0']);
  });
});

describe('enums', () => {
  it('keeps project phase and task status separate', () => {
    const overlap = PROJECT_PHASES.filter((p) => (TASK_STATUSES as readonly string[]).includes(p));
    expect(overlap).toEqual([]);
  });
});

describe('task patch', () => {
  it('saves fields, checklist and pending comment in one versioned step', () => {
    const original = task({ id: 't', version: 3 });
    const patch = parseInput(taskPatchSchema, {
      expectedVersion: 3,
      title: 'Nyt navn',
      checklist: { add: [{ text: 'Delopgave' }] },
      newComments: [{ clientMutationId: '55555555-5555-4555-8555-555555555555', body: 'Kommentar' }],
    });
    const result = applyTaskPatch(original, patch, ctx, refs, () => []);
    expect(result.task.version).toBe(4);
    expect(result.task.title).toBe('Nyt navn');
    expect(result.task.checklist.map((c) => c.text)).toEqual(['Delopgave']);
    expect(result.task.comments.map((c) => c.body)).toEqual(['Kommentar']);
    expect(result.task.comments[0]!.authorUserId).toBe(U);
  });

  it('rejects a stale version without changing anything', () => {
    const original = task({ id: 't', version: 5 });
    const patch = parseInput(taskPatchSchema, { expectedVersion: 4, title: 'x' });
    expect(() => applyTaskPatch(original, patch, ctx, refs, () => [])).toThrow(expect.objectContaining({ code: 'VERSION_CONFLICT' }));
    expect(original.title).toBe('Opgave');
  });

  it('rejects associations to unknown records', () => {
    const original = task({ id: 't' });
    const patch = parseInput(taskPatchSchema, { expectedVersion: 1, projectId: '99999999-9999-4999-8999-999999999999' });
    expect(() => applyTaskPatch(original, patch, ctx, refs, () => [])).toThrow(expect.objectContaining({ code: 'INVALID_REFERENCE' }));
  });
});

describe('rank keys', () => {
  it('always produces a key strictly between neighbours', () => {
    let keys = initialRanks(5);
    for (let i = 0; i < 200; i++) {
      const at = i % (keys.length - 1);
      const key = rankBetween(keys[at]!, keys[at + 1]!);
      expect(compareRank(keys[at]!, key)).toBeLessThan(0);
      expect(compareRank(key, keys[at + 1]!)).toBeLessThan(0);
      expect(isValidRankKey(key)).toBe(true);
      keys = [...keys.slice(0, at + 1), key, ...keys.slice(at + 1)];
    }
  });

  it('keeps appended keys short', () => {
    let key: string | null = null;
    for (let i = 0; i < 1000; i++) key = rankBetween(key, null);
    expect(key!.length).toBeLessThanOrEqual(4);
  });

  it('places a moved task between visible neighbours even with hidden tasks', () => {
    const column = [task({ id: 'x', sortKey: 'b' }), task({ id: 'hidden', sortKey: 'c' }), task({ id: 'y', sortKey: 'd' })];
    const key = computeMoveKey(column, { expectedVersion: 1, status: 'open', beforeTaskId: 'x', afterTaskId: 'y' });
    expect(key > 'b' && key < 'd').toBe(true);
  });
});
