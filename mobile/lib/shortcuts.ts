// The keyboard shortcut registry (build plan phase 2, section 5). ONE place: the
// help overlay (Shift+/) is generated from this list, and every handler asks
// `shortcutFor` what a key press means. Pure: NO runtime imports; see
// shortcuts.test.ts.
//
// Rules, all enforced here and checked by tests:
//  - Nothing ever fires while the person is typing (an input, a textarea, a
//    select or a contenteditable), whatever the key. A single letter typed into
//    a field is text, and a Ctrl combination in a field is left to the field.
//  - Nothing fires while a popover or an overlay is open (`blocked`), except
//    that those own their own keys.
//  - Tab and Space are never shortcuts: Tab keeps normal focus order (build
//    plan section 0, item 10) and Space scrolls or activates a focused button.
//  - Alt is never part of a shortcut (menus, accessibility tools).
//  - Only shortcuts that are really wired are listed, so the overlay never
//    promises a key that does nothing.
//
// Scopes: 'home' keys work anywhere on the home screen; 'card' keys act on
// the task card that has the keyboard focus (the card element itself or a
// button inside it, never a field).

export type ShortcutId =
  // General
  | 'help'
  | 'search'
  | 'onlyToday'
  | 'quickCapture'
  | 'newTaskToday'
  | 'toggleLeftPane'
  | 'toggleRightPane'
  // Navigation
  | 'dayView'
  | 'weekView'
  | 'monthView'
  | 'toggleCenter'
  | 'nextTask'
  | 'prevTask'
  // Task (on the focused card)
  | 'complete'
  | 'openDetails'
  | 'toggleSubtasks'
  | 'newSubtask'
  | 'editEstimate'
  | 'editActual'
  | 'selectLabel'
  | 'toggleTimer'
  | 'duplicateTask'
  | 'deleteTask';

export type ShortcutGroup = 'General' | 'Navigation' | 'Task';
export type ShortcutScope = 'home' | 'card';

export interface ShortcutDef {
  id: ShortcutId;
  keys: string;
  label: string;
  group: ShortcutGroup;
  scope: ShortcutScope;
}

// Phase 2: the task keys, the arrows between cards, help, and one way to add.
export const PHASE2_SHORTCUTS: ShortcutDef[] = [
  { id: 'help', keys: 'Shift+/', label: 'Show keyboard shortcuts', group: 'General', scope: 'home' },
  { id: 'quickCapture', keys: 'Q', label: 'Quick capture into the current list', group: 'General', scope: 'home' },

  { id: 'nextTask', keys: 'Down', label: 'Next task', group: 'Navigation', scope: 'card' },
  { id: 'prevTask', keys: 'Up', label: 'Previous task', group: 'Navigation', scope: 'card' },

  { id: 'complete', keys: 'C', label: 'Complete or reopen the task', group: 'Task', scope: 'card' },
  { id: 'toggleSubtasks', keys: 'S', label: 'Show or hide notes and subtasks', group: 'Task', scope: 'card' },
  { id: 'newSubtask', keys: 'Ctrl+S', label: 'New subtask', group: 'Task', scope: 'card' },
  { id: 'openDetails', keys: 'O', label: 'Open the task details', group: 'Task', scope: 'card' },
  { id: 'editEstimate', keys: 'Ctrl+E', label: 'Set the estimate', group: 'Task', scope: 'card' },
  { id: 'editActual', keys: 'Ctrl+B', label: 'Set the actual time', group: 'Task', scope: 'card' },
  { id: 'selectLabel', keys: 'Ctrl+L', label: 'Choose a label', group: 'Task', scope: 'card' },
  { id: 'toggleTimer', keys: 'Ctrl+Shift+Enter', label: 'Start or stop the timer', group: 'Task', scope: 'card' },
  { id: 'duplicateTask', keys: 'Ctrl+Shift+D', label: 'Duplicate the task', group: 'Task', scope: 'card' },
  { id: 'deleteTask', keys: 'Ctrl+Delete', label: 'Delete the task', group: 'Task', scope: 'card' },
];

// Phase 3: search, capture for today, the layout and the Calendar views.
export const PHASE3_SHORTCUTS: ShortcutDef[] = [
  { id: 'search', keys: 'Ctrl+K', label: 'Search tasks', group: 'General', scope: 'home' },
  { id: 'newTaskToday', keys: 'T', label: 'Quick capture a task for today', group: 'General', scope: 'home' },
  { id: 'onlyToday', keys: 'Shift+F', label: 'Show only today', group: 'General', scope: 'home' },
  { id: 'toggleLeftPane', keys: '[', label: 'Hide or show the left pane', group: 'General', scope: 'home' },
  { id: 'toggleRightPane', keys: ']', label: 'Hide or show the right pane', group: 'General', scope: 'home' },

  { id: 'toggleCenter', keys: 'V', label: 'Switch between Kanban and Calendar', group: 'Navigation', scope: 'home' },
  { id: 'dayView', keys: 'D', label: 'Calendar day view', group: 'Navigation', scope: 'home' },
  { id: 'weekView', keys: 'W', label: 'Calendar week view', group: 'Navigation', scope: 'home' },
  { id: 'monthView', keys: 'M', label: 'Calendar month view', group: 'Navigation', scope: 'home' },
];

export const SHORTCUTS: ShortcutDef[] = [...PHASE2_SHORTCUTS, ...PHASE3_SHORTCUTS];

// ---- matching ----

export interface KeyLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  isComposing?: boolean;
}

interface ParsedSpec {
  ctrl: boolean;
  shift: boolean;
  key: string;
}

const KEY_ALIASES: Record<string, string> = {
  down: 'ArrowDown',
  up: 'ArrowUp',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  esc: 'Escape',
  enter: 'Enter',
  delete: 'Delete',
};

export function parseSpec(spec: string): ParsedSpec {
  const parts = spec.split('+');
  // "Shift+/" has a "/" part; a lone "+" key is not used.
  const key = parts[parts.length - 1];
  const mods = parts.slice(0, -1).map((m) => m.toLowerCase());
  const lower = key.toLowerCase();
  return {
    ctrl: mods.includes('ctrl'),
    shift: mods.includes('shift'),
    key: KEY_ALIASES[lower] ?? (key.length === 1 ? lower : key),
  };
}

function eventKey(e: KeyLike): string {
  return e.key.length === 1 ? e.key.toLowerCase() : e.key;
}

// Does this key press mean this shortcut? Pure matching, no context rules.
export function keyMatches(spec: string, e: KeyLike): boolean {
  if (e.isComposing || e.altKey) return false;
  const p = parseSpec(spec);
  const ctrl = !!(e.ctrlKey || e.metaKey);
  if (ctrl !== p.ctrl) return false;
  // A shifted symbol key arrives as another character ("?" for "/"), whatever
  // the layout, so compare the character and ignore the Shift flag for it.
  if (p.shift && p.key === '/') return e.key === '?' || (e.key === '/' && !!e.shiftKey);
  if (!!e.shiftKey !== p.shift) return false;
  return eventKey(e) === p.key;
}

export interface ShortcutContext {
  // The key came from an input, textarea, select or contenteditable.
  typing: boolean;
  // A popover or an overlay is open and owns the keyboard.
  blocked?: boolean;
  // Which handler is asking: the home screen's, or a task card's.
  scope: ShortcutScope;
}

// What a key press means in this context, or null. The one function every
// handler uses.
export function shortcutFor(e: KeyLike, ctx: ShortcutContext): ShortcutId | null {
  if (ctx.typing || ctx.blocked) return null;
  for (const def of SHORTCUTS) {
    if (def.scope === ctx.scope && keyMatches(def.keys, e)) return def.id;
  }
  return null;
}

// A key press the registry knows in ANY scope. Used by the home handler to
// leave 'card' keys alone (the card handles them) and by tests.
export function isRegisteredKey(e: KeyLike): boolean {
  return SHORTCUTS.some((d) => keyMatches(d.keys, e));
}

export function shortcutGroups(): Array<{ group: ShortcutGroup; items: ShortcutDef[] }> {
  const order: ShortcutGroup[] = ['General', 'Navigation', 'Task'];
  return order.map((group) => ({ group, items: SHORTCUTS.filter((d) => d.group === group) }));
}

// How a spec is shown in the overlay: "Ctrl+Shift+Enter", "Shift+/" -> "Shift+?"
// is NOT done: the overlay shows what is typed on a US keyboard.
export function displayKeys(spec: string): string {
  return spec.replace('Down', '↓').replace('Up', '↑');
}

// ---- building an event from a spec (tests, and the help overlay's checks) ----
export function eventFromSpec(spec: string): KeyLike {
  const p = parseSpec(spec);
  const key = p.key === '/' && p.shift ? '?' : p.key.length === 1 && p.shift ? p.key.toUpperCase() : p.key;
  return { key, ctrlKey: p.ctrl, shiftKey: p.shift };
}
