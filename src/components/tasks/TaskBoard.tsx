'use client';

import { useRef, useState, type DragEvent } from 'react';
import { TASK_STATUSES, type Task, type TaskStatus } from '@/domain/entities';
import { STATUS_LABEL } from '@/domain/labels';
import { groupByStatus } from '@/domain/selectors';
import { cx } from '@/components/ui/primitives';
import { TaskCard, type Lookups } from './TaskItems';
import { useTaskActions, type Neighbours } from './task-actions';

/** Neighbours of index `at` in `list` (visible order) for an insertion. */
function neighboursAt(list: Task[], at: number): Neighbours {
  return { beforeTaskId: list[at - 1]?.id ?? null, afterTaskId: list[at]?.id ?? null };
}

function currentNeighbours(list: Task[], task: Task): Neighbours {
  const index = list.findIndex((t) => t.id === task.id);
  return { beforeTaskId: list[index - 1]?.id ?? null, afterTaskId: list[index + 1]?.id ?? null };
}

/**
 * Four status columns over one canonical task list. Pointer dragging is optional;
 * every move is also possible with the status select or Alt+arrow keys.
 */
export function TaskBoard({ tasks, lookups, hideProject }: { tasks: Task[]; lookups: Lookups; hideProject?: boolean }) {
  const columns = groupByStatus(tasks);
  const { move } = useTaskActions();
  const dragged = useRef<Task | null>(null);
  const [dropTarget, setDropTarget] = useState<{ status: TaskStatus; index: number } | null>(null);

  const keyboardMove = (task: Task, direction: 'up' | 'down' | 'left' | 'right') => {
    const column = columns[task.status];
    const index = column.findIndex((t) => t.id === task.id);
    const previous = currentNeighbours(column, task);
    if (direction === 'up' || direction === 'down') {
      const others = column.filter((t) => t.id !== task.id);
      const target = direction === 'up' ? index - 1 : index + 1;
      if (target < 0 || target > others.length) return;
      void move(task, task.status, neighboursAt(others, target), previous).then(() => refocus(task.id));
      return;
    }
    const statusIndex = TASK_STATUSES.indexOf(task.status) + (direction === 'left' ? -1 : 1);
    const status = TASK_STATUSES[statusIndex];
    if (!status) return;
    void move(task, status, { beforeTaskId: null, afterTaskId: null }, previous).then(() => refocus(task.id));
  };

  const onDragOver = (status: TaskStatus) => (event: DragEvent<HTMLUListElement>) => {
    if (!dragged.current) return;
    event.preventDefault();
    const cards = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-task-id]')].filter(
      (el) => el.dataset.taskId !== dragged.current?.id,
    );
    let index = cards.length;
    for (let i = 0; i < cards.length; i++) {
      const rect = cards[i]!.getBoundingClientRect();
      if (event.clientY < rect.top + rect.height / 2) {
        index = i;
        break;
      }
    }
    setDropTarget({ status, index });
  };

  const onDrop = (status: TaskStatus) => (event: DragEvent<HTMLUListElement>) => {
    event.preventDefault();
    const task = dragged.current;
    const target = dropTarget;
    dragged.current = null;
    setDropTarget(null);
    if (!task || !target || target.status !== status) return;
    const others = columns[status].filter((t) => t.id !== task.id);
    const next = neighboursAt(others, target.index);
    const previous = currentNeighbours(columns[task.status], task);
    if (task.status === status && next.beforeTaskId === previous.beforeTaskId && next.afterTaskId === previous.afterTaskId) return;
    void move(task, status, next, previous);
  };

  return (
    <div>
      <p id="board-keyboard-hint" className="sr-only">
        Brug statusfeltet, eller fokusér titlen og tryk Alt plus piletast for at flytte opgaven.
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {TASK_STATUSES.map((status) => {
          const list = columns[status];
          const headingId = `col-${status}`;
          return (
            <section key={status} aria-labelledby={headingId} className="flex min-w-0 flex-col rounded-card border border-line bg-bg/40 p-3">
              <h3 id={headingId} className="mb-3 flex items-center justify-between px-1 text-[13px] font-semibold">
                {STATUS_LABEL[status]}
                <span className="text-muted" aria-label={`${list.length} opgaver`}>
                  {list.length}
                </span>
              </h3>
              <ul
                className={cx('flex min-h-16 flex-col gap-2 rounded-control', dropTarget?.status === status && 'outline-2 outline-dashed outline-line')}
                onDragOver={onDragOver(status)}
                onDrop={onDrop(status)}
              >
                {list.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    lookups={lookups}
                    hideProject={hideProject}
                    onKeyboardMove={keyboardMove}
                    dragProps={{
                      draggable: task.archivedAt === null,
                      onDragStart: (event) => {
                        dragged.current = task;
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData('text/plain', task.id);
                      },
                      onDragEnd: () => {
                        dragged.current = null;
                        setDropTarget(null);
                      },
                    }}
                  />
                ))}
                {list.length === 0 ? <li className="px-1 py-2 text-[12px] text-muted">Ingen opgaver</li> : null}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function refocus(taskId: string) {
  requestAnimationFrame(() => {
    document.querySelector<HTMLElement>(`[data-task-id="${taskId}"] button`)?.focus();
  });
}
