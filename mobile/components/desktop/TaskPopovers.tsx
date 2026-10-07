import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { addDays, clampToToday, dateKey, formatShortDate, isDateKey, parseDateKey } from '../../lib/kanban';
import { DURATION_PRESETS, parseDuration, presetLabel } from '../../lib/duration';
import { LABEL_COLORS, labelColor } from '../../lib/labelColors';
import { countTasksWithLabel, createLabel, deleteLabel, loadLabels, renameLabel, setLabelColor } from '../../lib/labels';
import { availableSuggestions, findLabelByName, normalizeName } from '../../lib/labelRules';
import { REMINDER_OPTIONS, NO_START_NOTE, optionEnabled, reminderState } from '../../lib/reminder';
import {
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
import { loadTasks } from '../../lib/storage';
import type { EventPriority, Project, Task, WeekDay } from '../../lib/types';
import HoverPressable from './HoverPressable';
import { PopoverHeading, Row, popoverStyles } from './Popover';
import { DESKTOP_FONT_FAMILY } from './desktopFont';
import type { TaskOps } from './taskOps';

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

// ---------------------------------------------------------------- Priority
const PRIORITIES: Array<{ key: EventPriority | undefined; label: string; sub: string }> = [
  { key: 'high', label: 'High', sub: 'Shows a flag' },
  { key: undefined, label: 'Normal', sub: 'The default' },
  { key: 'low', label: 'Low', sub: 'Shown muted' },
];

export function PriorityBody({ task, ops, done }: BodyProps) {
  return (
    <View style={styles.list}>
      <PopoverHeading>Priority</PopoverHeading>
      {PRIORITIES.map((p) => (
        <Row
          key={p.label}
          label={p.label}
          sub={p.sub}
          selected={task.priority === p.key}
          onPress={() => {
            ops.patch({ priority: p.key });
            done();
          }}
        />
      ))}
      {task.priority !== undefined && (
        <Row
          label="Clear priority"
          onPress={() => {
            ops.patch({ priority: undefined });
            done();
          }}
        />
      )}
    </View>
  );
}

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
          placeholder="45m, 1h 30m, 130..."
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

// ---------------------------------------------------------------- Reminder
export function ReminderBody({ task, ops, done }: BodyProps) {
  const hasStart = !!task.dueDate && !!task.startTime;
  const state = reminderState(task.reminderMinutes);
  return (
    <View style={styles.list}>
      <PopoverHeading>Reminder</PopoverHeading>
      <Row
        label="Default"
        sub={hasStart ? 'At the start time' : 'Your daily reminder'}
        selected={state === 'default'}
        onPress={() => {
          ops.patch({ reminderMinutes: undefined });
          done();
        }}
      />
      {REMINDER_OPTIONS.map((o) => (
        <Row
          key={o.key}
          label={o.label}
          selected={state !== 'default' && task.reminderMinutes === o.value}
          disabled={!optionEnabled(o, hasStart)}
          onPress={() => {
            ops.patch({ reminderMinutes: o.value });
            done();
          }}
        />
      ))}
      {!hasStart && <Text style={popoverStyles.note}>{NO_START_NOTE}</Text>}
    </View>
  );
}

// ---------------------------------------------------------------- Move to day
export function MoveToDayBody({ task, ops, done }: BodyProps) {
  const todayKey = dateKey(new Date());
  const tomorrowKey = dateKey(addDays(parseDateKey(todayKey), 1));
  const move = (requested: string | undefined) => {
    // Nothing earlier than today can be chosen.
    const day = requested ? clampToToday(requested, todayKey) : undefined;
    ops.patch({ dueDate: day, startTime: day ? task.startTime : undefined });
    done();
  };
  return (
    <View style={styles.list}>
      <PopoverHeading>Move to day</PopoverHeading>
      <Row label="Today" sub={formatShortDate(todayKey)} selected={task.dueDate === todayKey} onPress={() => move(todayKey)} />
      <Row label="Tomorrow" sub={formatShortDate(tomorrowKey)} selected={task.dueDate === tomorrowKey} onPress={() => move(tomorrowKey)} />
      <View style={styles.dateRow}>
        <Text style={styles.rowText}>A date</Text>
        <input
          type="date"
          min={todayKey}
          value=""
          onChange={(e) => {
            const v = e.target.value;
            if (isDateKey(v) && v >= todayKey) move(v);
          }}
          style={domInputStyle}
          aria-label="Move to date"
        />
      </View>
      {task.dueDate && <Row label="Remove day" sub="Back to the Brain Dump list" onPress={() => move(undefined)} />}
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
  const resolved = resolveRepeat(repeat, days, day, monthDay);
  const summary = repeatSummary(repeat, days, day, monthDay);

  function choose(kind: RepeatKind) {
    setRepeat(kind);
    // A day based repeat with nothing chosen starts from the weekday of the Day.
    if ((kind === 'weekly' || kind === 'biweekly') && (days.length === 0 || (kind === 'weekly' && allSeven(days))) && day) setDays([weekdayOf(day)]);
  }

  function apply() {
    if (!resolved) return;
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
      {/* Always says exactly what will happen. */}
      <Text style={[popoverStyles.note, resolved === null && popoverStyles.noteWarn]} accessibilityLabel="Repeat summary">
        {summary}
      </Text>
      <View style={styles.footer}>
        <Pressable
          onPress={apply}
          disabled={!resolved}
          style={[styles.applyBtn, !resolved && styles.disabled]}
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
// Search, the existing labels (colour dot, tick on the selected one), Create
// "text" when it matches none, then the ready made suggestions not yet used.
// A hover edit icon on a row switches it to rename, colours and delete.
export function LabelBody({ task, ops, done }: BodyProps) {
  const [labels, setLabels] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [text, setText] = useState('');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; warn?: boolean } | null>(null);

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

  // Creates a label (typed or suggested) and selects it; a name that exists
  // already selects the existing label instead of making a duplicate.
  async function createNamed(name: string) {
    const result = await createLabel(name);
    if (!result) return;
    await choose(result.label.key);
  }

  async function submitRename(key: string) {
    const problem = await renameLabel(key, renameText);
    if (problem) {
      setNote({ text: problem, warn: true });
      return;
    }
    setEditingKey(null);
    setNote(null);
    await reload();
  }

  async function removeLabel(label: Project) {
    const { movedTo, count } = await deleteLabel(label.key);
    setConfirmKey(null);
    setEditingKey(null);
    await reload();
    loadTasks().then(setTasks);
    const what = count === 1 ? '1 task' : `${count} tasks`;
    setNote({
      text: count === 0 ? `Deleted "${label.name}"` : movedTo ? `Deleted "${label.name}"; ${what} moved to the other "${label.name}"` : `Deleted "${label.name}"; ${what} now have no label`,
    });
  }

  return (
    <View style={styles.list}>
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.search}
          placeholder="Search or create a label"
          placeholderTextColor={Colors.textSecondary}
          value={text}
          onChangeText={setText}
          onSubmitEditing={() => {
            if (exact) choose(exact.key);
            else if (text.trim()) createNamed(text);
          }}
          accessibilityLabel="Search labels"
          autoFocus
        />
      </View>

      {task.projectKey && !query && <Row label="No label" onPress={() => choose(undefined)} />}

      {shown.map((l) => {
        const color = labelColor(l.colorKey);
        if (editingKey === l.key) {
          const n = countTasksWithLabel(tasks, l.key);
          const other = findLabelByName(labels, l.name, l.key);
          return (
            <View key={l.key} style={styles.editBox}>
              <TextInput
                style={styles.search}
                value={renameText}
                onChangeText={setRenameText}
                onSubmitEditing={() => submitRename(l.key)}
                // Keep the field open after Enter so a rejected name can be fixed.
                blurOnSubmit={false}
                accessibilityLabel={`Rename ${l.name}`}
                autoFocus
              />
              <View style={styles.swatches}>
                {LABEL_COLORS.map((c) => {
                  const on = l.colorKey === c.key;
                  return (
                    <Pressable
                      key={c.key}
                      onPress={async () => {
                        setLabels((prev) => prev.map((p) => (p.key === l.key ? { ...p, colorKey: c.key } : p)));
                        await setLabelColor(l.key, c.key);
                      }}
                      style={[styles.swatch, on && styles.swatchOn]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={`${c.name} colour for ${l.name}`}
                    >
                      <View style={[styles.swatchFill, { backgroundColor: c.edge }]} />
                    </Pressable>
                  );
                })}
              </View>
              {confirmKey === l.key ? (
                <View style={styles.confirm}>
                  <Text style={styles.muted}>
                    Delete this label?{' '}
                    {n === 0
                      ? 'No tasks use it.'
                      : other
                        ? `${n === 1 ? '1 task uses it' : `${n} tasks use it`}; they move to the other "${other.name}".`
                        : `${n === 1 ? '1 task uses it' : `${n} tasks use it`}; they will have no label.`}
                  </Text>
                  <Pressable onPress={() => removeLabel(l)} accessibilityRole="button" accessibilityLabel="Confirm delete label">
                    <Text style={styles.yes}>Yes</Text>
                  </Pressable>
                  <Pressable onPress={() => setConfirmKey(null)} accessibilityRole="button" accessibilityLabel="Cancel delete label">
                    <Text style={styles.no}>No</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.linkRow}>
                  <Pressable onPress={() => submitRename(l.key)} accessibilityRole="button" accessibilityLabel={`Save name of ${l.name}`}>
                    <Text style={styles.link}>Save name</Text>
                  </Pressable>
                  <Pressable onPress={() => setConfirmKey(l.key)} accessibilityRole="button" accessibilityLabel={`Delete label ${l.name}`}>
                    <Text style={styles.danger}>Delete label</Text>
                  </Pressable>
                  <Pressable onPress={() => setEditingKey(null)} accessibilityRole="button" accessibilityLabel="Close label editing">
                    <Text style={styles.link}>Done</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        }
        return (
          <HoverPressable
            key={l.key}
            onPress={() => choose(l.key)}
            style={styles.labelRow}
            hoverStyle={styles.labelRowHover}
            accessibilityRole="button"
            accessibilityLabel={l.name}
            accessibilityState={{ selected: task.projectKey === l.key }}
          >
            {(hovered) => (
              <>
                <View style={[styles.dot, { backgroundColor: color?.edge ?? Colors.border }]} />
                <Text style={[styles.labelName, task.projectKey === l.key && styles.labelNameOn]} numberOfLines={1}>
                  {l.name}
                </Text>
                {hovered && (
                  <Pressable
                    onPress={() => {
                      setEditingKey(l.key);
                      setRenameText(l.name);
                      setConfirmKey(null);
                      setNote(null);
                    }}
                    style={styles.editIcon}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit label ${l.name}`}
                  >
                    <Ionicons name="pencil" size={13} color={Colors.textSecondary} />
                  </Pressable>
                )}
                {task.projectKey === l.key && <Ionicons name="checkmark" size={16} color={Colors.accentText} />}
              </>
            )}
          </HoverPressable>
        );
      })}

      {text.trim() && !exact && (
        <Row
          label={`Create "${text.trim()}"`}
          leading={<Ionicons name="add" size={16} color={Colors.accentText} />}
          onPress={() => createNamed(text)}
          a11y={`Create label ${text.trim()}`}
        />
      )}

      {suggestions.length > 0 && (
        <>
          <PopoverHeading>Suggested</PopoverHeading>
          {suggestions.map((s) => (
            <Row key={s} label={s} leading={<Ionicons name="add" size={16} color={Colors.textSecondary} />} onPress={() => createNamed(s)} a11y={`Add label ${s}`} />
          ))}
        </>
      )}

      {note && <Text style={[popoverStyles.note, note.warn && popoverStyles.noteWarn]} accessibilityLabel="Label note">{note.text}</Text>}
    </View>
  );
}

// ---------------------------------------------------------------- Overflow
export function OverflowBody({ ops, done }: Pick<BodyProps, 'ops' | 'done'>) {
  const [confirming, setConfirming] = useState(false);
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
        <Row label="Delete task" danger onPress={() => setConfirming(true)} a11y="Delete task" />
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 12, paddingVertical: 6 },
  chip: { paddingHorizontal: 10, height: 30, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, justifyContent: 'center', backgroundColor: Colors.background },
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
  applyBtn: { paddingHorizontal: 16, height: 32, borderRadius: 12, backgroundColor: Colors.accent, justifyContent: 'center' },
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
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, minHeight: 34 },
  labelRowHover: { backgroundColor: Colors.background },
  dot: { width: 10, height: 10, borderRadius: 5 },
  labelName: { flex: 1, fontSize: 14, color: Colors.textPrimary },
  labelNameOn: { fontWeight: '700', color: Colors.accentText },
  editIcon: { padding: 4 },
  editBox: { padding: 10, gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: Colors.border },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  swatch: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  swatchOn: { borderColor: Colors.textPrimary },
  swatchFill: { width: 14, height: 14, borderRadius: 7 },
  confirm: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  yes: { fontSize: 13, fontWeight: '700', color: Colors.danger },
  no: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
});
