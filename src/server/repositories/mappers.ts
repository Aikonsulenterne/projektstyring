// Row <-> domain mapping. Database dates become ISO strings; date-only due dates
// stay date-only (YYYY-MM-DD) with no timezone conversion.

import type {
  Area as AreaRow,
  ChecklistItem as ChecklistRow,
  Comment as CommentRow,
  Project as ProjectRow,
  Task as TaskRow,
  Thought as ThoughtRow,
  Workspace as WorkspaceRow,
} from '@/generated/prisma/client';
import type { Area, Project, Task, Thought, Workspace } from '@/domain/entities';

export const iso = (d: Date): string => d.toISOString();
export const isoOrNull = (d: Date | null): string | null => (d ? d.toISOString() : null);
export const dateOnlyToDb = (d: string | null): Date | null => (d ? new Date(`${d}T00:00:00.000Z`) : null);
export const dateOnlyFromDb = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

export function toWorkspace(row: WorkspaceRow): Workspace {
  return { id: row.id, name: row.name, direction: row.direction, version: row.version, updatedAt: iso(row.updatedAt) };
}

export function toArea(row: AreaRow): Area {
  return { id: row.id, code: row.code, label: row.label, ownerUserId: row.ownerUserId };
}

export function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    title: row.title,
    emoji: row.emoji,
    phase: row.phase,
    lifecycle: row.lifecycle,
    ownerUserId: row.ownerUserId,
    why: row.why,
    goal: row.goal,
    nextStep: row.nextStep,
    learning: row.learning,
    isExample: row.isExample,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    version: row.version,
    archivedAt: isoOrNull(row.archivedAt),
  };
}

export type TaskWithChildren = TaskRow & { checklist: ChecklistRow[]; comments: CommentRow[] };

export const TASK_INCLUDE = {
  checklist: { orderBy: [{ position: 'asc' as const }, { id: 'asc' as const }] },
  comments: { where: { archivedAt: null }, orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }] },
};

export function toTask(row: TaskWithChildren): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    projectId: row.projectId,
    areaId: row.areaId,
    assigneeId: row.assigneeUserId,
    status: row.status,
    priority: row.priority,
    dueDate: dateOnlyFromDb(row.dueDate),
    sortKey: row.sortKey,
    isExample: row.isExample,
    checklist: row.checklist.map((c) => ({ id: c.id, text: c.text, done: c.done, position: c.position })),
    comments: row.comments.map((c) => ({ id: c.id, body: c.body, authorUserId: c.authorUserId, createdAt: iso(c.createdAt) })),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    version: row.version,
    archivedAt: isoOrNull(row.archivedAt),
  };
}

export function toThought(row: ThoughtRow): Thought {
  return {
    id: row.id,
    body: row.body,
    type: row.type,
    projectId: row.projectId,
    areaId: row.areaId,
    authorUserId: row.authorUserId,
    convertedProjectId: row.convertedProjectId,
    isExample: row.isExample,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    version: row.version,
    archivedAt: isoOrNull(row.archivedAt),
  };
}
