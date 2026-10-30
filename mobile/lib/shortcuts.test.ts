// Run with `npm test` from mobile/. The shortcut registry (phase 2).
import test from 'node:test';
import assert from 'node:assert/strict';
import { SHORTCUTS, displayKeys, eventFromSpec, isRegisteredKey, keyMatches, parseSpec, shortcutFor, shortcutGroups } from './shortcuts.ts';

const press = (key: string, mods: { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean } = {}) => ({
  key,
  ctrlKey: !!mods.ctrl,
  shiftKey: !!mods.shift,
  altKey: !!mods.alt,
  metaKey: !!mods.meta,
});
const home = { typing: false, scope: 'home' as const };
const card = { typing: false, scope: 'card' as const };

test('every shortcut is found by its own key press, in its own scope', () => {
  for (const def of SHORTCUTS) {
    const ctx = { typing: false, scope: def.scope };
    assert.equal(shortcutFor(eventFromSpec(def.keys), ctx), def.id, def.id);
  }
});

test('NOTHING fires while typing: not one registered key, in either scope', () => {
  for (const def of SHORTCUTS) {
    for (const scope of ['home', 'card'] as const) {
      assert.equal(shortcutFor(eventFromSpec(def.keys), { typing: true, scope }), null, `${def.id} in ${scope}`);
    }
  }
  // the single letters the brief names, typed into a field
  for (const k of ['q', 't', 'c', 'v', 'd', 'w', 'm', 's', 'o', 'f', 'k', '[', ']']) {
    assert.equal(shortcutFor(press(k), { typing: true, scope: 'home' }), null, k);
    assert.equal(shortcutFor(press(k), { typing: true, scope: 'card' }), null, k);
  }
});

test('nothing fires while a popover or overlay owns the keyboard', () => {
  for (const def of SHORTCUTS) {
    assert.equal(shortcutFor(eventFromSpec(def.keys), { typing: false, blocked: true, scope: def.scope }), null, def.id);
  }
});

test('phase 3 keys: search, capture for today, layout and the calendar views', () => {
  const expect: Array<[string, Parameters<typeof press>[1], string]> = [
    ['k', { ctrl: true }, 'search'],
    ['t', {}, 'newTaskToday'],
    ['F', { shift: true }, 'onlyToday'],
    ['[', {}, 'toggleLeftPane'],
    [']', {}, 'toggleRightPane'],
    ['v', {}, 'toggleCenter'],
    ['d', {}, 'dayView'],
    ['w', {}, 'weekView'],
    ['m', {}, 'monthView'],
  ];
  for (const [k, mods, id] of expect) {
    assert.equal(shortcutFor(press(k, mods), home), id, id);
    assert.equal(shortcutFor(press(k, mods), { typing: true, scope: 'home' }), null, `${id} while typing`);
    assert.equal(shortcutFor(press(k, mods), { typing: false, blocked: true, scope: 'home' }), null, `${id} while an overlay is open`);
    assert.equal(shortcutFor(press(k, mods), card), null, `${id} is not a card key`);
  }
  // V, not Tab, switches the centre; Tab is never taken
  assert.equal(shortcutFor(press('Tab'), home), null);
  assert.equal(shortcutFor(press('Tab', { shift: true }), home), null);
  // plain F and Shift+K are nothing
  assert.equal(shortcutFor(press('f'), home), null);
  assert.equal(shortcutFor(press('K', { shift: true }), home), null);
  // a letter with Ctrl is not the plain letter's shortcut
  assert.equal(shortcutFor(press('d', { ctrl: true }), home), null);
  assert.equal(shortcutFor(press('v', { ctrl: true }), home), null, 'Ctrl+V stays paste');
  assert.equal(shortcutFor(press('f', { ctrl: true }), home), null, 'Ctrl+F is not Shift+F');
});

// 3.21.0 (on purpose): Ctrl+Z and Ctrl+Y are the undo and redo of task changes, and only when no field has the
// keyboard (shortcutFor returns null while typing), so a field still undoes its own typing.
test('the registry never takes a key the app menu or the editor needs', () => {
  const taken = ['Ctrl+,', 'Ctrl+Q', 'Ctrl+X', 'Ctrl+C', 'Ctrl+V', 'Ctrl+A', 'Ctrl+=', 'Ctrl+-', 'Ctrl+0'];
  for (const spec of taken) {
    for (const def of SHORTCUTS) {
      assert.ok(!(def.keys.toLowerCase() === spec.toLowerCase()), `${def.id} takes ${spec}`);
    }
  }
});

test('phase 5 keys: planning, today, Brain Dump, the days either side, the time section; never while typing', () => {
  const homeKeys: Array<[string, Parameters<typeof press>[1], string]> = [
    ['P', { ctrl: true, shift: true }, 'dailyPlanning'],
    ['T', { shift: true }, 'goToday'],
    ['B', { shift: true }, 'firstBrainDump'],
  ];
  for (const [k, mods, id] of homeKeys) {
    assert.equal(shortcutFor(press(k, mods), home), id, id);
    assert.equal(shortcutFor(press(k, mods), { typing: true, scope: 'home' }), null, `${id} while typing`);
  }
  const cardKeys: Array<[string, Parameters<typeof press>[1], string]> = [
    ['ArrowLeft', {}, 'prevDay'],
    ['ArrowRight', {}, 'nextDay'],
    ['i', { ctrl: true }, 'toggleTimeSection'],
  ];
  for (const [k, mods, id] of cardKeys) {
    assert.equal(shortcutFor(press(k, mods), card), id, id);
    assert.equal(shortcutFor(press(k, mods), { typing: true, scope: 'card' }), null, `${id} while typing`);
  }
  // plain T is still quick capture for today, plain B nothing
  assert.equal(shortcutFor(press('t'), home), 'newTaskToday');
  assert.equal(shortcutFor(press('b'), home), null);
  // Ctrl+P (print) and Ctrl+Shift+P differ
  assert.equal(shortcutFor(press('p', { ctrl: true }), home), null);
  assert.equal(displayKeys('Left'), '←');
  assert.equal(displayKeys('Right'), '→');
});

test('a task key is ignored by the home handler and the other way round', () => {
  assert.equal(shortcutFor(press('c'), home), null);
  assert.equal(shortcutFor(press('c'), card), 'complete');
  assert.equal(shortcutFor(press('q'), card), null);
  assert.equal(shortcutFor(press('q'), home), 'quickCapture');
});

test('letters match in either case (caps lock) but Shift makes a different key', () => {
  assert.equal(shortcutFor(press('Q'), home), 'quickCapture');
  assert.equal(shortcutFor(press('C', { shift: true }), card), null, 'Shift+C is not Complete');
  assert.equal(shortcutFor(press('C'), card), 'complete', 'caps lock');
});

test('Shift+/ is the help key, whatever the layout calls it', () => {
  assert.equal(shortcutFor(press('?', { shift: true }), home), 'help');
  assert.equal(shortcutFor(press('?'), home), 'help');
  assert.equal(shortcutFor(press('/', { shift: true }), home), 'help');
  assert.equal(shortcutFor(press('/'), home), null);
});

test('Ctrl combinations need Ctrl (or Cmd) and the exact extra modifiers', () => {
  assert.equal(shortcutFor(press('e', { ctrl: true }), card), 'editEstimate');
  assert.equal(shortcutFor(press('e', { meta: true }), card), 'editEstimate');
  assert.equal(shortcutFor(press('e'), card), null);
  assert.equal(shortcutFor(press('e', { ctrl: true, shift: true }), card), null);
  assert.equal(shortcutFor(press('Enter', { ctrl: true, shift: true }), card), 'toggleTimer');
  assert.equal(shortcutFor(press('Enter', { ctrl: true }), card), null);
  assert.equal(shortcutFor(press('Enter', { shift: true }), card), null);
  assert.equal(shortcutFor(press('Enter'), card), null, 'plain Enter stays the card expand key');
  assert.equal(shortcutFor(press('Delete', { ctrl: true }), card), 'deleteTask');
  assert.equal(shortcutFor(press('Delete'), card), null);
  assert.equal(shortcutFor(press('D', { ctrl: true, shift: true }), card), 'duplicateTask');
  assert.equal(shortcutFor(press('d'), card), null, 'plain D is not Duplicate');
  assert.equal(shortcutFor(press('d', { ctrl: true }), card), null);
});

test('Alt is never part of a shortcut, and composing text is never a shortcut', () => {
  for (const def of SHORTCUTS) {
    assert.equal(shortcutFor({ ...eventFromSpec(def.keys), altKey: true }, { typing: false, scope: def.scope }), null, def.id);
    assert.equal(shortcutFor({ ...eventFromSpec(def.keys), isComposing: true }, { typing: false, scope: def.scope }), null, def.id);
  }
});

test('Tab and Space are never shortcuts (focus order is untouched)', () => {
  for (const k of ['Tab', ' ', 'Spacebar']) {
    assert.equal(isRegisteredKey(press(k)), false, JSON.stringify(k));
    assert.equal(isRegisteredKey(press(k, { shift: true })), false, `Shift+${JSON.stringify(k)}`);
    assert.equal(isRegisteredKey(press(k, { ctrl: true })), false, `Ctrl+${JSON.stringify(k)}`);
  }
  for (const def of SHORTCUTS) assert.ok(!/tab|space/i.test(def.keys), def.keys);
});

test('arrow keys move between tasks only on a card', () => {
  assert.equal(shortcutFor(press('ArrowDown'), card), 'nextTask');
  assert.equal(shortcutFor(press('ArrowUp'), card), 'prevTask');
  assert.equal(shortcutFor(press('ArrowDown'), home), null);
  assert.equal(shortcutFor(press('ArrowDown', { shift: true }), card), null);
});

test('no two shortcuts share a key, and the table is complete', () => {
  // A home key works anywhere on the home screen, so it is unique across every
  // scope. A card key and a time block key (2.26.0) act on different elements
  // (the one with the keyboard), so each is unique within its own scope.
  const sigOf = (keys: string) => {
    const p = parseSpec(keys);
    return `${p.ctrl ? 'C' : ''}${p.shift ? 'S' : ''}:${p.key}`;
  };
  const home = new Map<string, string>();
  for (const def of SHORTCUTS.filter((d) => d.scope === 'home')) {
    assert.ok(!home.has(sigOf(def.keys)), `${def.id} clashes with ${home.get(sigOf(def.keys))}`);
    home.set(sigOf(def.keys), def.id);
  }
  for (const scope of ['card', 'block'] as const) {
    const seen = new Map<string, string>();
    for (const def of SHORTCUTS.filter((d) => d.scope === scope)) {
      const sig = sigOf(def.keys);
      assert.ok(!seen.has(sig) && !home.has(sig), `${def.id} clashes with ${seen.get(sig) ?? home.get(sig)}`);
      seen.set(sig, def.id);
    }
  }
  assert.equal(new Set(SHORTCUTS.map((d) => d.id)).size, SHORTCUTS.length);
  for (const def of SHORTCUTS) {
    assert.ok(def.label.length > 0 && def.keys.length > 0);
  }
});

test('the help overlay groups everything, and shows arrows for the arrow keys', () => {
  const groups = shortcutGroups();
  assert.deepEqual(groups.map((g) => g.group), ['General', 'Navigation', 'Task']);
  assert.ok(groups.every((g) => g.items.length > 0), 'no empty group in the overlay');
  assert.equal(groups.reduce((n, g) => n + g.items.length, 0), SHORTCUTS.length);
  assert.equal(displayKeys('Down'), '↓');
  assert.equal(displayKeys('Ctrl+Shift+Enter'), 'Ctrl+Shift+Enter');
});

test('spec parsing', () => {
  assert.deepEqual(parseSpec('Ctrl+Shift+Enter'), { ctrl: true, shift: true, key: 'Enter' });
  assert.deepEqual(parseSpec('Shift+/'), { ctrl: false, shift: true, key: '/' });
  assert.deepEqual(parseSpec('Q'), { ctrl: false, shift: false, key: 'q' });
  assert.deepEqual(parseSpec('['), { ctrl: false, shift: false, key: '[' });
  assert.equal(keyMatches('Down', press('ArrowDown')), true);
});

test('undo and redo: Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z on the home screen, never while typing', () => {
  const keys: Array<[string, Parameters<typeof press>[1], string]> = [
    ['z', { ctrl: true }, 'undo'],
    ['y', { ctrl: true }, 'redo'],
    ['z', { ctrl: true, shift: true }, 'redoAlt'],
  ];
  for (const [k, mods, id] of keys) {
    assert.equal(shortcutFor(press(k, mods), home), id, id);
    assert.equal(shortcutFor(press(k, mods), { typing: true, scope: 'home' }), null, `${id} while typing is left to the field`);
    assert.equal(shortcutFor(press(k, mods), { typing: false, blocked: true, scope: 'home' }), null, `${id} while a popover is open`);
  }
});
