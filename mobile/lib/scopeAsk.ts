// "This day only / All days" (3.4.0): the question asked when the time or the length of a day of a
// repeating task changes. Pure (no React Native): the desktop draws it as a small popover
// (components/desktop/ScopePrompt.tsx), the phone as a sheet (components/phone/ScopeSheet.tsx); both
// listen here. With nothing drawn to answer (a test, a screen without a host) it answers null at once,
// and null means "dismissed": the caller then does what the app did before the question existed.
export type Scope = 'day' | 'all';

export interface ScopeQuestion {
  title: string;
  // Which answer a dismissal stands for (shown as the default).
  fallback: Scope;
}

export const THIS_DAY_ONLY = 'This day only';
export const ALL_DAYS = 'All days';

type Listener = (q: ScopeQuestion | null) => void;
let current: { q: ScopeQuestion; answer: Promise<Scope | null>; resolve: (s: Scope | null) => void } | null = null;
const listeners = new Set<Listener>();

export function onScopeQuestion(fn: Listener): () => void {
  listeners.add(fn);
  fn(current?.q ?? null);
  return () => {
    listeners.delete(fn);
  };
}

export function askScope(q: ScopeQuestion): Promise<Scope | null> {
  if (listeners.size === 0) return Promise.resolve(null);
  // One change can arrive twice (a time field commits on Enter and again on blur): a question asked
  // while one is open shares its answer, so both writes go the same way.
  if (current) return current.answer;
  let resolve: (s: Scope | null) => void = () => {};
  const answer = new Promise<Scope | null>((r) => {
    resolve = r;
  });
  current = { q, answer, resolve };
  for (const fn of listeners) fn(q);
  return answer;
}

export function answerScope(answer: Scope | null): void {
  const c = current;
  current = null;
  for (const fn of listeners) fn(null);
  c?.resolve(answer);
}

// The fields whose change asks the question: the time and the length of the day.
const TIME_KEYS = ['startTime', 'durationMinutes', 'extraTimes', 'timesDone'] as const;
export function isTimeEdit(fields: object): boolean {
  const keys = Object.keys(fields);
  return keys.length > 0 && keys.every((k) => (TIME_KEYS as readonly string[]).includes(k)) && keys.some((k) => k !== 'timesDone');
}
