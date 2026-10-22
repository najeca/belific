// What the phone's Week and Month views show for one day (PLAN_phone P9). Pure: NO runtime imports
// besides siblings; see phoneWeek.test.ts. The same day as the Day view (timeboxTasks.ts: stored and
// projected tasks; old events; the iPhone's own events), reduced to short items: all day tasks first,
// then timed ones in time order. Done tasks are kept and marked, so a day reads the same everywhere.
import type { ScheduleEvent, Task } from './types.ts';
import { tasksForTimebox } from './timeboxTasks.ts';
import { toMinutes } from './timebox.ts';
import { isMustDo } from './mustDo.ts';
import { segmentsForDay } from './externalEvents.ts';
import type { Occurrence } from './icsParse.ts';

export interface DayItem {
  key: string;
  title: string;
  startMin: number | null;
  kind: 'task' | 'event' | 'device';
  done: boolean;
  high: boolean;
}

export function dayItems(input: { tasks: Task[]; dayKey: string; todayKey: string; events?: ScheduleEvent[]; device?: Occurrence[] }): DayItem[] {
  const out: DayItem[] = [];
  for (const { task } of tasksForTimebox(input.tasks, input.dayKey, input.todayKey).own) {
    out.push({ key: `task:${task.id}`, title: `${task.emoji ? `${task.emoji} ` : ''}${task.title}`, startMin: toMinutes(task.startTime), kind: 'task', done: task.completed, high: isMustDo(task) });
  }
  for (const e of input.events ?? []) out.push({ key: `event:${e.id}`, title: e.title, startMin: toMinutes(e.start), kind: 'event', done: false, high: false });
  for (const seg of segmentsForDay(input.device ?? [], input.dayKey)) out.push({ key: `ext:${seg.occ.id}`, title: seg.occ.title, startMin: seg.allDayRow ? null : seg.startMin, kind: 'device', done: false, high: false });
  return out.sort((a, b) => (a.startMin ?? -1) - (b.startMin ?? -1) || Number(b.high) - Number(a.high) || a.title.localeCompare(b.title));
}

// Emoji out of a title (astral pairs, the arrow and symbol blocks, joiners and variation selectors),
// written without Unicode property escapes so every JavaScript engine reads it.
const EMOJI = /[\uD83C-\uDBFF][\uDC00-\uDFFF]|[←-⯿️‍]/g;

// A short title for a narrow Week column: the first word or two, no emoji, at most `max` characters.
export function shortTitle(title: string, max = 9): string {
  const plain = title.replace(EMOJI, '').trim();
  const words = plain.split(/\s+/).filter(Boolean);
  let out = words[0] ?? '';
  if (words[1] && out.length + 1 + words[1].length <= max) out = `${out} ${words[1]}`;
  return out.length > max ? `${out.slice(0, max - 1)}…` : out;
}
