// Pure draft model for the task editor. Kept separate from React so the
// "pending input is saved exactly once" and dirty-state rules are unit tested.

import type { Id, Priority, Task, TaskStatus } from '@/domain/entities';
import type { CreateTaskInput, TaskPatchInput } from '@/domain/schemas';

export interface DraftChecklistItem {
  /** Existing item id, or null for an item added in this draft. */
  id: Id | null;
  key: string;
  text: string;
  done: boolean;
}

export interface TaskDraft {
  title: string;
  description: string;
  projectId: string;
  areaId: string;
  assigneeId: string;
  status: TaskStatus;
  priority: Priority;
  dueDate: string;
  checklist: DraftChecklistItem[];
  /** Text typed in "Ny delopgave" but not yet added. Saved anyway. */
  pendingChecklist: string;
  /** Comments added with Tilføj in this draft, not yet persisted. */
  newComments: Array<{ clientMutationId: string; body: string }>;
  /** Text typed in the comment field but not yet added. Saved anyway. */
  pendingComment: string;
  /** Stable mutation id for the pending comment so retries cannot duplicate it. */
  pendingCommentId: string;
}

export interface NewTaskDefaults {
  projectId?: Id | null;
  areaId?: Id | null;
  assigneeId?: Id | null;
  status?: TaskStatus;
  title?: string;
}

export function emptyDraft(currentUserId: Id, defaults: NewTaskDefaults, newId: () => string): TaskDraft {
  return {
    title: defaults.title ?? '',
    description: '',
    projectId: defaults.projectId ?? '',
    areaId: defaults.areaId ?? '',
    // Assignee defaults to the current user; the area owner is never assumed.
    assigneeId: defaults.assigneeId === undefined ? currentUserId : (defaults.assigneeId ?? ''),
    status: defaults.status ?? 'open',
    priority: 'normal',
    dueDate: '',
    checklist: [],
    pendingChecklist: '',
    newComments: [],
    pendingComment: '',
    pendingCommentId: newId(),
  };
}

export function draftFromTask(task: Task, newId: () => string): TaskDraft {
  return {
    title: task.title,
    description: task.description,
    projectId: task.projectId ?? '',
    areaId: task.areaId ?? '',
    assigneeId: task.assigneeId ?? '',
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate ?? '',
    checklist: [...task.checklist]
      .sort((a, b) => a.position - b.position)
      .map((item) => ({ id: item.id, key: item.id, text: item.text, done: item.done })),
    pendingChecklist: '',
    newComments: [],
    pendingComment: '',
    pendingCommentId: newId(),
  };
}

const SCALARS = ['title', 'description', 'projectId', 'areaId', 'assigneeId', 'status', 'priority', 'dueDate'] as const;

function sameChecklist(a: DraftChecklistItem[], b: DraftChecklistItem[]): boolean {
  return a.length === b.length && a.every((item, i) => item.id === b[i]!.id && item.text === b[i]!.text && item.done === b[i]!.done);
}

/** Includes typed-but-not-added text, so closing never silently drops it. */
export function isDraftDirty(draft: TaskDraft, original: TaskDraft): boolean {
  if (SCALARS.some((field) => draft[field] !== original[field])) return true;
  if (!sameChecklist(draft.checklist, original.checklist)) return true;
  return draft.pendingChecklist.trim() !== '' || draft.pendingComment.trim() !== '' || draft.newComments.length > 0;
}

/** Create payload. Only the title is required; blanks become null. */
export function toCreateInput(draft: TaskDraft): CreateTaskInput {
  const checklist = draft.checklist.map((item) => ({ text: item.text, done: item.done }));
  if (draft.pendingChecklist.trim()) checklist.push({ text: draft.pendingChecklist.trim(), done: false });
  const comments = [...draft.newComments.map((c) => c.body), draft.pendingComment.trim()].filter(Boolean);
  return {
    title: draft.title,
    description: draft.description,
    projectId: draft.projectId || null,
    areaId: draft.areaId || null,
    assigneeId: draft.assigneeId || null,
    status: draft.status,
    priority: draft.priority,
    dueDate: draft.dueDate || null,
    checklist,
    pendingComment: comments.length ? comments.join('\n\n') : null,
  };
}

/** Patch with only changed fields plus checklist/comment operations. */
export function toPatch(draft: TaskDraft, original: TaskDraft, expectedVersion: number): TaskPatchInput {
  const patch: TaskPatchInput = { expectedVersion };
  const nullable = (v: string) => v || null;
  if (draft.title !== original.title) patch.title = draft.title;
  if (draft.description !== original.description) patch.description = draft.description;
  if (draft.projectId !== original.projectId) patch.projectId = nullable(draft.projectId);
  if (draft.areaId !== original.areaId) patch.areaId = nullable(draft.areaId);
  if (draft.assigneeId !== original.assigneeId) patch.assigneeId = nullable(draft.assigneeId);
  if (draft.status !== original.status) patch.status = draft.status;
  if (draft.priority !== original.priority) patch.priority = draft.priority;
  if (draft.dueDate !== original.dueDate) patch.dueDate = nullable(draft.dueDate);

  const originalById = new Map(original.checklist.filter((i) => i.id).map((i) => [i.id!, i]));
  const keptIds = new Set(draft.checklist.filter((i) => i.id).map((i) => i.id!));
  const add = draft.checklist.filter((i) => !i.id).map((i) => ({ text: i.text, done: i.done }));
  if (draft.pendingChecklist.trim()) add.push({ text: draft.pendingChecklist.trim(), done: false });
  const update = draft.checklist
    .filter((i) => i.id && originalById.has(i.id))
    .flatMap((i) => {
      const before = originalById.get(i.id!)!;
      if (before.text === i.text && before.done === i.done) return [];
      return [{ id: i.id!, ...(before.text !== i.text ? { text: i.text } : {}), ...(before.done !== i.done ? { done: i.done } : {}) }];
    });
  const remove = [...originalById.keys()].filter((id) => !keptIds.has(id));
  if (add.length || update.length || remove.length) patch.checklist = { add, update, remove };

  const newComments = [...draft.newComments];
  if (draft.pendingComment.trim()) newComments.push({ clientMutationId: draft.pendingCommentId, body: draft.pendingComment.trim() });
  if (newComments.length) patch.newComments = newComments;
  return patch;
}

/** Re-applies my changes (relative to my original) on top of a newer server version. */
export function rebaseDraft(draft: TaskDraft, original: TaskDraft, latest: TaskDraft): TaskDraft {
  const next: TaskDraft = { ...latest, pendingChecklist: draft.pendingChecklist, newComments: draft.newComments, pendingComment: draft.pendingComment, pendingCommentId: draft.pendingCommentId };
  for (const field of SCALARS) {
    if (draft[field] !== original[field]) (next as unknown as Record<string, unknown>)[field] = draft[field];
  }
  const added = draft.checklist.filter((i) => !i.id);
  next.checklist = [...latest.checklist, ...added];
  return next;
}

export function describeDraft(draft: TaskDraft): string {
  const lines = [`Navn: ${draft.title}`];
  if (draft.description) lines.push(`Beskrivelse: ${draft.description}`);
  for (const item of draft.checklist) lines.push(`[${item.done ? 'x' : ' '}] ${item.text}`);
  if (draft.pendingChecklist) lines.push(`[ ] ${draft.pendingChecklist}`);
  for (const c of draft.newComments) lines.push(`Kommentar: ${c.body}`);
  if (draft.pendingComment) lines.push(`Kommentar: ${draft.pendingComment}`);
  return lines.join('\n');
}
