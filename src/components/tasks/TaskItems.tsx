'use client';

import { CheckCircle2, Circle, MessageSquare, ListChecks } from 'lucide-react';
import type { KeyboardEvent, ReactNode } from 'react';
import { TASK_STATUSES, type Area, type Member, type Project, type Task } from '@/domain/entities';
import { formatDueDate, PRIORITY_LABEL, STATUS_LABEL } from '@/domain/labels';
import { usePanel } from '@/components/shell/PanelContext';
import { compactControlClass, cx, ExampleTag } from '@/components/ui/primitives';
import { useTaskActions } from './task-actions';

export interface Lookups {
  members: Member[];
  areas: Area[];
  projects: Project[];
}

function name(list: Array<{ id: string; displayName?: string; title?: string; label?: string }>, id: string | null) {
  if (!id) return null;
  const found = list.find((x) => x.id === id);
  return found ? (found.displayName ?? found.title ?? found.label ?? null) : null;
}

export function TaskMeta({ task, lookups, hideProject }: { task: Task; lookups: Lookups; hideProject?: boolean }) {
  const parts: ReactNode[] = [];
  if (!hideProject) parts.push(name(lookups.projects, task.projectId) ?? 'Uden projekt');
  parts.push(name(lookups.members, task.assigneeId) ?? 'Ingen ansvarlig');
  const area = name(lookups.areas, task.areaId);
  if (area) parts.push(area);
  if (task.dueDate) parts.push(`Frist ${formatDueDate(task.dueDate)}`);
  if (task.priority !== 'normal') parts.push(`${PRIORITY_LABEL[task.priority]} prioritet`);
  const done = task.checklist.filter((c) => c.done).length;
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-muted">
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 ? <span aria-hidden>· </span> : null}
          {part}
        </span>
      ))}
      {task.checklist.length ? (
        <span className="inline-flex items-center gap-0.5" aria-label={`${done} af ${task.checklist.length} delopgaver færdige`}>
          <ListChecks size={12} aria-hidden /> {done}/{task.checklist.length}
        </span>
      ) : null}
      {task.comments.length ? (
        <span className="inline-flex items-center gap-0.5" aria-label={`${task.comments.length} kommentarer`}>
          <MessageSquare size={12} aria-hidden /> {task.comments.length}
        </span>
      ) : null}
      {task.isExample ? <ExampleTag /> : null}
    </p>
  );
}

function StatusSelect({ task, className }: { task: Task; className?: string }) {
  const { move } = useTaskActions();
  return (
    <select
      aria-label={`Status for ${task.title}`}
      className={cx(compactControlClass, 'rounded-full bg-raised', className)}
      value={task.status}
      disabled={task.archivedAt !== null}
      onChange={(e) => void move(task, e.target.value as Task['status'])}
    >
      {TASK_STATUSES.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  );
}

function TitleButton({ task }: { task: Task }) {
  const { openTask } = usePanel();
  return (
    <button
      type="button"
      className={cx('text-left text-[14px] font-medium leading-snug hover:underline', task.status === 'done' && 'text-muted line-through')}
      onClick={() => openTask(task.id)}
    >
      {/* Rendered as text: never interpreted as HTML. */}
      {task.title}
    </button>
  );
}

/** Row used in I dag lists: done toggle, title, metadata, status. */
export function TaskRow({ task, lookups, hideProject }: { task: Task; lookups: Lookups; hideProject?: boolean }) {
  const { move } = useTaskActions();
  const isDone = task.status === 'done';
  return (
    <li className="flex items-center gap-3 border-b border-line py-3 last:border-b-0">
      <button
        type="button"
        className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:text-text"
        aria-label={isDone ? `Genåbn ${task.title}` : `Markér ${task.title} som færdig`}
        onClick={() => void move(task, isDone ? 'open' : 'done')}
        disabled={task.archivedAt !== null}
      >
        {isDone ? <CheckCircle2 size={18} aria-hidden /> : <Circle size={16} aria-hidden />}
      </button>
      <div className="min-w-0 flex-1">
        <TitleButton task={task} />
        <TaskMeta task={task} lookups={lookups} hideProject={hideProject} />
      </div>
      <StatusSelect task={task} />
    </li>
  );
}

/** Kanban card: open, change status, change assignee. */
export function TaskCard({
  task,
  lookups,
  hideProject,
  onKeyboardMove,
  dragProps,
}: {
  task: Task;
  lookups: Lookups;
  hideProject?: boolean;
  onKeyboardMove?: (task: Task, direction: 'up' | 'down' | 'left' | 'right') => void;
  dragProps?: React.HTMLAttributes<HTMLLIElement> & { draggable?: boolean };
}) {
  const { setAssignee } = useTaskActions();
  const onKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
    // Alt+arrows on the title move the card; selects keep their native keys.
    if (!event.altKey || !onKeyboardMove || event.target instanceof HTMLSelectElement) return;
    const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' } as const;
    const direction = map[event.key as keyof typeof map];
    if (!direction) return;
    event.preventDefault();
    onKeyboardMove(task, direction);
  };
  return (
    <li
      className="rounded-control border border-line bg-surface p-3 shadow-sm"
      data-task-id={task.id}
      onKeyDown={onKeyDown}
      aria-describedby="board-keyboard-hint"
      {...dragProps}
    >
      <TitleButton task={task} />
      <div className="mt-1">
        <TaskMeta task={task} lookups={lookups} hideProject={hideProject} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <StatusSelect task={task} className="flex-1" />
        <select
          aria-label={`Ansvarlig for ${task.title}`}
          className={cx(compactControlClass, 'flex-1 rounded-full')}
          value={task.assigneeId ?? ''}
          disabled={task.archivedAt !== null}
          onChange={(e) => void setAssignee(task, e.target.value || null)}
        >
          <option value="">Ingen ansvarlig</option>
          {lookups.members
            .filter((m) => m.active || m.id === task.assigneeId)
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
              </option>
            ))}
        </select>
      </div>
    </li>
  );
}
