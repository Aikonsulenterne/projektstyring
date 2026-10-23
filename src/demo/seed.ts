// Demo fixtures. Every project, task and thought is flagged isExample and shown as
// "Eksempel" in the UI. They are illustrations, not verified company records.

import type { Area, Member, Project, Task, Thought } from '@/domain/entities';
import { initialRanks } from '@/domain/rank';
import type { DemoData } from './format';

export const DEMO_IDS = {
  workspace: '00000000-0000-4000-8000-000000000001',
  sune: '00000000-0000-4000-8000-0000000000a1',
  sofieIhle: '00000000-0000-4000-8000-0000000000a2',
  sofieRasmussen: '00000000-0000-4000-8000-0000000000a3',
  nicholas: '00000000-0000-4000-8000-0000000000a4',
  areaData: '00000000-0000-4000-8000-0000000000b1',
  areaModel: '00000000-0000-4000-8000-0000000000b2',
  areaAdoption: '00000000-0000-4000-8000-0000000000b3',
  okai: '00000000-0000-4000-8000-0000000000c1',
  meetingNotes: '00000000-0000-4000-8000-0000000000c2',
  dataCatalog: '00000000-0000-4000-8000-0000000000c3',
} as const;

export const DEMO_DIRECTION =
  'Vi gør AI nyttigt i hverdagen – i små, trygge skridt, hvor vi lærer undervejs og deler det, vi finder ud af.';

export function demoMembers(): Member[] {
  return [
    { id: DEMO_IDS.sune, displayName: 'Sune', role: 'admin', active: true },
    { id: DEMO_IDS.sofieIhle, displayName: 'Sofie Ihle', role: 'member', active: true },
    { id: DEMO_IDS.sofieRasmussen, displayName: 'Sofie Rasmussen', role: 'member', active: true },
    { id: DEMO_IDS.nicholas, displayName: 'Nicholas', role: 'member', active: true },
  ];
}

export function demoAreas(): Area[] {
  return [
    { id: DEMO_IDS.areaData, code: 'data', label: 'Data', ownerUserId: DEMO_IDS.sofieIhle },
    { id: DEMO_IDS.areaModel, code: 'model', label: 'Model', ownerUserId: DEMO_IDS.nicholas },
    { id: DEMO_IDS.areaAdoption, code: 'adoption', label: 'Adoption', ownerUserId: DEMO_IDS.sofieRasmussen },
  ];
}

function addDays(now: Date, days: number): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days));
  return d.toISOString().slice(0, 10);
}

/** Deterministic UUID for fixture rows (index-based, valid v4 layout). */
function fixtureId(prefix: string, index: number): string {
  return `00000000-0000-4000-8000-${prefix}${String(index).padStart(12 - prefix.length, '0')}`;
}

export function createDemoData(nowDate: Date = new Date()): DemoData {
  const now = nowDate.toISOString();
  const base = { createdAt: now, updatedAt: now, version: 1, archivedAt: null, isExample: true } as const;

  const projects: Project[] = [
    {
      ...base,
      id: DEMO_IDS.okai,
      title: 'OKAI',
      emoji: null,
      phase: 'experiment',
      lifecycle: 'active',
      ownerUserId: DEMO_IDS.nicholas,
      why: 'Undersøge om en intern AI-assistent kan spare tid i det daglige arbejde.',
      goal: 'Et lille eksperiment med fem brugere, hvor vi lærer, hvad der virker.',
      nextStep: 'Afklar kvalitetskriterier for svarene.',
      learning: 'Brugerne vil hellere have få gode svar end mange hurtige.',
    },
    {
      ...base,
      id: DEMO_IDS.meetingNotes,
      title: 'Mødenoter med AI',
      emoji: null,
      phase: 'explore',
      lifecycle: 'active',
      ownerUserId: DEMO_IDS.sofieRasmussen,
      why: 'Mange bruger tid på referater, der sjældent bliver læst.',
      goal: 'Forstå om AI-referater gør møder lettere at følge op på.',
      nextStep: 'Vælg første testgruppe.',
      learning: '',
    },
    {
      ...base,
      id: DEMO_IDS.dataCatalog,
      title: 'Fælles datakatalog',
      emoji: null,
      phase: 'idea',
      lifecycle: 'active',
      ownerUserId: DEMO_IDS.sofieIhle,
      why: 'Det er svært at vide, hvilke data vi må bruge til hvad.',
      goal: '',
      nextStep: 'Tal med to datakilder om behovet.',
      learning: '',
    },
  ];

  const rows: Array<Omit<Task, 'id' | 'sortKey' | 'createdAt' | 'updatedAt' | 'version' | 'archivedAt' | 'isExample'>> = [
    {
      title: 'Afklar kvalitetskriterier',
      description: '',
      projectId: DEMO_IDS.okai,
      areaId: DEMO_IDS.areaModel,
      assigneeId: DEMO_IDS.nicholas,
      status: 'in_progress',
      priority: 'high',
      dueDate: addDays(nowDate, 3),
      checklist: [
        { id: fixtureId('d', 1), text: 'Saml eksempler på gode svar', done: true, position: 0 },
        { id: fixtureId('d', 2), text: 'Aftal tre kriterier med teamet', done: false, position: 1 },
      ],
      comments: [],
    },
    {
      title: 'Beskriv fælles dataprincipper',
      description: '',
      projectId: null,
      areaId: DEMO_IDS.areaData,
      assigneeId: DEMO_IDS.sofieIhle,
      status: 'open',
      priority: 'normal',
      dueDate: null,
      checklist: [],
      comments: [],
    },
    {
      title: 'Planlæg feedback fra brugerne',
      description: '',
      projectId: DEMO_IDS.okai,
      areaId: DEMO_IDS.areaAdoption,
      assigneeId: DEMO_IDS.sofieRasmussen,
      status: 'open',
      priority: 'normal',
      dueDate: addDays(nowDate, 10),
      checklist: [],
      comments: [],
    },
    {
      title: 'Få adgang til testdata',
      description: 'Venter på svar om, hvilke data vi må bruge i eksperimentet.',
      projectId: DEMO_IDS.okai,
      areaId: DEMO_IDS.areaData,
      assigneeId: DEMO_IDS.sofieIhle,
      status: 'blocked',
      priority: 'high',
      dueDate: null,
      checklist: [],
      comments: [],
    },
    {
      title: 'Sammenlign to sprogmodeller',
      description: '',
      projectId: null,
      areaId: DEMO_IDS.areaModel,
      assigneeId: DEMO_IDS.nicholas,
      status: 'open',
      priority: 'low',
      dueDate: null,
      checklist: [],
      comments: [],
    },
    {
      title: 'Vælg første testgruppe',
      description: '',
      projectId: DEMO_IDS.meetingNotes,
      areaId: DEMO_IDS.areaAdoption,
      assigneeId: DEMO_IDS.sofieRasmussen,
      status: 'open',
      priority: 'normal',
      dueDate: addDays(nowDate, 7),
      checklist: [],
      comments: [],
    },
    {
      title: 'Saml spørgsmål fra kollegaer',
      description: '',
      projectId: DEMO_IDS.meetingNotes,
      areaId: null,
      assigneeId: DEMO_IDS.sune,
      status: 'done',
      priority: 'normal',
      dueDate: null,
      checklist: [],
      comments: [],
    },
    {
      title: 'Opdatér fælles retning efter workshop',
      description: '',
      projectId: null,
      areaId: null,
      assigneeId: DEMO_IDS.sune,
      status: 'open',
      priority: 'normal',
      dueDate: null,
      checklist: [],
      comments: [],
    },
  ];
  const ranks = initialRanks(rows.length);
  const tasks: Task[] = rows.map((row, i) => ({ ...base, ...row, id: fixtureId('e', i + 1), sortKey: ranks[i]! }));

  const thoughts: Thought[] = [
    {
      ...base,
      id: fixtureId('f', 1),
      body: 'Kunne vi samle vores bedste prompts ét sted, så vi lærer af hinanden?',
      type: 'idea',
      projectId: null,
      areaId: null,
      authorUserId: DEMO_IDS.sune,
      convertedProjectId: null,
    },
    {
      ...base,
      id: fixtureId('f', 2),
      body: 'Folk spørger mest om, hvor svarene kommer fra.',
      type: 'observation',
      projectId: DEMO_IDS.okai,
      areaId: DEMO_IDS.areaAdoption,
      authorUserId: DEMO_IDS.sofieRasmussen,
      convertedProjectId: null,
    },
    {
      ...base,
      id: fixtureId('f', 3),
      body: 'Små eksperimenter giver hurtigere svar end store planer.',
      type: 'learning',
      projectId: null,
      areaId: null,
      authorUserId: DEMO_IDS.nicholas,
      convertedProjectId: null,
    },
  ];

  return {
    workspace: { id: DEMO_IDS.workspace, name: 'AI-teamet', direction: DEMO_DIRECTION, version: 1, updatedAt: now },
    members: demoMembers(),
    areas: demoAreas(),
    projects,
    tasks,
    thoughts,
    receipts: [],
    imports: [],
  };
}
