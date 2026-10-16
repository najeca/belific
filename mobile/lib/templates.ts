// Task templates (build plan phase 7). Pure: NO runtime imports besides
// siblings; see templates.test.ts.
//
// A template is one user_settings row, key `template.<id>`, whose value is a
// small JSON object (so templates follow the person across devices with no
// schema change). A setting value is capped at 4000 characters (syncCore
// MAX_SETTING_VALUE), so a template is trimmed to fit: a long note is cut and
// surplus steps are dropped, never the title. A template holds what a task
// DESCRIBES (title, notes, estimate, priority, label, steps), never progress
// (no actual time, no timer, no Day, no done state).
import type { EventPriority, Subtask, Task, UserSetting } from './types.ts';
import { MAX_SETTING_VALUE } from './syncCore.ts';

export const TEMPLATE_PREFIX = 'template.';
export const templateKey = (id: string): string => `${TEMPLATE_PREFIX}${id}`;

export const MAX_TEMPLATES = 50;
export const MAX_NAME = 40;
export const MAX_TITLE = 200;
export const MAX_NOTES = 1500;
export const MAX_STEPS = 20;
export const MAX_STEP = 120;

export interface TaskTemplate {
  id: string;
  name: string;
  emoji?: string;
  title: string;
  notes?: string;
  durationMinutes?: number;
  priority?: EventPriority;
  projectKey?: string;
  // The titles of the steps (subtasks), in order.
  steps?: string[];
}

const clean = (s: unknown, max: number): string => (typeof s === 'string' ? s.trim().replace(/\s+/g, ' ').slice(0, max) : '');

// A template as stored: sanitised and trimmed until its JSON fits one setting.
export function fitTemplate(t: TaskTemplate): TaskTemplate {
  const out: TaskTemplate = { id: t.id, name: clean(t.name, MAX_NAME) || clean(t.title, MAX_NAME) || 'Template', title: clean(t.title, MAX_TITLE) };
  if (t.emoji) out.emoji = t.emoji.slice(0, 32);
  const notes = typeof t.notes === 'string' ? t.notes.trim().slice(0, MAX_NOTES) : '';
  if (notes) out.notes = notes;
  if (typeof t.durationMinutes === 'number' && Number.isInteger(t.durationMinutes) && t.durationMinutes >= 1 && t.durationMinutes <= 1440) out.durationMinutes = t.durationMinutes;
  if (t.priority === 'high' || t.priority === 'low') out.priority = t.priority;
  if (t.projectKey) out.projectKey = t.projectKey.slice(0, 80);
  const steps = (t.steps ?? []).map((s) => clean(s, MAX_STEP)).filter(Boolean).slice(0, MAX_STEPS);
  if (steps.length) out.steps = steps;
  // Trim to fit: the notes first, then the last steps. Never the title.
  while (JSON.stringify(out).length > MAX_SETTING_VALUE && (out.notes || out.steps)) {
    if (out.notes && out.notes.length > 100) out.notes = out.notes.slice(0, Math.floor(out.notes.length * 0.8));
    else if (out.steps && out.steps.length > 0) {
      out.steps = out.steps.slice(0, -1);
      if (out.steps.length === 0) delete out.steps;
    } else delete out.notes;
  }
  return out;
}

export function serializeTemplate(t: TaskTemplate): string {
  return JSON.stringify(fitTemplate(t));
}

export function parseTemplate(id: string, raw: string): TaskTemplate | null {
  try {
    const o = JSON.parse(raw) as Partial<TaskTemplate>;
    if (!o || typeof o !== 'object' || typeof o.title !== 'string' || !o.title.trim()) return null;
    return fitTemplate({ ...(o as TaskTemplate), id });
  } catch {
    return null;
  }
}

export function templatesFromSettings(settings: Array<Pick<UserSetting, 'key' | 'value' | 'deletedAt'>>): TaskTemplate[] {
  const out: TaskTemplate[] = [];
  for (const s of settings) {
    if (s.deletedAt || !s.key.startsWith(TEMPLATE_PREFIX)) continue;
    const t = parseTemplate(s.key.slice(TEMPLATE_PREFIX.length), s.value);
    if (t) out.push(t);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)).slice(0, MAX_TEMPLATES);
}

// What a task describes, as a template.
export function templateFromTask(task: Task, id: string, name: string): TaskTemplate {
  return fitTemplate({
    id,
    name: name || task.title,
    emoji: task.emoji,
    title: task.title,
    notes: task.notes,
    durationMinutes: task.durationMinutes,
    priority: task.priority,
    projectKey: task.projectKey,
    steps: (task.subtasks ?? []).map((s) => s.title),
  });
}

// A new task from a template: not done, no Day (unless asked), no time, no
// actual, steps unticked with new ids. A label that has been deleted is dropped.
export function taskFromTemplate(
  t: TaskTemplate,
  newId: string,
  nowIso: string,
  opts: { listKey?: string; dueDate?: string; liveLabelKeys?: ReadonlySet<string>; stepId: (index: number) => string },
): Task {
  const task: Task = { id: newId, title: t.title, completed: false, createdAt: nowIso, updatedAt: nowIso };
  if (t.emoji) task.emoji = t.emoji;
  if (t.notes) task.notes = t.notes;
  if (t.durationMinutes) task.durationMinutes = t.durationMinutes;
  if (t.priority) task.priority = t.priority;
  if (t.projectKey && (!opts.liveLabelKeys || opts.liveLabelKeys.has(t.projectKey))) task.projectKey = t.projectKey;
  if (opts.listKey) task.listKey = opts.listKey;
  if (opts.dueDate) task.dueDate = opts.dueDate;
  if (t.steps && t.steps.length > 0) {
    const subtasks: Subtask[] = t.steps.map((title, i) => ({ id: opts.stepId(i), title, done: false }));
    task.subtasks = subtasks;
  }
  return task;
}
