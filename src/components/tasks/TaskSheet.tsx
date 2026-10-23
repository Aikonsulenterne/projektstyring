'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  PRIORITIES,
  TASK_STATUSES,
  type Area,
  type Member,
  type Project,
  type Task,
  type WorkspaceContext,
} from '@/domain/entities';
import { isDomainError, MESSAGES } from '@/domain/errors';
import { formatInstant, PRIORITY_LABEL, STATUS_LABEL } from '@/domain/labels';
import type { TaskPatchInput } from '@/domain/schemas';
import { usePanel } from '@/components/shell/PanelContext';
import { useRepo } from '@/components/shell/WorkspaceProvider';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toasts';
import { Button, controlClass, cx, FieldError, FieldLabel } from '@/components/ui/primitives';
import { errorMessage, queryKeys, useMutationRunner, useProjects, useTask, useWorkspaceContext } from '@/lib/queries';
import {
  describeDraft,
  draftFromTask,
  emptyDraft,
  isDraftDirty,
  rebaseDraft,
  toCreateInput,
  toPatch,
  type TaskDraft,
} from './task-draft';

const newId = () => crypto.randomUUID();
const DRAFT_PREFIX = 'teamspace-draft:';

function readStoredDraft(key: string): TaskDraft | null {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_PREFIX + key);
    return raw ? (JSON.parse(raw) as TaskDraft) : null;
  } catch {
    return null;
  }
}

function storeDraft(key: string, draft: TaskDraft | null): void {
  try {
    if (draft) window.sessionStorage.setItem(DRAFT_PREFIX + key, JSON.stringify(draft));
    else window.sessionStorage.removeItem(DRAFT_PREFIX + key);
  } catch {
    // A draft copy is a convenience; the open panel still holds the text.
  }
}

/** Mounted by the shell; opens when the URL carries ?task=<id|new>. */
export function TaskSheetHost() {
  const { taskParam } = usePanel();
  const context = useWorkspaceContext();
  if (!taskParam || !context.data) return null;
  return <TaskSheet key={taskParam} taskParam={taskParam} context={context.data} />;
}

function TaskSheet({ taskParam, context }: { taskParam: string; context: WorkspaceContext }) {
  const isNew = taskParam === 'new';
  const { closeTask } = usePanel();
  const taskQuery = useTask(isNew ? null : taskParam);

  if (!isNew && taskQuery.isPending) {
    return (
      <Sheet open title="Opgave" isDirty={() => false} onSave={async () => true} onClose={closeTask} footer={null}>
        <p className="text-muted" aria-busy="true">
          Henter opgaven…
        </p>
      </Sheet>
    );
  }
  if (!isNew && (taskQuery.isError || !taskQuery.data)) {
    return (
      <Sheet
        open
        title="Opgaven kunne ikke åbnes"
        isDirty={() => false}
        onSave={async () => true}
        onClose={closeTask}
        footer={<Button onClick={closeTask}>Luk</Button>}
      >
        <p role="alert">{errorMessage(taskQuery.error) || MESSAGES.notFound}</p>
      </Sheet>
    );
  }
  return <TaskEditor task={isNew ? null : taskQuery.data!} context={context} />;
}

function TaskEditor({ task, context }: { task: Task | null; context: WorkspaceContext }) {
  const repo = useRepo();
  const queryClient = useQueryClient();
  const run = useMutationRunner();
  const toast = useToast();
  const { closeTask, newTaskDefaults, registerEditor } = usePanel();
  const projectsQuery = useProjects({ includeArchived: true });
  const storageKey = task ? task.id : 'new';

  const [original, setOriginal] = useState<TaskDraft>(() =>
    task ? draftFromTask(task, newId) : emptyDraft(context.currentUserId, newTaskDefaults, newId),
  );
  const [draft, setDraftState] = useState<TaskDraft>(original);
  const [version, setVersion] = useState(task?.version ?? 0);
  const [archived, setArchived] = useState(task?.archivedAt != null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState<Task | null>(null);
  const [showDetails, setShowDetails] = useState(task !== null);
  const [recovered, setRecovered] = useState<TaskDraft | null>(null);
  const idempotencyKey = useRef(newId());
  const titleRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);
  const closeRef = useRef<(() => void) | null>(null);

  const setDraft = useCallback((update: (d: TaskDraft) => TaskDraft) => {
    // A changed request needs a new idempotency key.
    idempotencyKey.current = newId();
    setDraftState(update);
  }, []);

  const dirty = isDraftDirty(draft, original);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  // Offer a draft left behind by an earlier navigation, never apply it silently.
  useEffect(() => {
    const stored = readStoredDraft(storageKey);
    if (stored && isDraftDirty(stored, original)) setRecovered(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (dirty) storeDraft(storageKey, draft);
  }, [dirty, draft, storageKey]);

  const discard = useCallback(() => {
    storeDraft(storageKey, null);
    closeTask();
  }, [storageKey, closeTask]);

  const save = useCallback(async (): Promise<boolean> => {
    if (savingRef.current) return false;
    if (!draft.title.trim()) {
      setFieldErrors({ title: 'Skriv et navn.' });
      setShowDetails((s) => s);
      titleRef.current?.focus();
      return false;
    }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      if (!task) {
        await run((r) => r.createTask(toCreateInput(draft), { idempotencyKey: idempotencyKey.current }), {
          success: 'Gemt.',
          undo: (created, r) => () => r.archiveTask(created.id, created.version),
          inlineErrors: true,
        });
      } else {
        const patch = toPatch(draft, original, version);
        const onlyScalars = !patch.checklist && !patch.newComments;
        if (Object.keys(patch).length > 1) {
          const inverse: TaskPatchInput = { expectedVersion: 0 };
          for (const key of Object.keys(patch) as Array<keyof TaskPatchInput>) {
            if (key === 'expectedVersion' || key === 'checklist' || key === 'newComments') continue;
            const before = original[key as keyof TaskDraft];
            (inverse as Record<string, unknown>)[key] = before === '' ? null : before;
          }
          await run((r) => r.updateTask(task.id, patch, { idempotencyKey: idempotencyKey.current }), {
            success: 'Gemt.',
            undo: onlyScalars ? (updated, r) => () => r.updateTask(updated.id, { ...inverse, expectedVersion: updated.version }) : undefined,
            inlineErrors: true,
          });
        }
      }
      storeDraft(storageKey, null);
      closeTask();
      return true;
    } catch (caught) {
      if (isDomainError(caught) && caught.code === 'VERSION_CONFLICT' && task) {
        try {
          const latest = await repo.getTask(task.id);
          setConflict(latest);
          queryClient.setQueryData(queryKeys.task(task.id), latest);
        } catch {
          setError(MESSAGES.taskConflict);
        }
      } else if (isDomainError(caught) && (caught.code === 'VALIDATION' || caught.code === 'INVALID_REFERENCE')) {
        setFieldErrors(caught.details.fieldErrors ?? {});
        setError(caught.message);
      } else if (isDomainError(caught) && caught.code === 'ARCHIVED') {
        setError(caught.message);
      } else {
        setError(MESSAGES.saveFailed);
      }
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [draft, original, version, task, run, repo, queryClient, storageKey, closeTask]);

  useEffect(() => {
    registerEditor({ isDirty: () => dirtyRef.current, save, discard });
    return () => registerEditor(null);
  }, [registerEditor, save, discard]);

  const resolveConflict = (mode: 'reapply' | 'discard') => {
    if (!conflict) return;
    const latestDraft = draftFromTask(conflict, newId);
    setOriginal(latestDraft);
    setVersion(conflict.version);
    setArchived(conflict.archivedAt !== null);
    setDraft(() => (mode === 'reapply' ? rebaseDraft(draft, original, latestDraft) : latestDraft));
    setConflict(null);
    setError(null);
  };

  const toggleArchive = async () => {
    if (!task) return;
    try {
      const next = await run((r) => (archived ? r.restoreTask(task.id, version) : r.archiveTask(task.id, version)), {
        success: archived ? 'Opgaven er gendannet.' : 'Opgaven er arkiveret.',
        undo: (result, r) => () => (archived ? r.archiveTask(result.id, result.version) : r.restoreTask(result.id, result.version)),
      });
      setVersion(next.version);
      setArchived(next.archivedAt !== null);
      if (next.archivedAt) {
        storeDraft(storageKey, null);
        closeTask();
      }
    } catch {
      // Toasted by the runner; the panel stays open.
    }
  };

  const projects = useMemo(() => {
    const list = projectsQuery.data ?? [];
    return list.filter((p) => p.archivedAt === null || p.id === original.projectId);
  }, [projectsQuery.data, original.projectId]);

  const ids = {
    title: useId(),
    status: useId(),
    assignee: useId(),
    project: useId(),
    area: useId(),
    description: useId(),
    due: useId(),
    priority: useId(),
    newItem: useId(),
    comment: useId(),
    details: useId(),
  };
  const disabled = archived;

  return (
    <Sheet
      open
      title={task ? 'Opgave' : 'Ny opgave'}
      description={task ? undefined : 'Kun navnet er påkrævet. Resten kan vente.'}
      isDirty={() => dirtyRef.current}
      onSave={save}
      onClose={discard}
      closeRef={closeRef}
      footer={
        <div className="flex flex-col gap-3">
          {error && !conflict ? (
            <p role="alert" className="rounded-control bg-danger px-3 py-2 text-[13px] text-on-danger">
              {error}
            </p>
          ) : null}
          {conflict ? (
            <ConflictNotice
              onReapply={() => resolveConflict('reapply')}
              onDiscard={() => resolveConflict('discard')}
              onCopy={() => {
                void navigator.clipboard
                  ?.writeText(describeDraft(draft))
                  .then(() => toast({ message: 'Din kladde er kopieret.' }))
                  .catch(() => toast({ message: 'Kunne ikke kopiere. Markér teksten manuelt.', tone: 'error' }));
              }}
            />
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={() => void save()} disabled={saving || disabled || conflict !== null} aria-describedby={disabled ? 'archived-note' : undefined}>
              {saving ? 'Gemmer…' : 'Gem'}
            </Button>
            <Button onClick={() => closeRef.current?.()}>Annuller</Button>
            {task ? (
              <Button variant="ghost" className="ml-auto" onClick={() => void toggleArchive()}>
                {archived ? 'Gendan' : 'Arkivér'}
              </Button>
            ) : null}
          </div>
        </div>
      }
    >
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        className="flex flex-col gap-5"
      >
        {recovered ? (
          <div role="status" className="rounded-control bg-warning px-3 py-3 text-[13px] text-on-warning">
            <p className="mb-2">Du har en kladde, der ikke blev gemt.</p>
            <div className="flex gap-2">
              <Button size="sm" variant="primary" onClick={() => { setDraft(() => recovered); setRecovered(null); }}>
                Gendan kladde
              </Button>
              <Button size="sm" onClick={() => { storeDraft(storageKey, null); setRecovered(null); }}>
                Kassér kladde
              </Button>
            </div>
          </div>
        ) : null}
        {archived ? (
          <p id="archived-note" className="rounded-control bg-raised px-3 py-2 text-[13px] text-muted">
            Opgaven er arkiveret. Gendan den for at redigere.
          </p>
        ) : null}

        <div>
          <FieldLabel htmlFor={ids.title}>Navn</FieldLabel>
          <input
            ref={titleRef}
            id={ids.title}
            className={controlClass}
            value={draft.title}
            autoFocus={!task}
            disabled={disabled}
            maxLength={500}
            aria-invalid={fieldErrors.title ? true : undefined}
            aria-describedby={fieldErrors.title ? `${ids.title}-error` : undefined}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            placeholder="Hvad skal gøres?"
          />
          <FieldError id={`${ids.title}-error`} message={fieldErrors.title} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor={ids.status}>Status</FieldLabel>
            <select id={ids.status} className={controlClass} value={draft.status} disabled={disabled} onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value as TaskDraft['status'] }))}>
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <MemberSelect id={ids.assignee} members={context.members} value={draft.assigneeId} disabled={disabled} error={fieldErrors.assigneeId} onChange={(v) => setDraft((d) => ({ ...d, assigneeId: v }))} />
          <ProjectSelect id={ids.project} projects={projects} value={draft.projectId} disabled={disabled} error={fieldErrors.projectId} onChange={(v) => setDraft((d) => ({ ...d, projectId: v }))} />
          <AreaSelect id={ids.area} areas={context.areas} members={context.members} value={draft.areaId} disabled={disabled} error={fieldErrors.areaId} onChange={(v) => setDraft((d) => ({ ...d, areaId: v }))} />
        </div>

        <div>
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-1 text-[14px] font-medium text-accent"
            aria-expanded={showDetails}
            aria-controls={ids.details}
            onClick={() => setShowDetails((s) => !s)}
          >
            {showDetails ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
            Detaljer
          </button>
          <div id={ids.details} hidden={!showDetails} className="mt-3 flex flex-col gap-5">
            <div>
              <FieldLabel htmlFor={ids.description}>Beskrivelse / blokering</FieldLabel>
              <textarea id={ids.description} className={cx(controlClass, 'min-h-24 py-2')} value={draft.description} disabled={disabled} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor={ids.due}>Frist (valgfrit)</FieldLabel>
                <input id={ids.due} type="date" className={controlClass} value={draft.dueDate} disabled={disabled} aria-invalid={fieldErrors.dueDate ? true : undefined} onChange={(e) => setDraft((d) => ({ ...d, dueDate: e.target.value }))} />
                <FieldError id={`${ids.due}-error`} message={fieldErrors.dueDate} />
              </div>
              <div>
                <FieldLabel htmlFor={ids.priority}>Prioritet</FieldLabel>
                <select id={ids.priority} className={controlClass} value={draft.priority} disabled={disabled} onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value as TaskDraft['priority'] }))}>
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABEL[p]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <ChecklistEditor draft={draft} setDraft={setDraft} inputId={ids.newItem} disabled={disabled} />
            <CommentsEditor task={task} draft={draft} setDraft={setDraft} inputId={ids.comment} members={context.members} disabled={disabled} />
          </div>
        </div>
        {task ? (
          <p className="text-[12px] text-muted">
            Oprettet {formatInstant(task.createdAt)} · Opdateret {formatInstant(task.updatedAt)}
          </p>
        ) : null}
      </form>
    </Sheet>
  );
}

function ConflictNotice({ onReapply, onDiscard, onCopy }: { onReapply: () => void; onDiscard: () => void; onCopy: () => void }) {
  return (
    <div role="alert" className="rounded-control bg-warning px-3 py-3 text-[13px] text-on-warning">
      <p className="mb-2 font-medium">{MESSAGES.taskConflict}</p>
      <p className="mb-3">Vælg, hvordan du vil fortsætte. Intet bliver overskrevet automatisk.</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="primary" onClick={onReapply}>
          Brug nyeste og anvend mine ændringer
        </Button>
        <Button size="sm" onClick={onCopy}>
          Kopiér min kladde
        </Button>
        <Button size="sm" variant="ghost" onClick={onDiscard}>
          Kassér min kladde
        </Button>
      </div>
    </div>
  );
}

export function MemberSelect({ id, members, value, onChange, disabled, error, label = 'Ansvarlig' }: { id: string; members: Member[]; value: string; onChange: (v: string) => void; disabled?: boolean; error?: string; label?: string }) {
  const options = members.filter((m) => m.active || m.id === value);
  return (
    <div>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <select id={id} className={controlClass} value={value} disabled={disabled} aria-invalid={error ? true : undefined} onChange={(e) => onChange(e.target.value)}>
        <option value="">Ingen ansvarlig</option>
        {options.map((m) => (
          <option key={m.id} value={m.id}>
            {m.displayName}
            {m.active ? '' : ' (inaktiv)'}
          </option>
        ))}
      </select>
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

export function ProjectSelect({ id, projects, value, onChange, disabled, error }: { id: string; projects: Project[]; value: string; onChange: (v: string) => void; disabled?: boolean; error?: string }) {
  return (
    <div>
      <FieldLabel htmlFor={id}>Projekt (valgfrit)</FieldLabel>
      <select id={id} className={controlClass} value={value} disabled={disabled} aria-invalid={error ? true : undefined} onChange={(e) => onChange(e.target.value)}>
        <option value="">Uden projekt</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
            {p.archivedAt ? ' (arkiveret)' : ''}
          </option>
        ))}
      </select>
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

export function AreaSelect({ id, areas, members, value, onChange, disabled, error }: { id: string; areas: Area[]; members: Member[]; value: string; onChange: (v: string) => void; disabled?: boolean; error?: string }) {
  const area = areas.find((a) => a.id === value);
  const owner = area?.ownerUserId ? members.find((m) => m.id === area.ownerUserId) : undefined;
  return (
    <div>
      <FieldLabel htmlFor={id}>Område (valgfrit)</FieldLabel>
      <select id={id} className={controlClass} value={value} disabled={disabled} aria-invalid={error ? true : undefined} aria-describedby={owner ? `${id}-owner` : undefined} onChange={(e) => onChange(e.target.value)}>
        <option value="">Uden område</option>
        {areas.map((a) => (
          <option key={a.id} value={a.id}>
            {a.label}
          </option>
        ))}
      </select>
      {owner ? (
        <p id={`${id}-owner`} className="mt-1 text-[12px] text-muted">
          {area!.label} holdes samlet af {owner.displayName}. Det ændrer ikke, hvem der er ansvarlig.
        </p>
      ) : null}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

function ChecklistEditor({ draft, setDraft, inputId, disabled }: { draft: TaskDraft; setDraft: (u: (d: TaskDraft) => TaskDraft) => void; inputId: string; disabled: boolean }) {
  const add = () => {
    const text = draft.pendingChecklist.trim();
    if (!text) return;
    setDraft((d) => ({ ...d, pendingChecklist: '', checklist: [...d.checklist, { id: null, key: crypto.randomUUID(), text, done: false }] }));
  };
  const done = draft.checklist.filter((i) => i.done).length;
  return (
    <fieldset>
      <legend className="mb-2 text-[12px] font-medium text-muted">
        Delopgaver {draft.checklist.length ? `(${done}/${draft.checklist.length})` : ''}
      </legend>
      <ul className="mb-2 flex flex-col gap-1">
        {draft.checklist.map((item, index) => (
          <li key={item.key} className="flex items-center gap-2">
            <input
              type="checkbox"
              className="size-5 accent-[var(--accent)]"
              checked={item.done}
              disabled={disabled}
              aria-label={`Færdig: ${item.text}`}
              onChange={(e) => setDraft((d) => ({ ...d, checklist: d.checklist.map((c, i) => (i === index ? { ...c, done: e.target.checked } : c)) }))}
            />
            <input
              className={cx(controlClass, 'min-h-9')}
              value={item.text}
              disabled={disabled}
              aria-label={`Delopgave ${index + 1}`}
              onChange={(e) => setDraft((d) => ({ ...d, checklist: d.checklist.map((c, i) => (i === index ? { ...c, text: e.target.value } : c)) }))}
            />
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              aria-label={`Fjern delopgave: ${item.text}`}
              onClick={() => setDraft((d) => ({ ...d, checklist: d.checklist.filter((_, i) => i !== index) }))}
            >
              <Trash2 size={16} aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <label htmlFor={inputId} className="sr-only">
          Ny delopgave
        </label>
        <input
          id={inputId}
          className={controlClass}
          placeholder="Ny delopgave"
          value={draft.pendingChecklist}
          disabled={disabled}
          onChange={(e) => setDraft((d) => ({ ...d, pendingChecklist: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button onClick={add} disabled={disabled || !draft.pendingChecklist.trim()}>
          Tilføj
        </Button>
      </div>
    </fieldset>
  );
}

function CommentsEditor({ task, draft, setDraft, inputId, members, disabled }: { task: Task | null; draft: TaskDraft; setDraft: (u: (d: TaskDraft) => TaskDraft) => void; inputId: string; members: Member[]; disabled: boolean }) {
  const name = (id: string) => members.find((m) => m.id === id)?.displayName ?? 'Ukendt';
  const add = () => {
    const body = draft.pendingComment.trim();
    if (!body) return;
    setDraft((d) => ({
      ...d,
      pendingComment: '',
      newComments: [...d.newComments, { clientMutationId: d.pendingCommentId, body }],
      pendingCommentId: crypto.randomUUID(),
    }));
  };
  return (
    <fieldset>
      <legend className="mb-2 text-[12px] font-medium text-muted">Kommentarer</legend>
      <ul className="mb-3 flex flex-col gap-2">
        {(task?.comments ?? []).map((c) => (
          <li key={c.id} className="rounded-control bg-surface px-3 py-2">
            <p className="text-[12px] text-muted">
              {name(c.authorUserId)} · {formatInstant(c.createdAt)}
            </p>
            {/* Rendered as text: never interpreted as HTML. */}
            <p className="whitespace-pre-wrap break-words">{c.body}</p>
          </li>
        ))}
        {draft.newComments.map((c) => (
          <li key={c.clientMutationId} className="rounded-control border border-dashed border-line px-3 py-2">
            <p className="text-[12px] text-muted">Gemmes, når du trykker Gem</p>
            <p className="whitespace-pre-wrap break-words">{c.body}</p>
          </li>
        ))}
      </ul>
      <label htmlFor={inputId} className="sr-only">
        Ny kommentar
      </label>
      <textarea
        id={inputId}
        className={cx(controlClass, 'min-h-20 py-2')}
        placeholder="Skriv en kommentar"
        value={draft.pendingComment}
        disabled={disabled}
        onChange={(e) => setDraft((d) => ({ ...d, pendingComment: e.target.value }))}
      />
      <div className="mt-2 flex justify-end">
        <Button onClick={add} disabled={disabled || !draft.pendingComment.trim()}>
          Tilføj
        </Button>
      </div>
    </fieldset>
  );
}
