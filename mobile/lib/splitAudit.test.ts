// Run with `npm test` from mobile/. 3.22.0: the audit of Split and hosting edge cases, with a seeded random check
// of the invariants and one test for each case that was asked about.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cutDay, planCuts, type CutEntry } from './cuts.ts';
import { dayHostEntries, hostDay, hostSnapshot, hostedMinutes, lostGuests, type HostEntry } from './hosting.ts';
import type { Task } from './types.ts';

const h = (hh: number, mm = 0) => hh * 60 + mm;
const ent = (id: string, s: number, e: number, breaks = false, cont = false): HostEntry => ({ id, startMin: s, endMin: e, breaks, ...(cont ? { cont: true } : {}) });
const spansOf = (r: ReturnType<typeof cutDay>, id: string) => r.pieces.filter((p) => p.hostId === id).map((p) => [p.startMin, p.endMin]);

// ---- a seeded random check ----
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

test('random days: the cut pieces and the hosting always satisfy their rules', () => {
  const rand = rng(20261030);
  for (let n = 0; n < 4000; n++) {
    const count = 2 + Math.floor(rand() * 6);
    const entries: HostEntry[] = [];
    for (let i = 0; i < count; i++) {
      const start = Math.floor(rand() * 96) * 15;
      const len = (1 + Math.floor(rand() * 16)) * 15;
      entries.push(ent(`e${i}`, start, start + len, rand() < 0.45, rand() < 0.08));
    }
    const minLen = [15, 30, 60][Math.floor(rand() * 3)];
    const host = hostDay(entries);
    // ---- hosting ----
    const byId = new Map(entries.map((e) => [e.id, e]));
    for (const [g, b] of host.hostOf) {
      const ge = byId.get(g)!;
      const be = byId.get(b)!;
      assert.ok(be.startMin <= ge.startMin && ge.endMin <= be.endMin, `${g} is inside ${b}`);
      assert.ok(host.breakIds.has(b), `${b} hosts, so it is a break`);
      assert.ok(!host.breakIds.has(g), `${g} is hosted, so it is not a break (its Split is ignored)`);
      assert.ok(!ge.cont && !be.cont, 'yesterday never hosts nor is hosted');
    }
    for (const e of entries) {
      if (e.cont || host.hostOf.has(e.id) || host.breakIds.has(e.id)) continue;
      for (const b of host.breakIds) {
        const be = byId.get(b)!;
        assert.ok(!(be.startMin <= e.startMin && e.endMin <= be.endMin), `${e.id} lies inside ${b} and is not hosted`);
      }
    }
    // A hosted break is held by a LONGER one, or one of the same span that sorts first.
    for (const [g, b] of host.hostOf) {
      const ge = byId.get(g)!;
      const be = byId.get(b)!;
      if (ge.breaks) assert.ok(be.endMin - be.startMin >= ge.endMin - ge.startMin, 'a break is hosted by a longer one');
    }
    // The order of the entries does not matter.
    const shuffled = [...entries].reverse();
    const again = hostDay(shuffled);
    assert.deepEqual([...again.hostOf].sort(), [...host.hostOf].sort(), 'same hosting in any order');
    assert.deepEqual([...again.breakIds].sort(), [...host.breakIds].sort());
    // ---- the cut, on what the panes pass it: the hosted entries are left out ----
    const kept: CutEntry[] = entries.filter((e) => !host.hostOf.has(e.id));
    const cut = cutDay(kept, minLen);
    for (const hostId of cut.cut) {
      const e = byId.get(hostId)!;
      const pieces = cut.pieces.filter((p) => p.hostId === hostId).sort((a, b) => a.startMin - b.startMin);
      assert.ok(!e.breaks, 'a break is never cut');
      for (let i = 0; i < pieces.length; i++) {
        const p = pieces[i];
        assert.ok(p.startMin >= e.startMin && p.endMin <= e.endMin + 1, `${p.id} is inside its task`);
        assert.ok(p.endMin - p.startMin >= minLen || p.endMin > 1440, `${p.id} is at least the minimum`);
        if (i > 0) assert.ok(p.startMin >= pieces[i - 1].endMin, 'pieces never overlap');
      }
      for (const b of kept.filter((x) => x.breaks && !(x as HostEntry).cont)) {
        const refused = cut.refusals.some((r) => r.hostId === hostId && r.breakId === b.id);
        if (refused) continue;
        for (const p of pieces) assert.ok(!(p.startMin < Math.min(b.endMin, 1440) && b.startMin < Math.min(p.endMin, 1440)), `${p.id} avoids the break ${b.id}`);
      }
    }
    for (const e of kept) {
      if (e.breaks || cut.cut.has(e.id) || e.startMin >= 1440) continue;
      for (const b of kept.filter((x) => x.breaks)) {
        const overlaps = b.startMin < Math.min(e.endMin, 1440) && e.startMin < Math.min(b.endMin, 1440);
        if (overlaps) assert.ok(cut.refusals.some((r) => r.hostId === e.id && r.breakId === b.id), `${e.id} overlaps ${b.id} and neither cut nor refused`);
      }
    }
    // The planned items: every kept entry appears once, as itself or as pieces.
    const plan = planCuts(kept, minLen, (id) => id);
    for (const e of kept) {
      const items = plan.items.filter((i) => i.id === e.id || i.piece?.hostId === e.id);
      assert.ok(items.length >= 1, `${e.id} is drawn`);
    }
    // The shared minutes are never more than the hosted tasks' own minutes.
    const own = [...host.hostOf.keys()].reduce((m, g) => m + (byId.get(g)!.endMin - byId.get(g)!.startMin), 0);
    assert.ok(hostedMinutes(entries) <= own, 'shared minutes never exceed what the hosted tasks add up to');
  }
});

// ---- the cases that were asked about ----

test('a task partly overlapping two breaks: cut around both; a Split task partly overlapping two other Split tasks is not cut', () => {
  const r = cutDay([ent('work', h(9), h(17)), ent('b1', h(10), h(10, 30), true), ent('b2', h(14), h(15), true)], 30);
  assert.deepEqual(spansOf(r, 'work'), [[h(9), h(10)], [h(10, 30), h(14)], [h(15), h(17)]]);
  // A Split task is never cut by another Split task: two breaks overlapping a third stay side by side.
  const s = cutDay([ent('mid', h(9), h(17), true), ent('b1', h(10), h(10, 30), true), ent('b2', h(14), h(15), true)], 30);
  assert.equal(s.pieces.length, 0);
});

test('three tasks overlapping one break are each cut on their own, and each is judged by the minimum', () => {
  const r = cutDay([ent('break', h(12), h(12, 30), true), ent('a', h(11), h(13)), ent('b', h(11, 50), h(13, 30)), ent('c', h(11, 45), h(12, 15))], 30);
  assert.deepEqual(spansOf(r, 'a'), [[h(11), h(12)], [h(12, 30), h(13)]]);
  // b would be left with a 10 minute head, c with a 15 minute one: both refused (a short piece), neither cut.
  assert.deepEqual(spansOf(r, 'b'), []);
  assert.deepEqual(spansOf(r, 'c'), []);
  assert.deepEqual(r.refusals.map((x) => [x.hostId, x.reason, x.pieceMin]).sort(), [['b', 'short', 10], ['c', 'short', 15]]);
  // The same three with the minimum at 15 minutes: b and c are cut too.
  const at15 = cutDay([ent('break', h(12), h(12, 30), true), ent('a', h(11), h(13)), ent('b', h(11, 50), h(13, 30)), ent('c', h(11, 45), h(12, 15))], 10);
  assert.deepEqual(spansOf(at15, 'b'), [[h(11, 50), h(12)], [h(12, 30), h(13, 30)]]);
  assert.deepEqual(spansOf(at15, 'c'), [[h(11, 45), h(12)]]);
});

test('breaks overlapping each other cut the host once, the shared part counted once', () => {
  const r = cutDay([ent('host', h(9), h(15)), ent('b1', h(11), h(12), true), ent('b2', h(11, 30), h(12, 30), true)], 30);
  assert.deepEqual(spansOf(r, 'host'), [[h(9), h(11)], [h(12, 30), h(15)]]);
  assert.deepEqual(r.refusals, []);
});

test('a break touching exactly at the edge of a task does not cut or refuse it', () => {
  for (const b of [ent('end', h(10), h(11), true), ent('start', h(12), h(13), true)]) {
    const r = cutDay([ent('t', h(11), h(12)), b], 30);
    assert.equal(r.pieces.length, 0, b.id);
    assert.deepEqual(r.refusals, [], b.id);
  }
  // A break that touches the task's edge from inside cuts nothing off the other side: one piece, no refusal.
  const edge = cutDay([ent('t', h(11), h(13)), ent('b', h(11), h(11, 30), true)], 30);
  assert.deepEqual(spansOf(edge, 't'), [[h(11, 30), h(13)]]);
  assert.equal(edge.pieces[0].head, false);
});

test('pieces under the minimum: refused at 30, allowed at 15; zero length pieces never exist', () => {
  const entries = [ent('t', h(10), h(11)), ent('b', h(10, 20), h(10, 40), true)];
  const at30 = cutDay(entries, 30);
  assert.equal(at30.pieces.length, 0);
  assert.equal(at30.refusals[0].reason, 'short');
  assert.equal(at30.refusals[0].pieceMin, 20);
  const at15 = cutDay(entries, 15);
  assert.deepEqual(spansOf(at15, 't'), [[h(10), h(10, 20)], [h(10, 40), h(11)]]);
  for (const p of at15.pieces) assert.ok(p.endMin > p.startMin);
  // A break that starts where the task starts leaves no zero length head.
  const noHead = cutDay([ent('t', h(10), h(11)), ent('b', h(10), h(10, 15), true)], 15);
  assert.deepEqual(spansOf(noHead, 't'), [[h(10, 15), h(11)]]);
  // One minute tasks and zero length entries do not throw.
  assert.doesNotThrow(() => cutDay([ent('t', h(10), h(10, 1)), ent('z', h(10), h(10)), ent('b', h(10), h(10, 30), true)], 30));
});

test('midnight: a break ending exactly at 24:00, a break across it, and the next day cutting the continuation', () => {
  // A task 23:00 to 01:00 and a break 23:30 to 24:00: cut on the first day (the last piece is none: the break reaches the end of the day).
  const r = cutDay([ent('late', h(23), h(25)), ent('b', h(23, 30), h(24), true)], 30);
  assert.deepEqual(spansOf(r, 'late'), [[h(23), h(23, 30)]], 'the part after the break is on the next day');
  // The break across midnight cuts the host's first day to its end, clamped.
  const across = cutDay([ent('host', h(22), h(24)), ent('night', h(23), h(26), true)], 30);
  assert.deepEqual(spansOf(across, 'host'), [[h(22), h(23)]]);
  // A break that starts at or after 24:00 is not on this day at all.
  assert.equal(cutDay([ent('host', h(22), h(24)), ent('tomorrow', h(24), h(25), true)], 30).pieces.length, 0);
  // Hosting does not cross the day: a task past midnight is inside a break only if the break's true end reaches it.
  assert.equal(hostDay([ent('brk', h(23), h(25), true), ent('in', h(23, 30), h(24, 30))]).hostOf.get('in'), 'brk');
  assert.equal(hostDay([ent('brk', h(23), h(24), true), ent('out', h(23, 30), h(24, 30))]).hostOf.has('out'), false);
});

test('extra times: each time is its own entry and is hosted by its own break', () => {
  const day = '2026-10-30';
  const task = (id: string, extra: Partial<Task>): Task => ({ id, title: id, completed: false, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', dueDate: day, durationMinutes: 20, ...extra });
  const tasks = [task('pill', { startTime: '08:00', extraTimes: ['12:40', '20:00'] }), task('lunch', { startTime: '12:30', durationMinutes: 60, cutsBelow: true })];
  const entries = dayHostEntries(tasks, day, day);
  const host = hostDay(entries);
  assert.equal(host.hostOf.get('task:pill@12:40'), 'task:lunch');
  assert.equal(host.hostOf.has('task:pill'), false);
  assert.equal(host.hostOf.has('task:pill@20:00'), false);
  // A time that is moved out of the break is a plain entry again; the others are untouched.
  const moved = dayHostEntries([task('pill', { startTime: '08:00', extraTimes: ['13:45', '20:00'] }), tasks[1]], day, day);
  assert.equal(hostDay(moved).hostOf.size, 0);
});

test('repeating days: a projected occurrence is hosted and hosts like a stored one', () => {
  const day = '2026-10-30';
  const rule = { recurrence: 'daily' as const, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', completed: false, dueDate: '2026-10-28' };
  const tasks: Task[] = [
    { id: 'lunch', title: 'Lunch', startTime: '12:00', durationMinutes: 60, cutsBelow: true, ...rule },
    { id: 'walk', title: 'Walk', startTime: '12:15', durationMinutes: 30, ...rule },
  ];
  const entries = dayHostEntries(tasks, day, day);
  assert.ok(entries.every((e) => e.projected), 'both are projected today');
  assert.equal(hostDay(entries).hostOf.get(`task:walk:${day}`), `task:lunch:${day}`);
});

test('hosted tasks when the host moves, resizes, is ticked, deleted or has Split turned off', () => {
  const guest = ent('g', h(12, 15), h(12, 30));
  const lunch = (s: number, e: number, breaks = true) => ent('lunch', s, e, breaks);
  const at = (...e: HostEntry[]) => hostDay(e);
  assert.equal(at(lunch(h(12), h(13)), guest).hostOf.get('g'), 'lunch');
  // Moved so the guest is no longer inside: a plain task again, counted as lost.
  const prev = hostSnapshot([lunch(h(12), h(13)), guest]);
  const moved = hostSnapshot([lunch(h(13), h(14)), guest]);
  assert.equal(lostGuests(prev, moved), 1);
  // Resized shorter: lost. Longer: still hosted, nothing lost.
  assert.equal(lostGuests(prev, hostSnapshot([lunch(h(12), h(12, 20)), guest])), 1);
  assert.equal(lostGuests(prev, hostSnapshot([lunch(h(11), h(14)), guest])), 0);
  // Ticked: a completed task is still on the grid, so it still hosts (the entries do not change).
  assert.equal(at(lunch(h(12), h(13)), guest).hostOf.get('g'), 'lunch');
  // Deleted (the entry is gone) or Split off: the guest is a plain entry; not counted as lost.
  assert.equal(lostGuests(prev, hostSnapshot([guest])), 0);
  assert.equal(lostGuests(prev, hostSnapshot([lunch(h(12), h(13), false), guest])), 0);
  assert.equal(at(lunch(h(12), h(13), false), guest).hostOf.size, 0);
  // Found by this audit: the shortest break changes (a longer break around it) and the guest stays hosted by the
  // other: that is not "moved out of the break".
  const two = hostSnapshot([ent('a', h(12, 10), h(12, 45), true), ent('b', h(11, 50), h(12, 40), true), guest]);
  const grew = hostSnapshot([ent('a', h(12, 10), h(13, 10), true), ent('b', h(11, 50), h(12, 40), true), guest]);
  assert.equal(two.hostOf.get('g'), 'a');
  assert.equal(grew.hostOf.get('g'), 'b');
  assert.equal(lostGuests(two, grew), 0, 'still hosted, by the other break');
});

test('a Split task hosted in another Split task: its own Split is ignored, it never cuts its host', () => {
  const entries = [ent('outer', h(9), h(13), true), ent('inner', h(10), h(11), true), ent('work', h(9, 30), h(12, 30)), ent('call', h(10, 15), h(10, 45))];
  const host = hostDay(entries);
  assert.deepEqual([...host.breakIds], ['outer']);
  assert.equal(host.hostOf.get('inner'), 'outer');
  assert.equal(host.hostOf.get('call'), 'outer', 'what was inside the inner break is the outer break\'s now');
  assert.equal(host.hostOf.has('work'), true, 'work is inside the outer one too');
  // Cut plan on what the panes pass: the hosted ones are left out, so inner cuts nothing.
  const plan = cutDay(entries.filter((e) => !host.hostOf.has(e.id)), 30);
  assert.equal(plan.pieces.length, 0);
  // Before this change inner was a break of its own: it cut `work`.
  const before = cutDay(entries, 30);
  assert.ok(before.cut.has('work'));
});

test('a Split task dropped on a Split task of the same span: the first of them stays the break, never a swap loop', () => {
  const a = hostDay([ent('x', h(10), h(11), true), ent('y', h(10), h(11), true)]);
  assert.deepEqual([...a.breakIds], ['x']);
  assert.equal(a.hostOf.get('y'), 'x');
  const b = hostDay([ent('y', h(10), h(11), true), ent('x', h(10), h(11), true)]);
  assert.deepEqual([...b.breakIds], ['x'], 'the order of the entries makes no difference');
});

test('a chain of Split tasks: the longest is the break, the others are its chips', () => {
  const r = hostDay([ent('c', h(10, 15), h(10, 30), true), ent('a', h(9), h(13), true), ent('b', h(10), h(11), true)]);
  assert.deepEqual([...r.breakIds], ['a']);
  assert.deepEqual(r.hosted.get('a'), ['b', 'c']);
});

test('hosted shared minutes count a nested Split task once', () => {
  assert.equal(hostedMinutes([ent('a', h(9), h(13), true), ent('b', h(10), h(11), true), ent('c', h(10, 15), h(10, 30))]), 60 + 0, 'b and c overlap inside a: the 60 minutes once');
});
