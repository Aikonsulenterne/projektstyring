'use client';

import { PageHeader } from '@/components/shell/AppShell';
import { TaskRow } from '@/components/tasks/TaskItems';
import { ThoughtList } from '@/components/thoughts/ThoughtCard';
import { Button, Card, SectionHeading } from '@/components/ui/primitives';
import { useMutationRunner, useProjects, useTasks, useThoughts, useWorkspaceContext } from '@/lib/queries';
import { QueryState } from './common';

/** Soft-archived items with explicit restore. Nothing is deleted from the UI. */
export function ArchiveView() {
  const context = useWorkspaceContext();
  const tasks = useTasks({ archivedOnly: true });
  const projects = useProjects({ archivedOnly: true });
  const allProjects = useProjects({ includeArchived: true });
  const thoughts = useThoughts({ archivedOnly: true });
  const run = useMutationRunner();
  const lookups = { members: context.data?.members ?? [], areas: context.data?.areas ?? [], projects: allProjects.data ?? [] };

  return (
    <>
      <PageHeader title="Arkiv" />
      <p className="mb-6 text-muted">Arkiverede opgaver, projekter og tanker. Gendan dem, når I får brug for dem igen.</p>
      <div className="flex flex-col gap-8">
        <section aria-labelledby="archived-projects">
          <SectionHeading id="archived-projects" count={projects.data?.length}>
            Projekter
          </SectionHeading>
          <QueryState query={projects}>
            {projects.data?.length ? (
              <ul className="mt-3 flex flex-col gap-2">
                {projects.data.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3">
                    <span className="font-medium">{p.title}</span>
                    <Button
                      size="sm"
                      onClick={() =>
                        void run((r) => r.restoreProject(p.id, p.version), {
                          success: 'Projektet er gendannet.',
                          undo: (restored, r) => () => r.archiveProject(restored.id, restored.version),
                        }).catch(() => undefined)
                      }
                    >
                      Gendan
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-muted">Ingen arkiverede projekter.</p>
            )}
          </QueryState>
        </section>
        <section aria-labelledby="archived-tasks">
          <SectionHeading id="archived-tasks" count={tasks.data?.totalMatching}>
            Opgaver
          </SectionHeading>
          <QueryState query={tasks}>
            {tasks.data?.items.length ? (
              <Card as="div" className="mt-3">
                <ul>
                  {tasks.data.items.map((t) => (
                    <li key={t.id} className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <ul>
                          <TaskRow task={t} lookups={lookups} />
                        </ul>
                      </div>
                      <Button
                        size="sm"
                        onClick={() =>
                          void run((r) => r.restoreTask(t.id, t.version), {
                            success: 'Opgaven er gendannet.',
                            undo: (restored, r) => () => r.archiveTask(restored.id, restored.version),
                          }).catch(() => undefined)
                        }
                      >
                        Gendan
                      </Button>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : (
              <p className="mt-3 text-muted">Ingen arkiverede opgaver.</p>
            )}
          </QueryState>
        </section>
        <section aria-labelledby="archived-thoughts">
          <SectionHeading id="archived-thoughts" count={thoughts.data?.totalMatching}>
            Tanker
          </SectionHeading>
          <div className="mt-3">
            <QueryState query={thoughts}>
              <ThoughtList thoughts={thoughts.data?.items ?? []} empty="Ingen arkiverede tanker." />
            </QueryState>
          </div>
        </section>
      </div>
    </>
  );
}
