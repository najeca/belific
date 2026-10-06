import { loadProjectsRaw, saveProjects } from './storage';
import { assignMissingColors } from './labelColors';
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
