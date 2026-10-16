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
  const seen = new Map<string, string>();
  for (const def of SHORTCUTS) {
    const p = parseSpec(def.keys);
    const sig = `${p.ctrl ? 'C' : ''}${p.shift ? 'S' : ''}:${p.key}`;
    assert.ok(!seen.has(sig), `${def.id} clashes with ${seen.get(sig)}`);
    seen.set(sig, def.id);
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
