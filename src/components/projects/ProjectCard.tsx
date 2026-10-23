'use client';

import type { Member, Project } from '@/domain/entities';
import { LIFECYCLE_LABEL, PHASE_LABEL } from '@/domain/labels';
import type { ProjectProgress } from '@/domain/selectors';
import { GuardedLink } from '@/components/shell/AppShell';
import { ExampleTag, Pill } from '@/components/ui/primitives';

/** Owner, next step, task completion count and blocked indicator. No value scores. */
export function ProjectCard({ project, owner, progress }: { project: Project; owner: Member | undefined; progress: ProjectProgress }) {
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <GuardedLink href={`/projects/${project.id}`} className="block rounded-card border border-line bg-surface p-4 hover:bg-raised">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold leading-snug">
          {project.emoji ? `${project.emoji} ` : ''}
          {project.title}
        </p>
        {project.isExample ? <ExampleTag /> : null}
      </div>
      <p className="mt-0.5 text-[12px] text-muted">
        {PHASE_LABEL[project.phase]}
        {project.lifecycle !== 'active' ? ` · ${LIFECYCLE_LABEL[project.lifecycle]}` : ''} · {owner?.displayName ?? 'Ingen ejer'}
      </p>
      {project.nextStep ? <p className="mt-3 line-clamp-3 text-[13px]">Næste skridt: {project.nextStep}</p> : null}
      <div className="mt-3">
        <div className="flex items-center justify-between text-[12px] text-muted">
          <span>
            Opgaver færdige: {progress.done}/{progress.total}
          </span>
          {progress.blocked ? <Pill tone="warning">{progress.blocked} blokeret</Pill> : null}
        </div>
        <div
          className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-raised"
          role="img"
          aria-label={`Opgaver færdige: ${progress.done} af ${progress.total}`}
        >
          <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </GuardedLink>
  );
}
