import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countsInHours, hoursCountKey, labelHours } from './labelHours.ts';
import type { Project, Task } from './types.ts';

const day = '2026-11-19';
const stamp = '2026-09-01T07:00:00.000Z';
const t = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, completed: false, createdAt: stamp, updatedAt: stamp, dueDate: day, ...extra });
const L = (key: string, name: string, extra: Partial<Project> = {}): Project => ({ key, name, createdAt: stamp, updatedAt: stamp, colorKey: 'sage', ...extra });
const labels = [L('H', 'Health'), L('M', 'Money', { colorKey: 'clay' }), L('S', ' sleep '), L('B', 'Break')];
const none = new Map<string, string>();

test('one part per label, longest first, done and planned both; no label is one grey part', () => {
  const r = labelHours({
    tasks: [t('a', { projectKey: 'H', startTime: '09:00', durationMinutes: 60 }), t('b', { projectKey: 'H', durationMinutes: 30, completed: true }), t('c', { projectKey: 'M', startTime: '11:00', durationMinutes: 45 }), t('d', { startTime: '13:00', durationMinutes: 120 })],
    labels,
    stored: none,
  });
  assert.deepEqual(r.parts.map((p) => [p.key, p.name, p.minutes]), [['', 'No label', 120], ['H', 'Health', 90], ['M', 'Money', 45]]);
  assert.equal(r.total, 255);
});

test('a reminder and a break never count; a task with no length counts 0', () => {
  const r = labelHours({ tasks: [t('r', { projectKey: 'H', startTime: '09:00', durationMinutes: 0 }), t('br', { projectKey: 'H', startTime: '12:00', durationMinutes: 60, cutsBelow: true }), t('n', { projectKey: 'H' })], labels, stored: none });
  assert.deepEqual(r.parts, []);
});

test('a shift counts once, even when its blocks have other labels', () => {
  const r = labelHours({ tasks: [t('shift', { projectKey: 'M', startTime: '09:00', durationMinutes: 480 }), t('in', { projectKey: 'H', startTime: '10:00', durationMinutes: 60 })], labels, stored: none });
  assert.equal(r.total, 480);
  assert.deepEqual(r.parts.map((p) => p.key), ['M']);
});

test('free time cut out of a task is not counted', () => {
  const r = labelHours({ tasks: [t('work', { projectKey: 'M', startTime: '09:00', durationMinutes: 240 }), t('lunch', { startTime: '11:00', durationMinutes: 60, cutsBelow: true })], labels, stored: none });
  assert.equal(r.total, 180);
});

test('a task with several times counts each time', () => {
  const r = labelHours({ tasks: [t('pills', { projectKey: 'H', startTime: '08:00', extraTimes: ['20:00'], durationMinutes: 10 })], labels, stored: none });
  assert.equal(r.total, 20);
});

test('Sleep and Break are off by default, by name; the switch turns any label on or off', () => {
  const tasks = [t('s', { projectKey: 'S', startTime: '22:00', durationMinutes: 480 }), t('b', { projectKey: 'B', durationMinutes: 15 }), t('h', { projectKey: 'H', durationMinutes: 30 })];
  assert.deepEqual(labelHours({ tasks, labels, stored: none }).parts.map((p) => p.key), ['H']);
  const stored = new Map([['S', 'on'], ['H', 'off']]);
  assert.deepEqual(labelHours({ tasks, labels, stored }).parts.map((p) => p.key), ['S']);
  assert.equal(countsInHours({ name: 'Sleep' }, null), false);
  assert.equal(countsInHours({ name: 'Sleepy' }, null), true);
  assert.equal(hoursCountKey('S'), 'hours.count.S');
});

test('a deleted label falls to No label', () => {
  const r = labelHours({ tasks: [t('x', { projectKey: 'Z', durationMinutes: 30 })], labels: [...labels, L('Z', 'Gone', { deletedAt: stamp })], stored: none });
  assert.deepEqual(r.parts.map((p) => p.name), ['No label']);
});
