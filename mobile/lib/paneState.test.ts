// Run with `npm test` from mobile/. Pane layout and how it is remembered (phase 3).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PANE_STATE,
  PANE_LOCAL_KEY,
  PANE_SETTING_KEY,
  loadPaneState,
  paneLayout,
  parsePaneState,
  resolvePaneState,
  savePaneState,
  serializePaneState,
  showCalendar,
  toggleCenter,
  toggleLeft,
  toggleOnlyToday,
  toggleRight,
  type PaneState,
  type PaneStateIo,
} from './paneState.ts';

function fakeIo(opts: { setting?: string | null; local?: string | null; failSetting?: boolean; failLocal?: boolean } = {}) {
  const store = { setting: opts.setting ?? null, local: opts.local ?? null, writes: [] as string[] };
  const io: PaneStateIo = {
    readSetting: async (key) => {
      assert.equal(key, PANE_SETTING_KEY);
      if (opts.failSetting) throw new Error('boom');
      return store.setting;
    },
    writeSetting: async (key, value) => {
      assert.equal(key, PANE_SETTING_KEY);
      if (opts.failSetting) throw new Error('boom');
      store.setting = value;
      store.writes.push('setting');
    },
    readLocal: async (key) => {
      assert.equal(key, PANE_LOCAL_KEY);
      if (opts.failLocal) throw new Error('boom');
      return store.local;
    },
    writeLocal: async (key, value) => {
      assert.equal(key, PANE_LOCAL_KEY);
      if (opts.failLocal) throw new Error('boom');
      store.local = value;
      store.writes.push('local');
    },
  };
  return { io, store };
}

const custom: PaneState = { leftCollapsed: true, rightCollapsed: false, center: 'calendar', calendar: 'month', onlyToday: true };

test('the default layout has every pane open, Tasks in the centre', () => {
  assert.deepEqual(DEFAULT_PANE_STATE, { leftCollapsed: false, rightCollapsed: false, center: 'kanban', calendar: 'week', onlyToday: false });
});

test('serialise and parse round trip', () => {
  assert.deepEqual(parsePaneState(serializePaneState(custom)), custom);
  assert.deepEqual(parsePaneState(serializePaneState(DEFAULT_PANE_STATE)), DEFAULT_PANE_STATE);
});

test('unreadable text is null; a readable object with bad fields keeps the defaults for those fields', () => {
  for (const bad of [null, undefined, '', 'not json', '[1,2]', '"x"', '5', 'null', 'x'.repeat(3000)]) assert.equal(parsePaneState(bad), null, String(bad).slice(0, 12));
  assert.deepEqual(parsePaneState('{}'), DEFAULT_PANE_STATE);
  assert.deepEqual(parsePaneState('{"leftCollapsed":"yes","center":"timeline","calendar":9,"onlyToday":1}'), DEFAULT_PANE_STATE);
  assert.deepEqual(parsePaneState('{"leftCollapsed":true,"center":"calendar","extra":1}'), { ...DEFAULT_PANE_STATE, leftCollapsed: true, center: 'calendar' });
});

test('the setting wins, then the local copy, then the default', () => {
  const a = serializePaneState(custom);
  const b = serializePaneState({ ...custom, leftCollapsed: false });
  assert.deepEqual(resolvePaneState(a, b), custom);
  assert.deepEqual(resolvePaneState(null, b), { ...custom, leftCollapsed: false });
  assert.deepEqual(resolvePaneState('garbage', b), { ...custom, leftCollapsed: false }, 'a damaged setting falls back to local');
  assert.deepEqual(resolvePaneState('garbage', 'garbage'), DEFAULT_PANE_STATE);
  assert.deepEqual(resolvePaneState(null, null), DEFAULT_PANE_STATE);
});

test('save writes the setting and the local copy; a restart reads it back', async () => {
  const { io, store } = fakeIo();
  await savePaneState(io, custom);
  assert.deepEqual(store.writes.sort(), ['local', 'setting']);
  assert.deepEqual(await loadPaneState(io), custom);
  // a second launch with only what was stored
  const again = fakeIo({ setting: store.setting, local: store.local });
  assert.deepEqual(await loadPaneState(again.io), custom);
});

test('the local copy carries the layout when the setting is missing, unreadable or fails', async () => {
  const text = serializePaneState(custom);
  assert.deepEqual(await loadPaneState(fakeIo({ local: text }).io), custom, 'no setting yet (signed out, first launch)');
  assert.deepEqual(await loadPaneState(fakeIo({ setting: 'garbage', local: text }).io), custom);
  assert.deepEqual(await loadPaneState(fakeIo({ failSetting: true, local: text }).io), custom, 'the read throws');
  assert.deepEqual(await loadPaneState(fakeIo({ failSetting: true, failLocal: true }).io), DEFAULT_PANE_STATE, 'both fail: still a screen');
});

test('saving survives either write failing, and never throws', async () => {
  const a = fakeIo({ failSetting: true });
  await savePaneState(a.io, custom);
  assert.deepEqual(a.store.writes, ['local']);
  const b = fakeIo({ failLocal: true });
  await savePaneState(b.io, custom);
  assert.deepEqual(b.store.writes, ['setting']);
  await savePaneState(fakeIo({ failSetting: true, failLocal: true }).io, custom);
});

test('toggles change one thing each; the originals are untouched', () => {
  const s = DEFAULT_PANE_STATE;
  assert.equal(toggleLeft(s).leftCollapsed, true);
  assert.equal(toggleLeft(toggleLeft(s)).leftCollapsed, false);
  assert.equal(toggleRight(s).rightCollapsed, true);
  assert.equal(toggleCenter(s).center, 'calendar');
  assert.equal(toggleCenter(toggleCenter(s)).center, 'kanban');
  assert.equal(toggleOnlyToday(s).onlyToday, true);
  assert.deepEqual(showCalendar(s, 'day'), { ...s, center: 'calendar', calendar: 'day' });
  assert.deepEqual(showCalendar({ ...s, center: 'calendar', calendar: 'day' }, 'month'), { ...s, center: 'calendar', calendar: 'month' });
  assert.deepEqual(s, DEFAULT_PANE_STATE);
});

test('layout: an open pane shares the width, a collapsed one is a rail, the centre is never hidden', () => {
  assert.deepEqual(paneLayout(DEFAULT_PANE_STATE), { left: { collapsed: false, flex: 1 }, center: { flex: 2.2 }, right: { collapsed: false, flex: 1.2 } });
  const both = paneLayout({ ...DEFAULT_PANE_STATE, leftCollapsed: true, rightCollapsed: true });
  assert.equal(both.left.flex, 0);
  assert.equal(both.right.flex, 0);
  assert.equal(both.left.collapsed && both.right.collapsed, true);
  assert.ok(both.center.flex > 0, 'works with either sidebar hidden, or both');
  assert.ok(paneLayout({ ...DEFAULT_PANE_STATE, leftCollapsed: true }).center.flex > 0);
  assert.ok(paneLayout({ ...DEFAULT_PANE_STATE, rightCollapsed: true }).center.flex > 0);
});

test('2.26.0 widths: sidebar docked from 900, Timebox docked from 1180 in Tasks, never in Calendar', async () => {
  const { responsiveLayout, SIDEBAR_DOCK_MIN, TIMEBOX_DOCK_MIN } = await import('./paneState.ts');
  const s = DEFAULT_PANE_STATE;
  assert.deepEqual(responsiveLayout(s, 1440), { sidebar: 'docked', timebox: 'docked', timeboxAvailable: true });
  assert.deepEqual(responsiveLayout(s, TIMEBOX_DOCK_MIN - 1), { sidebar: 'docked', timebox: 'hidden', timeboxAvailable: true });
  assert.deepEqual(responsiveLayout(s, SIDEBAR_DOCK_MIN - 1), { sidebar: 'hidden', timebox: 'hidden', timeboxAvailable: true });
  assert.deepEqual(responsiveLayout(s, 760, { sidebar: true, timebox: false }).sidebar, 'overlay');
  assert.deepEqual(responsiveLayout(s, 1000, { sidebar: false, timebox: true }).timebox, 'overlay');
  const cal = { ...s, center: 'calendar' as const };
  assert.deepEqual(responsiveLayout(cal, 1920, { sidebar: false, timebox: true }), { sidebar: 'docked', timebox: 'hidden', timeboxAvailable: false });
  // Hidden by the person: hidden at every width, and an overlay still opens on request.
  const hidden = { ...s, leftCollapsed: true, rightCollapsed: true };
  assert.equal(responsiveLayout(hidden, 1920).sidebar, 'hidden');
  assert.equal(responsiveLayout(hidden, 1920).timebox, 'hidden');
  assert.equal(responsiveLayout(hidden, 1920, { sidebar: true, timebox: true }).sidebar, 'overlay');
});

test('2.26.0 toggles: where a panel fits the choice is remembered; where it does not, only the overlay opens', async () => {
  const { sidebarToggle, timeboxToggle } = await import('./paneState.ts');
  const s = DEFAULT_PANE_STATE;
  assert.deepEqual(sidebarToggle(s, 1440, false), { state: { ...s, leftCollapsed: true }, overlayOpen: false });
  assert.deepEqual(sidebarToggle(s, 800, false), { state: s, overlayOpen: true });
  assert.deepEqual(sidebarToggle(s, 800, true), { state: s, overlayOpen: false });
  assert.deepEqual(timeboxToggle(s, 1440, false), { state: { ...s, rightCollapsed: true }, overlayOpen: false });
  assert.deepEqual(timeboxToggle(s, 1000, false), { state: s, overlayOpen: true });
  assert.deepEqual(timeboxToggle({ ...s, center: 'calendar' }, 1440, false), { state: { ...s, center: 'calendar' }, overlayOpen: false });
});
