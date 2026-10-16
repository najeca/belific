import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { formatClock } from '../../lib/duration';
import { formatTaskTime } from '../../lib/taskTotals';
import { reminderLabel } from '../../lib/reminder';
import { shortRepeat } from '../../lib/repeat';
import { dateKey } from '../../lib/kanban';
import type { Project, Task } from '../../lib/types';
import Popover, { PopoverHeading, Row, closePopover, togglePopover } from './Popover';
import { ActualBody, DurationBody, LabelBody, OverflowBody, PriorityBody, ReminderBody, RepeatBody, SeriesNote } from './TaskPopovers';
import StreakLine from './StreakLine';
import { useFeatures } from './featureStore';
import { opsForProjected, opsForTask, type TaskOps } from './taskOps';

// Clicking a placed task on the Timebox opens this small popover anchored to
// the block (checkpoint 8.2, never a modal). A menu of the same controls a
// board card has; each opens the same dropdown contents inside this popover,
// with a back arrow. Events keep their own editor.
// `scope` tells two places that draw the same task apart (the Timebox pane, which
// has none, and the Calendar view, build plan phase 3): each has its own popover
// id and finds its own block.
export const blockPopoverId = (taskId: string, scope = '') => `block:${scope}${taskId}`;

export function blockAnchor(taskId: string, scope = ''): () => HTMLElement | null {
  const id = taskId.replace(/"/g, '');
  return () =>
    scope
      ? document.querySelector<HTMLElement>(`[data-cal-block="${scope}${id}"]`)
      : document.querySelector<HTMLElement>(`[data-block-id="${id}"]`);
}

export function toggleBlockPopover(taskId: string, scope = '') {
  togglePopover(blockPopoverId(taskId, scope), blockAnchor(taskId, scope));
}

type View_ = 'root' | 'label' | 'priority' | 'duration' | 'actual' | 'reminder' | 'repeat' | 'more';

export default function TaskBlockPopover({
  task,
  label,
  onChanged,
  projected,
  scope,
}: {
  task: Task;
  label?: Project;
  onChanged: () => void;
  // A projected occurrence of a repeating series (not stored yet).
  projected?: boolean;
  scope?: string;
}) {
  return (
    <Popover id={blockPopoverId(task.id, scope)} anchor={blockAnchor(task.id, scope)} width={280}>
      <Inner task={task} label={label} onChanged={onChanged} projected={projected} />
    </Popover>
  );
}

function Inner({ task, label, onChanged, projected }: { task: Task; label?: Project; onChanged: () => void; projected?: boolean }) {
  const feats = useFeatures();
  const [view, setView] = useState<View_>('root');
  const [title, setTitle] = useState(task.title);
  const base = projected ? opsForProjected(task) : opsForTask(task);
  const run = <T,>(fn: () => Promise<T>) => fn().then((r) => (onChanged(), r));
  const ops: TaskOps = {
    patch: (f) => run(() => base.patch(f)),
    setCompleted: (d) => run(() => base.setCompleted(d)),
    toggleSubtask: (id) => run(() => base.toggleSubtask(id)),
    remove: () => run(() => base.remove()),
    series: base.series
      ? {
          projected: base.series.projected,
          skipDay: () => run(() => base.series!.skipDay()),
          deleteSeries: () => run(() => base.series!.deleteSeries()),
        }
      : undefined,
  };
  const back = () => setView('root');
  const todayKey = dateKey(new Date());

  function saveTitle() {
    const t = title.trim();
    if (t && t !== task.title) ops.patch({ title: t });
  }

  if (view !== 'root') {
    const heading = { label: 'Label', priority: 'Priority', duration: 'Duration', actual: 'Actual time', reminder: 'Reminder', repeat: 'Repeat', more: 'More' }[view];
    return (
      <View>
        <Pressable onPress={back} style={styles.back} accessibilityRole="button" accessibilityLabel="Back to task options">
          <Ionicons name="chevron-back" size={16} color={Colors.textSecondary} />
          <Text style={styles.backText}>{heading}</Text>
        </Pressable>
        {view === 'label' && <LabelBody task={task} ops={ops} done={back} />}
        {view === 'priority' && <PriorityBody task={task} ops={ops} done={back} />}
        {view === 'duration' && <DurationBody task={task} ops={ops} done={back} />}
        {view === 'actual' && <ActualBody task={task} ops={ops} done={back} />}
        {view === 'reminder' && <ReminderBody task={task} ops={ops} done={back} />}
        {view === 'repeat' && <RepeatBody task={task} ops={ops} done={back} />}
        {view === 'more' && <OverflowBody task={task} ops={ops} done={() => closePopover()} />}
      </View>
    );
  }

  const placed = !!task.dueDate && !!task.startTime;
  return (
    <View>
      <View style={styles.titleRow}>
        <Pressable
          onPress={() => ops.setCompleted(!task.completed)}
          style={styles.tick}
          accessibilityRole="button"
          accessibilityLabel={task.completed ? `Mark ${task.title} incomplete` : `Mark ${task.title} complete`}
        >
          <Ionicons name={task.completed ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={task.completed ? Colors.accent : Colors.textSecondary} />
        </Pressable>
        <TextInput
          style={styles.titleInput}
          value={title}
          onChangeText={setTitle}
          onSubmitEditing={saveTitle}
          onBlur={saveTitle}
          onKeyPress={(e) => {
            if ((e.nativeEvent as { key?: string }).key === 'Escape') setTitle(task.title);
          }}
          accessibilityLabel={`Rename ${task.title}`}
        />
      </View>
      <PopoverHeading>Task</PopoverHeading>
      {projected && <SeriesNote />}
      <StreakLine task={task} inset />
      <Row
        label="Duration"
        sub={placed ? `${formatClock(task.durationMinutes)}, starts ${task.startTime}` : formatClock(task.durationMinutes)}
        trailing={<Ionicons name="chevron-forward" size={14} color={Colors.textSecondary} />}
        onPress={() => setView('duration')}
        a11y="Duration"
      />
      {!projected && (
        <Row
          label="Actual time"
          sub={formatTaskTime(task, Date.now())}
          trailing={<Ionicons name="chevron-forward" size={14} color={Colors.textSecondary} />}
          onPress={() => setView('actual')}
          a11y="Actual time"
        />
      )}
      <Row
        label="Label"
        sub={label ? `${label.emoji ? `${label.emoji} ` : ''}${label.name}` : 'None'}
        trailing={<Ionicons name="chevron-forward" size={14} color={Colors.textSecondary} />}
        onPress={() => setView('label')}
        a11y="Label"
      />
      {feats.priority && <Row
        label="Priority"
        sub={task.priority ?? 'normal'}
        trailing={<Ionicons name="chevron-forward" size={14} color={Colors.textSecondary} />}
        onPress={() => setView('priority')}
        a11y="Priority"
      />}
      {feats.dueDates && <Row
        label="Reminder"
        sub={reminderLabel(task.reminderMinutes)}
        trailing={<Ionicons name="chevron-forward" size={14} color={Colors.textSecondary} />}
        onPress={() => setView('reminder')}
        a11y="Reminder"
      />}
      <Row
        label="Repeat"
        sub={task.recurrence ? (shortRepeat(task, todayKey) ?? 'Repeats') : 'Does not repeat'}
        trailing={<Ionicons name="chevron-forward" size={14} color={Colors.textSecondary} />}
        onPress={() => setView('repeat')}
        a11y="Repeat"
      />
      {placed && (
        <Row
          label="Remove time"
          sub="Off the Timebox, keeps its day"
          onPress={async () => {
            await ops.patch({ startTime: undefined });
            closePopover(true);
          }}
          a11y="Remove time"
        />
      )}
      <Row label="More" trailing={<Ionicons name="ellipsis-horizontal" size={14} color={Colors.textSecondary} />} onPress={() => setView('more')} a11y="More actions" />
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, paddingBottom: 2 },
  tick: { padding: 2 },
  titleInput: {
    flex: 1,
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
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, minHeight: 34 },
  backText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1 },
});
