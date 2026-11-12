import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuick, previewText, quickFields } from './quickParse.ts';

// Thursday 12 November 2026, 10:00.
const NOW = new Date(2026, 10, 12, 10, 0);
const p = (s: string) => parseQuick(s, NOW);
const brief = (s: string) => {
  const r = p(s);
  return { title: r.title, day: r.day, time: r.time, minutes: r.minutes, repeat: r.repeat, found: r.found };
};

test('the two examples: "ring dentist tomorrow 9am" and "gym Mon Wed 6pm 1h"', () => {
  assert.deepEqual(brief('ring dentist tomorrow 9am'), { title: 'ring dentist', day: '2026-11-13', time: '09:00', minutes: undefined, repeat: undefined, found: true });
  assert.deepEqual(brief('gym Mon Wed 6pm 1h'), { title: 'gym', day: undefined, time: '18:00', minutes: 60, repeat: { rule: 'weekly', days: ['Mon', 'Wed'] }, found: true });
  assert.deepEqual(quickFields(p('ring dentist tomorrow 9am'), NOW), { dueDate: '2026-11-13', startTime: '09:00' });
  assert.deepEqual(quickFields(p('gym Mon Wed 6pm 1h'), NOW), { dueDate: '2026-11-16', startTime: '18:00', durationMinutes: 60, recurrence: 'weekly', recurrenceDays: ['Mon', 'Wed'] });
  assert.equal(previewText(p('ring dentist tomorrow 9am'), NOW), 'Tomorrow · 9:00am');
  assert.equal(previewText(p('gym Mon Wed 6pm 1h'), NOW), 'Mon, Wed · 6:00pm · 1h · repeats');
});

test('days: today, tomorrow, a weekday (the next one, never today), next Mon, 12 Nov', () => {
  assert.equal(p('call mum today').day, '2026-11-12');
  assert.equal(p('call mum tomorrow').day, '2026-11-13');
  assert.equal(p('dentist Mon').day, '2026-11-16');
  assert.equal(p('dentist monday').day, '2026-11-16');
  assert.equal(p('dentist Thu').day, '2026-11-19', 'today is Thursday: the next Thursday');
  assert.equal(p('dentist Fri').day, '2026-11-13');
  assert.equal(p('dentist next Mon').day, '2026-11-16');
  assert.equal(p('dentist next Fri').day, '2026-11-20', 'Friday of next week');
  assert.equal(p('dentist on Sat').title, 'dentist');
  assert.equal(p('pay rent 20 Nov').day, '2026-11-20');
  assert.equal(p('pay rent 5 November').day, '2027-11-05', 'already gone this year: next year');
  assert.equal(p('pay rent 12 Nov').day, '2026-11-12', 'today itself is today');
  assert.equal(p('pay rent 1st dec').day, '2026-12-01');
});

test('times: am and pm, 24 hour, with a colon; a bare number is never a time', () => {
  assert.equal(p('ring 9am').time, '09:00');
  assert.equal(p('ring 6pm').time, '18:00');
  assert.equal(p('ring 6:30pm').time, '18:30');
  assert.equal(p('ring 6 pm').time, '18:00');
  assert.equal(p('ring 18:00').time, '18:00');
  assert.equal(p('ring 9:30').time, '09:30');
  assert.equal(p('ring 12am').time, '00:00');
  assert.equal(p('ring 12pm').time, '12:00');
  assert.equal(p('ring at 9am').title, 'ring', '"at" goes with the time');
  for (const s of ['ring 9', 'ring 25:00', 'ring 13pm', 'ring 9:75', 'ring 0am']) assert.equal(p(s).found, false, s);
});

test('lengths: 1h, 30m, 1h 30m, 1h30m, 45 min, for 45 min', () => {
  assert.equal(p('tidy 1h').minutes, 60);
  assert.equal(p('tidy 30m').minutes, 30);
  assert.equal(p('tidy 1h 30m').minutes, 90);
  assert.equal(p('tidy 1h30m').minutes, 90);
  assert.equal(p('tidy 1.5h').minutes, 90);
  assert.equal(p('tidy 45 min').minutes, 45);
  assert.equal(p('tidy for 45 min').minutes, 45);
  assert.equal(p('tidy for 45 min').title, 'tidy');
  assert.equal(p('tidy 2 hours').minutes, 120);
  assert.equal(p('tidy 2 hours').title, 'tidy');
  assert.equal(p('tidy 0m').found, false);
  assert.equal(p('tidy 2000m').found, false);
});

test('repeats: Mon Wed, Mon and Wed, every Mon, every Mon Wed, every day', () => {
  assert.deepEqual(p('gym Mon Wed').repeat, { rule: 'weekly', days: ['Mon', 'Wed'] });
  assert.deepEqual(p('gym Mon and Wed').repeat, { rule: 'weekly', days: ['Mon', 'Wed'] });
  assert.deepEqual(p('gym Mon, Wed, Fri').repeat, { rule: 'weekly', days: ['Mon', 'Wed', 'Fri'] });
  assert.deepEqual(p('gym every Mon').repeat, { rule: 'weekly', days: ['Mon'] });
  assert.deepEqual(p('gym every Mon Wed').repeat, { rule: 'weekly', days: ['Mon', 'Wed'] });
  assert.equal(p('gym every Mon Wed').title, 'gym');
  assert.deepEqual(p('vitamins every day 8am').repeat, { rule: 'daily' });
  assert.equal(p('vitamins every day 8am').title, 'vitamins');
  assert.equal(previewText(p('vitamins every day 8am'), NOW), 'Every day · 8:00am');
  // A repeat starts on the next of its days; every day starts today (tomorrow once its time has passed).
  assert.equal(quickFields(p('gym every Thu'), NOW).dueDate, '2026-11-19');
  assert.equal(quickFields(p('vitamins every day 8am'), NOW).dueDate, '2026-11-13');
  assert.equal(quickFields(p('vitamins every day 11am'), NOW).dueDate, '2026-11-12');
});

test('edge cases: nothing changes for text with no phrase; the middle is never read', () => {
  for (const s of ['ring 9 people', 'Monday meeting notes', 'the 1h video', 'buy milk', 'ring the 9am people', '2 Nov was great', 'plan 30m session notes']) {
    assert.deepEqual(brief(s), { title: s, day: undefined, time: undefined, minutes: undefined, repeat: undefined, found: false }, s);
  }
  assert.equal(p('  buy   milk  ').title, 'buy milk', 'spaces are kept as one');
  assert.equal(p('').found, false);
});

test('at least one word always stays in the title', () => {
  for (const s of ['tomorrow', '9am', '1h', 'Mon Wed', 'every day', '12 Nov']) {
    assert.equal(p(s).found, false, s);
    assert.equal(p(s).title, s);
  }
  assert.equal(p('x tomorrow 9am').title, 'x');
  assert.deepEqual([p('tomorrow 9am').title, p('tomorrow 9am').time, p('tomorrow 9am').day], ['tomorrow', '09:00', undefined], 'the last word is the title, the time is still read');
});

test('any order, each kind once; what is not understood stays in the title', () => {
  const a = brief('dentist 9am tomorrow 30m');
  assert.deepEqual([a.title, a.day, a.time, a.minutes], ['dentist', '2026-11-13', '09:00', 30]);
  const b = brief('call the bank tomorrow tomorrow');
  assert.deepEqual([b.title, b.day], ['call the bank tomorrow', '2026-11-13'], 'a second day stays in the title');
  const c = brief('book flights for Sat 7am');
  assert.deepEqual([c.title, c.day, c.time], ['book flights for', '2026-11-14', '07:00']);
  assert.equal(p('Water plants tomorrow').title, 'Water plants');
});

test('a time with no day is today; a length alone has no day; the preview says what it understood', () => {
  assert.deepEqual(quickFields(p('ring dentist 9am'), NOW), { dueDate: '2026-11-12', startTime: '09:00' });
  assert.deepEqual(quickFields(p('tidy shed 1h'), NOW), { durationMinutes: 60 });
  assert.equal(previewText(p('ring dentist 9am'), NOW), 'Today · 9:00am');
  assert.equal(previewText(p('tidy shed 1h 30m'), NOW), '1h 30m');
  assert.equal(previewText(p('pay rent 20 Nov'), NOW), 'Fri 20 Nov');
  assert.equal(previewText(p('call tomorrow 9am 1h'), NOW), 'Tomorrow · 9:00am · 1h');
});
