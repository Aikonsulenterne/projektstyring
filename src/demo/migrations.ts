// Explicit, validated import of earlier prototype data. Nothing here runs
// automatically: the UI shows a preview and the user confirms the import.
//
// Legacy shapes are reconstructed from the handoff (10_BUGS_AND_MIGRATION.md) and
// the canvas excerpts. Field aliases below are assumptions; anything we cannot map
// unambiguously is rejected with a Danish explanation instead of being guessed.

import {
  PROJECT_PHASES,
  type Id,
  type Project,
  type ProjectPhase,
  type Task,
  type TaskStatus,
  type Thought,
  type ThoughtType,
} from '@/domain/entities';
import { PHASE_LABEL, STATUS_LABEL, THOUGHT_TYPE_LABEL } from '@/domain/labels';
import { initialRanks } from '@/domain/rank';
import { dateOnly, LIMITS } from '@/domain/schemas';
import { validateData, validateEnvelope, type DemoData } from './format';
import { createDemoData, DEMO_IDS } from './seed';

export type ImportSource = 'backup-v3' | 'canvas-v2' | 'html-v1';

export interface ImportPreview {
  source: ImportSource;
  data: DemoData;
  counts: { projects: number; tasks: number; thoughts: number };
  warnings: string[];
}

export type ImportResult = { ok: true; preview: ImportPreview } | { ok: false; errors: string[] };

/** Label -> member id. Legacy aliases per the conversation: B = Rasmussen, P = Ihle. */
const PERSON_ALIASES: Record<string, Id> = {
  sune: DEMO_IDS.sune,
  'sofie ihle': DEMO_IDS.sofieIhle,
  'sofie p.': DEMO_IDS.sofieIhle,
  'sofie rasmussen': DEMO_IDS.sofieRasmussen,
  'sofie b.': DEMO_IDS.sofieRasmussen,
  nicholas: DEMO_IDS.nicholas,
};

const AREA_BY_LABEL: Record<string, Id> = {
  data: DEMO_IDS.areaData,
  model: DEMO_IDS.areaModel,
  adoption: DEMO_IDS.areaAdoption,
};

function invert<K extends string>(labels: Record<K, string>): Record<string, K> {
  const out: Record<string, K> = {};
  for (const [key, label] of Object.entries(labels) as Array<[K, string]>) {
    out[label.toLocaleLowerCase('da-DK')] = key;
    out[key] = key;
  }
  return out;
}
const STATUS_BY_LABEL = invert(STATUS_LABEL);
const PHASE_BY_LABEL = invert(PHASE_LABEL);
const TYPE_BY_LABEL = invert(THOUGHT_TYPE_LABEL);

type Raw = Record<string, unknown>;
const isObject = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : undefined);
const pick = (o: Raw, ...keys: string[]): unknown => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
};

export function detectFormat(raw: unknown): ImportSource | null {
  if (!isObject(raw)) return null;
  if (raw.format === 'teamspace-demo') return 'backup-v3';
  if (Array.isArray(raw.projects) && Array.isArray(raw.tasks) && Array.isArray(raw.notes)) {
    return raw.version === 1 ? 'html-v1' : raw.version === undefined ? 'canvas-v2' : null;
  }
  return null;
}

function legacyToData(raw: Raw, source: 'canvas-v2' | 'html-v1', now: string, newId: () => Id): ImportResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const idMap: Record<string, Id> = {};
  const seenOriginal = new Set<string>();
  const mapId = (kind: string, original: unknown): Id => {
    const key = `${kind}:${str(original) ?? newId()}`;
    if (seenOriginal.has(key)) errors.push(`Dublet-id i ${kind}: ${str(original)}`);
    seenOriginal.add(key);
    const id = newId();
    idMap[key] = id;
    return id;
  };
  const person = (value: unknown, where: string): Id | null => {
    const label = str(value)?.trim();
    if (!label) return null;
    const id = PERSON_ALIASES[label.toLocaleLowerCase('da-DK')];
    if (!id) errors.push(`${where}: ukendt person "${label}".`);
    return id ?? null;
  };
  const date = (value: unknown, where: string): string | null => {
    const s = str(value)?.trim();
    if (!s) return null;
    if (!dateOnly.safeParse(s).success) {
      errors.push(`${where}: ugyldig dato "${s}".`);
      return null;
    }
    return s;
  };
  const instant = (value: unknown): string => {
    const s = str(value);
    if (s && !Number.isNaN(Date.parse(s))) return new Date(s).toISOString();
    if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString();
    return now;
  };
  const area = (value: unknown, where: string): Id | null => {
    const label = str(value)?.trim();
    if (!label) return null;
    const id = AREA_BY_LABEL[label.toLocaleLowerCase('da-DK')];
    if (!id) errors.push(`${where}: ukendt område "${label}".`);
    return id ?? null;
  };

  const rawProjects = raw.projects as unknown[];
  const rawTasks = raw.tasks as unknown[];
  const rawNotes = raw.notes as unknown[];
  for (const [name, list] of [['projekter', rawProjects], ['opgaver', rawTasks], ['noter', rawNotes]] as const) {
    if (list.length > LIMITS.recordsPerCollection) errors.push(`For mange ${name} (${list.length}).`);
  }
  if (errors.length) return { ok: false, errors };

  const projects: Project[] = [];
  const projectByOriginal = new Map<string, Id>();
  const projectByTitle = new Map<string, Id>();
  rawProjects.forEach((p, i) => {
    const where = `Projekt ${i + 1}`;
    if (!isObject(p)) return void errors.push(`${where}: ugyldig værdi.`);
    const title = str(pick(p, 'title', 'name'))?.trim();
    if (!title) errors.push(`${where}: mangler navn.`);
    const rawPhase = pick(p, 'phase');
    let phase: ProjectPhase | undefined;
    if (source === 'canvas-v2') {
      phase = typeof rawPhase === 'number' && Number.isInteger(rawPhase) ? PROJECT_PHASES[rawPhase] : undefined;
    } else {
      phase = PHASE_BY_LABEL[(str(rawPhase) ?? '').toLocaleLowerCase('da-DK')];
    }
    if (!phase) errors.push(`${where}: ukendt fase "${String(rawPhase)}".`);
    const id = mapId('project', pick(p, 'id') ?? `#${i}`);
    projectByOriginal.set(str(pick(p, 'id')) ?? `#${i}`, id);
    if (title) projectByTitle.set(title.toLocaleLowerCase('da-DK'), id);
    projects.push({
      id,
      title: title ?? '',
      emoji: str(pick(p, 'emoji'))?.slice(0, LIMITS.emoji) || null,
      phase: phase ?? 'idea',
      lifecycle: 'active',
      ownerUserId: person(pick(p, 'owner', 'ownerName'), where),
      why: str(pick(p, 'why', 'purpose')) ?? '',
      goal: str(pick(p, 'goal')) ?? '',
      nextStep: str(pick(p, 'nextStep', 'next')) ?? '',
      learning: str(pick(p, 'learning', 'learnings')) ?? '',
      isExample: false,
      createdAt: instant(pick(p, 'createdAt', 'created')),
      updatedAt: now,
      version: 1,
      archivedAt: pick(p, 'archived') === true ? now : null,
    });
  });

  const projectRef = (value: unknown, where: string): Id | null => {
    const ref = str(value)?.trim();
    if (!ref) return null;
    const byId = projectByOriginal.get(ref);
    if (byId) return byId;
    const byTitle = projectByTitle.get(ref.toLocaleLowerCase('da-DK'));
    if (byTitle) {
      warnings.push(`${where}: projekt fundet via navn "${ref}".`);
      return byTitle;
    }
    errors.push(`${where}: peger på et projekt, der ikke findes ("${ref}").`);
    return null;
  };

  const ranks = initialRanks(rawTasks.length);
  const tasks: Task[] = [];
  rawTasks.forEach((t, i) => {
    if (!isObject(t)) return void errors.push(`Opgave ${i + 1}: ugyldig værdi.`);
    const title = str(pick(t, 'title', 'name'))?.trim();
    const where = `Opgave ${i + 1}${title ? ` "${title}"` : ''}`;
    if (!title) errors.push(`${where}: mangler navn.`);
    const rawStatus = str(pick(t, 'status', 'state'))?.trim();
    const status: TaskStatus | undefined = rawStatus ? STATUS_BY_LABEL[rawStatus.toLocaleLowerCase('da-DK')] : undefined;
    if (!rawStatus) errors.push(`${where}: mangler status. Vi gætter ikke – ret filen og prøv igen.`);
    else if (!status) errors.push(`${where}: ukendt status "${rawStatus}".`);
    const checklistRaw = pick(t, 'checklist', 'subtasks', 'sub');
    const commentsRaw = pick(t, 'comments');
    const checklist = (Array.isArray(checklistRaw) ? checklistRaw : []).flatMap((c, position) => {
      const text = isObject(c) ? str(pick(c, 'text', 'title'))?.trim() : str(c)?.trim();
      if (!text) return [];
      return [{ id: newId(), text: text.slice(0, LIMITS.title), done: isObject(c) && c.done === true, position }];
    });
    const comments = (Array.isArray(commentsRaw) ? commentsRaw : []).flatMap((c) => {
      const body = isObject(c) ? str(pick(c, 'body', 'text'))?.trim() : str(c)?.trim();
      if (!body) return [];
      const author = isObject(c) ? person(pick(c, 'author', 'by'), where) : null;
      if (!author) warnings.push(`${where}: en kommentar uden forfatter importeres som "ukendt forfatter".`);
      return [
        {
          id: newId(),
          body: author ? body : `(Importeret, ukendt forfatter) ${body}`,
          authorUserId: author ?? DEMO_IDS.sune,
          createdAt: isObject(c) ? instant(pick(c, 'createdAt', 'at', 'date')) : now,
        },
      ];
    });
    tasks.push({
      id: mapId('task', pick(t, 'id') ?? `#${i}`),
      title: title ?? '',
      description: str(pick(t, 'description', 'desc', 'blocker')) ?? '',
      projectId: projectRef(pick(t, 'project', 'projectId'), where),
      // Never infer area from the assignee: missing area stays null.
      areaId: area(pick(t, 'area'), where),
      assigneeId: person(pick(t, 'owner', 'assignee'), where),
      status: status ?? 'open',
      priority: (['high', 'normal', 'low'] as const).find((p) => p === pick(t, 'priority')) ?? 'normal',
      dueDate: date(pick(t, 'due', 'dueDate'), where),
      sortKey: ranks[i]!,
      isExample: false,
      checklist,
      comments,
      createdAt: instant(pick(t, 'createdAt', 'created')),
      updatedAt: now,
      version: 1,
      archivedAt: pick(t, 'archived') === true ? now : null,
    });
  });

  const thoughts: Thought[] = [];
  rawNotes.forEach((n, i) => {
    const where = `Note ${i + 1}`;
    if (!isObject(n)) return void errors.push(`${where}: ugyldig værdi.`);
    const body = str(pick(n, 'text', 'body'))?.trim();
    if (!body) errors.push(`${where}: er tom.`);
    const rawType = str(pick(n, 'type'))?.trim();
    let type: ThoughtType = 'idea';
    if (rawType) {
      const mapped = TYPE_BY_LABEL[rawType.toLocaleLowerCase('da-DK')];
      if (!mapped) errors.push(`${where}: ukendt type "${rawType}".`);
      else type = mapped;
    } else {
      warnings.push(`${where}: mangler type og importeres som Idé.`);
    }
    const author = person(pick(n, 'author', 'by', 'owner'), where);
    if (!author) warnings.push(`${where}: uden forfatter tilskrives Sune som opretter af importen.`);
    thoughts.push({
      id: mapId('note', pick(n, 'id') ?? `#${i}`),
      body: body ?? '',
      type,
      projectId: projectRef(pick(n, 'project', 'projectId'), where),
      areaId: area(pick(n, 'area'), where),
      authorUserId: author ?? DEMO_IDS.sune,
      convertedProjectId: null,
      isExample: false,
      createdAt: instant(pick(n, 'createdAt', 'date', 'at')),
      updatedAt: now,
      version: 1,
      archivedAt: pick(n, 'archived') === true ? now : null,
    });
  });

  if (errors.length) return { ok: false, errors: errors.slice(0, 50) };

  const base = createDemoData(new Date(now));
  const data: DemoData = {
    ...base,
    workspace: { ...base.workspace, direction: str(raw.direction) ?? '' },
    projects,
    tasks,
    thoughts,
    imports: [{ importedAt: now, source, idMap }],
  };
  const validated = validateData(data);
  if (!validated.ok) return { ok: false, errors: validated.errors };
  return {
    ok: true,
    preview: {
      source,
      data: validated.value,
      counts: { projects: projects.length, tasks: tasks.length, thoughts: thoughts.length },
      warnings: warnings.slice(0, 50),
    },
  };
}

/** Validates any supported backup/legacy text. Never writes anything. */
export function prepareImport(text: string, now: string, newId: () => Id): ImportResult {
  if (new Blob([text]).size > LIMITS.backupBytes) {
    return { ok: false, errors: ['Filen er større end 10 MB.'] };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['Filen er ikke gyldig JSON.'] };
  }
  const format = detectFormat(raw);
  if (format === null) {
    return { ok: false, errors: ['Ukendt filformat. Vælg en backup fra teamspace eller den tidligere prototype.'] };
  }
  if (format === 'backup-v3') {
    const result = validateEnvelope(raw);
    if (!result.ok) return { ok: false, errors: result.errors };
    const data = result.value.data;
    return {
      ok: true,
      preview: {
        source: format,
        data,
        counts: { projects: data.projects.length, tasks: data.tasks.length, thoughts: data.thoughts.length },
        warnings: [],
      },
    };
  }
  return legacyToData(raw as Raw, format, now, newId);
}

export const SOURCE_LABEL: Record<ImportSource, string> = {
  'backup-v3': 'teamspace-backup',
  'canvas-v2': 'tidligere prototype (canvas)',
  'html-v1': 'tidligere HTML-version',
};
