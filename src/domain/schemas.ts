import { z } from 'zod';
import {
  PRIORITIES,
  PROJECT_LIFECYCLES,
  PROJECT_PHASES,
  TASK_STATUSES,
  THOUGHT_TYPES,
} from './entities';
import { DomainError } from './errors';

export const LIMITS = {
  title: 500,
  longText: 20_000,
  emoji: 16,
  checklistItems: 200,
  backupBytes: 10 * 1024 * 1024,
  recordsPerCollection: 10_000,
  pageDefault: 50,
  pageMax: 200,
} as const;

/** Blank selector values map to null, never to an empty foreign-key string. */
const nullableId = z.preprocess(
  (v) => (v === '' ? null : v),
  z.uuid({ message: 'Ugyldigt id.' }).nullable(),
);

/** NFC so that search and comparison behave the same for text typed on any device. */
const nfc = (value: string) => value.normalize('NFC');

const title = z
  .string({ message: 'Skriv et navn.' })
  .trim()
  .min(1, 'Skriv et navn.')
  .max(LIMITS.title, `Højst ${LIMITS.title} tegn.`)
  .transform(nfc);

const longText = z.string().max(LIMITS.longText, `Højst ${LIMITS.longText} tegn.`).transform(nfc);

/** Valid calendar date in YYYY-MM-DD. */
export const dateOnly = z.iso.date({ message: 'Ugyldig dato.' });

const dueDate = z.preprocess((v) => (v === '' ? null : v), dateOnly.nullable());

const version = z.number().int().nonnegative();

export const taskStatusSchema = z.enum(TASK_STATUSES);
export const prioritySchema = z.enum(PRIORITIES);
export const phaseSchema = z.enum(PROJECT_PHASES);
export const lifecycleSchema = z.enum(PROJECT_LIFECYCLES);
export const thoughtTypeSchema = z.enum(THOUGHT_TYPES);

const checklistText = z.string().trim().min(1, 'Delopgaven mangler tekst.').max(LIMITS.title);
const commentBody = z.string().trim().min(1, 'Kommentaren er tom.').max(LIMITS.longText);

export const createTaskSchema = z.object({
  title,
  description: longText.default(''),
  projectId: nullableId.optional(),
  areaId: nullableId.optional(),
  /** Omitted = current user. Explicit null = unassigned. */
  assigneeId: nullableId.optional(),
  status: taskStatusSchema.default('open'),
  priority: prioritySchema.default('normal'),
  dueDate: dueDate.optional(),
  checklist: z
    .array(z.object({ text: checklistText, done: z.boolean().default(false) }))
    .max(LIMITS.checklistItems)
    .default([]),
  pendingComment: z
    .preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), commentBody.nullable())
    .optional(),
});
export type CreateTaskInput = z.input<typeof createTaskSchema>;
export type CreateTaskData = z.output<typeof createTaskSchema>;

export const taskPatchSchema = z.object({
  expectedVersion: version,
  title: title.optional(),
  description: longText.optional(),
  projectId: nullableId.optional(),
  areaId: nullableId.optional(),
  assigneeId: nullableId.optional(),
  status: taskStatusSchema.optional(),
  priority: prioritySchema.optional(),
  dueDate: dueDate.optional(),
  checklist: z
    .object({
      add: z.array(z.object({ text: checklistText, done: z.boolean().default(false) })).default([]),
      update: z
        .array(z.object({ id: z.uuid(), text: checklistText.optional(), done: z.boolean().optional() }))
        .default([]),
      remove: z.array(z.uuid()).default([]),
    })
    .optional(),
  newComments: z
    .array(z.object({ clientMutationId: z.uuid(), body: commentBody }))
    .max(20)
    .default([]),
});
export type TaskPatchInput = z.input<typeof taskPatchSchema>;
export type TaskPatchData = z.output<typeof taskPatchSchema>;

export const moveTaskSchema = z.object({
  expectedVersion: version,
  status: taskStatusSchema,
  /** The task that should end up directly above the moved task. */
  beforeTaskId: z.uuid().nullable().default(null),
  /** The task that should end up directly below the moved task. */
  afterTaskId: z.uuid().nullable().default(null),
});
export type MoveTaskInput = z.input<typeof moveTaskSchema>;
export type MoveTaskData = z.output<typeof moveTaskSchema>;

export const versionOnlySchema = z.object({ expectedVersion: version });
export type VersionOnly = z.output<typeof versionOnlySchema>;

const projectFields = {
  title,
  emoji: z
    .preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), z.string().trim().max(LIMITS.emoji).nullable())
    .optional(),
  phase: phaseSchema,
  lifecycle: lifecycleSchema,
  ownerUserId: nullableId,
  why: longText,
  goal: longText,
  nextStep: longText,
  learning: longText,
};

export const createProjectSchema = z.object({
  title: projectFields.title,
  emoji: projectFields.emoji,
  phase: projectFields.phase.default('idea'),
  lifecycle: projectFields.lifecycle.default('active'),
  ownerUserId: projectFields.ownerUserId.optional(),
  why: projectFields.why.default(''),
  goal: projectFields.goal.default(''),
  nextStep: projectFields.nextStep.default(''),
  learning: projectFields.learning.default(''),
});
export type CreateProjectInput = z.input<typeof createProjectSchema>;
export type CreateProjectData = z.output<typeof createProjectSchema>;

export const projectPatchSchema = z.object({
  expectedVersion: version,
  title: projectFields.title.optional(),
  emoji: projectFields.emoji,
  phase: projectFields.phase.optional(),
  lifecycle: projectFields.lifecycle.optional(),
  ownerUserId: projectFields.ownerUserId.optional(),
  why: projectFields.why.optional(),
  goal: projectFields.goal.optional(),
  nextStep: projectFields.nextStep.optional(),
  learning: projectFields.learning.optional(),
});
export type ProjectPatchInput = z.input<typeof projectPatchSchema>;
export type ProjectPatchData = z.output<typeof projectPatchSchema>;

const thoughtBody = z.string().trim().min(1, 'Skriv noget først.').max(LIMITS.longText).transform(nfc);

export const createThoughtSchema = z.object({
  body: thoughtBody,
  type: thoughtTypeSchema.default('idea'),
  projectId: nullableId.optional(),
  areaId: nullableId.optional(),
});
export type CreateThoughtInput = z.input<typeof createThoughtSchema>;
export type CreateThoughtData = z.output<typeof createThoughtSchema>;

export const thoughtPatchSchema = z.object({
  expectedVersion: version,
  body: thoughtBody.optional(),
  type: thoughtTypeSchema.optional(),
  projectId: nullableId.optional(),
  areaId: nullableId.optional(),
});
export type ThoughtPatchInput = z.input<typeof thoughtPatchSchema>;
export type ThoughtPatchData = z.output<typeof thoughtPatchSchema>;

export const convertThoughtSchema = z.object({
  expectedVersion: version,
  title,
  phase: phaseSchema.default('idea'),
});
export type ConvertThoughtInput = z.input<typeof convertThoughtSchema>;
export type ConvertThoughtData = z.output<typeof convertThoughtSchema>;

export const directionSchema = z.object({
  expectedVersion: version,
  direction: longText,
});
export type DirectionInput = z.input<typeof directionSchema>;

/** Parses input or throws a VALIDATION DomainError with Danish field errors. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    fieldErrors[key] ??= issue.message;
  }
  const first = Object.values(fieldErrors)[0] ?? 'Ugyldige data.';
  throw new DomainError('VALIDATION', first, { fieldErrors });
}

/** Default/sensible first line of a thought as project title. */
export function titleFromBody(body: string): string {
  const firstLine = body.trim().split('\n')[0]?.trim() ?? '';
  return firstLine.length > 80 ? `${firstLine.slice(0, 79)}…` : firstLine;
}
