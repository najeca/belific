// Pure label naming and deletion rules (checkpoint 4.3). NO runtime imports
// so `node --test` can run it; see labelRules.test.ts. Names compare trimmed
// and case insensitively, so "Work", " work " and "WORK" are one label.
import type { Project } from './types.ts';
import { LABEL_SUGGESTIONS } from './labelSuggestions.ts';

export function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

// The live label with this name, if any (optionally ignoring one key, for a
// rename).
export function findLabelByName<T extends Pick<Project, 'key' | 'name' | 'deletedAt'>>(
  labels: T[],
  name: string,
  exceptKey?: string,
): T | undefined {
  const wanted = normalizeName(name);
  if (!wanted) return undefined;
  return labels.find((l) => !l.deletedAt && l.key !== exceptKey && normalizeName(l.name) === wanted);
}

// The suggestions not yet used by a live label, in their fixed order.
export function availableSuggestions(labels: Pick<Project, 'key' | 'name' | 'deletedAt'>[]): string[] {
  return LABEL_SUGGESTIONS.filter((s) => !findLabelByName(labels, s));
}

// A rename is rejected when the name is blank or another live label has it.
export function renameProblem(
  labels: Pick<Project, 'key' | 'name' | 'deletedAt'>[],
  key: string,
  name: string,
): string | null {
  if (!name.trim()) return 'Enter a name';
  if (findLabelByName(labels, name, key)) return 'Another label already has that name';
  return null;
}

// Where the tasks of a deleted label go: another live label with the same
// name if there is one (so deleting one of two duplicates merges them),
// otherwise no label (undefined).
export function deletedLabelTarget(
  labels: Pick<Project, 'key' | 'name' | 'deletedAt'>[],
  deletedKey: string,
): string | undefined {
  const deleted = labels.find((l) => l.key === deletedKey);
  if (!deleted) return undefined;
  return findLabelByName(labels, deleted.name, deletedKey)?.key;
}
