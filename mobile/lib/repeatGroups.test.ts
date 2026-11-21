// Run with `npm test` from mobile/. The Repeats rows' words and emoji, shared by both apps (PLAN_desktop_parity D1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQuests, questsBySection } from './quests.ts';
import { questEmoji, questWords } from './repeatGroups.ts';
import type { Task } from './types.ts';

const TODAY = '2026-11-18';
const STAMP = '2026-11-01T00:00:00.000Z';
const T = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, completed: false, createdAt: STAMP, updatedAt: STAMP, ...extra });

test('a daily series says Every day, with Until when it ends, and has the Daily emoji', () => {
  const quests = buildQuests([T('d', { recurrence: 'daily', dueDate: '2026-11-10', repeatUntil: '2026-12-17' })], [], TODAY);
  assert.equal(quests.length, 1);
  assert.match(questWords(quests[0], TODAY), /^Every day/);
  assert.match(questWords(quests[0], TODAY), /Until 17 Dec/);
  const daily = questsBySection(quests).find((g) => g.quests.includes(quests[0]))!;
  assert.equal(questEmoji(quests[0]), quests[0].emoji ?? daily.section.emoji);
});
