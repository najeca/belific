// The Repeats groups and their row words, for both apps (PLAN_desktop_parity D1, 3.66.0). The grouping itself was
// already shared (lib/quests.ts: buildQuests, questsBySection, QUEST_SECTIONS); the row's words and emoji moved here
// unchanged from the phone's app/(tabs)/tasks.tsx so the desktop's Repeats list (D5) says the same. Pure: NO runtime
// imports besides siblings; see repeatGroups.test.ts.
import { QUEST_SECTIONS, type Quest } from './quests.ts';
import { repeatWords } from './repeatWords.ts';

// The pattern in words, with "Until 17 Dec" when it ends (3.61.0); the short form when the rule is not known.
export function questWords(q: Quest, todayKey: string): string {
  const template = q.rows.find((r) => r.recurrence && !r.deletedAt) ?? q.target?.task;
  return (template ? repeatWords(template, todayKey) : undefined) ?? q.repeat;
}

export function questEmoji(q: Quest): string {
  return q.emoji ?? QUEST_SECTIONS.find((x) => x.key === q.section)?.emoji ?? '🔁';
}
