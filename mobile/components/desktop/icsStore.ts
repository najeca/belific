import { useSyncExternalStore } from 'react';
import { kv } from '../../lib/kv';
import { expandCalendar, type IcsCalendar, type Occurrence } from '../../lib/icsParse';
import {
  afterFetch,
  checkSubscriptionUrl,
  defaultName,
  fetchErrorText,
  isRefreshDue,
  sanitizeSubscriptions,
  MAX_SUBSCRIPTIONS,
  URL_ERROR_TEXT,
  type IcsSubscription,
} from '../../lib/icsSubscriptions';

// Imported calendar subscriptions on the desktop (build plan phase 8, step 3),
// as a small module store: the Settings section and the Calendar follow one
// value. Everything stays on this computer (kv, never synced, never in the
// export): the list in SUBS_KEY, each calendar's parsed events under
// calKey(id). The main process fetches (desktop/src/icsFetch.js); this store
// never logs a link. Refreshed every 30 minutes while the window is visible
// (10 after a failure), and on demand.
const SUBS_KEY = 'belific_ics_subscriptions';
const calKey = (id: string) => `belific_ics_cal_${id}`;
const TICK_MS = 60 * 1000;

interface IcsState {
  subs: IcsSubscription[];
  cals: Record<string, IcsCalendar>;
  refreshing: string[];
  loaded: boolean;
  version: number;
}

let state: IcsState = { subs: [], cals: {}, refreshing: [], loaded: false, version: 0 };
const listeners = new Set<() => void>();
const set = (patch: Partial<IcsState>, eventsChanged = false) => {
  state = { ...state, ...patch, version: state.version + (eventsChanged ? 1 : 0) };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useIcs(): IcsState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

async function saveSubs(subs: IcsSubscription[]): Promise<void> {
  try {
    await kv.setItem(SUBS_KEY, JSON.stringify(subs));
  } catch {
    // The list on screen stays; the next change tries again.
  }
}

let loading: Promise<void> | null = null;
export function loadIcs(): Promise<void> {
  if (state.loaded) return Promise.resolve();
  if (loading) return loading;
  loading = (async () => {
    let subs: IcsSubscription[] = [];
    try {
      subs = sanitizeSubscriptions(JSON.parse((await kv.getItem(SUBS_KEY)) ?? '[]'));
    } catch {
      subs = [];
    }
    const cals: Record<string, IcsCalendar> = {};
    for (const s of subs) {
      try {
        const raw = await kv.getItem(calKey(s.id));
        const c = raw ? (JSON.parse(raw) as IcsCalendar) : null;
        if (c && Array.isArray(c.events) && c.zones && typeof c.zones === 'object') cals[s.id] = c;
      } catch {
        // A damaged calendar file shows nothing until the next refresh.
      }
    }
    set({ subs, cals, loaded: true }, true);
  })();
  return loading;
}

function newId(): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return 's' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function fetchText(url: string) {
  const bridge = globalThis.belificDesktop?.ics;
  if (!bridge) return { ok: false as const, reason: 'unavailable' };
  try {
    return await bridge.fetch(url);
  } catch {
    return { ok: false as const, reason: 'network' };
  }
}

// Adds a subscription only after its first fetch worked, so a wrong link is
// told at once and never stored. Returns a sentence when it was not added.
export async function addSubscription(rawUrl: string, name?: string): Promise<{ ok: true } | { ok: false; message: string }> {
  await loadIcs();
  const check = checkSubscriptionUrl(rawUrl);
  if (!check.ok) return { ok: false, message: URL_ERROR_TEXT[check.reason] };
  if (state.subs.length >= MAX_SUBSCRIPTIONS) return { ok: false, message: `You can add up to ${MAX_SUBSCRIPTIONS} calendars.` };
  if (state.subs.some((s) => s.url === check.url)) return { ok: false, message: 'That calendar is already added.' };
  const result = await fetchText(check.url);
  if (!result.ok) return { ok: false, message: fetchErrorText(result.reason) ?? 'The calendar could not be added.' };
  const now = new Date().toISOString();
  const draft: IcsSubscription = { id: newId(), name: '', url: check.url, addedAt: now };
  const { sub, calendar } = afterFetch(draft, result, now);
  sub.name = (name ?? '').trim().slice(0, 60) || defaultName(calendar?.name, check.url);
  try {
    if (calendar) await kv.setItem(calKey(sub.id), JSON.stringify(calendar));
  } catch {
    return { ok: false, message: 'The calendar could not be saved on this computer.' };
  }
  const subs = [...state.subs, sub];
  set({ subs, cals: calendar ? { ...state.cals, [sub.id]: calendar } : state.cals }, true);
  await saveSubs(subs);
  return { ok: true };
}

export async function removeSubscription(id: string): Promise<void> {
  await loadIcs();
  const subs = state.subs.filter((s) => s.id !== id);
  const { [id]: _gone, ...cals } = state.cals;
  set({ subs, cals }, true);
  await saveSubs(subs);
  try {
    await kv.removeItem(calKey(id));
  } catch {
    // An orphaned file is harmless; it is never read without its list entry.
  }
}

export async function refreshSubscription(id: string): Promise<void> {
  await loadIcs();
  const sub = state.subs.find((s) => s.id === id);
  if (!sub || state.refreshing.includes(id)) return;
  set({ refreshing: [...state.refreshing, id] });
  const result = await fetchText(sub.url);
  const out = afterFetch(sub, result, new Date().toISOString());
  if (out.calendar) {
    try {
      await kv.setItem(calKey(id), JSON.stringify(out.calendar));
    } catch {
      // Shown from memory now; the file is written again next time.
    }
  }
  // The subscription may have been removed while fetching.
  if (!state.subs.some((s) => s.id === id)) {
    set({ refreshing: state.refreshing.filter((r) => r !== id) });
    return;
  }
  const subs = state.subs.map((s) => (s.id === id ? out.sub : s));
  set({ subs, cals: out.calendar ? { ...state.cals, [id]: out.calendar } : state.cals, refreshing: state.refreshing.filter((r) => r !== id) }, !!out.calendar);
  await saveSubs(subs);
}

export async function refreshAll(onlyDue: boolean): Promise<void> {
  await loadIcs();
  const now = Date.now();
  for (const s of state.subs) if (!onlyDue || isRefreshDue(s, now)) await refreshSubscription(s.id);
}

// The timer: on start, when the window becomes visible, then every minute it
// refreshes whatever is due, only while the window is visible. Returns a stop function.
export function startIcsRefresh(): () => void {
  const tick = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    refreshAll(true).catch(() => {});
  };
  tick();
  const id = setInterval(tick, TICK_MS);
  // The window starts hidden and is shown a moment later: check again then,
  // and whenever it comes back from the tray.
  const onVisible = () => {
    if (document.visibilityState === 'visible') tick();
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
  return () => {
    clearInterval(id);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
  };
}

// Every imported event overlapping [fromMs, toMs), with the calendar's name.
export interface ImportedOccurrence extends Occurrence {
  calendarName: string;
}
export function importedOccurrences(s: IcsState, fromMs: number, toMs: number): ImportedOccurrence[] {
  const out: ImportedOccurrence[] = [];
  for (const sub of s.subs) {
    const cal = s.cals[sub.id];
    if (!cal) continue;
    for (const o of expandCalendar(cal, fromMs, toMs)) out.push({ ...o, id: `${sub.id}|${o.id}`, calendarName: sub.name });
  }
  return out;
}
