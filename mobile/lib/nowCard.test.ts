import { test } from 'node:test';
import assert from 'node:assert/strict';
import { minutesWords, nowCard, type NowCardItem } from './nowCard.ts';

const it = (key: string, start: string, len: number, extra: Partial<NowCardItem> = {}): NowCardItem => {
  const s = Number(start.slice(0, 2)) * 60 + Number(start.slice(3));
  return { key, title: key, startMin: s, endMin: s + len, reminder: len === 0, free: false, done: false, ...extra };
};
const at = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

test('something now: the time range, the time left and the next item with "in"', () => {
  const c = nowCard([it('Gym', '14:00', 60), it('Call Mum', '15:30', 30)], at('14:35'));
  assert.equal(c.now?.title, 'Gym');
  assert.equal(c.free, false);
  assert.equal(c.range, '2:00pm to 3:00pm');
  assert.equal(c.left, '25 min left');
  assert.equal(c.nextLine, 'Next: Call Mum at 3:30pm, in 55 min');
});

test('nothing now: Free time, and "in" across the hour', () => {
  const c = nowCard([it('Call Mum', '15:30', 30)], at('14:10'));
  assert.equal(c.now, null);
  assert.equal(c.free, true);
  assert.equal(c.nextLine, 'Next: Call Mum at 3:30pm, in 1 h 20 min');
});

test('a reminder is never Now but can be Next', () => {
  const c = nowCard([it('Ring the pharmacy', '14:00', 0), it('Later', '18:00', 30)], at('13:50'));
  assert.equal(c.now, null);
  assert.equal(c.nextLine, 'Next: Ring the pharmacy at 2:00pm, in 10 min');
  assert.equal(nowCard([it('Ring', '14:00', 0)], at('14:00')).now, null);
});

test('a free time block now gives Free time; a task inside it is Now', () => {
  const lunch = it('Lunch', '12:00', 60, { free: true });
  const a = nowCard([lunch], at('12:10'));
  assert.equal(a.now, null);
  assert.equal(a.free, true);
  assert.equal(a.freeBlock?.title, 'Lunch');
  const b = nowCard([lunch, it('Call', '12:15', 15)], at('12:20'));
  assert.equal(b.now?.title, 'Call');
  assert.equal(b.free, false);
});

test('a task inside a shift is Now, not the shift', () => {
  const c = nowCard([it('Shift', '09:00', 480), it('Stand up', '10:00', 15)], at('10:05'));
  assert.equal(c.now?.title, 'Stand up');
  assert.equal(c.left, '10 min left');
});

test('a task with several times: each time is its own item', () => {
  const c = nowCard([it('Pills#1', '08:00', 5), it('Pills#2', '20:00', 5)], at('08:02'));
  assert.equal(c.now?.title, 'Pills#1');
  assert.equal(c.nextLine, 'Next: Pills#2 at 8:00pm, in 11 h 58 min');
});

test('done items are left out; nothing left reads "Nothing else today", an empty day "A free day"', () => {
  assert.equal(nowCard([it('Gym', '14:00', 60, { done: true })], at('14:10')).now, null);
  assert.equal(nowCard([it('Gym', '09:00', 60)], at('20:00')).nextLine, 'Nothing else today');
  assert.equal(nowCard([], at('20:00')).nextLine, 'A free day');
});

test('a task running past midnight shows its time left to its true end', () => {
  const c = nowCard([it('Night shift', '22:00', 240)], at('23:30'));
  assert.equal(c.range, '10:00pm to 2:00am');
  assert.equal(c.left, '2 h 30 min left');
});

test('minutes words', () => {
  assert.equal(minutesWords(5), '5 min');
  assert.equal(minutesWords(60), '1 h');
  assert.equal(minutesWords(80), '1 h 20 min');
});
