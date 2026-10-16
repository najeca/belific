// The layout of the desktop home screen, and how it is remembered (build plan
// phase 3). Pure: NO runtime imports; see paneState.test.ts.
//
// The state is: is the left pane (the list) collapsed, is the right pane (the
// Timebox) collapsed, which view fills the centre (Kanban or Calendar), which
// Calendar view (day, week, month) and whether "show only today" is on.
//
// Where it is kept (Jethro, phase 2 and 3 brief): in user_settings under the
// key "ui.panes", so it follows the person across devices when signed in, with a
// local fallback key used when that setting is missing or unreadable. The
// store below writes both and reads the setting first. A damaged value in
// either place never breaks the screen: anything unreadable falls back to the
// default layout (all panes open, Kanban).
export type CenterView = 'kanban' | 'calendar';
export type CalendarView = 'day' | 'week' | 'month';

export interface PaneState {
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  center: CenterView;
  calendar: CalendarView;
  onlyToday: boolean;
}

export const DEFAULT_PANE_STATE: PaneState = {
  leftCollapsed: false,
  rightCollapsed: false,
  center: 'kanban',
  calendar: 'week',
  onlyToday: false,
};

export const PANE_SETTING_KEY = 'ui.panes';
export const PANE_LOCAL_KEY = 'belific_desktop_panes';

const CENTERS: CenterView[] = ['kanban', 'calendar'];
const CALENDARS: CalendarView[] = ['day', 'week', 'month'];

// Null when the text is not a JSON object at all; otherwise a complete state in
// which every bad or missing field is the default.
export function parsePaneState(raw: string | null | undefined): PaneState | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2000) return null;
  let o: unknown;
  try {
    o = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const r = o as Record<string, unknown>;
  return {
    leftCollapsed: r.leftCollapsed === true,
    rightCollapsed: r.rightCollapsed === true,
    center: CENTERS.includes(r.center as CenterView) ? (r.center as CenterView) : DEFAULT_PANE_STATE.center,
    calendar: CALENDARS.includes(r.calendar as CalendarView) ? (r.calendar as CalendarView) : DEFAULT_PANE_STATE.calendar,
    onlyToday: r.onlyToday === true,
  };
}

export function serializePaneState(s: PaneState): string {
  return JSON.stringify({
    leftCollapsed: s.leftCollapsed,
    rightCollapsed: s.rightCollapsed,
    center: s.center,
    calendar: s.calendar,
    onlyToday: s.onlyToday,
  });
}

// The setting first, then the local copy, then the default.
export function resolvePaneState(settingRaw: string | null | undefined, localRaw: string | null | undefined): PaneState {
  return parsePaneState(settingRaw) ?? parsePaneState(localRaw) ?? DEFAULT_PANE_STATE;
}

// ---- changes (each returns a new state) ----
export const toggleLeft = (s: PaneState): PaneState => ({ ...s, leftCollapsed: !s.leftCollapsed });
export const toggleRight = (s: PaneState): PaneState => ({ ...s, rightCollapsed: !s.rightCollapsed });
export const toggleCenter = (s: PaneState): PaneState => ({ ...s, center: s.center === 'kanban' ? 'calendar' : 'kanban' });
export const toggleOnlyToday = (s: PaneState): PaneState => ({ ...s, onlyToday: !s.onlyToday });
// D, W and M open the Calendar in that view, from either centre view.
export const showCalendar = (s: PaneState, view: CalendarView): PaneState => ({ ...s, center: 'calendar', calendar: view });

// How the three columns share the width. A collapsed pane is a narrow rail
// (a fixed width with just its reopen button); the rest share the space in the
// original proportions (left 1, centre 2.2, right 1.2). With both sidebars
// collapsed the centre takes everything but the two rails.
export const RAIL_WIDTH = 44;
export interface PaneLayout {
  left: { collapsed: boolean; flex: number };
  center: { flex: number };
  right: { collapsed: boolean; flex: number };
}
export function paneLayout(s: PaneState): PaneLayout {
  return {
    left: { collapsed: s.leftCollapsed, flex: s.leftCollapsed ? 0 : 1 },
    center: { flex: 2.2 },
    right: { collapsed: s.rightCollapsed, flex: s.rightCollapsed ? 0 : 1.2 },
  };
}

// ---- the store, with its reads and writes injected so a test can fake them ----
export interface PaneStateIo {
  readSetting(key: string): Promise<string | null>;
  writeSetting(key: string, value: string): Promise<void>;
  readLocal(key: string): Promise<string | null>;
  writeLocal(key: string, value: string): Promise<void>;
}

export async function loadPaneState(io: PaneStateIo): Promise<PaneState> {
  let setting: string | null = null;
  let local: string | null = null;
  try {
    setting = await io.readSetting(PANE_SETTING_KEY);
  } catch {
    // fall back to the local copy
  }
  try {
    local = await io.readLocal(PANE_LOCAL_KEY);
  } catch {
    // fall back to the default
  }
  return resolvePaneState(setting, local);
}

// Writes both. One failing never stops the other, and neither throws: losing
// the remembered layout must never lose the screen.
export async function savePaneState(io: PaneStateIo, state: PaneState): Promise<void> {
  const text = serializePaneState(state);
  await Promise.allSettled([io.writeSetting(PANE_SETTING_KEY, text), io.writeLocal(PANE_LOCAL_KEY, text)]);
}
