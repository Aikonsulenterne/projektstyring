'use client';

import { useId, useRef, useState } from 'react';
import { THOUGHT_TYPES, type Thought, type ThoughtType, type WorkspaceContext } from '@/domain/entities';
import { isDomainError, MESSAGES } from '@/domain/errors';
import { THOUGHT_TYPE_LABEL } from '@/domain/labels';
import type { ThoughtPatchInput } from '@/domain/schemas';
import { useShell } from '@/components/shell/ShellContext';
import { AreaSelect, ProjectSelect } from '@/components/tasks/TaskSheet';
import { Sheet } from '@/components/ui/Sheet';
import { Button, controlClass, cx, FieldLabel } from '@/components/ui/primitives';
import { useMutationRunner, useProjects } from '@/lib/queries';

/** Edit a note. Project and area are both optional. */
export function ThoughtSheet({ thought, context }: { thought: Thought; context: WorkspaceContext }) {
  const shell = useShell();
  const run = useMutationRunner();
  const projects = useProjects({ includeArchived: true });
  const original = { body: thought.body, type: thought.type, projectId: thought.projectId ?? '', areaId: thought.areaId ?? '' };
  const [draft, setDraft] = useState(original);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<(() => void) | null>(null);
  const ids = { body: useId(), type: useId(), project: useId(), area: useId() };
  const dirty = (Object.keys(draft) as Array<keyof typeof draft>).some((k) => draft[k] !== original[k]);

  const save = async () => {
    if (saving) return false;
    if (!draft.body.trim()) {
      setError('Skriv noget først.');
      return false;
    }
    setSaving(true);
    setError(null);
    try {
      const patch: ThoughtPatchInput = { expectedVersion: thought.version };
      const inverse: ThoughtPatchInput = { expectedVersion: 0 };
      for (const field of Object.keys(draft) as Array<keyof typeof draft>) {
        if (draft[field] === original[field]) continue;
        const value = (v: string) => ((field === 'projectId' || field === 'areaId') && v === '' ? null : v);
        (patch as Record<string, unknown>)[field] = value(draft[field]);
        (inverse as Record<string, unknown>)[field] = value(original[field]);
      }
      if (Object.keys(patch).length > 1) {
        await run((r) => r.updateThought(thought.id, patch), {
          success: 'Gemt.',
          undo: (t, r) => () => r.updateThought(t.id, { ...inverse, expectedVersion: t.version }),
          inlineErrors: true,
        });
      }
      shell.close();
      return true;
    } catch (caught) {
      setError(isDomainError(caught) && caught.code !== 'UNEXPECTED' && caught.code !== 'NETWORK' && caught.code !== 'STORAGE_UNAVAILABLE' ? caught.message : MESSAGES.saveFailed);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const projectOptions = (projects.data ?? []).filter((p) => p.archivedAt === null || p.id === original.projectId);

  return (
    <Sheet
      open
      title="Redigér tanke"
      isDirty={() => dirty}
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
      <div className="flex flex-col gap-5">
        <div>
          <FieldLabel htmlFor={ids.body}>Tanke</FieldLabel>
          <textarea id={ids.body} className={cx(controlClass, 'min-h-32 py-2')} value={draft.body} autoFocus onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))} />
        </div>
        <div>
          <FieldLabel htmlFor={ids.type}>Type</FieldLabel>
          <select id={ids.type} className={controlClass} value={draft.type} onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value as ThoughtType }))}>
            {THOUGHT_TYPES.map((t) => (
              <option key={t} value={t}>
                {THOUGHT_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <ProjectSelect id={ids.project} projects={projectOptions} value={draft.projectId} onChange={(v) => setDraft((d) => ({ ...d, projectId: v }))} />
        <AreaSelect id={ids.area} areas={context.areas} members={context.members} value={draft.areaId} onChange={(v) => setDraft((d) => ({ ...d, areaId: v }))} />
      </div>
    </Sheet>
  );
}
