import { addProject, deleteProject, loadProjectsRaw, loadTasks, saveProjects, updateProject, updateTask } from './storage';
import { assignMissingColors, nextColorKey } from './labelColors';
import { deletedLabelTarget, findLabelByName, renameProblem } from './labelRules';
import type { Project } from './types';

// Desktop only (imported only from components/desktop, so never by the
// iPhone app, which keeps calling loadProjects). Labels with their colours:
// any live label without a colorKey gets the next free palette colour on
// first read, saved straight away as a silent local fill (updatedAt is not
// touched and nothing is pushed to sync; colorKey is local only until
// checkpoint 5).
export async function loadLabels(): Promise<Project[]> {
  const raw = await loadProjectsRaw();
  const { projects, changed } = assignMissingColors(raw);
  if (changed) await saveProjects(projects);
  return projects.filter((p) => !p.deletedAt);
}

// Changes one label's colour. Same local only write: no updatedAt change and
// no sync push, because the colour is not a synced field yet.
export async function setLabelColor(key: string, colorKey: string): Promise<void> {
  const raw = await loadProjectsRaw();
  await saveProjects(raw.map((p) => (p.key === key ? { ...p, colorKey } : p)));
}

// Creates a label, or returns the existing one with the same name (trimmed,
// case insensitive) so a name never exists twice. A new label takes the next
// unused palette colour.
export async function createLabel(name: string): Promise<{ label: Project; created: boolean } | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const labels = await loadLabels();
  const existing = findLabelByName(labels, trimmed);
  if (existing) return { label: existing, created: false };
  const now = new Date().toISOString();
  const label: Project = {
    key: `project-${Date.now().toString(36)}`,
    name: trimmed,
    createdAt: now,
    updatedAt: now,
    colorKey: nextColorKey(labels),
  };
  await addProject(label);
  return { label, created: true };
}

// Renames a label (a real, synced edit). Returns a problem message instead
// when the name is blank or another label already has it.
export async function renameLabel(key: string, name: string): Promise<string | null> {
  const labels = await loadLabels();
  const problem = renameProblem(labels, key, name);
  if (problem) return problem;
  const label = labels.find((l) => l.key === key);
  if (!label) return 'That label no longer exists';
  if (label.name !== name.trim()) await updateProject({ ...label, name: name.trim() });
  return null;
}

export function countTasksWithLabel(tasks: { projectKey?: string; deletedAt?: string }[], key: string): number {
  return tasks.filter((t) => !t.deletedAt && t.projectKey === key).length;
}

// Deletes a label (a tombstone, never a hard delete). Its tasks move to
// another label with the same name if one exists, otherwise lose their
// label; each is a real task edit through updateTask. Returns where they
// went and how many moved.
export async function deleteLabel(key: string): Promise<{ movedTo?: string; count: number }> {
  const labels = await loadLabels();
  const target = deletedLabelTarget(labels, key);
  const tasks = (await loadTasks()).filter((t) => t.projectKey === key);
  for (const task of tasks) await updateTask({ ...task, projectKey: target });
  await deleteProject(key);
  return { movedTo: target, count: tasks.length };
}
