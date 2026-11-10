import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carryPlan, gapLayout, gapTip } from './gaps.ts';
import { GAP_BLOCK_MIN_PX, layoutItems } from './timebox.ts';

// PLAN_breaks_as_gaps section 6: Boot Camp 9:30 for 7 h, breaks 11:00 (20 min), 12:30 (1 h), 15:00 (20 min), and on
// Monday four tasks dropped into the gaps.
const m = (h: number, min = 0) => h * 60 + min;
const camp = { id: 'task:camp', startMin: m(9, 30), endMin: m(16, 30), breaks: false };
const breaks = [
  { id: 'task:short1', startMin: m(11), endMin: m(11, 20), breaks: true },
  { id: 'task:long', startMin: m(12, 30), endMin: m(13, 30), breaks: true },
  { id: 'task:short2', startMin: m(15), endMin: m(15, 20), breaks: true },
];
const guests = [
  { id: 'task:warm', startMin: m(11), endMin: m(11, 20), breaks: false },
  { id: 'task:run', startMin: m(12, 30), endMin: m(13), breaks: false },
  { id: 'task:lunch', startMin: m(13), endMin: m(13, 30), breaks: false },
  { id: 'task:shower', startMin: m(15), endMin: m(15, 20), breaks: false },
];
const titleOf = (id: string) => id.replace('task:', '');

test('Boot Camp, Monday: four pieces, three gaps, and the four tasks as blocks in the gaps at their real times', () => {
  const g = gapLayout([camp, ...breaks, ...guests], 30, titleOf);
  assert.deepEqual(g.gaps.map((x) => x.id).sort(), ['task:long', 'task:short1', 'task:short2']);
  assert.ok(g.gaps.every((x) => !x.refused));
  const pieces = g.items.filter((i) => i.piece).map((i) => [i.startMin, i.endMin]);
  assert.deepEqual(pieces, [[m(9, 30), m(11)], [m(11, 20), m(12, 30)], [m(13, 30), m(15)], [m(15, 20), m(16, 30)]]);
  const inGap = g.items.filter((i) => i.gapId).map((i) => [i.id, i.gapId, i.startMin, i.endMin, i.minPx]);
  assert.deepEqual(inGap, [
    ['task:warm', 'task:short1', m(11), m(11, 20), GAP_BLOCK_MIN_PX],
    ['task:run', 'task:long', m(12, 30), m(13), GAP_BLOCK_MIN_PX],
    ['task:lunch', 'task:long', m(13), m(13, 30), GAP_BLOCK_MIN_PX],
    ['task:shower', 'task:short2', m(15), m(15, 20), GAP_BLOCK_MIN_PX],
  ]);
  assert.ok(!g.items.some((i) => i.id.startsWith('task:short') || i.id === 'task:long'), 'a break is never a block');
  // Full width: nothing in a gap shares a lane with the pieces.
  assert.ok(layoutItems(g.items).blocks.every((b) => b.cols === 1));
});

test('Boot Camp, Tuesday: no tasks in the gaps, the gaps stay empty (hatched)', () => {
  const g = gapLayout([camp, ...breaks], 30, titleOf);
  assert.equal(g.gaps.length, 3);
  assert.equal(g.items.length, 4);
  assert.ok(g.items.every((i) => i.piece && !i.gapId));
});

test('a 10 minute task in a gap is 10 px high (not the 20 px floor), so it ends inside the gap', () => {
  const g = gapLayout([camp, breaks[0], { id: 'task:apply', startMin: m(11), endMin: m(11, 10), breaks: false }], 30, titleOf);
  const b = layoutItems(g.items).blocks.find((x) => x.id === 'task:apply');
  assert.ok(b);
  assert.equal(Math.round(b.height * 10) / 10, 10);
  const plain = layoutItems([{ id: 'x', startMin: m(11), endMin: m(11, 10) }]).blocks[0];
  assert.equal(plain.height, 20, 'outside a gap the 20 px floor stays');
});

test('a refused cut: the task draws whole, the gap is marked refused and the task carries the reason', () => {
  // A break 10:00 to 10:20 in a task 9:30 to 11:00 leaves a 30 and a 40: with a minimum of 60 it is refused.
  const host = { id: 'task:h', startMin: m(9, 30), endMin: m(11), breaks: false };
  const brk = { id: 'task:b', startMin: m(10), endMin: m(10, 20), breaks: true };
  const g = gapLayout([host, brk], 60, titleOf);
  assert.deepEqual(g.items.map((i) => [i.id, i.startMin, i.endMin]), [['task:h', m(9, 30), m(11)]]);
  assert.equal(g.gaps[0].refused, true);
  assert.match(g.hostNotes.get('task:h') ?? '', /a piece would be 30 min \(the minimum is 1 h\)/);
  assert.equal(g.hostBadges.get('task:h'), 'Not cut: 30 min piece (min 60)');
});

test('a break inside a longer break is a second gap inside the first, drawn after it', () => {
  const outer = { id: 'task:o', startMin: m(12), endMin: m(13), breaks: true };
  const inner = { id: 'task:i', startMin: m(12, 10), endMin: m(12, 20), breaks: true };
  const g = gapLayout([inner, outer], 30, titleOf);
  assert.deepEqual(g.gaps.map((x) => x.id), ['task:o', 'task:i']);
  assert.equal(g.items.length, 0);
});

test('yesterday\'s overnight break is a gap at the top of today; a break on empty grid is a gap on its own', () => {
  const g = gapLayout([{ id: 'cont:night', startMin: 0, endMin: m(1), breaks: true, cont: true }, { id: 'task:free', startMin: m(18), endMin: m(18, 30), breaks: true }], 30, titleOf);
  assert.deepEqual(g.gaps.map((x) => [x.id, x.cont]), [['cont:night', true], ['task:free', false]]);
  assert.equal(g.items.length, 0);
});

test('gapTip: the name and the length', () => {
  assert.equal(gapTip('Short break', 20), 'Short break · 20 min');
  assert.equal(gapTip('Long break', 60), 'Long break · 1 h');
  assert.equal(gapTip('', 90), 'Break · 1 h 30 min');
});

// D5: the breaks wholly inside a task's old span move with it, by the same amount, on the same or another day.
test('carryPlan: Boot Camp moved 30 minutes later takes its three breaks along; Lunch (a task) and a break outside stay', () => {
  const e = (id: string, s: number, en: number, breaks: boolean, cont = false) =>
    ({ id: `task:${id}`, startMin: s, endMin: en, breaks, cont, task: { id } as never, full: { id } as never, projected: false });
  const entries = [e('camp', m(9, 30), m(16, 30), false), ...breaks.map((b) => e(b.id.slice(5), b.startMin, b.endMin, true)), e('lunch', m(13), m(13, 30), false), e('evening', m(18), m(18, 20), true), e('night', 0, m(1), true, true)];
  const from = { dayKey: '2026-11-09', startMin: m(9, 30), endMin: m(16, 30) };
  const moves = carryPlan(entries, 'camp', from, '2026-11-09', m(10));
  assert.deepEqual(moves.map((x) => [x.entry.id, x.startMin, x.dayKey]), [
    ['task:short1', m(11, 30), '2026-11-09'],
    ['task:long', m(13), '2026-11-09'],
    ['task:short2', m(15, 30), '2026-11-09'],
  ]);
  assert.deepEqual(carryPlan(entries, 'camp', from, '2026-11-10', m(9, 30)).map((x) => [x.entry.id, x.startMin, x.dayKey])[0], ['task:short1', m(11), '2026-11-10'], 'to another day at the same time');
  assert.equal(carryPlan(entries, 'camp', from, '2026-11-09', m(9, 30)).length, 0, 'no move, nothing to carry');
  // A move that would push a break past midnight leaves that break.
  assert.deepEqual(carryPlan(entries, 'camp', from, '2026-11-09', m(9, 30) + m(11)).map((x) => x.entry.id), ['task:short1', 'task:long']);
});

test('a refused cut on a task other breaks did cut: the note goes on the piece under the refused break', () => {
  // 9:00 to 13:00; break one 9:50 (15 min) would leave a 50 minute first piece; with a minimum of 60 it is refused,
  // break two 11:00 (30 min) still cuts. The note is on the first piece (9:00 to 11:00), the one under break one.
  const host = { id: 'task:long', startMin: m(9), endMin: m(13), breaks: false };
  const b1 = { id: 'task:b1', startMin: m(9, 50), endMin: m(10, 5), breaks: true };
  const b2 = { id: 'task:b2', startMin: m(11), endMin: m(11, 30), breaks: true };
  const g = gapLayout([host, b1, b2], 60, titleOf);
  assert.deepEqual(g.items.map((i) => i.id), ['task:long#0', 'task:long#1']);
  assert.deepEqual([...g.hostNotes.keys()], ['task:long#0']);
  assert.equal(g.hostBadges.get('task:long#0'), 'Not cut: 50 min piece (min 60)');
});
