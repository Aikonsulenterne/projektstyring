'use client';

import { Pencil, Plus } from 'lucide-react';
import { PROJECT_PHASES } from '@/domain/entities';
import { PHASE_LABEL } from '@/domain/labels';
import { projectProgress } from '@/domain/selectors';
import { GuardedLink, PageHeader } from '@/components/shell/AppShell';
import { useShell } from '@/components/shell/ShellContext';
import { ProjectCard } from '@/components/projects/ProjectCard';
import { Button, Card } from '@/components/ui/primitives';
import { useProjects, useTasks, useWorkspaceContext } from '@/lib/queries';
import { QueryState } from './common';

/** The shared direction and every project on the journey, grouped by phase. */
export function ProjectsView() {
  const context = useWorkspaceContext();
  const projects = useProjects();
  const tasks = useTasks({});
  const shell = useShell();
  const members = context.data?.members ?? [];

  return (
    <>
      <PageHeader
        title="Projekter"
        actions={
          <Button variant="primary" onClick={() => shell.openProject(null)}>
            <Plus size={16} aria-hidden /> Nyt projekt
          </Button>
        }
      />
      <Card className="mb-8" aria-labelledby="direction-heading">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p id="direction-heading" className="text-[11px] font-semibold tracking-wider text-muted">
              FÆLLES RETNING
            </p>
            <p className="mt-2 max-w-3xl whitespace-pre-wrap text-[17px] leading-relaxed">
              {context.data?.workspace.direction || 'I har ikke skrevet en fælles retning endnu.'}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => shell.openDirection()}>
            <Pencil size={14} aria-hidden /> Redigér retning
          </Button>
        </div>
      </Card>

      <h2 className="mb-1 text-[30px] font-bold tracking-tight">Vores rejse</h2>
      <p className="mb-5 text-muted">Fasen fortæller, hvor projektet er på rejsen. Den er ikke det samme som opgavernes status.</p>

      <QueryState query={projects}>
        <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          {PROJECT_PHASES.map((phase, index) => {
            const inPhase = (projects.data ?? []).filter((p) => p.phase === phase);
            return (
              <li key={phase} aria-labelledby={`phase-${phase}`} className="flex min-w-0 flex-col gap-3">
                <h3 id={`phase-${phase}`} className="flex items-baseline gap-2 text-[13px] font-semibold">
                  <span className="text-muted">{index + 1}</span> {PHASE_LABEL[phase]}
                  <span className="font-normal text-muted">{inPhase.length}</span>
                </h3>
                {inPhase.length === 0 ? <p className="rounded-card border border-dashed border-line p-4 text-[12px] text-muted">Ingen projekter</p> : null}
                <ul className="flex flex-col gap-3">
                  {inPhase.map((p) => (
                    <li key={p.id}>
                      <ProjectCard project={p} owner={members.find((m) => m.id === p.ownerUserId)} progress={projectProgress(tasks.data?.items ?? [], p.id)} />
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ol>
      </QueryState>
      <p className="mt-8 text-[13px] text-muted">
        Arkiverede projekter finder du i <GuardedLink href="/archive" className="text-accent underline">arkivet</GuardedLink>.
      </p>
    </>
  );
}
