import type { Priority, ProjectLifecycle, ProjectPhase, TaskStatus, ThoughtType } from './entities';

export const STATUS_LABEL: Record<TaskStatus, string> = {
  open: 'Åben',
  in_progress: 'I gang',
  blocked: 'Blokeret',
  done: 'Færdig',
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  high: 'Høj',
  normal: 'Normal',
  low: 'Lav',
};

export const PHASE_LABEL: Record<ProjectPhase, string> = {
  idea: 'Idé',
  explore: 'Udforsk',
  experiment: 'Eksperiment',
  prove_value: 'Bevis værdi',
  pilot: 'Pilot',
  scale: 'Skalér',
};

export const LIFECYCLE_LABEL: Record<ProjectLifecycle, string> = {
  active: 'Aktiv',
  paused: 'På pause',
  completed: 'Afsluttet',
};

export const THOUGHT_TYPE_LABEL: Record<ThoughtType, string> = {
  idea: 'Idé',
  observation: 'Observation',
  learning: 'Læring',
  decision: 'Beslutning',
  todo: 'To-do',
};

export function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] ?? displayName;
}

const dateFormatter = new Intl.DateTimeFormat('da-DK', { day: 'numeric', month: 'short' });
const dateTimeFormatter = new Intl.DateTimeFormat('da-DK', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/** Formats a date-only string (YYYY-MM-DD) without timezone drift. */
export function formatDueDate(dueDate: string): string {
  const [y, m, d] = dueDate.split('-').map(Number);
  return dateFormatter.format(new Date(Date.UTC(y!, m! - 1, d!, 12)));
}

export function formatInstant(iso: string): string {
  return dateTimeFormatter.format(new Date(iso));
}
