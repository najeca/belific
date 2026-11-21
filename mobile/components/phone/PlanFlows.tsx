// Wrap up and Plan week on the phone (PLAN_phone_parity phase 9, 3.65.0). Both are FlowScreen (one task at a time, each
// answer saved at once, Undo, a summary) over the desktop's rules: lib/wrapQueue.ts and lib/weekQueue.ts for what is asked,
// lib/flowActions.ts (the desktop's wrapActions) for what is written.
import React from 'react';
import { addDays, dateKey, formatDayTitle, parseDateKey } from '../../lib/kanban';
import { formatTime } from '../../lib/data';
import { formatDuration } from '../../lib/duration';
import { BRAIN_DUMP_NAME, liveLists } from '../../lib/lists';
import { loadListsRaw, loadTasksRaw } from '../../lib/storage';
import { loadCutMin } from '../../lib/phoneActions';
import { tomorrowText, type WrapItem } from '../../lib/wrapUp';
import { wrapHint, wrapOffers, wrapQueue, wrapText, type WrapAnswer } from '../../lib/wrapQueue';
import { dayButton, openDays, weekFigure, weekQueue, weekText, type WeekStep } from '../../lib/weekQueue';
import { weekToPlan } from '../../lib/planEntry';
import { runWeekAnswer, runWrapAnswer } from '../../lib/flowActions';
import type { Task, TaskList } from '../../lib/types';
import { FlowScreen, type FlowStep } from './FlowScreen';

const whereOf = (t: Task, lists: TaskList[]): string => {
  const l = t.listKey ? liveLists(lists).find((x) => x.key === t.listKey) : undefined;
  return l ? `${l.emoji ? `${l.emoji} ` : ''}${l.name}` : BRAIN_DUMP_NAME;
};
const facts = (item: WrapItem): string => [formatDuration(item.task.durationMinutes), item.task.startTime ? formatTime(item.task.startTime) : '', item.series ? 'Repeats' : ''].filter(Boolean).join(' · ');

export function PhoneWrapUp({ visible, onClose, onChanged }: { visible: boolean; onClose: () => void; onChanged: () => void }) {
  const todayKey = React.useRef(dateKey(new Date()));
  const cutMin = React.useRef(30);
  const tomorrowKey = () => dateKey(addDays(parseDateKey(todayKey.current), 1));
  const figure = async () => tomorrowText(await loadTasksRaw(), tomorrowKey(), todayKey.current, cutMin.current, Date.now());
  const load = async () => {
    todayKey.current = dateKey(new Date());
    const [raw, lists, cut] = await Promise.all([loadTasksRaw(), loadListsRaw(), loadCutMin()]);
    cutMin.current = cut;
    const steps: FlowStep<WrapItem>[] = wrapQueue(raw, todayKey.current, cut).map((item) => ({
      key: item.key,
      title: item.task.title,
      emoji: item.task.emoji,
      meta: [whereOf(item.task, lists), facts(item), item.inside ? `${item.inside.length} inside` : ''],
      ask: 'How did this go?',
      hint: wrapHint(item),
      buttons: wrapOffers(item).map((o) => ({ id: o.answer, label: o.label, a11y: o.answer === 'letGo' && item.series ? 'Let go for today, skip this day' : o.label })),
      data: item,
    }));
    return { steps, figure: await figure() };
  };
  return (
    <FlowScreen<WrapItem>
      visible={visible}
      name="wrap"
      title="Wrap up"
      emptyText="Nothing left open today."
      doneText="That is the day wrapped up."
      load={load}
      figure={figure}
      run={async (step, button) => {
        await runWrapAnswer(step.data, button as WrapAnswer, tomorrowKey());
        return { text: wrapText(button as WrapAnswer, step.title) };
      }}
      onClose={onClose}
      onChanged={onChanged}
    />
  );
}

export function PhonePlanWeek({ visible, onClose, onChanged }: { visible: boolean; onClose: () => void; onChanged: () => void }) {
  // The days and "today" are fixed when it opens: on Sunday from 16:00 the week is next week.
  const state = React.useRef({ today: dateKey(new Date()), days: weekToPlan(new Date()), cut: 30 });
  const figure = async () => weekFigure(await loadTasksRaw(), state.current.days, state.current.today, state.current.cut, Date.now());
  const load = async () => {
    const opened = new Date();
    const [raw, lists, cut] = await Promise.all([loadTasksRaw(), loadListsRaw(), loadCutMin()]);
    state.current = { today: dateKey(opened), days: weekToPlan(opened), cut };
    const open = openDays(state.current.days, state.current.today);
    const steps: FlowStep<WeekStep>[] = weekQueue(raw, state.current.today, lists).map((st) => ({
      key: st.item.key,
      title: st.item.task.title,
      emoji: st.item.task.emoji,
      meta: [whereOf(st.item.task, lists), st.source === 'earlier' ? (st.item.task.dueDate ? `From ${formatDayTitle(st.item.task.dueDate, state.current.today)}` : 'From last week') : '', facts(st.item)],
      ask: 'Which day?',
      hint: st.source === 'earlier' ? 'It keeps the time it has.' : 'It goes on the day with no time. Not now leaves it where it is.',
      buttons: [...open.map((d) => ({ id: d, label: dayButton(d) })), { id: 'skip', label: 'Not now' }],
      data: st,
    }));
    return { steps, figure: await figure() };
  };
  return (
    <FlowScreen<WeekStep>
      visible={visible}
      name="week"
      title="Plan week"
      emptyText="Nothing waiting to be placed."
      doneText="That is the week planned."
      load={load}
      figure={figure}
      run={async (step, button) => {
        if (button !== 'skip') await runWeekAnswer(step.data.item, step.data.source, button);
        return { text: weekText(button, step.title) };
      }}
      onClose={onClose}
      onChanged={onChanged}
    />
  );
}
