// Which repeat groups on the phone's Tasks tab are folded (PLAN_phone_stepflow B2.2): kept on this phone only (kv key
// belific_phone_repeat_folds), never synced. Pure; see repeatWords.test.ts.
export const REPEAT_FOLDS_KEY = 'belific_phone_repeat_folds';

export function parseFolds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function toggleFold(folds: string[], key: string): string[] {
  return folds.includes(key) ? folds.filter((k) => k !== key) : [...folds, key];
}
