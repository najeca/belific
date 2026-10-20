// Run with `npm test` from mobile/. "Cut tasks underneath" (Part B, P4): the pieces
// a break leaves of the tasks it overlaps, the minimum length, refusals, and the
// overnight cases. Everything is derived; nothing here touches a task.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CUT_MIN_OPTIONS, DEFAULT_CUT_MIN, cutDay, parseCutMin, pieceTimeText, planCuts, refusalBadge, refusalNote, type CutEntry } from './cuts.ts';

const h = (hh: number, mm = 0) => hh * 60 + mm;
const host = (id: string, start: number, end: number): CutEntry => ({ id, startMin: start, endMin: end, breaks: false });
const brk = (id: string, start: number, end: number): CutEntry => ({ id, startMin: start, endMin: end, breaks: true });
const spans = (r: ReturnType<typeof cutDay>, hostId: string) => r.pieces.filter((p) => p.hostId === hostId).map((p) => [p.startMin, p.endMin]);

test('the setting: 15, 30 or 60, default 30; anything else is the default', () => {
  assert.deepEqual([...CUT_MIN_OPTIONS], [15, 30, 60]);
  assert.equal(DEFAULT_CUT_MIN, 30);
  assert.equal(parseCutMin('15'), 15);
  assert.equal(parseCutMin('60'), 60);
  assert.equal(parseCutMin(30), 30);
  for (const v of ['45', '', null, undefined, 'abc', 0, -30]) assert.equal(parseCutMin(v), 30);
});

test('the drawing: a 9:30 to 16:30 task cut by a 20 minute break at 11:00', () => {
  const r = cutDay([host('boot', h(9, 30), h(16, 30)), brk('break', h(11), h(11, 20))], 30);
  assert.deepEqual(spans(r, 'boot'), [[h(9, 30), h(11)], [h(11, 20), h(16, 30)]]);
  const [a, b] = r.pieces;
  assert.deepEqual([a.head, a.last, a.index, a.count, a.leftMin], [true, false, 0, 2, 420]);
  assert.deepEqual([b.head, b.last, b.index, b.count, b.leftMin], [false, true, 1, 2, 310]);
  assert.deepEqual(r.refusals, []);
  assert.ok(r.cut.has('boot') && !r.cut.has('break'));
  // the labels: "9:30am 7h" then "11:20am 5h 10m left"
  assert.equal(pieceTimeText('9:30am', '7h', '7h', a.head), '9:30am 7h');
  assert.equal(pieceTimeText('11:20am', '7h', '5h 10m', b.head), '11:20am 5h 10m left');
});

test('three breaks in one day: every piece is checked, all are cut', () => {
  const r = cutDay([host('h', h(9), h(17)), brk('b1', h(10), h(10, 15)), brk('b2', h(12), h(12, 30)), brk('b3', h(15), h(15, 20))], 30);
  assert.deepEqual(spans(r, 'h'), [[h(9), h(10)], [h(10, 15), h(12)], [h(12, 30), h(15)], [h(15, 20), h(17)]]);
  assert.deepEqual(r.pieces.map((p) => p.index), [0, 1, 2, 3]);
  assert.ok(r.pieces.every((p) => p.count === 4));
  assert.deepEqual(r.pieces.map((p) => p.leftMin), [480, 405, 270, 100 + 0]);
});

test('a refused break does not stop the others: only the too close one overlaps', () => {
  const r = cutDay([host('h', h(9), h(17)), brk('b1', h(10), h(10, 15)), brk('b2', h(10, 20), h(10, 30)), brk('b3', h(14), h(14, 30))], 30);
  assert.deepEqual(spans(r, 'h'), [[h(9), h(10)], [h(10, 15), h(14)], [h(14, 30), h(17)]]);
  assert.deepEqual(r.refusals, [{ hostId: 'h', breakId: 'b2', reason: 'short', pieceMin: 5 }]);
});

test('the minimum is a boundary: exactly the minimum cuts, one minute less refuses', () => {
  const ok = cutDay([host('h', h(9), h(11)), brk('b', h(9, 30), h(10, 0))], 30);
  assert.deepEqual(spans(ok, 'h'), [[h(9), h(9, 30)], [h(10), h(11)]]);
  const no = cutDay([host('h', h(9), h(11)), brk('b', h(9, 29), h(10, 0))], 30);
  assert.equal(no.cut.size, 0);
  assert.deepEqual(no.refusals, [{ hostId: 'h', breakId: 'b', reason: 'short', pieceMin: 29 }]);
  // the setting changes the verdict
  assert.equal(cutDay([host('h', h(9), h(11)), brk('b', h(9, 29), h(10, 0))], 15).cut.size, 1);
  assert.equal(cutDay([host('h', h(9), h(11)), brk('b', h(9, 29), h(10, 0))], 60).cut.size, 0);
});

test('a break that runs past the end of the host cuts only what is inside it', () => {
  const r = cutDay([host('h', h(9), h(10)), brk('b', h(9, 40), h(11))], 30);
  assert.deepEqual(spans(r, 'h'), [[h(9), h(9, 40)]]);
  assert.equal(r.pieces[0].last, true);
  assert.equal(r.pieces[0].head, true);
  // leaving too little before it refuses: 20 minutes would stay
  const tight = cutDay([host('h', h(9), h(10)), brk('b', h(9, 20), h(11))], 30);
  assert.equal(tight.cut.size, 0);
  assert.deepEqual(tight.refusals, [{ hostId: 'h', breakId: 'b', reason: 'short', pieceMin: 20 }]);
});

test('a break that starts before the host trims the front: the first piece is no longer the head', () => {
  const r = cutDay([host('h', h(10), h(12)), brk('b', h(9), h(10, 30))], 30);
  assert.deepEqual(spans(r, 'h'), [[h(10, 30), h(12)]]);
  assert.equal(r.pieces[0].head, false);
  assert.equal(r.pieces[0].leftMin, 90);
});

test('a break covering the whole host is refused', () => {
  const r = cutDay([host('h', h(10), h(11)), brk('b', h(9, 30), h(11, 30))], 30);
  assert.equal(r.cut.size, 0);
  assert.deepEqual(r.refusals, [{ hostId: 'h', breakId: 'b', reason: 'covers' }]);
  // exactly the same span counts too
  assert.equal(cutDay([host('h', h(10), h(11)), brk('b', h(10), h(11))], 30).refusals[0].reason, 'covers');
});

test('breaks never cut breaks, and a break that touches nothing changes nothing', () => {
  assert.equal(cutDay([brk('a', h(9), h(11)), brk('b', h(10), h(10, 30))], 30).pieces.length, 0);
  const apart = cutDay([host('h', h(9), h(10)), brk('b', h(10), h(11))], 30);
  assert.equal(apart.pieces.length, 0, 'touching at 10:00 is not an overlap');
  assert.equal(cutDay([host('h', h(9), h(10))], 30).pieces.length, 0);
});

test('overlapping breaks cut together; a break inside an already cut gap changes nothing', () => {
  const r = cutDay([host('h', h(9), h(17)), brk('a', h(11), h(12)), brk('b', h(11, 30), h(12, 30)), brk('c', h(11, 10), h(11, 20))], 30);
  assert.deepEqual(spans(r, 'h'), [[h(9), h(11)], [h(12, 30), h(17)]]);
  assert.deepEqual(r.refusals, []);
});

test('several hosts are each cut on their own', () => {
  const r = cutDay([host('a', h(9), h(12)), host('b', h(10), h(14)), brk('x', h(10, 30), h(11)), host('far', h(15), h(16))], 30);
  assert.deepEqual(spans(r, 'a'), [[h(9), h(10, 30)], [h(11), h(12)]]);
  assert.deepEqual(spans(r, 'b'), [[h(10), h(10, 30)], [h(11), h(14)]]);
  assert.equal(r.cut.has('far'), false);
});

test('an overnight host: the last piece ends at the true end past 24:00, left counts to it', () => {
  const r = cutDay([host('night', h(22), h(28)), brk('b', h(23), h(23, 20))], 30);
  assert.deepEqual(spans(r, 'night'), [[h(22), h(23)], [h(23, 20), h(28)]]);
  assert.equal(r.pieces[1].leftMin, 280);
  assert.equal(r.pieces[1].last, true);
  // a break that swallows the tail of the drawn day leaves a last piece that stops at the break
  const tail = cutDay([host('night', h(22), h(28)), brk('b', h(23, 30), h(24))], 30);
  assert.deepEqual(spans(tail, 'night'), [[h(22), h(23, 30)]]);
  assert.equal(tail.pieces[0].endMin, h(23, 30), 'not the true end: the break is above the end of the drawn day');
});

test('the next day: the continuation of an overnight host is cut by that day\'s break', () => {
  // the continuation is an entry from 00:00 to the rest (here 4 hours); a break at 01:00
  const r = cutDay([host('cont:night', 0, h(4)), brk('b', h(1), h(1, 30))], 30);
  assert.deepEqual(spans(r, 'cont:night'), [[0, h(1)], [h(1, 30), h(4)]]);
  assert.deepEqual(r.pieces.map((p) => p.leftMin), [240, 150]);
});

test('an overnight break cuts the host on the first day (clamped) and the next day by its continuation', () => {
  const day1 = cutDay([host('h', h(22), h(25)), brk('b', h(23, 30), h(24) + 60)], 30);
  assert.deepEqual(spans(day1, 'h'), [[h(22), h(23, 30)]]);
  const day2 = cutDay([host('h2', 0, h(3)), brk('cont:b', 0, 60)], 30);
  assert.deepEqual(spans(day2, 'h2'), [[60, h(3)]]);
  assert.equal(day2.pieces[0].head, false);
});

test('the result does not depend on the order of the entries', () => {
  const a = [host('h', h(9), h(17)), brk('b1', h(10), h(10, 30)), brk('b2', h(13), h(13, 45)), host('g', h(12), h(15))];
  const key = (r: ReturnType<typeof cutDay>) => JSON.stringify([...r.pieces].sort((x, y) => x.id.localeCompare(y.id)));
  assert.equal(key(cutDay(a, 30)), key(cutDay([...a].reverse(), 30)));
});

test('bad entries are ignored, never thrown on', () => {
  const r = cutDay([host('h', h(9), h(9)), host('x', NaN, 5), brk('b', 10, 5), host('ok', h(9), h(11)), brk('b2', h(9, 30), h(10))], 30);
  assert.deepEqual(spans(r, 'ok'), [[h(9), h(9, 30)], [h(10), h(11)]]);
  assert.equal(cutDay([], 30).pieces.length, 0);
});

test('planCuts: the host is replaced by its pieces, the refused break gets a note naming the task', () => {
  const entries = [host('task:boot', h(9, 30), h(16, 30)), brk('task:break', h(11), h(11, 20)), host('task:tiny', h(11, 5), h(11, 15)), host('task:far', h(18), h(19))];
  const titles: Record<string, string> = { 'task:boot': 'Boot camp', 'task:tiny': 'Tiny' };
  const plan = planCuts(entries, 30, (id) => titles[id] ?? id);
  assert.deepEqual(plan.items.map((i) => i.id), ['task:boot#0', 'task:boot#1', 'task:break', 'task:tiny', 'task:far']);
  assert.equal(plan.items[0].piece?.head, true);
  assert.equal(plan.items[3].piece, undefined);
  assert.equal(plan.notes.get('task:break'), 'Not cutting Tiny: it would cover all of the task.');
  assert.equal(plan.badges.get('task:break'), 'Not cut: it would cover a whole task');
});

test('refusal notes say what happened and the minimum', () => {
  assert.equal(refusalNote({ hostId: 'h', breakId: 'b', reason: 'short', pieceMin: 10 }, 'Boot camp', 30), 'Not cutting Boot camp: a piece would be 10 min (the minimum is 30 min).');
  assert.equal(refusalNote({ hostId: 'h', breakId: 'b', reason: 'short', pieceMin: 45 }, 'X', 60), 'Not cutting X: a piece would be 45 min (the minimum is 1 h).');
  assert.equal(refusalNote({ hostId: 'h', breakId: 'b', reason: 'covers' }, 'X', 30), 'Not cutting X: it would cover all of the task.');
});

test('moving the break recomputes the pieces; deleting it restores the whole host (derived, nothing stored)', () => {
  const entries = (b?: CutEntry) => [host('h', h(9), h(13)), ...(b ? [b] : [])];
  const moved = (s: number) => spans(cutDay(entries(brk('b', s, s + 20)), 30), 'h');
  assert.deepEqual(moved(h(10)), [[h(9), h(10)], [h(10, 20), h(13)]]);
  assert.deepEqual(moved(h(11)), [[h(9), h(11)], [h(11, 20), h(13)]]);
  assert.deepEqual(moved(h(9, 10)), [], 'too close to the start (10 minutes would stay): refused, the host is whole');
  assert.deepEqual(spans(cutDay(entries(), 30), 'h'), [], 'no break: no pieces');
});

test('the short badge on the block', () => {
  assert.equal(refusalBadge({ hostId: 'h', breakId: 'b', reason: 'short', pieceMin: 20 }, 30), 'Not cut: 20 min piece (min 30)');
  assert.equal(refusalBadge({ hostId: 'h', breakId: 'b', reason: 'covers' }, 30), 'Not cut: it would cover a whole task');
});
