'use strict';
// Desktop settings kept in the main process store (decisions 017 and 020).
// Pure Node. Every value is validated, so a hand edited or corrupt file can
// never produce an unusable setting.
const SETTINGS_KEY = 'belific_desktop_settings';
const MAX_LEADS = 5;
// Whole minutes 0 to 1440, distinct, ascending, at most five.
function normalizeLeads(list) {
  const out = new Set();
  for (const n of list) if (Number.isInteger(n) && n >= 0 && n <= 1440) out.add(n);
  return [...out].sort((a, b) => a - b).slice(0, MAX_LEADS);
}
const HM = /^([01]\d|2[0-3]):([0-5]\d)$/;
// "My day starts at" (decision 024): a time in 30 minute steps.
const HM_30 = /^([01]\d|2[0-3]):(00|30)$/;

const DEFAULTS = Object.freeze({
  notifyEvents: true, // CustomEvent starts
  notifyTasks: true, // placed tasks at their startTime
  dailyReminder: true, // one grouped reminder (decision 020)
  dailyTime: '09:00',
  // Part B (P5): the reminders a timed task gets unless it has its own list: whole minutes
  // before the start, 0 = at the start; up to five. [] means none by default.
  defaultReminders: Object.freeze([0]),
  dayStart: '05:00', // where the Timebox opens (UI state, never synced)
  showStreaks: true, // the "N days in a row" line on repeating tasks (checkpoint 11, never synced)
  // "Vibrant task colours" on Calendar blocks and Timebox cards (per computer, never synced). 3.19.0: ON for a
  // new user, i.e. when no settings were ever saved. A settings file saved before keeps what it had (see loadSettings).
  vibrantColours: true,
  theme: 'light', // the Theme setting: 'light' (default), 'dark' or 'system' (per computer, never synced)
  closeToTray: true,
  startWithWindows: false, // opt in, off by default
  trayNoteShown: false,
});

const BOOLEANS = ['notifyEvents', 'notifyTasks', 'dailyReminder', 'closeToTray', 'startWithWindows', 'trayNoteShown', 'showStreaks', 'vibrantColours'];

// Applies `partial` onto `current`, ignoring unknown keys and invalid values.
function sanitize(partial, current = DEFAULTS) {
  const out = { ...DEFAULTS, ...current };
  const p = partial && typeof partial === 'object' ? partial : {};
  for (const key of BOOLEANS) {
    if (typeof p[key] === 'boolean') out[key] = p[key];
  }
  if (p.theme === 'light' || p.theme === 'dark' || p.theme === 'system') out.theme = p.theme;
  if (typeof p.dailyTime === 'string' && HM.test(p.dailyTime)) out.dailyTime = p.dailyTime;
  if (typeof p.dayStart === 'string' && HM_30.test(p.dayStart)) out.dayStart = p.dayStart;
  if (Array.isArray(p.defaultReminders)) out.defaultReminders = normalizeLeads(p.defaultReminders);
  // A stored value that is not a list falls back to the default.
  out.defaultReminders = Array.isArray(out.defaultReminders) ? [...out.defaultReminders] : [...DEFAULTS.defaultReminders];
  // A stored value that is not a theme falls back to the default.
  if (out.theme !== 'light' && out.theme !== 'dark' && out.theme !== 'system') out.theme = DEFAULTS.theme;
  // A stored value that is not valid falls back to the default.
  if (!HM_30.test(out.dayStart)) out.dayStart = DEFAULTS.dayStart;
  return out;
}

// 3.19.0: the defaults that changed for NEW users only (vibrant colours on). A person who has settings saved
// already keeps their effective values: a file that has no `vibrantColours` was written when it was off by default,
// so it stays off; a file that cannot be read is treated the same way (it was somebody's file). Only when nothing was
// ever saved do the new defaults apply. The theme default was already Light and is unchanged.
const LEGACY_VALUES = Object.freeze({ vibrantColours: false });

async function loadSettings(kv) {
  let raw = null;
  try {
    raw = await kv.getItem(SETTINGS_KEY);
  } catch {
    return { ...DEFAULTS };
  }
  if (!raw) return { ...DEFAULTS };
  try {
    const parsed = JSON.parse(raw);
    // An empty saved value (null) is no saved settings.
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULTS };
    const out = sanitize(parsed, DEFAULTS);
    const saved = parsed;
    for (const [key, value] of Object.entries(LEGACY_VALUES)) if (typeof saved[key] !== 'boolean') out[key] = value;
    return out;
  } catch {
    return { ...DEFAULTS, ...LEGACY_VALUES };
  }
}

async function saveSettings(kv, settings) {
  await kv.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// The options for app.setLoginItemSettings. Opening at login starts hidden
// in the tray (the window only shows when the user opens it).
function loginItemOptions(enabled, execPath) {
  return { openAtLogin: !!enabled, path: execPath, args: enabled ? ['--hidden'] : [] };
}

module.exports = { DEFAULTS, SETTINGS_KEY, sanitize, loadSettings, saveSettings, loginItemOptions };
