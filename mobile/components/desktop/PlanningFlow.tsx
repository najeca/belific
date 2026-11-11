import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { addDays, dateKey, parseDateKey } from '../../lib/kanban';
import { formatClock } from '../../lib/duration';
import { loadLabels } from '../../lib/labels';
import { labelColor } from '../../lib/labelColors';
import { listTitle, tasksInList } from '../../lib/lists';
import { generateId } from '../../lib/data';
import { newThought } from '../../lib/thoughts';
import { tomorrowOf } from '../../lib/rollover';
import { EMPTY_DRAFT, doneOn, draftAdd, draftEdit, draftView, nextWeekStart, onDay, type Draft } from '../../lib/planningDraft';
import { missedItems, ownDayCompletedAt, type MissedItem } from '../../lib/missed';
import MissedList, { type MissedActions } from './MissedList';
import { useAwayDays } from './awayStore';
import { finishFlow } from '../../lib/planningActions';
import { estimateOf, formatTotals, lengthOf, totalsOf } from '../../lib/taskTotals';
import { nestedMinutesBy } from '../../lib/nesting';
import { useCutMin } from './cutStore';
import { minutesOfDay, nowLineTop } from '../../lib/calendarView';
import { loadLists, loadTasksRaw } from '../../lib/storage';
import type { Project, Task, TaskList } from '../../lib/types';
import { DESKTOP_FONT_FAMILY } from './desktopFont';
import DurationSelect from './DurationSelect';
import { isPopoverOpen } from './Popover';
import { closeOverlay, notifyChanged } from './uiStore';
import { useTint } from './themeStore';
import { DISPLAY_FONT_FAMILY } from './desktopFont';
import { RoundCheck } from './ui';
import { IconHeading, type IconName } from './ui';

// Daily Planning (4 steps) and Daily Shutdown (2 steps), build plan phase 5,
// section 4. A full screen overlay on the home screen, never a new screen: a
// narrow rail on the left (step, title, helper text, figures, the primary
// button pinned at the bottom, a back arrow after step 1, Cancel) and one to
// three columns on the right.
//
// EVERYTHING here is a draft (lib/planningDraft.ts) held in this component:
// ticking a missed task as done, pulling a task onto today, adding one, moving
// one to tomorrow or next week, giving one a time or an estimate. Nothing is
// written until Finish (lib/planningActions.ts). Cancel, Escape or closing throws the draft
// away, so every task is exactly as it was.
//
// F3 of PLAN_daily_flow (3.42.0): this is Plan my day only (Wrap up is WrapUp.tsx, one screen), and Finish no longer
// rolls the tasks of earlier days onto today: they wait in Earlier until you choose (D5). F4 replaces this screen.
export default function PlanningFlow({ mode }: { mode: 'planning' }) {
  // The smallest piece a Break leaves: a task the breaks cut counts only its pieces in the figures (D4).
  const cutMin = useCutMin();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [labels, setLabels] = useState<Project[]>([]);
  const [lists, setLists] = useState<TaskList[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  // The day the flow is about, fixed when it opens (a flow left open past
  // midnight still plans the day it was opened for).
  const todayKey = useRef(dateKey(new Date())).current;
  const yesterday = dateKey(addDays(parseDateKey(todayKey), -1));
  const tomorrow = tomorrowOf(todayKey);
  const nextWeek = nextWeekStart(todayKey);
  // Away days (2.27.0) show in the flow: a line in the rail, and on the day's column.
  const awayDays = useAwayDays();
  const awayNote = [awayDays.has(todayKey) && 'Today', awayDays.has(tomorrow) && 'Tomorrow'].filter(Boolean).join(' and ');

  useEffect(() => {
    Promise.all([loadTasksRaw(), loadLabels(), loadLists()]).then(([t, l, ls]) => {
      setTasks(t);
      setLabels(l);
      setLists(ls);
    });
    const before = document.activeElement as HTMLElement | null;
    // Escape is Cancel, wherever the keyboard is in the flow (a text box
    // included): caught first, so nothing else treats it as its own.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // An open drop-down (the estimate, 2.27.1) takes its own Escape first.
      if (isPopoverOpen()) return;
      e.preventDefault();
      e.stopPropagation();
      closeOverlay();
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      if (before && before.isConnected) before.focus({ preventScroll: true });
    };
  }, [todayKey]);

  const view = useMemo(() => (tasks ? draftView(tasks.filter((t) => !t.deletedAt), draft) : []), [tasks, draft]);
  const edit = (id: string, fields: Partial<Task>) => setDraft((d) => draftEdit(d, id, fields));
  // 3.25.0: Done and Skip all here are draft edits (written on Finish): each task is marked done on its own day. An Undo shows
  // for 8 seconds; there is no question first.
  const [doneUndo, setDoneUndo] = useState<{ ids: string[] } | null>(null);
  useEffect(() => {
    if (!doneUndo) return;
    const t = setTimeout(() => setDoneUndo(null), 8000);
    return () => clearTimeout(t);
  }, [doneUndo]);
  const markDone = (list: Task[]) => {
    if (list.length === 0) return;
    list.forEach((t) => edit(t.id, { completed: true, completedAt: t.dueDate ? ownDayCompletedAt(t.dueDate) : new Date().toISOString() }));
    setDoneUndo({ ids: list.map((t) => t.id) });
  };
  const undoDone = () => {
    doneUndo?.ids.forEach((id) => edit(id, { completed: false, completedAt: undefined }));
    setDoneUndo(null);
  };
  const steps = PLANNING_STEPS;
  const last = step === steps.length - 1;
  const labelOf = (t: Task) => labels.find((l) => l.key === t.projectKey);

  async function finish() {
    if (!tasks || busy) return;
    setBusy(true);
    await finishFlow(draft, todayKey, mode, new Set(), false);
    notifyChanged();
    closeOverlay();
  }

  // What each step shows.
  // F3: the earlier days' column is always there, and nothing rolls onto today on Finish (D5).
  const showMissed = true;
  const todayList = onDay(view, todayKey);
  const tomorrowList = onDay(view, tomorrow);
  const nextWeekList = onDay(view, nextWeek);

  // The Missed list (2.27.0): the same rows and actions as the Missed panel,
  // here as draft edits written on Finish. Worked out from the rows with
  // tombstones (a skipped series day is not missed). A task ticked done in the
  // flow stays listed, ticked, so the tick can be undone.
  const missedRows: MissedItem[] = tasks && showMissed
    ? [
        ...missedItems(draftView(tasks, draft), todayKey),
        ...view.filter((t) => draft.edits[t.id]?.completed === true && t.dueDate && t.dueDate < todayKey).map((t): MissedItem => ({ kind: 'task', task: t, day: t.dueDate as string, stored: true })),
      ]
    : [];
  const missedActions: MissedActions = {
    today: (t) => edit(t.id, { dueDate: todayKey }),
    tomorrow: (t) => edit(t.id, { dueDate: tomorrow }),
    pickDay: (t, day) => edit(t.id, { dueDate: day }),
    drop: (t) => edit(t.id, { dueDate: undefined, startTime: undefined }),
    done: (t) => markDone([t]),
    skipAll: () => markDone(missedRows.map((m) => m.task).filter((t) => !t.completed)),
    allToday: () => missedRows.forEach((m) => m.kind === 'task' && !m.task.completed && edit(m.task.id, { dueDate: todayKey })),
    tick: (t) => edit(t.id, t.completed ? { completed: false } : { completed: true, completedAt: new Date().toISOString() }),
  };
  const missedColumn = (title: string, hint: string) => (
    <Column title={title} icon="time-outline" hint={hint}>
      {doneUndo && (
        <View style={styles.undoNote} {...({ dataSet: { missedUndo: '1' } } as object)}>
          <Text style={styles.undoText}>{doneUndo.ids.length === 1 ? 'Marked 1 done on its own day.' : `Marked ${doneUndo.ids.length} done on their own days.`}</Text>
          <Pressable onPress={undoDone} accessibilityRole="button" accessibilityLabel="Undo" {...({ dataSet: { missedUndoBtn: '1' } } as object)}>
            <Text style={styles.undoLink}>Undo</Text>
          </Pressable>
        </View>
      )}
      <MissedList items={missedRows} labels={labels} todayKey={todayKey} actions={missedActions} rowLabel={(t) => `Flow task ${t.title}`} empty="No missed tasks to review. Add anything you want to work on in the next step." />
    </Column>
  );

  const s = steps[step];
  let figures: Array<[string, string]> = [];
  let columns: React.ReactNode = null;

  if (!tasks) {
    columns = <Text style={styles.muted}>Loading…</Text>;
  } else if (step === 0) {
    const done = doneOn(view, yesterday);
    figures = [
      ['Finished yesterday', String(done.length)],
    ];
    columns = (
      <>
        <Column title="Here's what you finished" icon="checkmark-circle-outline">
          {done.length === 0 ? <Text style={styles.muted}>Nothing was finished yesterday.</Text> : done.map((t) => <Row key={t.id} task={t} label={labelOf(t)} />)}
        </Column>
        {showMissed && missedColumn('From earlier days', 'Tick any that were done, or choose a day. The ones you leave wait in Earlier. Skip all marks them done on their own days.')}
      </>
    );
  } else if (step === 1) {
    const target = todayKey;
    const targetList = todayList;
    figures = [
      ['For today', String(targetList.filter((t) => !t.cutsBelow).length)],
      ['Estimated', formatClock(totalsOf(targetList, Date.now(), cutMin).estimate)],
    ];
    columns = (
      <>
        <ListColumn lists={lists} tasks={view} labels={labels} actionLabel="Today" onPick={(t) => edit(t.id, { dueDate: target })} />
        <Column title="Today" icon="calendar-outline">
          <AddBar
            placeholder="Add a task for today"
            onAdd={(title) => {
              const t = newThought(generateId(), title, new Date().toISOString());
              if (t) setDraft((d) => draftAdd(d, { ...t, dueDate: target }));
            }}
          />
          {targetList.length === 0 ? (
            <Text style={styles.muted}>Nothing yet. Pull tasks across from the list, or add one above.</Text>
          ) : (
            targetList.map((t) => (
              <Row key={t.id} task={t} label={labelOf(t)} onEstimate={(m) => edit(t.id, { durationMinutes: m })} actions={[{ text: 'Not now', a11y: `Take ${t.title} off`, onPress: () => (draft.added.some((a) => a.id === t.id) ? setDraft((d) => ({ ...d, added: d.added.filter((a) => a.id !== t.id) })) : edit(t.id, { dueDate: undefined })) }]} />
            ))
          )}
        </Column>
      </>
    );
  } else if (step === 2) {
    const tot = totalsOf(todayList, Date.now(), cutMin);
    figures = [
      ['Tasks today', String(todayList.filter((t) => !t.cutsBelow).length)],
      ['Estimated', formatClock(tot.estimate)],
      ...byLabel(todayList, labels),
    ];
    const move = (t: Task, day: string) => edit(t.id, { dueDate: day });
    columns = (
      <>
        <Column title="Today" icon="calendar-outline">
          <LabelBar tasks={todayList} labels={labels} />
          {todayList.map((t) => (
            <Row key={t.id} task={t} label={labelOf(t)} onEstimate={(m) => edit(t.id, { durationMinutes: m })} actions={[{ text: '→ Tomorrow', a11y: `Move ${t.title} to tomorrow`, onPress: () => move(t, tomorrow) }, { text: '→ Next week', a11y: `Move ${t.title} to next week`, onPress: () => move(t, nextWeek) }]} />
          ))}
        </Column>
        <Column title="Tomorrow" icon="sunny-outline" hint={awayDays.has(tomorrow) ? 'Tomorrow is an away day' : 'Add tasks that can wait'}>
          {tomorrowList.map((t) => (
            <Row key={t.id} task={t} label={labelOf(t)} actions={[{ text: '← Today', a11y: `Move ${t.title} to today`, onPress: () => move(t, todayKey) }]} />
          ))}
        </Column>
        <Column title="Next week" icon="calendar-number-outline" hint="Add tasks that can wait">
          {nextWeekList.map((t) => (
            <Row key={t.id} task={t} label={labelOf(t)} actions={[{ text: '← Today', a11y: `Move ${t.title} to today`, onPress: () => move(t, todayKey) }]} />
          ))}
        </Column>
      </>
    );
  } else if (step === 3) {
    figures = [
      ['Tasks today', String(todayList.length)],
      ['Placed', String(todayList.filter((t) => t.startTime).length)],
    ];
    columns = (
      <>
        <Column title="Today" icon="calendar-outline" hint="Give a task a time, or leave it untimed.">
          {todayList.map((t) => (
            <View key={t.id} style={styles.timeRow}>
              <Row task={t} label={labelOf(t)} onEstimate={(m) => edit(t.id, { durationMinutes: m })} />
              <select
                value={t.startTime ?? ''}
                aria-label={`Time for ${t.title}`}
                onChange={(e) => edit(t.id, { startTime: e.target.value || undefined })}
                style={domSelect}
              >
                <option value="">No time</option>
                {SLOTS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </View>
          ))}
        </Column>
        <Column title="Timebox" icon="time-outline">
          <DayPreview tasks={todayList} labels={labels} isToday />
        </Column>
      </>
    );
  }

  return (
    <View style={styles.overlay} accessibilityLabel="Daily Planning" {...({ role: 'dialog', 'aria-modal': true, dataSet: { flow: mode } } as object)}>
      <View style={styles.rail}>
        <Text style={styles.badge}>
          Daily Planning · Step {step + 1} of {steps.length}
        </Text>
        <Text style={styles.title} accessibilityRole="header">
          {s.title}
        </Text>
        <Text style={styles.helper}>{s.helper}</Text>
        <Text style={styles.helper}>Everything is a draft until you finish. Cancel changes nothing.</Text>
        {awayNote ? (
          <Text style={styles.helper} {...({ dataSet: { flowAway: '1' } } as object)}>
            {awayNote} {awayNote.includes(' and ') ? 'are away days' : 'is an away day'}. Tasks can still go there.
          </Text>
        ) : null}
        <View style={styles.figures}>
          {figures.map(([k, v]) => (
            <View key={k} style={styles.figure}>
              <Text style={styles.figureKey}>{k}</Text>
              <Text style={styles.figureValue}>{v}</Text>
            </View>
          ))}
        </View>
        <View style={{ flex: 1 }} />
        <View style={styles.railButtons}>
          {step > 0 && (
            <Pressable onPress={() => setStep((n) => n - 1)} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Previous step">
              <Ionicons name="chevron-back" size={18} color={Colors.textPrimary} />
            </Pressable>
          )}
          <Pressable
            onPress={last ? finish : () => setStep((n) => n + 1)}
            disabled={!tasks || busy}
            style={[styles.primary, (!tasks || busy) && styles.off]}
            accessibilityRole="button"
            accessibilityLabel={last ? 'Finish' : 'Next step'}
          >
            <Text style={styles.primaryText}>{last ? 'Finish' : 'Next'}</Text>
          </Pressable>
        </View>
        <Pressable onPress={closeOverlay} style={styles.cancel} accessibilityRole="button" accessibilityLabel="Cancel and change nothing">
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
      <ScrollView horizontal style={styles.columns} contentContainerStyle={styles.columnsContent}>
        {columns}
      </ScrollView>
    </View>
  );
}

const PLANNING_STEPS = [
  { title: 'Review your work', helper: 'What you finished yesterday, and what was left from earlier days.' },
  { title: 'What do you want to get done today?', helper: 'Pull tasks across from a list, or add new ones.' },
  { title: 'Can anything wait?', helper: 'Move what does not fit today to tomorrow or next week.' },
  { title: 'Finalise your day', helper: 'Give tasks a time if you like. Finish applies it all.' },
];
const SLOTS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

// The estimate per label, for the rail (3.26.0: the time spent per label is no longer shown).
// Shifts S1: a block inside a longer one is not counted again (nesting.ts).
function byLabel(tasks: Task[], labels: Project[]): Array<[string, string]> {
  const by = new Map<string, number>();
  const nested = nestedMinutesBy(tasks);
  for (const t of tasks) {
    const name = labels.find((l) => l.key === t.projectKey);
    const k = name ? `${name.emoji ? `${name.emoji} ` : ''}${name.name}` : 'No label';
    const m = estimateOf(t) - (nested.get(t) ?? 0);
    by.set(k, (by.get(k) ?? 0) + m);
  }
  return [...by.entries()].filter(([, m]) => m > 0).map(([k, m]) => [k, formatClock(m)]);
}

function Column({ title, icon, hint, children }: { title: string; icon: IconName; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.column} accessibilityLabel={`${title} column`}>
      <IconHeading icon={icon} style={styles.columnTitle}>{title}</IconHeading>
      {hint ? <Text style={styles.muted}>{hint}</Text> : null}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 6, paddingBottom: 12 }}>
        {children}
      </ScrollView>
    </View>
  );
}

function Row({
  task,
  label,
  sub,
  tick,
  onTick,
  check,
  actions,
  onEstimate,
}: {
  task: Task;
  label?: Project;
  sub?: string;
  tick?: boolean;
  onTick?: () => void;
  check?: { on: boolean; a11y: string; onPress: () => void };
  actions?: Array<{ text: string; a11y: string; onPress: () => void }>;
  // The estimate, as the shared time drop-down (2.27.1); a draft edit.
  onEstimate?: (minutes: number | undefined) => void;
}) {
  const color = labelColor(label?.colorKey);
  return (
    <View style={[styles.row, color && { borderLeftColor: color.edge, borderLeftWidth: 3 }]} accessibilityLabel={`Flow task ${task.title}`}>
      {onTick && (
        <Pressable onPress={onTick} style={styles.tick} accessibilityRole="button" accessibilityLabel={tick ? `Mark ${task.title} not done` : `Mark ${task.title} done`}>
          <RoundCheck done={!!tick} size={18} />
        </Pressable>
      )}
      {check && (
        <Pressable onPress={check.onPress} style={styles.tick} accessibilityRole="checkbox" accessibilityState={{ checked: check.on }} accessibilityLabel={check.a11y}>
          <RoundCheck done={!!check.on} size={18} />
        </Pressable>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.rowTitle, task.completed && styles.rowDone]} numberOfLines={2}>
          {task.emoji ? `${task.emoji} ` : ''}
          {task.title}
        </Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {[sub, label ? `${label.emoji ? `${label.emoji} ` : ''}${label.name}` : undefined, task.startTime, formatTotals(totalsOf([task], Date.now())) || undefined].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {onEstimate && <DurationSelect id={`flow:${task.id}`} label={`Estimated time for ${task.title}`} value={task.durationMinutes} onChange={onEstimate} placeholder="⏳ Estimate" compact />}
      {actions?.map((a) => (
        <Pressable key={a.text} onPress={a.onPress} style={styles.action} accessibilityRole="button" accessibilityLabel={a.a11y}>
          <Text style={styles.actionText}>{a.text}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function ListColumn({ lists, tasks, labels, actionLabel, onPick }: { lists: TaskList[]; tasks: Task[]; labels: Project[]; actionLabel: string; onPick: (t: Task) => void }) {
  const [key, setKey] = useState<string>('');
  const shown = tasksInList(tasks, key || undefined, lists).filter((t) => !t.completed && !t.dueDate);
  return (
    <View style={styles.column} accessibilityLabel="List column">
      <select value={key} aria-label="List to pull from" onChange={(e) => setKey(e.target.value)} style={domSelect}>
        <option value="">{listTitle(undefined)}</option>
        {lists.map((l) => (
          <option key={l.key} value={l.key}>
            {listTitle(l)}
          </option>
        ))}
      </select>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 6, paddingBottom: 12, paddingTop: 8 }}>
        {shown.length === 0 ? (
          <Text style={styles.muted}>Nothing waiting in this list.</Text>
        ) : (
          shown.map((t) => <Row key={t.id} task={t} label={labels.find((l) => l.key === t.projectKey)} actions={[{ text: `→ ${actionLabel}`, a11y: `Move ${t.title} to ${actionLabel.toLowerCase()}`, onPress: () => onPick(t) }]} />)
        )}
      </ScrollView>
    </View>
  );
}

function AddBar({ placeholder, onAdd }: { placeholder: string; onAdd: (title: string) => void }) {
  const [text, setText] = useState('');
  return (
    <TextInput
      style={styles.add}
      value={text}
      onChangeText={setText}
      placeholder={placeholder}
      placeholderTextColor={Colors.textSecondary}
      onSubmitEditing={() => {
        if (!text.trim()) return;
        onAdd(text.trim());
        setText('');
      }}
      blurOnSubmit={false}
      accessibilityLabel={placeholder}
    />
  );
}

// A per label share of the day's estimate, as one quiet bar.
function LabelBar({ tasks, labels }: { tasks: Task[]; labels: Project[] }) {
  const nested = nestedMinutesBy(tasks);
  const own = (t: Task) => estimateOf(t) - (nested.get(t) ?? 0);
  const total = tasks.reduce((n, t) => n + own(t), 0);
  if (total === 0) return null;
  const parts = new Map<string, number>();
  for (const t of tasks) parts.set(t.projectKey ?? '', (parts.get(t.projectKey ?? '') ?? 0) + own(t));
  return (
    <View style={styles.bar} accessibilityLabel="Time by label">
      {[...parts.entries()].filter(([, m]) => m > 0).map(([k, m]) => (
        <View key={k || 'none'} style={{ flex: m, backgroundColor: labelColor(labels.find((l) => l.key === k)?.colorKey)?.edge ?? Colors.border }} />
      ))}
    </View>
  );
}

// A small read only Timebox of the draft: untimed tasks in an all day row, timed
// ones on the hours, and the current time line.
const PREVIEW_PX_PER_HOUR = 30;
function DayPreview({ tasks, labels, isToday }: { tasks: Task[]; labels: Project[]; isToday: boolean }) {
  const tint = useTint();
  const untimed = tasks.filter((t) => !t.startTime);
  const timed = tasks.filter((t) => t.startTime);
  const top = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    return ((h * 60 + m) * PREVIEW_PX_PER_HOUR) / 60;
  };
  return (
    <View>
      <View style={styles.allDay} accessibilityLabel="All day row">
        <Text style={styles.rowSub}>all day</Text>
        {untimed.map((t) => (
          <Text key={t.id} style={styles.allDayChip} numberOfLines={1}>
            {t.title}
          </Text>
        ))}
      </View>
      <View style={{ height: 24 * PREVIEW_PX_PER_HOUR, position: 'relative' }}>
        {Array.from({ length: 24 }, (_, h) => (
          <View key={h} style={[styles.hour, { top: h * PREVIEW_PX_PER_HOUR }]}>
            <Text style={styles.hourText}>{String(h).padStart(2, '0')}:00</Text>
          </View>
        ))}
        {timed.map((t) => {
          const color = labelColor(labels.find((l) => l.key === t.projectKey)?.colorKey);
          return (
            <View
              key={t.id}
              style={[styles.block, { top: top(t.startTime as string), height: Math.max(16, (Math.max(lengthOf(t), 30) * PREVIEW_PX_PER_HOUR) / 60) }, color && { backgroundColor: tint(color), borderLeftColor: color.edge }]}
              accessibilityLabel={`Planned ${t.title} at ${t.startTime}`}
            >
              <Text style={styles.blockText} numberOfLines={1}>
                {t.startTime} {t.title}
              </Text>
            </View>
          );
        })}
        {isToday && <View style={[styles.now, { top: (nowLineTop(minutesOfDay(new Date())) * PREVIEW_PX_PER_HOUR) / 56 }]} accessibilityLabel="Current time" />}
      </View>
    </View>
  );
}

const domSelect: React.CSSProperties = {
  height: 32,
  padding: '0 8px',
  borderRadius: 10,
  border: `1px solid ${Colors.border}`,
  background: Colors.surface,
  color: Colors.textPrimary,
  fontSize: 13,
  fontFamily: DESKTOP_FONT_FAMILY,
  outlineColor: Colors.accent,
};

const styles = StyleSheet.create({
  undoNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 10, height: 34, borderRadius: 10, backgroundColor: Colors.chip },
  undoText: { fontSize: 12, color: Colors.textPrimary },
  undoLink: { fontSize: 12, fontWeight: '700', color: Colors.accentText, textDecorationLine: 'underline' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 65, flexDirection: 'row', backgroundColor: Colors.background },
  rail: { width: 280, padding: 20, gap: 10, backgroundColor: Colors.surface, borderRightWidth: 1, borderRightColor: Colors.border },
  badge: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, color: Colors.accentText },
  title: { fontSize: 20, fontFamily: DISPLAY_FONT_FAMILY, fontWeight: '700', color: Colors.textPrimary },
  helper: { fontSize: 13, color: Colors.textSecondary },
  figures: { gap: 6, marginTop: 8 },
  figure: { flexDirection: 'row', justifyContent: 'space-between' },
  figureKey: { fontSize: 13, color: Colors.textSecondary },
  figureValue: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary, fontVariant: ['tabular-nums'] },
  railButtons: { flexDirection: 'row', gap: 8 },
  backBtn: { width: 44, height: 44, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  primary: { flex: 1, height: 44, borderRadius: 0, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 15, fontWeight: '700', color: Colors.onAccent },
  off: { opacity: 0.5 },
  cancel: { alignSelf: 'center', padding: 8 },
  cancelText: { fontSize: 13, color: Colors.textSecondary },
  columns: { flex: 1 },
  columnsContent: { padding: 20, gap: 16, flexGrow: 1 },
  column: { width: 340, gap: 8, padding: 14, borderRadius: 16, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  columnTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  muted: { fontSize: 13, color: Colors.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: 10, backgroundColor: Colors.background },
  tick: { padding: 2 },
  rowTitle: { fontSize: 14, color: Colors.textPrimary },
  rowDone: { textDecorationLine: 'line-through', color: Colors.textSecondary },
  rowSub: { fontSize: 11, color: Colors.textSecondary },
  action: { paddingHorizontal: 8, height: 28, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, justifyContent: 'center', backgroundColor: Colors.surface },
  actionText: { fontSize: 12, color: Colors.textPrimary },
  timeRow: { gap: 4 },
  add: { height: 38, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background, color: Colors.textPrimary, fontSize: 14, outlineColor: Colors.accent },
  bar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: Colors.background },
  allDay: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, alignItems: 'center', paddingBottom: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border, marginBottom: 6 },
  allDayChip: { fontSize: 11, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: Colors.background, color: Colors.textPrimary, maxWidth: 140 },
  hour: { position: 'absolute', left: 0, right: 0, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  hourText: { fontSize: 9, color: Colors.textSecondary },
  block: { position: 'absolute', left: 44, right: 4, borderRadius: 6, paddingHorizontal: 6, justifyContent: 'center', backgroundColor: Colors.background, borderLeftWidth: 3, borderLeftColor: Colors.border },
  blockText: { fontSize: 11, color: Colors.textPrimary },
  now: { position: 'absolute', left: 40, right: 0, height: 1.5, backgroundColor: Colors.now },
});
