// Export of your own data as JSON and CSV (build plan phase 6). Pure: NO runtime
// imports besides siblings; see dataExport.test.ts.
//
// Only data already on this computer, only the app's own tables, never the
// network. It never reads a sign in session or a token: the caller passes the
// tables, and as a second wall this file refuses to write a setting, or a
// field of any row, whose name looks like a secret (token, secret, password,
// session, credential, api key, auth). What was withheld is counted, so the
// message can say so. Deleted rows (tombstones) are not exported.
import type { BrainDumpItem, CustomCategory, CustomEvent, Project, Routine, RoutineCompletion, Task, TaskList, UserSetting } from './types.ts';
import { toCsv } from './csv.ts';

export interface ExportInput {
  tasks: Task[];
  labels: Project[];
  lists: TaskList[];
  settings: UserSetting[];
  events: CustomEvent[];
  categories: CustomCategory[];
  routines: Routine[];
  routineCompletions: RoutineCompletion[];
  brainDumpItems: BrainDumpItem[];
}

const SECRET = /token|secret|passw|session|credential|api[_-]?key|apikey|auth|private[_-]?key/i;

export function looksSecret(name: string): boolean {
  return SECRET.test(name);
}

export interface ExportCounts {
  tasks: number;
  labels: number;
  lists: number;
  settings: number;
  events: number;
  categories: number;
  routines: number;
  routineCompletions: number;
  brainDumpItems: number;
}

export interface ExportResult {
  json: string;
  counts: ExportCounts;
  total: number;
  // Settings and fields left out because their name looks like a secret.
  withheld: number;
  // The CSV is the tasks, one row each, with the label and list named.
  csv: string;
}

function scrub<T extends object>(row: T, tally: { n: number }): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === undefined) continue;
    if (looksSecret(k)) {
      tally.n += 1;
      continue;
    }
    out[k] = v;
  }
  return out;
}

const live = <T extends { deletedAt?: string }>(rows: T[]): T[] => rows.filter((r) => !r.deletedAt);

export const TASK_CSV_HEADERS = [
  'Title',
  'Emoji',
  'Done',
  'Completed at',
  'Day',
  'Start time',
  'Label',
  'List',
  'Priority',
  'Estimated (minutes)',
  'Actual (minutes)',
  'Repeats',
  'Notes',
  'Subtasks',
  'Created at',
];

export function buildExport(input: ExportInput, appVersion: string, nowIso: string): ExportResult {
  const tally = { n: 0 };
  const tasks = live(input.tasks);
  const labels = live(input.labels);
  const lists = live(input.lists);
  const settings = live(input.settings).filter((s) => {
    if (looksSecret(s.key)) {
      tally.n += 1;
      return false;
    }
    return true;
  });
  const tables = {
    tasks: tasks.map((r) => scrub(r, tally)),
    labels: labels.map((r) => scrub(r, tally)),
    lists: lists.map((r) => scrub(r, tally)),
    settings: settings.map((r) => scrub(r, tally)),
    events: live(input.events).map((r) => scrub(r, tally)),
    categories: live(input.categories).map((r) => scrub(r, tally)),
    routines: live(input.routines).map((r) => scrub(r, tally)),
    routineCompletions: input.routineCompletions.map((r) => scrub(r, tally)),
    brainDumpItems: live(input.brainDumpItems).map((r) => scrub(r, tally)),
  };
  const counts: ExportCounts = {
    tasks: tables.tasks.length,
    labels: tables.labels.length,
    lists: tables.lists.length,
    settings: tables.settings.length,
    events: tables.events.length,
    categories: tables.categories.length,
    routines: tables.routines.length,
    routineCompletions: tables.routineCompletions.length,
    brainDumpItems: tables.brainDumpItems.length,
  };
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const json = JSON.stringify({ app: 'Belific', version: appVersion, exportedAt: nowIso, counts, tables }, null, 2);
  const csv = toCsv(
    TASK_CSV_HEADERS,
    tasks.map((t) => [
      t.title,
      t.emoji ?? '',
      t.completed,
      t.completedAt ?? '',
      t.dueDate ?? '',
      t.startTime ?? '',
      labels.find((l) => l.key === t.projectKey)?.name ?? '',
      lists.find((l) => l.key === t.listKey)?.name ?? '',
      t.priority ?? '',
      t.durationMinutes ?? '',
      t.actualMinutes ?? '',
      t.recurrence ?? '',
      t.notes ?? '',
      (t.subtasks ?? []).map((s) => `${s.done ? '[x]' : '[ ]'} ${s.title}`),
      t.createdAt,
    ]),
  );
  return { json, counts, total, withheld: tally.n, csv };
}

const NAMES: Record<keyof ExportCounts, [string, string]> = {
  tasks: ['task', 'tasks'],
  labels: ['label', 'labels'],
  lists: ['list', 'lists'],
  settings: ['setting', 'settings'],
  events: ['event', 'events'],
  categories: ['category', 'categories'],
  routines: ['routine', 'routines'],
  routineCompletions: ['routine tick', 'routine ticks'],
  brainDumpItems: ['old Brain Dump item', 'old Brain Dump items'],
};

// "Exported 36 tasks, 10 labels (46 rows in all)."
export function exportMessage(r: ExportResult, what: 'json' | 'csv'): string {
  if (what === 'csv') {
    return `Exported ${r.counts.tasks} ${r.counts.tasks === 1 ? 'task' : 'tasks'} to CSV (one row each). The JSON file has everything.`;
  }
  const parts = (Object.keys(r.counts) as Array<keyof ExportCounts>)
    .filter((k) => r.counts[k] > 0)
    .map((k) => `${r.counts[k]} ${NAMES[k][r.counts[k] === 1 ? 0 : 1]}`);
  const withheld = r.withheld > 0 ? ` ${r.withheld} secret-looking ${r.withheld === 1 ? 'entry was' : 'entries were'} left out.` : '';
  return `Exported ${r.total} ${r.total === 1 ? 'row' : 'rows'}${parts.length ? `: ${parts.join(', ')}` : ''}.${withheld}`;
}
