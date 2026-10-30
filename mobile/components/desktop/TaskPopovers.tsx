import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { addDays, clampToToday, dateKey, formatShortDate, isDateKey, parseDateKey } from '../../lib/kanban';
import { DURATION_PRESETS, parseDuration, presetLabel } from '../../lib/duration';
import { colorClash, freeColorKey, labelColor } from '../../lib/labelColors';
import LabelForm from './LabelForm';
import { countTasksWithLabel, createLabel, deleteLabel, loadLabels, renameLabel, setLabelColor } from '../../lib/labels';
import { availableSuggestions, findLabelByName, normalizeName } from '../../lib/labelRules';
import { NEEDS_TIME_HINT, NO_START_NOTE, REMINDER_LEADS, MAX_TASK_REMINDERS, effectiveReminders, leadLabel, reminderPatch, reminderState, toggleLead } from '../../lib/reminder';
import { useDefaultReminders } from './reminderStore';
import {
  ANNUAL_CONFIRM,
  ANNUAL_WARNING,
  REPEAT_CHOICES,
  WEEKDAY_SET,
  WEEKEND_SET,
  WEEK_ORDER,
  defaultMonthDay,
  initialDays,
  parseMonthDay,
  repeatKindOf,
  allSeven,
  repeatLabel,
  repeatSummary,
  resolveRepeat,
  sameDays,
  switchedKind,
  toggleDay,
  weekdayOf,
  type RepeatKind,
} from '../../lib/repeat';
import { loadTasks, loadTasksRaw } from '../../lib/storage';
import { LONGER_THAN_BREAK, breakEntries, breaksFitting, dayHostEntries } from '../../lib/hosting';
import { taskDuration } from '../../lib/drag';
import { toTime } from '../../lib/timebox';
import { setLabelEmoji } from '../../lib/labels';
import { duplicateTaskById } from '../../lib/taskCommands';
import { setActualFor } from '../../lib/timerActions';
import { formatTaskTime } from '../../lib/taskTotals';
import { isTimerRunning } from '../../lib/taskTimer';
import type { Project, Task, WeekDay } from '../../lib/types';
import HoverPressable from './HoverPressable';
import { MUST_DO_MARK, MUST_DO_TIP, isMustDo, mustDoPatch } from '../../lib/mustDo';
import { notifyChanged, openDetail, openOverlay, useNewColorsOk } from './uiStore';
import { toggleTimer, useNow } from './timerUi';
import { startFromChoices } from '../../lib/timerSession';
import { EACH_TIME_NOTE, isMultiTime } from '../../lib/times';
import { MOVE_THIS_DAY, MOVE_THIS_DAY_NOTE } from '../../lib/series';
import { formatTime } from '../../lib/data';
import { useFeatures } from './featureStore';
import { startFocus } from './pomodoroStore';
import { PopoverHeading, Row, popoverStyles } from './Popover';
import { DESKTOP_FONT_FAMILY } from './desktopFont';
import type { TaskOps } from './taskOps';
import { MonthGrid, SearchField, divider } from './ui';

// The contents of the small dropdowns on a task card (checkpoint 8.2). Each
// body edits one thing through `ops` and calls `done` when an option was
// chosen (the card closes its popover; the Timebox block popover goes back to
// its menu). Nothing here is a modal.
interface BodyProps {
  task: Task;
  ops: TaskOps;
  done: () => void;
}

const domSelectStyle: React.CSSProperties = {
  height: 32,
  padding: '0 8px',
  borderRadius: 10,
  border: `1px solid ${Colors.border}`,
  background: Colors.background,
  color: Colors.textPrimary,
  fontSize: 13,
  fontFamily: DESKTOP_FONT_FAMILY,
  outlineColor: Colors.accent,
};

const domInputStyle: React.CSSProperties = { ...domSelectStyle, height: 34, fontSize: 14 };

// 2.26.0: Priority was removed from the interface (desktop and iPhone). A
// stored priority is kept as it is and still syncs; nothing shows or sets it.

// ---------------------------------------------------------------- Duration
// A field to type into (45m, 1h 30m, 1.5h, 130, 1:30) and a short list of
// presets under it. Any whole minute from 1 to 1440 is valid.
export function DurationBody({ task, ops, done }: BodyProps) {
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState(false);
  const apply = (minutes: number | undefined) => {
    ops.patch({ durationMinutes: minutes });
    done();
  };
  const submit = () => {
    const minutes = parseDuration(text);
    if (minutes === null) setInvalid(true);
    else apply(minutes);
  };
  return (
    <View style={styles.list}>
      <div style={{ padding: '10px 10px 4px' }}>
        <input
          type="text"
          value={text}
          placeholder="Custom: 45m, 1h 30m, 130..."
          aria-label="Duration"
          aria-invalid={invalid}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setText(e.target.value);
            setInvalid(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
          style={{ ...domInputStyle, width: '100%', boxSizing: 'border-box' }}
        />
      </div>
      {invalid && <Text style={styles.hint}>Not a duration. Try 45m, 1h 30m or 130 (minutes).</Text>}
      <div style={{ maxHeight: 196, overflowY: 'auto' }}>
        <Row label="No duration" selected={task.durationMinutes === undefined} onPress={() => apply(undefined)} />
        {DURATION_PRESETS.map((m) => (
          <Row key={m} label={presetLabel(m)} selected={task.durationMinutes === m} onPress={() => apply(m)} />
        ))}
      </div>
      {task.dueDate && task.startTime && (
        <Row
          label="Remove time"
          sub={`Taken off the Timebox (${task.startTime})`}
          onPress={() => {
            ops.patch({ startTime: undefined });
            done();
          }}
        />
      )}
    </View>
  );
}

// ---------------------------------------------------------------- Actual time
// Time actually spent (build plan phase 2): type it (45m, 1h 30m, 130), clear
// it, or start and stop the task's timer. A missing actual is 0. Whole minutes.
export function ActualBody({ task, ops, done }: BodyProps) {
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState(false);
  const running = isTimerRunning(task);
  const now = useNow(running);
  const submit = async () => {
    const minutes = parseDuration(text);
    if (minutes === null) {
      setInvalid(true);
      return;
    }
    // patchTask reads the latest task; setActualFor validates the number.
    if (await setActualFor(task.id, minutes)) {
      notifyChanged();
      done();
    } else setInvalid(true);
  };
  return (
    <View style={styles.list}>
      <Text style={styles.hint} accessibilityLabel="Time so far">
        {formatTaskTime(task, now)} (actual / estimated)
      </Text>
      <div style={{ padding: '4px 10px' }}>
        <input
          type="text"
          value={text}
          placeholder="Actual time: 45m, 1h 30m, 130..."
          aria-label="Actual time"
          aria-invalid={invalid}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setText(e.target.value);
            setInvalid(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
          style={{ ...domInputStyle, width: '100%', boxSizing: 'border-box' }}
        />
      </div>
      {invalid && <Text style={styles.hint}>Not a time. Try 45m, 1h 30m or 130 (minutes).</Text>}
      <Row
        label={running ? 'Stop the timer' : 'Start the timer'}
        sub={running ? 'Adds the time so far' : 'Stops any other timer first'}
        onPress={async () => {
          await toggleTimer(task);
          done();
        }}
        a11y={running ? 'Stop the timer' : 'Start the timer'}
      />
      <StartFromRows task={task} done={done} />
      {(task.actualMinutes ?? 0) > 0 && (
        <Row
          label="Clear actual time"
          onPress={async () => {
            await ops.patch({ actualMinutes: undefined });
            done();
          }}
          a11y="Clear actual time"
        />
      )}
    </View>
  );
}

// ---------------------------------------------------------------- Reminder
// Part B (P5): a task can have several reminders. "Default" uses the list from Settings,
// "None" turns them off; each time below is switched on or off on its own and the menu
// stays open for the next one. The first one is also written into the older single value.
export function ReminderBody({ task, ops, done }: BodyProps) {
  const hasStart = !!task.dueDate && !!task.startTime;
  const defaults = useDefaultReminders();
  const explicit = Array.isArray(task.reminders) || reminderState(task.reminderMinutes) !== 'default';
  // Kept here too, so several switches in a row build on each other before the saved task comes back.
  const [list, setList] = useState(() => effectiveReminders(task, defaults));
  useEffect(() => {
    setList(effectiveReminders(task, defaults));
  }, [task.reminders, task.reminderMinutes, defaults]);
  const full = list.length >= MAX_TASK_REMINDERS;
  return (
    <View style={styles.list}>
      <PopoverHeading>Reminders</PopoverHeading>
      {!hasStart && (
        <Text style={popoverStyles.note} {...({ dataSet: { reminderHint: '1' } } as object)}>
          {NEEDS_TIME_HINT}
        </Text>
      )}
      <Row
        label="Default"
        sub={hasStart ? leadsText(defaults) : 'Your daily reminder'}
        selected={!explicit}
        onPress={() => {
          ops.patch(reminderPatch('default'));
          done();
        }}
      />
      <Row
        label="None"
        selected={explicit && list.length === 0}
        onPress={() => {
          setList([]);
          ops.patch(reminderPatch([]));
          done();
        }}
      />
      {REMINDER_LEADS.map((lead) => {
        const on = explicit && list.includes(lead);
        return (
          <Row
            key={lead}
            label={leadLabel(lead)}
            selected={on}
            disabled={full && !on}
            a11y={`${leadLabel(lead)}${on ? ', on' : ', off'}`}
            onPress={() => {
              const next = toggleLead(explicit ? list : effectiveReminders(task, defaults), lead);
              setList(next);
              ops.patch(reminderPatch(next));
            }}
          />
        );
      })}
      {!hasStart && <Text style={popoverStyles.note}>{NO_START_NOTE}</Text>}
      {hasStart && full && <Text style={popoverStyles.note}>At most {MAX_TASK_REMINDERS} reminders.</Text>}
      {/* Part C: a task with several times a day reminds at each of them that is not done. */}
      {hasStart && isMultiTime(task) && <Text style={popoverStyles.note} {...({ dataSet: { reminderEachTime: '1' } } as object)}>{EACH_TIME_NOTE}</Text>}
    </View>
  );
}

function leadsText(list: number[]): string {
  return list.length === 0 ? 'None' : list.map(leadLabel).join(', ');
}

// ---------------------------------------------------------------- Move to day
// A repeating task (ops.series) moves that day only (3.2.0, seriesActions.moveDay): the heading says
// so and there is no "Remove day" (a day of a series always has a Day).
export function MoveToDayBody({ task, ops, done }: BodyProps) {
  const oneDay = !!ops.series;
  const todayKey = dateKey(new Date());
  const today = parseDateKey(todayKey);
  const tomorrowKey = dateKey(addDays(today, 1));
  // "Next week": the Monday after today (on a Monday, the Monday a week on).
  const nextWeekKey = dateKey(addDays(today, (8 - today.getDay()) % 7 || 7));
  const weekdayDate = (key: string) => parseDateKey(key).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const move = (requested: string | undefined) => {
    // Nothing earlier than today can be chosen.
    const day = requested ? clampToToday(requested, todayKey) : undefined;
    ops.patch({ dueDate: day, startTime: day ? task.startTime : undefined });
    done();
  };
  return (
    <View style={styles.list}>
      <PopoverHeading>{oneDay ? MOVE_THIS_DAY : 'Day'}</PopoverHeading>
      {oneDay ? <Text style={styles.seriesNote}>{MOVE_THIS_DAY_NOTE}</Text> : null}
      <Row icon="today-outline" label="Today" sub={weekdayDate(todayKey)} subRight selected={task.dueDate === todayKey} onPress={() => move(todayKey)} />
      <Row icon="sunny-outline" label="Tomorrow" sub={weekdayDate(tomorrowKey)} subRight selected={task.dueDate === tomorrowKey} onPress={() => move(tomorrowKey)} />
      <Row icon="arrow-forward-circle-outline" label="Next week" sub={weekdayDate(nextWeekKey)} subRight selected={task.dueDate === nextWeekKey} onPress={() => move(nextWeekKey)} />
      <View style={divider} />
      <MonthGrid selected={task.dueDate} min={todayKey} onPick={(key) => move(key)} a11y={(key) => `Move to ${key}`} />
      {task.dueDate && !oneDay && (
        <>
          <View style={divider} />
          <Row icon="close-outline" label="Remove day" sub="Back to the Brain Dump list" onPress={() => move(undefined)} />
        </>
      )}
    </View>
  );
}

// ---------------------------------------------------------------- Repeat
export function RepeatBody({ task, ops, done }: BodyProps) {
  const todayKey = dateKey(new Date());
  const [repeat, setRepeat] = useState<RepeatKind>(repeatKindOf(task.recurrence));
  const [days, setDays] = useState<WeekDay[]>(() => initialDays(task, todayKey));
  const [monthText, setMonthText] = useState(() => String(defaultMonthDay(task)));
  const day = isDateKey(task.dueDate) ? task.dueDate : undefined;
  const monthDay = parseMonthDay(monthText);
  const resolved = resolveRepeat(repeat, days, day, monthDay, todayKey);
  const summary = repeatSummary(repeat, days, day, monthDay);
  // Every year is new in 2.21.0: before a task is first made annual, the person
  // confirms every device has been updated (an older Belific shows no days).
  const [annualOk, setAnnualOk] = useState(false);
  const needsAnnualOk = repeat === 'annual' && task.recurrence !== 'annual' && !annualOk;

  function choose(kind: RepeatKind) {
    setRepeat(kind);
    // A day based repeat with nothing chosen starts from the weekday of the Day.
    if ((kind === 'weekly' || kind === 'biweekly') && (days.length === 0 || (kind === 'weekly' && allSeven(days))) && day) setDays([weekdayOf(day)]);
  }

  function apply() {
    if (!resolved || needsAnnualOk) return;
    // A day based repeat moves the Day to the first chosen weekday on or after
    // it (the summary line says so first). Saving rules are unchanged.
    ops.patch({
      dueDate: resolved.dueDate,
      recurrence: resolved.recurrence,
      recurrenceDays: resolved.recurrenceDays,
      recurrenceMonthDay: resolved.recurrenceMonthDay,
    });
    done();
  }

  return (
    <View style={styles.list}>
      <PopoverHeading>Repeat</PopoverHeading>
      <View style={styles.chips}>
        {REPEAT_CHOICES.map((r) => (
          <Chip
            key={r.kind}
            // Weekly reads Daily while all seven days are on.
            label={repeat === r.kind ? repeatLabel(r.kind, days) : r.label}
            selected={repeat === r.kind}
            onPress={() => choose(r.kind)}
            a11y={`Repeat ${r.label}`}
          />
        ))}
      </View>
      {repeat === 'monthly' && (
        <View style={styles.customRow}>
          <Text style={styles.muted}>Day of the month</Text>
          <input
            type="number"
            min={1}
            max={31}
            step={1}
            value={monthText}
            onChange={(e) => setMonthText(e.target.value)}
            style={{ ...domInputStyle, width: 72 }}
            aria-label="Day of the month"
          />
        </View>
      )}
      {(repeat === 'weekly' || repeat === 'biweekly') && (
        <>
          <View style={styles.chips}>
            {WEEK_ORDER.map((w) => (
              <Chip
                key={w}
                label={w}
                selected={days.includes(w)}
                onPress={() => {
                  const next = toggleDay(days, w);
                  setDays(next);
                  // All seven ticked on Weekly is Daily: the selection switches.
                  setRepeat(switchedKind(repeat, next));
                }}
              />
            ))}
          </View>
          <View style={styles.linkRow}>
            <Pressable onPress={() => setDays(WEEKDAY_SET)} accessibilityRole="button" accessibilityLabel="Weekdays">
              <Text style={[styles.link, sameDays(days, WEEKDAY_SET) && styles.linkOn]}>Weekdays</Text>
            </Pressable>
            <Pressable onPress={() => setDays(WEEKEND_SET)} accessibilityRole="button" accessibilityLabel="Weekends">
              <Text style={[styles.link, sameDays(days, WEEKEND_SET) && styles.linkOn]}>Weekends</Text>
            </Pressable>
          </View>
        </>
      )}
      {repeat === 'annual' && task.recurrence !== 'annual' && (
        <View style={styles.annual} accessibilityLabel="Every year warning">
          <Text style={styles.annualText}>⚠️ {ANNUAL_WARNING}</Text>
          <Chip label={ANNUAL_CONFIRM} selected={annualOk} onPress={() => setAnnualOk((v) => !v)} a11y={ANNUAL_CONFIRM} />
        </View>
      )}
      {/* Always says exactly what will happen. */}
      <Text style={[popoverStyles.note, resolved === null && popoverStyles.noteWarn]} accessibilityLabel="Repeat summary">
        {summary}
      </Text>
      <View style={styles.footer}>
        <Pressable
          onPress={apply}
          disabled={!resolved || needsAnnualOk}
          style={[styles.applyBtn, (!resolved || needsAnnualOk) && styles.disabled]}
          accessibilityRole="button"
          accessibilityLabel="Apply repeat"
        >
          <Text style={styles.applyText}>Apply</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------- Label
// The label menu of a task (2.27.1, the reference's layout): a search box, each
// label with its colour dot, emoji and name (a tick on the selected one, a pencil
// to edit it), then New label, Edit labels and Remove label, then the ready made
// suggestions. New label (and Enter on a name that matches none, Create "...",
// or a suggestion) opens ONE small form with name, emoji and colour together, so
// a label is never made without its colour being shown. The pencil opens the
// same form for that label.
export function LabelBody({ task, ops, done }: BodyProps) {
  const [labels, setLabels] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [text, setText] = useState('');
  const [form, setForm] = useState<{ mode: 'new'; name: string } | { mode: 'edit'; key: string } | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; warn?: boolean } | null>(null);
  // The 2.27 colours are picked automatically only once every computer runs 2.27.
  const newColorsOk = useNewColorsOk();

  const reload = () => loadLabels().then(setLabels);
  useEffect(() => {
    reload();
    loadTasks().then(setTasks);
  }, []);

  const query = normalizeName(text);
  const shown = useMemo(() => (query ? labels.filter((l) => normalizeName(l.name).includes(query)) : labels), [labels, query]);
  const suggestions = useMemo(
    () => availableSuggestions(labels).filter((s) => !query || normalizeName(s).includes(query)),
    [labels, query],
  );
  const exact = query ? findLabelByName(labels, text) : undefined;

  async function choose(key: string | undefined) {
    await ops.patch({ projectKey: key });
    done();
  }
  const openNew = (name: string) => {
    setForm({ mode: 'new', name: name.trim() });
    setNote(null);
    setConfirmKey(null);
  };

  async function removeLabel(label: Project) {
    const { movedTo, count } = await deleteLabel(label.key);
    setConfirmKey(null);
    setForm(null);
    await reload();
    loadTasks().then(setTasks);
    notifyChanged();
    const what = count === 1 ? '1 task' : `${count} tasks`;
    setNote({
      text: count === 0 ? `Deleted "${label.name}"` : movedTo ? `Deleted "${label.name}"; ${what} moved to the other "${label.name}"` : `Deleted "${label.name}"; ${what} now have no label`,
    });
  }

  if (form?.mode === 'new') {
    return (
      <LabelForm
        mode="new"
        initial={{ name: form.name, colorKey: freeColorKey(labels, newColorsOk) }}
        labels={labels}
        onCancel={() => setForm(null)}
        onSubmit={async (v) => {
          if (findLabelByName(labels, v.name)) return 'A label with that name already exists';
          if (!v.colorKey) return 'Pick a colour first.';
          const clash = colorClash(labels, v.colorKey);
          if (clash) return `"${clash.name}" already has that colour. Pick another.`;
          const result = await createLabel(v.name, v.emoji, v.colorKey, newColorsOk);
          if (!result) return 'Enter a name';
          notifyChanged();
          await choose(result.label.key);
          return null;
        }}
      />
    );
  }

  const editing = form?.mode === 'edit' ? labels.find((l) => l.key === form.key) : undefined;
  if (editing) {
    const n = countTasksWithLabel(tasks, editing.key);
    const other = findLabelByName(labels, editing.name, editing.key);
    return (
      <View style={styles.list}>
        <LabelForm
          key={editing.key}
          mode="edit"
          initial={{ name: editing.name, emoji: editing.emoji, colorKey: editing.colorKey ?? '' }}
          labels={labels}
          editKey={editing.key}
          forName={editing.name}
          onCancel={() => setForm(null)}
          onDelete={() => setConfirmKey(editing.key)}
          onLiveChange={async (c) => {
            if (c.colorKey !== undefined) {
              const problem = await setLabelColor(editing.key, c.colorKey);
              if (problem) return problem;
            }
            if ('emoji' in c) await setLabelEmoji(editing.key, c.emoji);
            await reload();
            notifyChanged();
            return null;
          }}
          onSubmit={async (v) => {
            const problem = await renameLabel(editing.key, v.name);
            if (problem) return problem;
            await reload();
            notifyChanged();
            setForm(null);
            return null;
          }}
        />
        {confirmKey === editing.key && (
          <View style={styles.confirm}>
            <Text style={styles.muted}>
              Delete this label?{' '}
              {n === 0
                ? 'No tasks use it.'
                : other
                  ? `${n === 1 ? '1 task uses it' : `${n} tasks use it`}; they move to the other "${other.name}".`
                  : `${n === 1 ? '1 task uses it' : `${n} tasks use it`}; they will have no label.`}
            </Text>
            <Pressable onPress={() => removeLabel(editing)} accessibilityRole="button" accessibilityLabel="Confirm delete label">
              <Text style={styles.yes}>Yes</Text>
            </Pressable>
            <Pressable onPress={() => setConfirmKey(null)} accessibilityRole="button" accessibilityLabel="Cancel delete label">
              <Text style={styles.no}>No</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.list}>
      <View style={styles.searchWrap}>
        <SearchField
          placeholder="Search or create…"
          value={text}
          onChangeText={setText}
          onSubmitEditing={() => {
            if (exact) choose(exact.key);
            else if (text.trim()) openNew(text);
          }}
          a11y="Search labels"
          autoFocus
        />
      </View>

      {/* The list keeps the menu small (about 320 px, decision 021); the form below gets more room. */}
      <div style={{ maxHeight: 268, overflowY: 'auto' }}>
      {shown.map((l) => {
        const color = labelColor(l.colorKey);
        const on = task.projectKey === l.key;
        return (
          <HoverPressable
            key={l.key}
            onPress={() => choose(l.key)}
            style={styles.labelRow}
            hoverStyle={styles.labelRowHover}
            accessibilityRole="button"
            accessibilityLabel={l.name}
            accessibilityState={{ selected: on }}
            {...({ dataSet: { labelRow: l.key } } as object)}
          >
            {(hovered) => (
              <>
                <View style={[styles.dot, { backgroundColor: color?.edge ?? Colors.border }]} {...({ dataSet: { labelDot: '1' } } as object)} />
                {l.emoji ? <Text style={styles.labelEmoji}>{l.emoji}</Text> : null}
                <Text style={[styles.labelName, on && styles.labelNameOn]} numberOfLines={1}>
                  {l.name}
                </Text>
                <Pressable
                  onPress={() => {
                    setForm({ mode: 'edit', key: l.key });
                    setConfirmKey(null);
                    setNote(null);
                  }}
                  style={[styles.editIcon, !hovered && styles.editIconQuiet]}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit label ${l.name}`}
                >
                  <Ionicons name="pencil" size={12} color={Colors.textSecondary} />
                </Pressable>
                {on && <Ionicons name="checkmark" size={16} color={Colors.accentText} />}
              </>
            )}
          </HoverPressable>
        );
      })}

      {text.trim() && !exact && (
        <Row
          label={`Create "${text.trim()}"…`}
          leading={<Ionicons name="add" size={16} color={Colors.accentText} />}
          onPress={() => openNew(text)}
          a11y={`Create label ${text.trim()}`}
        />
      )}
      <View style={styles.sep} />
      <Row label="New label" leading={<Ionicons name="add" size={16} color={Colors.accentText} />} onPress={() => openNew(text)} a11y="New label" />
      <Row
        label="Edit labels"
        leading={<Ionicons name="pencil" size={14} color={Colors.textSecondary} />}
        onPress={() => {
          done();
          openOverlay({ kind: 'labels' });
        }}
        a11y="Edit labels"
      />
      {task.projectKey && <Row label="Remove label" leading={<Ionicons name="close" size={16} color={Colors.textSecondary} />} onPress={() => choose(undefined)} a11y="Remove label" />}

      {suggestions.length > 0 && (
        <>
          <PopoverHeading>Suggested</PopoverHeading>
          {suggestions.map((s) => (
            <Row key={s} label={s} leading={<Ionicons name="add" size={16} color={Colors.textSecondary} />} onPress={() => openNew(s)} a11y={`Add label ${s}`} />
          ))}
        </>
      )}

      </div>
      {note && <Text style={[popoverStyles.note, note.warn && popoverStyles.noteWarn]} accessibilityLabel="Label note">{note.text}</Text>}
    </View>
  );
}

// ---------------------------------------------------------------- Overflow
// The quiet line on a card or block that stands for every day of a repeating
// series (checkpoint 8.4, decision 023): its edits change the series.
// 3.4.0: the sentence keeps its start (older checks read it); a new date or time is now this day's own choice.
export const SERIES_NOTE = 'Repeating: changes apply to every day. A new date moves this day only; a new time asks.';

export function SeriesNote() {
  return <Text style={styles.seriesNote}>{SERIES_NOTE}</Text>;
}

// The ⋮ menu of a card (2.27.0): Open details first, then what is not on the
// card face: the timer, a pomodoro, duplicate, and skip or delete.
// "Start from 11:00am" rows (Part C, 2.34.1): count the timer from the scheduled start of a time
// that has already begun today (less than 24 hours ago). Nothing when the timer runs or none has begun.
export function StartFromRows({ task, done }: { task: Task; done: () => void }) {
  if (isTimerRunning(task) || task.completed) return null;
  const choices = startFromChoices(task, new Date());
  return (
    <>
      {choices.map((c) => (
        <Row
          key={c.time}
          label={`Start from ${formatTime(c.time)}`}
          sub={`${c.minutesAgo} min ago`}
          leading={<Text>⏱️</Text>}
          onPress={async () => {
            done();
            await toggleTimer(task, c.startedAtMs);
          }}
          a11y={`Start the timer from ${formatTime(c.time)}, ${c.minutesAgo} minutes ago`}
        />
      ))}
    </>
  );
}

// 3.6.0 (task during a break): the ⋮ menu's "Do during a break" lists today's breaks the task fits in;
// choosing one puts the task on today at the break's start (lib/hosting.ts then draws it as a chip in
// the break). A repeating day changes that day only (ops.patchDay).
export const DURING_BREAK = 'Do during a break';
export function canDoDuringBreak(task?: Task): task is Task {
  return !!task && !task.id.startsWith('dump:') && !task.completed && !isMultiTime(task);
}
export function DuringBreakBody({ task, ops, done }: BodyProps) {
  const todayKey = dateKey(new Date());
  const [breaks, setBreaks] = useState<Array<{ id: string; startMin: number; endMin: number; title: string }> | null>(null);
  useEffect(() => {
    let live = true;
    loadTasksRaw().then((all) => {
      if (!live) return;
      setBreaks(breakEntries(dayHostEntries(all, todayKey, todayKey)).flatMap((e) => (e.full.id !== task.id ? [{ id: e.id, startMin: e.startMin, endMin: e.endMin, title: e.task.title }] : [])));
    });
    return () => {
      live = false;
    };
  }, [todayKey, task.id]);
  const len = taskDuration(task);
  const fit = breaks ? breaksFitting(breaks, len, !!task.cutsBelow) : [];
  const short = breaks ? breaks.filter((b) => !fit.includes(b)) : [];
  const span = (b: { startMin: number; endMin: number }) => `${formatTime(toTime(b.startMin))} to ${formatTime(toTime(b.endMin % 1440))}`;
  return (
    <View style={styles.list} {...({ dataSet: { duringBreak: '1' } } as object)}>
      <PopoverHeading>{DURING_BREAK}</PopoverHeading>
      {fit.map((b) => (
        <Row
          key={b.id}
          label={b.title}
          sub={span(b)}
          subRight
          onPress={async () => {
            await ops.patchDay({ dueDate: todayKey, startTime: toTime(b.startMin), ...(task.durationMinutes === undefined ? { durationMinutes: len } : {}) });
            notifyChanged();
            done();
          }}
          a11y={`Do during ${b.title}, ${span(b)}`}
        />
      ))}
      {breaks && breaks.length === 0 && <Text style={styles.hint}>No breaks today. A break is a task with Split on.</Text>}
      {short.length > 0 && (
        <Text style={styles.hint} {...({ dataSet: { duringBreakShort: '1' } } as object)}>
          {LONGER_THAN_BREAK}: {short.map((b) => b.title).join(', ')}
        </Text>
      )}
    </View>
  );
}

export function OverflowBody({
  task,
  ops,
  done,
  armed,
  projected,
  onOpen,
}: Pick<BodyProps, 'ops' | 'done'> & {
  task?: Task;
  // Opened by Ctrl+Delete: start at the "Delete? Yes / No" question.
  armed?: boolean;
  projected?: boolean;
  // Opens the details modal (a card passes its own, which converts a phone item).
  onOpen?: () => void;
}) {
  const [confirming, setConfirming] = useState(!!armed);
  const [moving, setMoving] = useState(false);
  const [duringBreak, setDuringBreak] = useState(false);
  const feats = useFeatures();
  const breakRow = canDoDuringBreak(task) ? (
    <Row label={DURING_BREAK} leading={<Text>☕</Text>} onPress={() => setDuringBreak(true)} a11y={DURING_BREAK} />
  ) : null;
  const series = ops.series;
  const openRow =
    task && (onOpen || !task.id.startsWith('dump:')) ? (
      <Row
        label="Open details"
        leading={<Text>📝</Text>}
        onPress={() => {
          done();
          if (onOpen) onOpen();
          else openDetail(task.id);
        }}
        a11y="Open details"
      />
    ) : null;
  const running = !!task && isTimerRunning(task);
  const timerRows =
    task && !task.id.startsWith('dump:') ? (
      <>
        <Row
          label={running ? 'Stop the timer' : 'Start the timer'}
          leading={<Text>⏱️</Text>}
          onPress={async () => {
            done();
            await toggleTimer(task);
          }}
          a11y={running ? 'Stop the timer' : 'Start the timer'}
        />
        <StartFromRows task={task} done={done} />
        {feats.pomodoro && !projected && !task.completed && (
          <Row
            label="Start a pomodoro"
            leading={<Text>🍅</Text>}
            onPress={() => {
              done();
              startFocus(task);
            }}
            a11y="Start a pomodoro"
          />
        )}
      </>
    ) : null;
  // Must do (2.27.0): the same switch as in the details (on = priority high, off = none).
  const mustRow =
    task && (onOpen || !task.id.startsWith('dump:')) ? (
      <Row
        label={MUST_DO_MARK}
        tip={MUST_DO_TIP}
        selected={isMustDo(task)}
        onPress={async () => {
          await ops.patch(mustDoPatch(!isMustDo(task)));
          notifyChanged();
          done();
        }}
        a11y={isMustDo(task) ? `${MUST_DO_TIP}, on: turn it off` : `${MUST_DO_TIP}, off: turn it on`}
      />
    ) : null;
  // A repeating task (stored or projected): skip one day, or delete the series.
  if (series) {
    const canSkip = !!task?.dueDate && !task.completed;
    // 3.2.0: the day picker opens inside this popover (only one popover is open at a time).
    if (moving && task) return <MoveToDayBody task={task} ops={ops} done={done} />;
    if (duringBreak && task) return <DuringBreakBody task={task} ops={ops} done={done} />;
    return (
      <View style={styles.list}>
        {confirming ? (
          <View style={styles.confirm}>
            <Text style={styles.muted}>Delete this repeating task?</Text>
            <Pressable
              onPress={async () => {
                await series.deleteSeries();
                done();
              }}
              accessibilityRole="button"
              accessibilityLabel="Confirm delete repeating task"
            >
              <Text style={styles.yes}>Yes</Text>
            </Pressable>
            <Pressable onPress={() => setConfirming(false)} accessibilityRole="button" accessibilityLabel="Cancel delete repeating task">
              <Text style={styles.no}>No</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {openRow}
            {timerRows}
            {mustRow}
            {breakRow}
            {canSkip && (
              <Row label={MOVE_THIS_DAY} sub="Only this day" onPress={() => setMoving(true)} a11y={MOVE_THIS_DAY} />
            )}
            {canSkip && (
              <Row
                label="Skip this day"
                sub="Hides this day only"
                onPress={async () => {
                  await series.skipDay();
                  done();
                }}
                a11y="Skip this day"
              />
            )}
            <Row label="Delete repeating task" danger onPress={() => setConfirming(true)} a11y="Delete repeating task" />
          </>
        )}
      </View>
    );
  }
  if (duringBreak && task) return <DuringBreakBody task={task} ops={ops} done={done} />;
  return (
    <View style={styles.list}>
      {confirming ? (
        <View style={styles.confirm}>
          <Text style={styles.muted}>Delete?</Text>
          <Pressable
            onPress={async () => {
              await ops.remove();
              done();
            }}
            accessibilityRole="button"
            accessibilityLabel="Confirm delete task"
          >
            <Text style={styles.yes}>Yes</Text>
          </Pressable>
          <Pressable onPress={() => setConfirming(false)} accessibilityRole="button" accessibilityLabel="Cancel delete task">
            <Text style={styles.no}>No</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {openRow}
          {timerRows}
          {mustRow}
          {breakRow}
          {task?.id && !task.id.startsWith('dump:') && (
            <>
              <Row
                label="Duplicate task"
                leading={<Text>📄</Text>}
                onPress={async () => {
                  await duplicateTaskById(task.id);
                  notifyChanged();
                  done();
                }}
                a11y="Duplicate task"
              />
            </>
          )}
          <Row label="Delete task" danger onPress={() => setConfirming(true)} a11y="Delete task" />
        </>
      )}
    </View>
  );
}

// ---------------------------------------------------------------- shared bits
function Chip({ label, selected, onPress, a11y }: { label: string; selected: boolean; onPress: () => void; a11y?: string }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected && styles.chipOn]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={a11y ?? label}
      // A chip is a toggle: expose which one is on.
      {...({ 'aria-pressed': selected } as object)}
    >
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: 6 },
  annual: { paddingHorizontal: 12, paddingVertical: 6, gap: 6 },
  annualText: { fontSize: 12, color: Colors.textPrimary },
  seriesNote: { paddingHorizontal: 12, paddingVertical: 4, fontSize: 12, color: Colors.textSecondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 12, paddingVertical: 6 },
  chip: { paddingHorizontal: 10, height: 30, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, justifyContent: 'center', backgroundColor: Colors.background },
  chipOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  chipText: { fontSize: 13, color: Colors.textPrimary },
  chipTextOn: { color: Colors.onAccent, fontWeight: '600' },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 4 },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 12, paddingVertical: 4 },
  rowText: { fontSize: 14, color: Colors.textPrimary },
  hint: { fontSize: 12, color: Colors.textSecondary, paddingHorizontal: 12, paddingBottom: 6 },
  muted: { fontSize: 12, color: Colors.textSecondary, flexShrink: 1 },
  linkRow: { flexDirection: 'row', gap: 14, paddingHorizontal: 12, paddingVertical: 4 },
  link: { fontSize: 13, fontWeight: '600', color: Colors.accentText },
  linkOn: { textDecorationLine: 'underline' },
  danger: { fontSize: 13, fontWeight: '600', color: Colors.danger },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 12, paddingTop: 4 },
  applyBtn: { paddingHorizontal: 16, height: 32, borderRadius: 10, backgroundColor: Colors.accent, justifyContent: 'center' },
  applyText: { fontSize: 13, fontWeight: '600', color: Colors.onAccent },
  disabled: { opacity: 0.4 },
  searchWrap: { padding: 10, paddingBottom: 4 },
  search: {
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    color: Colors.textPrimary,
    fontSize: 14,
    outlineColor: Colors.accent,
  },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, marginHorizontal: 4, borderRadius: 6, minHeight: 34 },
  labelRowHover: { backgroundColor: Colors.hover },
  dot: { width: 10, height: 10, borderRadius: 5 },
  labelName: { flex: 1, fontSize: 14, color: Colors.textPrimary },
  labelEmoji: { fontSize: 14 },
  labelNameOn: { fontWeight: '700', color: Colors.accentText },
  editIcon: { padding: 4, borderRadius: 6 },
  editIconQuiet: { opacity: 0.35 },
  sep: { height: 1, backgroundColor: Colors.border, marginVertical: 6, marginHorizontal: 8 },
  editBox: { padding: 10, gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: Colors.border },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  swatch: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  swatchOn: { borderColor: Colors.textPrimary },
  swatchFill: { width: 14, height: 14, borderRadius: 7 },
  confirm: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  yes: { fontSize: 13, fontWeight: '700', color: Colors.danger },
  no: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
});
