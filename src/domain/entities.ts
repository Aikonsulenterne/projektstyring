// Canonical domain types shared by the UI, the demo repository and the server.
// Database enums use stable English identifiers; Danish labels live in labels.ts.

export type Id = string;

export const TASK_STATUSES = ['open', 'in_progress', 'blocked', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const PRIORITIES = ['high', 'normal', 'low'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PROJECT_PHASES = ['idea', 'explore', 'experiment', 'prove_value', 'pilot', 'scale'] as const;
export type ProjectPhase = (typeof PROJECT_PHASES)[number];

export const PROJECT_LIFECYCLES = ['active', 'paused', 'completed'] as const;
export type ProjectLifecycle = (typeof PROJECT_LIFECYCLES)[number];

export const THOUGHT_TYPES = ['idea', 'observation', 'learning', 'decision', 'todo'] as const;
export type ThoughtType = (typeof THOUGHT_TYPES)[number];

export const AREA_CODES = ['data', 'model', 'adoption'] as const;
export type AreaCode = (typeof AREA_CODES)[number];

export const MEMBER_ROLES = ['member', 'admin'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

/** Explicit sentinel for "no association" in filters. Never a display string. */
export const NONE = 'none' as const;
export type FilterValue = Id | typeof NONE;

interface Versioned {
  createdAt: string;
  updatedAt: string;
  version: number;
  archivedAt: string | null;
}

export interface Member {
  id: Id;
  displayName: string;
  role: MemberRole;
  active: boolean;
}

export interface Area {
  id: Id;
  code: AreaCode;
  label: string;
  ownerUserId: Id | null;
}

export interface Workspace {
  id: Id;
  name: string;
  direction: string;
  version: number;
  updatedAt: string;
}

export interface Project extends Versioned {
  id: Id;
  title: string;
  emoji: string | null;
  phase: ProjectPhase;
  lifecycle: ProjectLifecycle;
  ownerUserId: Id | null;
  why: string;
  goal: string;
  nextStep: string;
  learning: string;
  isExample: boolean;
}

export interface ChecklistItem {
  id: Id;
  text: string;
  done: boolean;
  position: number;
}

export interface Comment {
  id: Id;
  body: string;
  authorUserId: Id;
  createdAt: string;
}

export interface Task extends Versioned {
  id: Id;
  title: string;
  description: string;
  projectId: Id | null;
  areaId: Id | null;
  assigneeId: Id | null;
  status: TaskStatus;
  priority: Priority;
  /** Date-only value, YYYY-MM-DD. */
  dueDate: string | null;
  sortKey: string;
  isExample: boolean;
  checklist: ChecklistItem[];
  comments: Comment[];
}

export interface Thought extends Versioned {
  id: Id;
  body: string;
  type: ThoughtType;
  projectId: Id | null;
  areaId: Id | null;
  authorUserId: Id;
  convertedProjectId: Id | null;
  isExample: boolean;
}

/** Workspace-level context every view needs. */
export interface WorkspaceContext {
  workspace: Workspace;
  members: Member[];
  areas: Area[];
  currentUserId: Id;
}

export interface TaskQuery {
  areaId?: FilterValue;
  assigneeId?: FilterValue;
  projectId?: FilterValue;
  q?: string;
  status?: TaskStatus[];
  includeArchived?: boolean;
  archivedOnly?: boolean;
}

export interface TaskPage {
  items: Task[];
  totalMatching: number;
  nextCursor: string | null;
  serverTime: string;
}

export interface ThoughtQuery {
  type?: ThoughtType;
  projectId?: FilterValue;
  areaId?: FilterValue;
  q?: string;
  includeArchived?: boolean;
  archivedOnly?: boolean;
}

export interface ProjectQuery {
  includeArchived?: boolean;
  archivedOnly?: boolean;
}
