'use client';

import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';
import { PROJECT_LIFECYCLES, PROJECT_PHASES, type Project, type Thought, type WorkspaceContext } from '@/domain/entities';
import { isDomainError, MESSAGES } from '@/domain/errors';
import { LIFECYCLE_LABEL, PHASE_LABEL } from '@/domain/labels';
import { titleFromBody, type ProjectPatchInput } from '@/domain/schemas';
import { useShell } from '@/components/shell/ShellContext';
import { MemberSelect } from '@/components/tasks/TaskSheet';
import { Sheet } from '@/components/ui/Sheet';
import { Button, controlClass, cx, FieldError, FieldLabel } from '@/components/ui/primitives';
import { useMutationRunner } from '@/lib/queries';
import { projectHref } from '@/lib/routes';

function saveError(error: unknown): { message: string; fields: Record<string, string> } {
  if (isDomainError(error)) {
    if (error.code === 'VERSION_CONFLICT') {
      return { message: 'Den er blevet opdateret af en anden. Din tekst er bevaret – luk og åbn igen for at se den nyeste version.', fields: {} };
    }
    if (error.code === 'VALIDATION' || error.code === 'INVALID_REFERENCE') return { message: error.message, fields: error.details.fieldErrors ?? {} };
  }
  return { message: MESSAGES.saveFailed, fields: {} };
}

type ProjectDraft = Pick<Project, 'title' | 'phase' | 'lifecycle' | 'why' | 'goal' | 'nextStep' | 'learning'> & { emoji: string; ownerUserId: string };

function toDraft(project: Project | null, currentUserId: string): ProjectDraft {
  return {
    title: project?.title ?? '',
    emoji: project?.emoji ?? '',
    phase: project?.phase ?? 'idea',
    lifecycle: project?.lifecycle ?? 'active',
    ownerUserId: project ? (project.ownerUserId ?? '') : currentUserId,
    why: project?.why ?? '',
    goal: project?.goal ?? '',
    nextStep: project?.nextStep ?? '',
    learning: project?.learning ?? '',
  };
}

export function ProjectSheet({ project, context }: { project: Project | null; context: WorkspaceContext }) {
  const shell = useShell();
  const router = useRouter();
  const run = useMutationRunner();
  const [original] = useState(() => toDraft(project, context.currentUserId));
  const [draft, setDraft] = useState(original);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ message: string; fields: Record<string, string> } | null>(null);
  const key = useRef(crypto.randomUUID());
  const closeRef = useRef<(() => void) | null>(null);
  const ids = { title: useId(), emoji: useId(), phase: useId(), lifecycle: useId(), owner: useId(), why: useId(), goal: useId(), next: useId(), learning: useId() };
  const dirty = (Object.keys(draft) as Array<keyof ProjectDraft>).some((k) => draft[k] !== original[k]);
  const update = (patch: Partial<ProjectDraft>) => {
    key.current = crypto.randomUUID();
    setDraft((d) => ({ ...d, ...patch }));
  };

  const save = async (): Promise<boolean> => {
    if (saving) return false;
    if (!draft.title.trim()) {
      setError({ message: 'Skriv et navn.', fields: { title: 'Skriv et navn.' } });
      return false;
    }
    setSaving(true);
    setError(null);
    try {
      if (!project) {
        const created = await run(
          (r) => r.createProject({ ...draft, emoji: draft.emoji || null, ownerUserId: draft.ownerUserId || null }, { idempotencyKey: key.current }),
          { success: 'Projektet er oprettet.', undo: (p, r) => () => r.archiveProject(p.id, p.version), inlineErrors: true },
        );
        shell.close();
        router.push(projectHref(created.id));
      } else {
        const patch: ProjectPatchInput = { expectedVersion: project.version };
        const inverse: ProjectPatchInput = { expectedVersion: 0 };
        for (const field of Object.keys(draft) as Array<keyof ProjectDraft>) {
          if (draft[field] === original[field]) continue;
          const toValue = (v: string) => ((field === 'emoji' || field === 'ownerUserId') && v === '' ? null : v);
          (patch as Record<string, unknown>)[field] = toValue(draft[field]);
          (inverse as Record<string, unknown>)[field] = toValue(original[field]);
        }
        if (Object.keys(patch).length > 1) {
          await run((r) => r.updateProject(project.id, patch), {
            success: 'Gemt.',
            undo: (p, r) => () => r.updateProject(p.id, { ...inverse, expectedVersion: p.version }),
            inlineErrors: true,
          });
        }
        shell.close();
      }
      return true;
    } catch (caught) {
      setError(saveError(caught));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const toggleArchive = async () => {
    if (!project) return;
    const archived = project.archivedAt !== null;
    try {
      await run((r) => (archived ? r.restoreProject(project.id, project.version) : r.archiveProject(project.id, project.version)), {
        success: archived ? 'Projektet er gendannet.' : 'Projektet er arkiveret. Opgaver og noter er bevaret.',
        undo: (p, r) => () => (archived ? r.archiveProject(p.id, p.version) : r.restoreProject(p.id, p.version)),
      });
      shell.close();
    } catch {
      // Announced by the runner.
    }
  };

  const area = (id: string, label: string, field: 'why' | 'goal' | 'nextStep' | 'learning') => (
    <div>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <textarea id={id} className={cx(controlClass, 'min-h-20 py-2')} value={draft[field]} onChange={(e) => update({ [field]: e.target.value })} />
    </div>
  );

  return (
    <Sheet
      open
      title={project ? 'Redigér projekt' : 'Nyt projekt'}
      description={project ? undefined : 'Kun navnet er påkrævet.'}
      isDirty={() => dirty}
      onSave={save}
      onClose={shell.close}
      closeRef={closeRef}
      footer={
        <div className="flex flex-col gap-3">
          {error ? (
            <p role="alert" className="rounded-control bg-danger px-3 py-2 text-[13px] text-on-danger">
              {error.message}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => void save()} disabled={saving}>
              {saving ? 'Gemmer…' : 'Gem'}
            </Button>
            <Button onClick={() => closeRef.current?.()}>Annuller</Button>
            {project ? (
              <Button variant="ghost" className="ml-auto" onClick={() => void toggleArchive()}>
                {project.archivedAt ? 'Gendan' : 'Arkivér'}
              </Button>
            ) : null}
          </div>
        </div>
      }
    >
      <form
        noValidate
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="grid grid-cols-[1fr_96px] gap-3">
          <div>
            <FieldLabel htmlFor={ids.title}>Navn</FieldLabel>
            <input id={ids.title} className={controlClass} value={draft.title} autoFocus maxLength={500} aria-invalid={error?.fields.title ? true : undefined} onChange={(e) => update({ title: e.target.value })} />
            <FieldError id={`${ids.title}-error`} message={error?.fields.title} />
          </div>
          <div>
            <FieldLabel htmlFor={ids.emoji} hint="(valgfrit)">
              Symbol
            </FieldLabel>
            <input id={ids.emoji} className={controlClass} value={draft.emoji} maxLength={16} onChange={(e) => update({ emoji: e.target.value })} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <FieldLabel htmlFor={ids.phase}>Fase</FieldLabel>
            <select id={ids.phase} className={controlClass} value={draft.phase} onChange={(e) => update({ phase: e.target.value as Project['phase'] })}>
              {PROJECT_PHASES.map((p) => (
                <option key={p} value={p}>
                  {PHASE_LABEL[p]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel htmlFor={ids.lifecycle}>Status</FieldLabel>
            <select id={ids.lifecycle} className={controlClass} value={draft.lifecycle} onChange={(e) => update({ lifecycle: e.target.value as Project['lifecycle'] })}>
              {PROJECT_LIFECYCLES.map((l) => (
                <option key={l} value={l}>
                  {LIFECYCLE_LABEL[l]}
                </option>
              ))}
            </select>
          </div>
          <MemberSelect id={ids.owner} label="Ejer" members={context.members} value={draft.ownerUserId} error={error?.fields.ownerUserId} onChange={(v) => update({ ownerUserId: v })} />
        </div>
        {area(ids.why, 'Hvorfor (formål)', 'why')}
        {area(ids.goal, 'Mål', 'goal')}
        {area(ids.next, 'Næste skridt', 'nextStep')}
        {area(ids.learning, 'Læring', 'learning')}
      </form>
    </Sheet>
  );
}

export function DirectionSheet({ context }: { context: WorkspaceContext }) {
  const shell = useShell();
  const run = useMutationRunner();
  const original = context.workspace.direction;
  const [text, setText] = useState(original);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<(() => void) | null>(null);
  const id = useId();

  const save = async () => {
    if (saving) return false;
    setSaving(true);
    setError(null);
    try {
      if (text !== original) {
        await run((r) => r.updateDirection({ direction: text, expectedVersion: context.workspace.version }), {
          success: 'Gemt.',
          undo: (w, r) => () => r.updateDirection({ direction: original, expectedVersion: w.version }),
          inlineErrors: true,
        });
      }
      shell.close();
      return true;
    } catch (caught) {
      setError(saveError(caught).message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open
      title="Redigér retning"
      description="Den fælles retning, som alle projekter peger mod."
      isDirty={() => text !== original}
      onSave={save}
      onClose={shell.close}
      closeRef={closeRef}
      footer={
        <div className="flex flex-col gap-3">
          {error ? (
            <p role="alert" className="rounded-control bg-danger px-3 py-2 text-[13px] text-on-danger">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button variant="primary" onClick={() => void save()} disabled={saving}>
              {saving ? 'Gemmer…' : 'Gem'}
            </Button>
            <Button onClick={() => closeRef.current?.()}>Annuller</Button>
          </div>
        </div>
      }
    >
      <FieldLabel htmlFor={id}>Fælles retning</FieldLabel>
      <textarea id={id} className={cx(controlClass, 'min-h-48 py-2')} value={text} autoFocus onChange={(e) => setText(e.target.value)} />
    </Sheet>
  );
}

export function ConvertThoughtDialog({ thought }: { thought: Thought }) {
  const shell = useShell();
  const router = useRouter();
  const run = useMutationRunner();
  const [title, setTitle] = useState(() => titleFromBody(thought.body));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef(crypto.randomUUID());
  const closeRef = useRef<(() => void) | null>(null);
  const id = useId();

  const save = async () => {
    if (saving) return false;
    if (!title.trim()) {
      setError('Skriv et navn.');
      return false;
    }
    setSaving(true);
    setError(null);
    try {
      const { project } = await run((r) => r.convertThought(thought.id, { expectedVersion: thought.version, title }, { idempotencyKey: key.current }), {
        success: 'Projektet er oprettet. Tanken er bevaret og koblet til projektet.',
        inlineErrors: true,
      });
      shell.close();
      router.push(projectHref(project.id));
      return true;
    } catch (caught) {
      setError(saveError(caught).message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open
      title="Gør tanken til et projekt"
      description="Tanken bliver ikke slettet. Den kobles til det nye projekt."
      isDirty={() => false}
      onSave={save}
      onClose={shell.close}
      closeRef={closeRef}
      footer={
        <div className="flex flex-col gap-3">
          {error ? (
            <p role="alert" className="rounded-control bg-danger px-3 py-2 text-[13px] text-on-danger">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button variant="primary" onClick={() => void save()} disabled={saving}>
              {saving ? 'Opretter…' : 'Opret projekt'}
            </Button>
            <Button onClick={() => closeRef.current?.()}>Annuller</Button>
          </div>
        </div>
      }
    >
      <blockquote className="mb-5 whitespace-pre-wrap rounded-control border-l-4 border-line bg-surface px-4 py-3 text-muted">{thought.body}</blockquote>
      <FieldLabel htmlFor={id}>Projektets navn</FieldLabel>
      <input id={id} className={controlClass} value={title} autoFocus maxLength={500} onChange={(e) => setTitle(e.target.value)} />
    </Sheet>
  );
}
