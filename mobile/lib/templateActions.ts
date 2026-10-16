import { addTask, deleteUserSetting, loadProjectsRaw, loadUserSettingsRaw, setUserSetting } from './storage';
import { generateId } from './data';
import { fitTemplate, serializeTemplate, taskFromTemplate, templateFromTask, templateKey, templatesFromSettings, MAX_TEMPLATES, type TaskTemplate } from './templates';
import type { Task } from './types';

// Task templates on the desktop (build plan phase 7). One user_settings row per
// template (templates.ts), so they sync with no schema change. Every write goes
// through storage.ts, queued like any other.
export async function loadTemplates(): Promise<TaskTemplate[]> {
  return templatesFromSettings(await loadUserSettingsRaw());
}

// Saves what a task describes as a template. Returns null when there are already
// the most templates allowed.
export async function saveTemplateFromTask(task: Task, name: string): Promise<TaskTemplate | null> {
  if ((await loadTemplates()).length >= MAX_TEMPLATES) return null;
  const t = templateFromTask(task, generateId(), name.trim());
  await setUserSetting(templateKey(t.id), serializeTemplate(t));
  return fitTemplate(t);
}

export async function renameTemplate(id: string, name: string): Promise<boolean> {
  const t = (await loadTemplates()).find((x) => x.id === id);
  const clean = name.trim();
  if (!t || !clean) return false;
  await setUserSetting(templateKey(id), serializeTemplate({ ...t, name: clean }));
  return true;
}

export async function deleteTemplate(id: string): Promise<void> {
  await deleteUserSetting(templateKey(id));
}

// A new task from a template, in the list shown (or on a Day).
export async function createFromTemplate(t: TaskTemplate, where: { listKey?: string; dueDate?: string } = {}): Promise<Task> {
  const labels = await loadProjectsRaw();
  const task = taskFromTemplate(t, generateId(), new Date().toISOString(), {
    ...where,
    liveLabelKeys: new Set(labels.filter((l) => !l.deletedAt).map((l) => l.key)),
    stepId: () => generateId(),
  });
  await addTask(task);
  return task;
}
