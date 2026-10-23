import { describe, expect, it } from 'vitest';
import type { Task } from '@/domain/entities';
import { draftFromTask, emptyDraft, isDraftDirty, rebaseDraft, toCreateInput, toPatch } from '@/components/tasks/task-draft';

let n = 0;
const newId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const ME = '11111111-1111-4111-8111-111111111111';

const task: Task = {
  id: 't1', title: 'Opgave', description: '', projectId: null, areaId: null, assigneeId: ME, status: 'open', priority: 'normal',
  dueDate: null, sortKey: 'i', isExample: false,
  checklist: [{ id: 'c1', text: 'Første', done: false, position: 0 }],
  comments: [], createdAt: '2026-10-23T10:00:00.000Z', updatedAt: '2026-10-23T10:00:00.000Z', version: 4, archivedAt: null,
};

describe('task draft', () => {
  it('starts a new task with only the current user as default: no project, no area', () => {
    const draft = emptyDraft(ME, {}, newId);
    expect(draft).toMatchObject({ projectId: '', areaId: '', assigneeId: ME, status: 'open' });
    expect(toCreateInput({ ...draft, title: 'Ny' })).toMatchObject({ title: 'Ny', projectId: null, areaId: null, assigneeId: ME, dueDate: null });
  });

  it('inherits a selected area without assigning the area owner', () => {
    const draft = emptyDraft(ME, { areaId: 'area-model' }, newId);
    expect(draft.areaId).toBe('area-model');
    expect(draft.assigneeId).toBe(ME);
  });

  it('counts typed-but-not-added text as unsaved', () => {
    const original = draftFromTask(task, newId);
    expect(isDraftDirty(original, original)).toBe(false);
    expect(isDraftDirty({ ...original, pendingComment: 'hej' }, original)).toBe(true);
    expect(isDraftDirty({ ...original, pendingChecklist: 'mere' }, original)).toBe(true);
    expect(isDraftDirty({ ...original, pendingComment: '   ' }, original)).toBe(false);
  });

  it('includes pending comment and checklist text exactly once in the patch', () => {
    const original = draftFromTask(task, newId);
    const draft = {
      ...original,
      newComments: [{ clientMutationId: newId(), body: 'Tilføjet' }],
      pendingComment: ' Skrevet, ikke tilføjet ',
      pendingChecklist: 'Ny delopgave',
    };
    const patch = toPatch(draft, original, task.version);
    expect(patch.expectedVersion).toBe(4);
    expect(patch.newComments?.map((c) => c.body)).toEqual(['Tilføjet', 'Skrevet, ikke tilføjet']);
    expect(new Set(patch.newComments?.map((c) => c.clientMutationId)).size).toBe(2);
    expect(patch.checklist?.add).toEqual([{ text: 'Ny delopgave', done: false }]);
    // Retrying the same draft produces the same mutation ids (no duplicate comments).
    expect(toPatch(draft, original, task.version).newComments).toEqual(patch.newComments);
  });

  it('sends only changed fields and maps cleared selectors to null', () => {
    const original = draftFromTask({ ...task, projectId: 'p1' }, newId);
    const patch = toPatch({ ...original, projectId: '', title: 'Nyt' }, original, 4);
    expect(patch).toEqual({ expectedVersion: 4, title: 'Nyt', projectId: null });
  });

  it('expresses checklist edits as update/remove operations', () => {
    const original = draftFromTask(task, newId);
    const toggled = toPatch({ ...original, checklist: [{ ...original.checklist[0]!, done: true }] }, original, 4);
    expect(toggled.checklist).toEqual({ add: [], update: [{ id: 'c1', done: true }], remove: [] });
    const removed = toPatch({ ...original, checklist: [] }, original, 4);
    expect(removed.checklist).toEqual({ add: [], update: [], remove: ['c1'] });
  });

  it('re-applies only my changes on top of a newer version after a conflict', () => {
    const original = draftFromTask(task, newId);
    const mine = { ...original, title: 'Min titel', pendingComment: 'Min kommentar' };
    const latest = draftFromTask({ ...task, description: 'Deres beskrivelse', status: 'blocked', version: 5 }, newId);
    const rebased = rebaseDraft(mine, original, latest);
    expect(rebased).toMatchObject({ title: 'Min titel', description: 'Deres beskrivelse', status: 'blocked', pendingComment: 'Min kommentar' });
  });
});
