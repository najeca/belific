import test from 'node:test';
import assert from 'node:assert/strict';
import { answeredBy, applies, closedNote, nextStep, prevStep, stepLabel, stepNumber, STEPS } from './stepFlow.ts';

const none = {};
const dated = { dueDate: '2026-11-18' };
const repeating = { dueDate: '2026-11-18', recurrence: 'daily' as const };

test('five screens in order, numbered for the dots and VoiceOver', () => {
  assert.deepEqual([...STEPS], ['what', 'when', 'time', 'where', 'more']);
  assert.equal(stepNumber('what'), 1);
  assert.equal(stepNumber('more'), 5);
  assert.equal(stepLabel('when'), 'Step 2 of 5');
});

test('with no Day, What time? is passed over going forward and going back', () => {
  assert.equal(applies('time', none), false);
  assert.equal(nextStep('what', none), 'when');
  assert.equal(nextStep('when', none), 'where');
  assert.equal(prevStep('where', none), 'when');
});

test('with a Day, every screen follows in turn', () => {
  assert.equal(nextStep('when', dated), 'time');
  assert.equal(nextStep('time', dated), 'where');
  assert.equal(nextStep('where', dated), 'more');
  assert.equal(nextStep('more', dated), null);
  assert.equal(prevStep('where', dated), 'time');
  assert.equal(prevStep('when', dated), 'what');
  assert.equal(prevStep('what', dated), null);
});

test('a phrase answers its screens: passed over going forward, still reached by Back', () => {
  const day = answeredBy({ dueDate: '2026-11-19' });
  assert.deepEqual([...day], ['when']);
  assert.equal(nextStep('what', dated, day), 'time');
  const both = answeredBy({ dueDate: '2026-11-19', startTime: '15:00' });
  assert.equal(nextStep('what', dated, both), 'where');
  assert.equal(prevStep('where', dated), 'time');
  assert.equal(answeredBy({}).size, 0);
});

test('a repeating task keeps its days: When is never shown', () => {
  assert.equal(applies('when', repeating), false);
  assert.equal(nextStep('what', repeating), 'time');
  assert.equal(prevStep('time', repeating), 'what');
});

test('closing with no Day says where the task is; with a Day it says nothing', () => {
  assert.equal(closedNote({ title: ' Call the dentist ', dueDate: undefined }, undefined), 'Saved in Brain Dump on the Tasks tab: Call the dentist');
  assert.equal(closedNote({ title: 'Buy stamps', dueDate: undefined }, 'Shopping'), 'Saved in Shopping on the Tasks tab: Buy stamps');
  assert.equal(closedNote({ title: 'Swim', dueDate: '2026-11-18' }, undefined), null);
  assert.equal(closedNote(null, undefined), null);
  assert.equal(closedNote({ title: '  ', dueDate: undefined }, undefined), null);
});
