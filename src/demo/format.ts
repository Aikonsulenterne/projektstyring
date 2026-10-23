// Versioned storage/backup format for demo mode and its full validation.

import { z } from 'zod';
import {
  AREA_CODES,
  MEMBER_ROLES,
  PRIORITIES,
  PROJECT_LIFECYCLES,
  PROJECT_PHASES,
  TASK_STATUSES,
  THOUGHT_TYPES,
  type Area,
  type Member,
  type Project,
  type Task,
  type Thought,
  type Workspace,
} from '@/domain/entities';
import { isValidRankKey } from '@/domain/rank';
import { dateOnly, LIMITS } from '@/domain/schemas';

export const STORAGE_KEY = 'ai-team-space-v3';
export const LEGACY_KEY = 'ai-team-space-v2';
export const FORMAT = 'teamspace-demo';
export const SCHEMA_VERSION = 3;

export interface IdempotencyReceipt {
  key: string;
  requestHash: string;
  entityType: 'task' | 'project' | 'thought' | 'conversion';
  entityId: string;
  createdAt: string;
}

export interface ImportRecord {
  importedAt: string;
  source: string;
  /** Original legacy id -> new UUID. */
  idMap: Record<string, string>;
}

export interface DemoData {
  workspace: Workspace;
  members: Member[];
  areas: Area[];
  projects: Project[];
  tasks: Task[];
  thoughts: Thought[];
  receipts: IdempotencyReceipt[];
  imports: ImportRecord[];
}

export interface DemoEnvelope {
  format: typeof FORMAT;
  schemaVersion: typeof SCHEMA_VERSION;
  revision: number;
  savedAt: string;
  data: DemoData;
}

const id = z.uuid();
const instant = z.iso.datetime({ offset: true });
const text = (max: number) => z.string().max(max);
const versioned = {
  createdAt: instant,
  updatedAt: instant,
  version: z.number().int().positive(),
  archivedAt: instant.nullable(),
};

const workspaceSchema = z.strictObject({
  id,
  name: text(LIMITS.title).min(1),
  direction: text(LIMITS.longText),
  version: z.number().int().positive(),
  updatedAt: instant,
});

const memberSchema = z.strictObject({
  id,
  displayName: text(LIMITS.title).min(1),
  role: z.enum(MEMBER_ROLES),
  active: z.boolean(),
});

const areaSchema = z.strictObject({
  id,
  code: z.enum(AREA_CODES),
  label: text(LIMITS.title).min(1),
  ownerUserId: id.nullable(),
});

const projectSchema = z.strictObject({
  id,
  title: text(LIMITS.title).min(1),
  emoji: text(LIMITS.emoji).nullable(),
  phase: z.enum(PROJECT_PHASES),
  lifecycle: z.enum(PROJECT_LIFECYCLES),
  ownerUserId: id.nullable(),
  why: text(LIMITS.longText),
  goal: text(LIMITS.longText),
  nextStep: text(LIMITS.longText),
  learning: text(LIMITS.longText),
  isExample: z.boolean(),
  ...versioned,
});

const taskSchema = z.strictObject({
  id,
  title: text(LIMITS.title).min(1),
  description: text(LIMITS.longText),
  projectId: id.nullable(),
  areaId: id.nullable(),
  assigneeId: id.nullable(),
  status: z.enum(TASK_STATUSES),
  priority: z.enum(PRIORITIES),
  dueDate: dateOnly.nullable(),
  sortKey: z.string().max(200).refine(isValidRankKey, 'Ugyldig sorteringsnøgle.'),
  isExample: z.boolean(),
  checklist: z
    .array(
      z.strictObject({
        id,
        text: text(LIMITS.title).min(1),
        done: z.boolean(),
        position: z.number().int().nonnegative(),
      }),
    )
    .max(LIMITS.checklistItems),
  comments: z.array(
    z.strictObject({ id, body: text(LIMITS.longText).min(1), authorUserId: id, createdAt: instant }),
  ),
  ...versioned,
});

const thoughtSchema = z.strictObject({
  id,
  body: text(LIMITS.longText).min(1),
  type: z.enum(THOUGHT_TYPES),
  projectId: id.nullable(),
  areaId: id.nullable(),
  authorUserId: id,
  convertedProjectId: id.nullable(),
  isExample: z.boolean(),
  ...versioned,
});

const collection = <T extends z.ZodType>(schema: T) => z.array(schema).max(LIMITS.recordsPerCollection);

export const demoDataSchema = z.strictObject({
  workspace: workspaceSchema,
  members: collection(memberSchema).min(1),
  areas: collection(areaSchema),
  projects: collection(projectSchema),
  tasks: collection(taskSchema),
  thoughts: collection(thoughtSchema),
  receipts: z
    .array(
      z.strictObject({
        key: z.string().min(1).max(200),
        requestHash: z.string().max(200),
        entityType: z.enum(['task', 'project', 'thought', 'conversion']),
        entityId: id,
        createdAt: instant,
      }),
    )
    .max(1000),
  imports: z
    .array(z.strictObject({ importedAt: instant, source: z.string().max(200), idMap: z.record(z.string(), id) }))
    .max(100),
});

export const envelopeSchema = z.strictObject({
  format: z.literal(FORMAT),
  schemaVersion: z.literal(SCHEMA_VERSION),
  revision: z.number().int().nonnegative(),
  savedAt: instant,
  data: demoDataSchema,
});

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

function describeZodIssues(error: z.ZodError): string[] {
  return error.issues.slice(0, 20).map((issue) => `${issue.path.join('.') || '(rod)'}: ${issue.message}`);
}

/** Referential integrity: no duplicate ids and no dangling references. */
export function checkIntegrity(data: DemoData): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  const unique = (kind: string, ids: string[]) => {
    for (const value of ids) {
      if (seen.has(value)) errors.push(`Dublet-id i ${kind}: ${value}`);
      seen.add(value);
    }
  };
  unique('medlemmer', data.members.map((m) => m.id));
  unique('områder', data.areas.map((a) => a.id));
  unique('projekter', data.projects.map((p) => p.id));
  unique('opgaver', data.tasks.map((t) => t.id));
  unique('tanker', data.thoughts.map((t) => t.id));
  unique('delopgaver', data.tasks.flatMap((t) => t.checklist.map((c) => c.id)));
  unique('kommentarer', data.tasks.flatMap((t) => t.comments.map((c) => c.id)));

  const codes = new Set<string>();
  for (const area of data.areas) {
    if (codes.has(area.code)) errors.push(`Område findes to gange: ${area.code}`);
    codes.add(area.code);
  }

  const members = new Set(data.members.map((m) => m.id));
  const areas = new Set(data.areas.map((a) => a.id));
  const projects = new Set(data.projects.map((p) => p.id));
  const ref = (ok: boolean, message: string) => {
    if (!ok) errors.push(message);
  };
  for (const area of data.areas) ref(!area.ownerUserId || members.has(area.ownerUserId), `Område ${area.code} peger på ukendt ejer.`);
  for (const p of data.projects) ref(!p.ownerUserId || members.has(p.ownerUserId), `Projekt "${p.title}" peger på ukendt ejer.`);
  for (const t of data.tasks) {
    ref(!t.projectId || projects.has(t.projectId), `Opgave "${t.title}" peger på ukendt projekt.`);
    ref(!t.areaId || areas.has(t.areaId), `Opgave "${t.title}" peger på ukendt område.`);
    ref(!t.assigneeId || members.has(t.assigneeId), `Opgave "${t.title}" peger på ukendt person.`);
    for (const c of t.comments) ref(members.has(c.authorUserId), `Kommentar på "${t.title}" har ukendt forfatter.`);
  }
  for (const n of data.thoughts) {
    ref(members.has(n.authorUserId), 'En tanke har ukendt forfatter.');
    ref(!n.projectId || projects.has(n.projectId), 'En tanke peger på ukendt projekt.');
    ref(!n.areaId || areas.has(n.areaId), 'En tanke peger på ukendt område.');
    ref(!n.convertedProjectId || projects.has(n.convertedProjectId), 'En tanke peger på ukendt projekt.');
  }
  return errors.slice(0, 50);
}

export function validateEnvelope(raw: unknown): ValidationResult<DemoEnvelope> {
  const parsed = envelopeSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: describeZodIssues(parsed.error) };
  const envelope = parsed.data as DemoEnvelope;
  const integrity = checkIntegrity(envelope.data);
  if (integrity.length > 0) return { ok: false, errors: integrity };
  return { ok: true, value: envelope };
}

export function validateData(raw: unknown): ValidationResult<DemoData> {
  const parsed = demoDataSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: describeZodIssues(parsed.error) };
  const data = parsed.data as DemoData;
  const integrity = checkIntegrity(data);
  if (integrity.length > 0) return { ok: false, errors: integrity };
  return { ok: true, value: data };
}

export function makeEnvelope(data: DemoData, revision: number, now: string): DemoEnvelope {
  return { format: FORMAT, schemaVersion: SCHEMA_VERSION, revision, savedAt: now, data };
}
