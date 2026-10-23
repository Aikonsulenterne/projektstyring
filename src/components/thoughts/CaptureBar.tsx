'use client';

import { useId, useRef, useState } from 'react';
import type { Id, Project } from '@/domain/entities';
import { Button, compactControlClass, cx } from '@/components/ui/primitives';
import { useMutationRunner } from '@/lib/queries';

type Kind = 'thought' | 'task';

/**
 * One field, press Enter. Creates a thought or a task; project is always optional.
 * The text survives re-renders and filter changes and is kept when saving fails.
 */
export function CaptureBar({
  projects,
  defaultKind = 'thought',
  lockedProjectId,
  areaId,
}: {
  projects: Project[];
  defaultKind?: Kind;
  /** On a project page every capture belongs to that project. */
  lockedProjectId?: Id;
  /** Inherit the selected area filter for new tasks, never forced. */
  areaId?: Id | null;
}) {
  const run = useMutationRunner();
  const [kind, setKind] = useState<Kind>(defaultKind);
  const [text, setText] = useState('');
  const [projectId, setProjectId] = useState('');
  const [pending, setPending] = useState(false);
  const key = useRef<{ text: string; key: string } | null>(null);
  const ids = { kind: useId(), text: useId(), project: useId() };

  const submit = async () => {
    const value = text.trim();
    if (!value || pending) return;
    // Same text retried after a failure reuses the key: no duplicates.
    if (!key.current || key.current.text !== `${kind}:${value}`) key.current = { text: `${kind}:${value}`, key: crypto.randomUUID() };
    const project = lockedProjectId ?? (projectId || null);
    setPending(true);
    try {
      if (kind === 'task') {
        await run((r) => r.createTask({ title: value, projectId: project, areaId: areaId ?? null }, { idempotencyKey: key.current!.key }), {
          success: 'Opgaven er oprettet.',
          undo: (task, r) => () => r.archiveTask(task.id, task.version),
        });
      } else {
        await run((r) => r.createThought({ body: value, type: 'idea', projectId: project, areaId: null }, { idempotencyKey: key.current!.key }), {
          success: 'Tanken er gemt.',
          undo: (thought, r) => () => r.archiveThought(thought.id, thought.version),
        });
      }
      setText('');
      key.current = null;
    } catch {
      // The runner announced the error; the text stays in the field.
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-2 rounded-card border border-line bg-surface p-3 sm:flex-row sm:items-center"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      aria-label="Hurtig registrering"
    >
      <label htmlFor={ids.kind} className="sr-only">
        Type
      </label>
      <select id={ids.kind} className={cx(compactControlClass, 'min-h-11 sm:w-32')} value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
        <option value="thought">Tanke</option>
        <option value="task">Opgave</option>
      </select>
      <label htmlFor={ids.text} className="sr-only">
        {kind === 'task' ? 'Ny opgave' : 'Ny tanke'}
      </label>
      <input
        id={ids.text}
        className="min-h-11 min-w-0 flex-1 bg-transparent px-2 text-[14px] placeholder:text-muted focus:outline-none focus-visible:outline-2 focus-visible:outline-accent"
        placeholder="Skriv noget og tryk Enter"
        value={text}
        maxLength={kind === 'task' ? 500 : 20_000}
        onChange={(e) => setText(e.target.value)}
      />
      {lockedProjectId ? null : (
        <>
          <label htmlFor={ids.project} className="sr-only">
            Projekt (valgfrit)
          </label>
          <select id={ids.project} className={cx(compactControlClass, 'min-h-11 sm:w-44')} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Uden projekt</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </>
      )}
      <Button type="submit" variant="primary" disabled={!text.trim() || pending}>
        {pending ? 'Gemmer…' : 'Tilføj'}
      </Button>
    </form>
  );
}
