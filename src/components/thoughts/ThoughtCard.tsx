'use client';

import { ArrowRightCircle, Pencil } from 'lucide-react';
import type { Thought } from '@/domain/entities';
import { formatInstant, THOUGHT_TYPE_LABEL } from '@/domain/labels';
import { GuardedLink } from '@/components/shell/AppShell';
import { useShell } from '@/components/shell/ShellContext';
import { Button, ExampleTag, Pill } from '@/components/ui/primitives';
import { useMutationRunner, useProjects, useWorkspaceContext } from '@/lib/queries';

export function ThoughtCard({ thought }: { thought: Thought }) {
  const context = useWorkspaceContext();
  const projects = useProjects({ includeArchived: true });
  const shell = useShell();
  const run = useMutationRunner();
  const author = context.data?.members.find((m) => m.id === thought.authorUserId)?.displayName ?? 'Ukendt';
  const project = projects.data?.find((p) => p.id === thought.projectId);
  const converted = projects.data?.find((p) => p.id === thought.convertedProjectId);
  const area = context.data?.areas.find((a) => a.id === thought.areaId);
  const archived = thought.archivedAt !== null;

  const setArchived = (value: boolean) =>
    void run((r) => (value ? r.archiveThought(thought.id, thought.version) : r.restoreThought(thought.id, thought.version)), {
      success: value ? 'Tanken er arkiveret.' : 'Tanken er gendannet.',
      undo: (t, r) => () => (value ? r.restoreThought(t.id, t.version) : r.archiveThought(t.id, t.version)),
    }).catch(() => undefined);

  return (
    <li className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
        <Pill>{THOUGHT_TYPE_LABEL[thought.type]}</Pill>
        <span>
          {author} · {formatInstant(thought.createdAt)}
        </span>
        {thought.isExample ? <ExampleTag /> : null}
      </div>
      {/* Rendered as text: never interpreted as HTML. */}
      <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{thought.body}</p>
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
        {project ? <span>Projekt: {project.title}</span> : null}
        {area ? <span>Område: {area.label}</span> : null}
        {converted ? (
          <GuardedLink href={`/projects/${converted.id}`} className="text-accent underline">
            Blev til projektet {converted.title}
          </GuardedLink>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {archived ? (
          <Button size="sm" onClick={() => setArchived(false)}>
            Gendan
          </Button>
        ) : (
          <>
            <Button size="sm" variant="ghost" onClick={() => shell.openThought(thought)}>
              <Pencil size={14} aria-hidden /> Redigér
            </Button>
            {thought.convertedProjectId ? null : (
              <Button size="sm" variant="ghost" onClick={() => shell.openConvert(thought)}>
                <ArrowRightCircle size={14} aria-hidden /> Gør til projekt
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setArchived(true)}>
              Arkivér
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

export function ThoughtList({ thoughts, empty }: { thoughts: Thought[]; empty: string }) {
  if (thoughts.length === 0) return <p className="rounded-card border border-dashed border-line p-8 text-center text-muted">{empty}</p>;
  return (
    <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {thoughts.map((t) => (
        <ThoughtCard key={t.id} thought={t} />
      ))}
    </ul>
  );
}
