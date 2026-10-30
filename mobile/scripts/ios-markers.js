'use strict';
// The iOS bundle marker gate (checkpoint 11, decision 018). After
//   npx expo export --platform ios --output-dir <temp folder outside the repo>
// run
//   npm run check:ios-markers -- <that folder>
// It reads the Hermes bundle (.hbc) and fails (exit 1) if any desktop only
// marker is in it. A missing folder or a folder without a bundle exits 2, so a
// failed export can never look like a clean one.
//
// MARKERS are names and strings that must NOT be in the phone's bundle.
//
// ALLOWED is the one explicit exception: `copyRoutineCompletions` is an inert
// exported helper in the shared storage.ts that the phone never calls. Hermes
// de-duplicates strings, so a bundle count cannot show whether a name is used;
// the allowed name is therefore checked in SOURCE: git grep must find it only
// in the files listed in ALLOWED_FILES.
//
// `seriesStreak` is a marker only until the iOS catch-up release reuses the
// streak code. Whoever ships the phone feature must remove that marker from this
// list on purpose (and say so in the commit), not by accident.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const MARKERS = [
  'listenForAuthCallbacks',
  'startAppleSignIn',
  // 2.18.1 (phone move checkpoint): 'startGoogleSignIn' and 'Continue with
  // Google' were removed from this list ON PURPOSE. The iPhone now has its own
  // Google sign in (lib/phoneGoogleAuth.ts, "Sign in with Google" in Settings)
  // and imports the pure parts of authCore.ts, which hold the desktop Sign in
  // page's wording. The desktop only parts stay protected by the names below.
  'SignInPage',
  'signOutDesktop',
  'deleteAccountDesktop',
  'answerAccountChoice',
  'restoreAccountChoice',
  'handleAuthCallback',
  'SettingsPage',
  'LabelsPage',
  'ProgressPage',
  'seriesStreak',
  'RoutineConvertRow',
  // 2.21.0 (build plan phase 4): 'convertRoutines', 'undoConversion' and
  // 'routineConvertActions' were removed from this list ON PURPOSE. The iPhone
  // now has its own Convert in Settings, Data (app/components/
  // RoutineConvertSection.tsx), with the desktop's dry run, confirmation and
  // Undo, so it imports lib/routineConvertActions.ts. The desktop's own row
  // (RoutineConvertRow, its backup step 'routine-convert' and its wording
  // 'Convert routines from your iPhone') stays protected below.
  'routine-convert',
  'Convert routines from your iPhone',
  // 'Show streaks' REMOVED ON PURPOSE in PLAN_phone P5 (2.53.0): the iPhone has its own per phone
  // "Show streaks" switch (Settings, On this iPhone) for the streaks on the Repeating chip. The phone's
  // streaks come from lib/quests.ts (as before); seriesStreak stays a marker. No data risk: a local switch.
  // 2.25.0 (build plan phase 8): imported ICS subscriptions are desktop only.
  // The iPhone reads its own calendars (lib/deviceCalendar.ts) and shares only
  // the pure day layout (lib/externalEvents.ts) and the feed link code.
  'parseIcs',
  'expandCalendar',
  'addSubscription',
  'Calendars shown in Belific',
  // 2.27.1: the emoji picker and its bundled emojibase data are desktop only.
  'searchEmoji',
  'Search emoji for',
  // 2.31.0 (Part B, P4): splitting a task around a break is desktop only (lib/cuts.ts, the
  // Split switch in the details and the Settings row; the visible strings say "split" since 2.33.0,
  // the old "Cut tasks underneath" / "cuts a task" markers were retired with the wording). The phone shows no pieces; the two
  // synced fields (cutsBelow, reminders) are shared sync code and are NOT markers.
  // 'planCuts' and 'refusalNote' REMOVED ON PURPOSE in PLAN_phone P8 (2.56.0): the iPhone's Day view draws a
  // break the way the desktop does (lib/phoneDay.ts uses lib/cuts.ts). Only drawing: the Split setting's
  // words below stay markers, so the switch itself cannot reach the phone.
  'Splits the tasks it overlaps, so you still see them before and after it.',
  'Smallest piece when a break splits a task',
  // 2.32.0 (Part B, P5): several reminders per task and the desktop's default list are desktop only
  // (lib/reminder.ts, reminderStore, Settings, Notifications). The phone notifies nothing until the
  // iPhone catch-up release; the synced field `reminders` is shared sync code and is NOT a marker.
  // 'effectiveReminders' REMOVED ON PURPOSE in PLAN_phone P7 (2.55.0): the iPhone reminds for timed tasks
  // (lib/phoneReminders.ts, components/phone/RemindersEditor.tsx use lib/reminder.ts). Risk: two devices
  // remind for the same task; decision 3 gives each device its own "Remind me on this device" switch.
  'setDefaultReminders',
  'Reminders for a timed task',
  'Turn on Start with Windows',
  // 2.33.0: "Vibrant task colours" (a desktop look setting; lib/vibrant.ts, vibrantStore, Settings, Appearance).
  'vibrantColor',
  'Vibrant task colours',
  // 2.34.1 (Part C, P1): "Start from" a scheduled time and the timer's "could not start" note are desktop
  // only (lib/timerSession.ts startFromChoices, StartFromRows, the notice bar). The phone gets timers in its
  // own adaptation step.
  'startFromChoices',
  'StartFromRows',
  'Could not start the timer',
  // 2.36.0 (Part C, P3): the control that adds a time to a task is desktop only. lib/times.ts and
  // tickTimeProjected are NOT markers: taskActions.ts and seriesActions.ts are shared with the phone (the
  // whole-task tick, the quests), so those names ARE in the phone bundle (the gate found tickTimeProjected
  // on 2026-10-21, and the comment that called it desktop only was wrong); the phone shows a task once, at its start time.
  // 'Add another time' REMOVED ON PURPOSE in PLAN_phone P7 (2.55.0): extra times are edited on the iPhone
  // (components/phone/TimesEditor.tsx), only through lib/times.ts (no overlap, at most six).
  // 2.37.0 (Part C, P4): dragging or resizing one time of a task with several times is desktop only (lib/drag.ts).
  // 'multiDropPatch' and 'resizeRefusal' REMOVED ON PURPOSE in PLAN_phone P10 (2.58.0): the iPhone's Day
  // view drags a block with the desktop's drop rules (lib/phoneDrag.ts uses lib/drag.ts). resizeRefusal
  // comes with the same file: a pure check, and the phone has no edge resize, so no screen uses it.
  // 2.45.0 (the Ellie Planner look): the Theme setting, its store and the desktop's dark theme are desktop only.
  // lib/tokens.ts and lib/theme.ts ARE in the phone bundle (Colors comes from them, as the phone's own palette:
  // nothing on the iPhone changes), so tokens, theme and dark tint names are NOT markers; these are.
  'installTheme',
  'setThemeMode',
  // 'Match system' REMOVED ON PURPOSE in PLAN_phone P1 (2.49.0): the phone's own theme store
  // (components/phone/theme.tsx) imports lib/themeMode.ts, whose labels include it; the Theme row is
  // shown on the phone in P11. A per device setting, never synced: no data risk.
  // 3.6.0 (task during a break): the ⋮ menu's "Do during a break" is desktop only. lib/hosting.ts is NOT a
  // marker: the iPhone's Day view draws hosted tasks with it (3.7.0).
  'Do during a break',
  'DuringBreakBody',
  // 3.8.0: its Settings switch (desktop only; the setting row itself is shared sync data, not a marker).
  'Count minutes done during a break twice',
  // 3.9.0: the chip's menu wording (desktop only). lib/hostActions.ts is NOT a marker: the iPhone's break
  // sheet moves tasks out with it.
  'Move out of break',
  // 3.15.1 to 3.17.0 (the UI fixes batch 2): desktop only wording and names. The List button of the details
  // (ListPick), the Add row's details icon, the native select style, and the Today / Only today buttons. The shared
  // Toggle (components/Toggle.tsx) IS in the phone bundle on purpose (the phone's switches), so it is not a marker; neither
  // are lib/repeatDrop.ts and seriesActions.startRepeatingOn (3.18.1): seriesActions.ts is shared with the phone and
  // Metro does not drop unused exports, so those names are in the bundle, inert (the phone has no drag).
  'ListPick',
  'belific-native-controls',
  'Add the task and open its details',
  'Type a name first, then open the details.',
  'Jump to today (Shift+T)',
  'Press again to see every day',
  // 3.20.0 to 3.22.0 (the UI fixes batch 3): desktop only wording. The undo toast (useUndoRedo.ts), the chip of a hosted
  // Split task (HostChips.tsx) and the details line (TaskDetailPanel). lib/undoStack.ts, lib/seriesTime.ts and the
  // hosting notes (Drop inside, As long as the break) are shared with the phone and are in its bundle, inert.
  'Undone: ',
  'Redone: ',
  'Its Split is ignored while it is inside',
  'Its Split is ignored while it is during',
];

const ALLOWED = {
  copyRoutineCompletions: 'inert helper in the shared storage.ts, never called by the phone',
};

// Where an allowed name may appear in source (repo relative, forward slashes).
const ALLOWED_FILES = new Set([
  'mobile/lib/storage.ts',
  'mobile/lib/routineConvertActions.ts',
  'mobile/scripts/ios-markers.js', // names it in the allow list
]);

function findBundles(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.hbc')) out.push(p);
    }
  };
  walk(dir);
  return out;
}

function count(buffer, text) {
  const needle = Buffer.from(text, 'utf8');
  let n = 0;
  for (let i = buffer.indexOf(needle); i !== -1; i = buffer.indexOf(needle, i + needle.length)) n += 1;
  return n;
}

// -> { error } when the folder or bundle is missing, else { hits, allowed }.
function scanBundle(dir, markers = MARKERS, allowed = ALLOWED) {
  if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return { error: `export folder not found: ${dir}` };
  const bundles = findBundles(dir);
  if (bundles.length === 0) return { error: `no .hbc bundle under ${dir}` };
  const hits = [];
  const seenAllowed = [];
  for (const file of bundles) {
    const buf = fs.readFileSync(file);
    for (const m of markers) {
      const n = count(buf, m);
      if (n > 0) hits.push({ marker: m, count: n, file: path.basename(file) });
    }
    for (const name of Object.keys(allowed)) {
      const n = count(buf, name);
      if (n > 0) seenAllowed.push({ marker: name, count: n, reason: allowed[name] });
    }
  }
  return { hits, allowed: seenAllowed };
}

// Source level check for the allowed names: files (tracked or untracked, not
// ignored) under mobile/ and desktop/ that mention them.
function sourceOffenders(root, allowed = ALLOWED, allowedFiles = ALLOWED_FILES) {
  const offenders = [];
  for (const name of Object.keys(allowed)) {
    const r = spawnSync('git', ['grep', '-l', '-I', '--untracked', '-e', name, '--', 'mobile', 'desktop'], { cwd: root, encoding: 'utf8' });
    if (r.status !== 0 && r.status !== 1) return { error: `git grep failed: ${r.stderr || r.error}` };
    for (const line of (r.stdout || '').split('\n').map((l) => l.trim()).filter(Boolean)) {
      const file = line.replace(/\\/g, '/');
      const test = /\.test\.(ts|js)$/.test(file) || /^desktop\/test\//.test(file);
      if (!allowedFiles.has(file) && !test) offenders.push({ marker: name, file });
    }
  }
  return { offenders };
}

function main(argv) {
  const dir = argv[0];
  const bundle = scanBundle(dir);
  if (bundle.error) {
    console.error(`ios-markers: ${bundle.error}`);
    return 2;
  }
  const root = path.resolve(__dirname, '..', '..');
  const source = sourceOffenders(root);
  if (source.error) {
    console.error(`ios-markers: ${source.error}`);
    return 2;
  }
  let failed = false;
  for (const h of bundle.hits) {
    failed = true;
    console.error(`FAIL marker in the iOS bundle: ${h.marker} (${h.count}) in ${h.file}`);
  }
  for (const o of source.offenders) {
    failed = true;
    console.error(`FAIL ${o.marker} is referenced outside its allowed files: ${o.file}`);
  }
  for (const a of bundle.allowed) console.log(`allowed: ${a.marker} x${a.count} (${a.reason}); source references checked`);
  console.log(failed ? 'ios-markers: FAILED' : `ios-markers: OK, ${MARKERS.length} markers, 0 hits`);
  return failed ? 1 : 0;
}

module.exports = { MARKERS, ALLOWED, ALLOWED_FILES, scanBundle, sourceOffenders, main };

if (require.main === module) process.exitCode = main(process.argv.slice(2));
