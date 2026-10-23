'use client';

import { useCallback } from 'react';
import type { Id, Task, TaskStatus } from '@/domain/entities';
import { STATUS_LABEL } from '@/domain/labels';
import { useMutationRunner } from '@/lib/queries';

export interface Neighbours {
  beforeTaskId: Id | null;
  afterTaskId: Id | null;
}

/** Card-level actions: change status/position and assignee, each undoable. */
export function useTaskActions() {
  const run = useMutationRunner();

  const move = useCallback(
    (task: Task, status: TaskStatus, target: Neighbours = { beforeTaskId: null, afterTaskId: null }, previous?: Neighbours) =>
      run((repo) => repo.moveTask(task.id, { expectedVersion: task.version, status, ...target }), {
        success: status === task.status ? 'Flyttet.' : `Flyttet til ${STATUS_LABEL[status]}.`,
        undo: (moved, repo) => () =>
          repo.moveTask(moved.id, {
            expectedVersion: moved.version,
            status: task.status,
            ...(previous ?? { beforeTaskId: null, afterTaskId: null }),
          }),
      }).catch(() => undefined),
    [run],
  );

  const setAssignee = useCallback(
    (task: Task, assigneeId: Id | null) =>
      run((repo) => repo.updateTask(task.id, { expectedVersion: task.version, assigneeId }), {
        success: 'Ansvarlig ændret.',
        undo: (updated, repo) => () => repo.updateTask(updated.id, { expectedVersion: updated.version, assigneeId: task.assigneeId }),
      }).catch(() => undefined),
    [run],
  );

  return { move, setAssignee };
}
