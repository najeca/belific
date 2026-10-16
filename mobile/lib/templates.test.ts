// Run with `npm test` from mobile/. Task templates (build plan phase 7).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_NAME,
  MAX_STEP,
  MAX_STEPS,
  MAX_TEMPLATES,
  fitTemplate,
  parseTemplate,
  serializeTemplate,
  taskFromTemplate,
  templateFromTask,
  templateKey,
  templatesFromSettings,
  type TaskTemplate,
} from './templates.ts';
import { MAX_SETTING_VALUE, sanitizeSettingValue } from './syncCore.ts';
import type { Task } from './types.ts';

const STAMP = '2026-10-16T09:00:00.000Z';
const base: TaskTemplate = { id: 't1', name: 'Weekly report', emoji: '📝', title: 'Write the weekly report', notes: 'Use last week as a start', durationMinutes: 45, priority: 'high', projectKey: 'work', steps: ['Gather numbers', 'Draft', 'Send'] };

test('a template round trips through its setting value, and fits one', () => {
  const raw = serializeTemplate(base);
  assert.ok(raw.length <= MAX_SETTING_VALUE);
  assert.equal(sanitizeSettingValue(raw), raw, 'the sync mapping does not cut it');
  assert.deepEqual(parseTemplate('t1', raw), base);
  assert.equal(templateKey('t1'), 'template.t1');
});

test('a very long template is trimmed to fit: notes first, then the last steps, never the title', () => {
  const huge: TaskTemplate = { id: 'h', name: 'x'.repeat(100), title: 'Keep this title', notes: 'n'.repeat(9000), steps: Array.from({ length: 60 }, (_, i) => `Step number ${i} `.repeat(20)) };
  const fitted = fitTemplate(huge);
  assert.ok(JSON.stringify(fitted).length <= MAX_SETTING_VALUE, String(JSON.stringify(fitted).length));
  assert.equal(fitted.title, 'Keep this title');
  assert.equal(fitted.name.length, MAX_NAME);
  assert.ok((fitted.steps ?? []).length <= MAX_STEPS);
  for (const s of fitted.steps ?? []) assert.ok(s.length <= MAX_STEP);
  assert.equal(sanitizeSettingValue(serializeTemplate(huge)), serializeTemplate(huge), 'still whole after the sync mapping');
});

test('a template with no usable title is not a template; junk fields are dropped', () => {
  assert.equal(parseTemplate('x', 'not json'), null);
  assert.equal(parseTemplate('x', '{}'), null);
  assert.equal(parseTemplate('x', '{"title":"  "}'), null);
  const t = parseTemplate('x', JSON.stringify({ title: 'Ok', durationMinutes: 99999, priority: 'urgent', steps: ['a', '', 7, 'b'], projectKey: 'k', evil: 'x' }))!;
  assert.deepEqual(t, { id: 'x', name: 'Ok', title: 'Ok', projectKey: 'k', steps: ['a', 'b'] });
});

test('listed from the settings rows: name order, deleted rows and other keys left out', () => {
  const rows = [
    { key: 'template.b', value: serializeTemplate({ ...base, id: 'b', name: 'Beta' }), updatedAt: STAMP },
    { key: 'template.a', value: serializeTemplate({ ...base, id: 'a', name: 'Alpha' }), updatedAt: STAMP },
    { key: 'template.c', value: serializeTemplate({ ...base, id: 'c', name: 'Gone' }), updatedAt: STAMP, deletedAt: STAMP },
    { key: 'template.bad', value: 'junk', updatedAt: STAMP },
    { key: 'feature.pomodoro', value: 'on', updatedAt: STAMP },
  ];
  assert.deepEqual(templatesFromSettings(rows).map((t) => t.name), ['Alpha', 'Beta']);
  const many = Array.from({ length: 80 }, (_, i) => ({ key: `template.${i}`, value: serializeTemplate({ ...base, id: String(i), name: `T${i}` }), updatedAt: STAMP }));
  assert.equal(templatesFromSettings(many).length, MAX_TEMPLATES);
});

test('a template holds what a task describes, never its progress', () => {
  const task: Task = {
    id: 'a',
    title: 'Plan trip',
    notes: 'n',
    emoji: '✈️',
    priority: 'low',
    projectKey: 'home',
    durationMinutes: 90,
    actualMinutes: 70,
    timerStartedAt: STAMP,
    dueDate: '2026-10-20',
    startTime: '09:00',
    completed: true,
    completedAt: STAMP,
    recurrence: 'weekly',
    subtasks: [{ id: 's1', title: 'Book', done: true }, { id: 's2', title: 'Pack', done: false }],
    createdAt: STAMP,
    updatedAt: STAMP,
  };
  const t = templateFromTask(task, 'tt', '');
  assert.deepEqual(t, { id: 'tt', name: 'Plan trip', emoji: '✈️', title: 'Plan trip', notes: 'n', durationMinutes: 90, priority: 'low', projectKey: 'home', steps: ['Book', 'Pack'] });
  assert.equal(templateFromTask(task, 'tt', 'My name').name, 'My name');
  const json = serializeTemplate(t);
  for (const word of ['actual', 'timer', 'dueDate', 'startTime', 'completed', 'recurrence']) assert.ok(!json.includes(word), word);
});

test('a task from a template: new, not done, steps unticked with new ids, a deleted label dropped', () => {
  let n = 0;
  const made = taskFromTemplate(base, 'new1', STAMP, { stepId: () => `st${++n}`, liveLabelKeys: new Set(['work']), listKey: 'l1', dueDate: '2026-10-17' });
  assert.deepEqual(made, {
    id: 'new1',
    title: 'Write the weekly report',
    completed: false,
    createdAt: STAMP,
    updatedAt: STAMP,
    emoji: '📝',
    notes: 'Use last week as a start',
    durationMinutes: 45,
    priority: 'high',
    projectKey: 'work',
    listKey: 'l1',
    dueDate: '2026-10-17',
    subtasks: [{ id: 'st1', title: 'Gather numbers', done: false }, { id: 'st2', title: 'Draft', done: false }, { id: 'st3', title: 'Send', done: false }],
  });
  const dropped = taskFromTemplate(base, 'new2', STAMP, { stepId: (i) => `s${i}`, liveLabelKeys: new Set() });
  assert.equal('projectKey' in dropped, false);
  assert.equal('listKey' in dropped, false);
  assert.equal('dueDate' in dropped, false);
  const plain = taskFromTemplate({ id: 'p', name: 'P', title: 'Just a title' }, 'new3', STAMP, { stepId: () => 'x' });
  assert.deepEqual(plain, { id: 'new3', title: 'Just a title', completed: false, createdAt: STAMP, updatedAt: STAMP });
});
