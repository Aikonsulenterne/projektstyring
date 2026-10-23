// Demo-mode persistence in browser storage. Explicitly NOT a shared datastore.
//
// Safety rules (see docs/handoff/09 and 10):
// - Load returns an explicit state; corrupt or unsupported data is never overwritten.
// - Every write re-reads storage first and applies the operation to the latest
//   snapshot, so another tab's unrelated changes are kept and same-record edits
//   conflict on the record version instead of being silently overwritten.
// - A failed write leaves storage and the in-memory cache untouched.

import type { Id, Project, ProjectQuery, Task, TaskQuery, Thought, ThoughtQuery } from '@/domain/entities';
import { DomainError, MESSAGES } from '@/domain/errors';
import type {
  ConvertThoughtInput,
  CreateProjectInput,
  CreateTaskInput,
  CreateThoughtInput,
  DirectionInput,
  MoveTaskInput,
  ProjectPatchInput,
  TaskPatchInput,
  ThoughtPatchInput,
} from '@/domain/schemas';
import type { MutationOptions, PageRequest, WorkspaceRepository } from '@/lib/repository';
import { DemoEngine } from './engine';
import {
  FORMAT,
  LEGACY_KEY,
  makeEnvelope,
  SCHEMA_VERSION,
  STORAGE_KEY,
  validateEnvelope,
  type DemoData,
  type DemoEnvelope,
} from './format';
import { createDemoData } from './seed';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type LoadState =
  | { status: 'ok'; seeded: boolean }
  | { status: 'corrupt'; errors: string[] }
  | { status: 'unsupported'; schemaVersion: unknown }
  | { status: 'unavailable' };

export interface DemoRepositoryOptions {
  storage: StorageLike | null;
  now?: () => Date;
  newId?: () => Id;
  currentUserId: () => Id | null;
}

type Snapshot = { revision: number; data: DemoData };

const clone = <T>(value: T): T => structuredClone(value);

export class DemoRepository implements WorkspaceRepository {
  readonly mode = 'demo' as const;
  private state: LoadState = { status: 'unavailable' };
  private cacheRaw: string | null = null;
  private cache: Snapshot | null = null;
  private readonly now: () => Date;
  private readonly newId: () => Id;

  constructor(private readonly options: DemoRepositoryOptions) {
    this.now = options.now ?? (() => new Date());
    this.newId = options.newId ?? (() => crypto.randomUUID());
  }

  get loadState(): LoadState {
    return this.state;
  }

  /** Reads storage once at startup. Seeds only when the key is truly empty. */
  init(): LoadState {
    const storage = this.options.storage;
    if (!storage) {
      this.state = { status: 'unavailable' };
      this.cache = { revision: 0, data: createDemoData(this.now()) };
      return this.state;
    }
    let raw: string | null;
    try {
      raw = storage.getItem(STORAGE_KEY);
    } catch {
      this.state = { status: 'unavailable' };
      this.cache = { revision: 0, data: createDemoData(this.now()) };
      return this.state;
    }
    if (raw === null) {
      const envelope = makeEnvelope(createDemoData(this.now()), 1, this.now().toISOString());
      try {
        this.writeRaw(JSON.stringify(envelope), envelope);
        this.state = { status: 'ok', seeded: true };
      } catch {
        this.state = { status: 'unavailable' };
        this.cache = { revision: 0, data: envelope.data };
      }
      return this.state;
    }
    this.state = this.parse(raw);
    return this.state;
  }

  private parse(raw: string): LoadState {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      this.cache = null;
      return { status: 'corrupt', errors: ['Data er ikke gyldig JSON.'] };
    }
    const head = json as Partial<DemoEnvelope> | null;
    if (head && head.format === FORMAT && typeof head.schemaVersion === 'number' && head.schemaVersion > SCHEMA_VERSION) {
      this.cache = null;
      return { status: 'unsupported', schemaVersion: head.schemaVersion };
    }
    const result = validateEnvelope(json);
    if (!result.ok) {
      this.cache = null;
      return { status: 'corrupt', errors: result.errors };
    }
    this.cacheRaw = raw;
    this.cache = { revision: result.value.revision, data: result.value.data };
    return { status: 'ok', seeded: false };
  }

  private assertWritable(): void {
    if (this.state.status === 'corrupt' || this.state.status === 'unsupported') {
      throw new DomainError('STORAGE_CORRUPT', MESSAGES.storageCorrupt);
    }
  }

  /** Latest persisted snapshot (re-read so other tabs' writes are seen). */
  private latest(): Snapshot {
    this.assertWritable();
    const storage = this.options.storage;
    if (this.state.status === 'unavailable' || !storage) return this.cache!;
    let raw: string | null;
    try {
      raw = storage.getItem(STORAGE_KEY);
    } catch {
      throw new DomainError('STORAGE_UNAVAILABLE', MESSAGES.storageUnavailable);
    }
    if (raw === null) {
      // Removed by another tab or the user. Do not resurrect silently.
      this.state = { status: 'corrupt', errors: ['Gemte data er forsvundet fra browseren.'] };
      throw new DomainError('STORAGE_CORRUPT', MESSAGES.storageCorrupt);
    }
    if (raw !== this.cacheRaw) {
      const parsed = this.parse(raw);
      if (parsed.status !== 'ok') {
        this.state = parsed;
        throw new DomainError('STORAGE_CORRUPT', MESSAGES.storageCorrupt);
      }
    }
    return this.cache!;
  }

  private writeRaw(raw: string, envelope: DemoEnvelope): void {
    this.options.storage!.setItem(STORAGE_KEY, raw);
    this.cacheRaw = raw;
    this.cache = { revision: envelope.revision, data: envelope.data };
  }

  private engine(data: DemoData): DemoEngine {
    return new DemoEngine(data, {
      actorId: this.actorId(data),
      now: this.now().toISOString(),
      newId: this.newId,
    });
  }

  private actorId(data: DemoData): Id {
    const selected = this.options.currentUserId();
    const member = data.members.find((m) => m.id === selected && m.active) ?? data.members.find((m) => m.active);
    if (!member) throw new DomainError('FORBIDDEN', 'Der er ingen aktive medlemmer i arbejdsrummet.');
    return member.id;
  }

  private read<T>(op: (engine: DemoEngine) => T): Promise<T> {
    try {
      const snapshot = this.latest();
      return Promise.resolve(clone(op(this.engine(snapshot.data))));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  private mutate<T>(op: (engine: DemoEngine) => T): Promise<T> {
    try {
      const snapshot = this.latest();
      const draft = clone(snapshot.data);
      const result = op(this.engine(draft));
      const envelope = makeEnvelope(draft, snapshot.revision + 1, this.now().toISOString());
      if (this.state.status === 'unavailable' || !this.options.storage) {
        this.cache = { revision: envelope.revision, data: draft };
      } else {
        try {
          this.writeRaw(JSON.stringify(envelope), envelope);
        } catch {
          throw new DomainError('STORAGE_UNAVAILABLE', MESSAGES.saveFailed);
        }
      }
      return Promise.resolve(clone(result));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  // ---- backup / recovery ----------------------------------------------------

  /** Current data as a backup file body. */
  exportBackup(): string {
    const snapshot = this.latest();
    return JSON.stringify(makeEnvelope(snapshot.data, snapshot.revision, this.now().toISOString()), null, 2);
  }

  /** Raw stored text, even when it could not be read. Used for recovery export. */
  exportRaw(): string | null {
    try {
      return this.options.storage?.getItem(STORAGE_KEY) ?? null;
    } catch {
      return null;
    }
  }

  legacyRaw(): string | null {
    try {
      return this.options.storage?.getItem(LEGACY_KEY) ?? null;
    } catch {
      return null;
    }
  }

  /** Replaces all data after explicit user confirmation. Data must be pre-validated. */
  restore(data: DemoData): void {
    const previous = this.cache?.revision ?? 0;
    const envelope = makeEnvelope(clone(data), previous + 1, this.now().toISOString());
    const check = validateEnvelope(envelope);
    if (!check.ok) throw new DomainError('VALIDATION', check.errors[0] ?? 'Ugyldig backup.');
    if (this.state.status === 'unavailable' || !this.options.storage) {
      this.cache = { revision: envelope.revision, data: envelope.data };
      return;
    }
    try {
      this.writeRaw(JSON.stringify(envelope), envelope);
    } catch {
      throw new DomainError('STORAGE_UNAVAILABLE', MESSAGES.saveFailed);
    }
    this.state = { status: 'ok', seeded: false };
  }

  resetToExamples(): void {
    this.restore(createDemoData(this.now()));
  }

  /** Calls `onChange` when another tab writes the demo key. */
  subscribe(onChange: () => void): () => void {
    if (typeof window === 'undefined') return () => {};
    const handler = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) onChange();
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }

  // ---- WorkspaceRepository ----------------------------------------------------

  getContext() {
    return this.read((e) => e.context(this.actorId(e.data)));
  }
  updateDirection(input: DirectionInput) {
    return this.mutate((e) => e.updateDirection(input));
  }

  listTasks(query: TaskQuery, page?: PageRequest) {
    return this.read((e) => e.listTasks(query, page));
  }
  getTask(id: Id) {
    return this.read((e) => e.getTask(id));
  }
  createTask(input: CreateTaskInput, options?: MutationOptions) {
    return this.mutate((e) => e.createTask(input, options?.idempotencyKey));
  }
  updateTask(id: Id, patch: TaskPatchInput, options?: MutationOptions) {
    return this.mutate((e) => e.updateTask(id, patch, options?.idempotencyKey));
  }
  moveTask(id: Id, input: MoveTaskInput) {
    return this.mutate((e) => e.moveTask(id, input));
  }
  archiveTask(id: Id, expectedVersion: number): Promise<Task> {
    return this.mutate((e) => e.setTaskArchived(id, true, expectedVersion));
  }
  restoreTask(id: Id, expectedVersion: number): Promise<Task> {
    return this.mutate((e) => e.setTaskArchived(id, false, expectedVersion));
  }

  listProjects(query: ProjectQuery = {}) {
    return this.read((e) => e.listProjects(query));
  }
  getProject(id: Id) {
    return this.read((e) => e.getProject(id));
  }
  createProject(input: CreateProjectInput, options?: MutationOptions) {
    return this.mutate((e) => e.createProject(input, options?.idempotencyKey));
  }
  updateProject(id: Id, patch: ProjectPatchInput) {
    return this.mutate((e) => e.updateProject(id, patch));
  }
  archiveProject(id: Id, expectedVersion: number): Promise<Project> {
    return this.mutate((e) => e.setProjectArchived(id, true, expectedVersion));
  }
  restoreProject(id: Id, expectedVersion: number): Promise<Project> {
    return this.mutate((e) => e.setProjectArchived(id, false, expectedVersion));
  }

  listThoughts(query: ThoughtQuery, page?: PageRequest) {
    return this.read((e) => e.listThoughts(query, page));
  }
  createThought(input: CreateThoughtInput, options?: MutationOptions) {
    return this.mutate((e) => e.createThought(input, options?.idempotencyKey));
  }
  updateThought(id: Id, patch: ThoughtPatchInput) {
    return this.mutate((e) => e.updateThought(id, patch));
  }
  archiveThought(id: Id, expectedVersion: number): Promise<Thought> {
    return this.mutate((e) => e.setThoughtArchived(id, true, expectedVersion));
  }
  restoreThought(id: Id, expectedVersion: number): Promise<Thought> {
    return this.mutate((e) => e.setThoughtArchived(id, false, expectedVersion));
  }
  convertThought(id: Id, input: ConvertThoughtInput, options?: MutationOptions) {
    return this.mutate((e) => e.convertThought(id, input, options?.idempotencyKey));
  }
}
