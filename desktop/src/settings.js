'use strict';
// Desktop settings kept in the main process store (decisions 017 and 020).
// Pure Node. Every value is validated, so a hand edited or corrupt file can
// never produce an unusable setting.
const SETTINGS_KEY = 'belific_desktop_settings';
const HM = /^([01]\d|2[0-3]):([0-5]\d)$/;
// "My day starts at" (decision 024): a time in 30 minute steps.
const HM_30 = /^([01]\d|2[0-3]):(00|30)$/;

const DEFAULTS = Object.freeze({
  notifyEvents: true, // CustomEvent starts
  notifyTasks: true, // placed tasks at their startTime
  dailyReminder: true, // one grouped reminder (decision 020)
  dailyTime: '09:00',
  dayStart: '05:00', // where the Timebox opens (UI state, never synced)
  closeToTray: true,
  startWithWindows: false, // opt in, off by default
  trayNoteShown: false,
});

const BOOLEANS = ['notifyEvents', 'notifyTasks', 'dailyReminder', 'closeToTray', 'startWithWindows', 'trayNoteShown'];

// Applies `partial` onto `current`, ignoring unknown keys and invalid values.
function sanitize(partial, current = DEFAULTS) {
  const out = { ...DEFAULTS, ...current };
  const p = partial && typeof partial === 'object' ? partial : {};
  for (const key of BOOLEANS) {
    if (typeof p[key] === 'boolean') out[key] = p[key];
  }
  if (typeof p.dailyTime === 'string' && HM.test(p.dailyTime)) out.dailyTime = p.dailyTime;
  if (typeof p.dayStart === 'string' && HM_30.test(p.dayStart)) out.dayStart = p.dayStart;
  // A stored value that is not valid falls back to the default.
  if (!HM_30.test(out.dayStart)) out.dayStart = DEFAULTS.dayStart;
  return out;
}

async function loadSettings(kv) {
  try {
    const raw = await kv.getItem(SETTINGS_KEY);
    return sanitize(raw ? JSON.parse(raw) : {}, DEFAULTS);
  } catch {
    return { ...DEFAULTS };
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
