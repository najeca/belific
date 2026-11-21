import React, { useEffect, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { radius, type ColorTokens } from '../../lib/tokens';
import { formatTime } from '../../lib/data';
import { formatDayTitle } from '../../lib/kanban';
import { toMinutes, toTime } from '../../lib/timebox';
import { formatDuration } from '../../lib/duration';
import { repeatLine } from '../../lib/repeat';
import { labelColor } from '../../lib/labelColors';
import type { Project, Task, TaskList } from '../../lib/types';
import { useStyles, useTheme } from './theme';
import { useReducedMotion, useSettled } from './touch';
import { inter, type } from './type';
import { LabelDot } from './ui';
import { DELETE_ASK, DELETE_CHOICES, SKIP_TODAY_NOTE, cardActions, deleteAsks, skipNote, type CardActionId, type CardDeleteId } from '../../lib/cardActions';

// Phase 5 of PLAN_phone_parity (item 3): what a press and hold on a task opens. The screen dims and a card in the middle
// shows the task larger (label, title, day and time, length, list, repeat), with large buttons under it: Done, Edit,
// Skip today (repeating tasks, with a plain line saying what it does), Move, Delete and More. Delete is plain dark text
// with its word, never red; on a repeating task it asks "Only today, or every day?" on this same card. A tap on the dim
// area closes it. Text 14 px or more, buttons 48 pt high.
// D1 (3.66.0): which buttons, their words and order are lib/cardActions.ts, shared with the desktop's right click menu.
export { SKIP_TODAY_NOTE, DELETE_ASK };

export interface HoldActions {
  completed: boolean;
  done: () => void;
  edit: () => void;
  skip: () => void;
  deleteOne: () => void;
  deleteSeries: () => void;
  // "Move to" and "More" open as the next sheet once this card has closed.
  move: () => void;
  more: () => void;
}

const make = (c: ColorTokens) => ({
  scrim: { flex: 1, backgroundColor: c.scrim, justifyContent: 'center' as const, paddingHorizontal: 20 },
  card: { backgroundColor: c.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: c.border, borderTopWidth: 8, borderTopColor: c.accent, padding: 18, gap: 14 },
  labelRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  labelText: { ...inter(600), fontSize: 14, color: c.textSecondary },
  title: { ...inter(700), fontSize: 20, lineHeight: 26, color: c.textPrimary },
  meta: { ...inter(500), fontSize: 15, lineHeight: 21, color: c.textSecondary },
  grid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 10 },
  btn: { minHeight: 48, flexBasis: '47%' as const, flexGrow: 1, borderRadius: radius.md, borderWidth: 1, borderColor: c.borderStrong, alignItems: 'center' as const, justifyContent: 'center' as const, paddingHorizontal: 10 },
  btnText: { ...inter(600), fontSize: 16, color: c.textPrimary },
  primary: { backgroundColor: c.accent, borderColor: c.accent },
  primaryText: { color: c.onAccent },
  note: { ...inter(400), fontSize: 14, lineHeight: 20, color: c.textSecondary },
  cancel: { minHeight: 48, alignItems: 'center' as const, justifyContent: 'center' as const },
  cancelText: { ...inter(600), fontSize: 16, color: c.textSecondary },
});

export function HoldCard({ task, projected, labels, lists, todayKey, actions, onClose }: { task: Task | null; projected: boolean; labels: Project[]; lists: TaskList[]; todayKey: string; actions: HoldActions; onClose: () => void }) {
  const s = useStyles(make);
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const visible = !!task;
  // The finger that held the row lifts over this card: that lift is not a choice.
  const settled = useSettled(visible);
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    setAsking(false);
  }, [task]);
  if (!task) return null;

  const label = task.projectKey ? labels.find((l) => l.key === task.projectKey && !l.deletedAt) : undefined;
  const list = task.listKey ? lists.find((l) => l.key === task.listKey && !l.deletedAt) : undefined;
  const start = task.startTime ? toMinutes(task.startTime) : null;
  const end = start !== null && task.durationMinutes ? toTime(Math.min(start + task.durationMinutes, 24 * 60 - 1)) : null;
  const when = [task.dueDate ? formatDayTitle(task.dueDate, todayKey) : 'No day', task.startTime ? (end ? `${formatTime(task.startTime)} to ${formatTime(end)}` : formatTime(task.startTime)) : ''].filter(Boolean).join(', ');
  const length = task.durationMinutes ? formatDuration(task.durationMinutes) : undefined;
  const repeats = task.recurrence ? repeatLine(task, todayKey) : undefined;
  const repeating = !!task.recurrence;
  const onAction: Record<Exclude<CardActionId, 'delete'>, () => void> = { done: actions.done, edit: actions.edit, skip: actions.skip, move: actions.move, more: actions.more };
  const onDelete: Record<CardDeleteId, () => void> = { 'delete-today': actions.deleteOne, 'delete-all': actions.deleteSeries };
  // Each choice closes the card first, then acts (the same order as the menu it replaces).
  const choose = (run: () => void) => () => {
    if (!settled()) return;
    onClose();
    run();
  };

  const Btn = ({ text, onPress, primary, id }: { text: string; onPress: () => void; primary?: boolean; id: string }) => (
    <Pressable style={({ pressed }) => [s.btn, primary && s.primary, pressed && { opacity: 0.85 }]} onPress={onPress} accessibilityRole="button" accessibilityLabel={text} {...({ dataSet: { holdBtn: id } } as object)}>
      <Text style={[s.btnText, primary && s.primaryText]}>{text}</Text>
    </Pressable>
  );

  return (
    <Modal visible transparent animationType={reduced ? 'none' : 'fade'} onRequestClose={onClose}>
      <Pressable style={s.scrim} onPress={() => settled() && onClose()} accessibilityLabel="Close" {...({ dataSet: { menuScrim: '1' } } as object)}>
        <Pressable style={s.card} onPress={() => {}} accessibilityViewIsModal {...({ dataSet: { holdCard: task.title } } as object)}>
          {label ? (
            <View style={s.labelRow}>
              <LabelDot color={labelColor(label.colorKey)?.edge ?? c.textTertiary} size={12} />
              <Text style={s.labelText}>{`${label.emoji ? `${label.emoji} ` : ''}${label.name}`}</Text>
            </View>
          ) : null}
          <Text style={s.title} accessibilityRole="header">{task.title}</Text>
          <View style={{ gap: 2 }}>
            <Text style={s.meta}>{when}</Text>
            {length ? <Text style={s.meta}>{length}</Text> : null}
            {repeats ? <Text style={s.meta}>{repeats}</Text> : null}
            <Text style={s.meta}>{list ? `${list.emoji ? `${list.emoji} ` : ''}${list.name}` : 'Brain Dump'}</Text>
          </View>
          {asking ? (
            <View style={{ gap: 10 }} {...({ dataSet: { holdAsk: '1' } } as object)}>
              <Text style={[s.meta, { color: c.textPrimary }]}>{DELETE_ASK}</Text>
              <View style={s.grid}>
                {DELETE_CHOICES.map((b) => (
                  <Btn key={b.id} id={b.id} text={b.label} onPress={choose(onDelete[b.id])} />
                ))}
              </View>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              <View style={s.grid}>
                {cardActions(task, actions.completed).map((b) => (
                  <Btn key={b.id} id={b.id} primary={b.primary} text={b.label} onPress={b.id === 'delete' ? () => (deleteAsks(task) ? settled() && setAsking(true) : choose(actions.deleteOne)()) : choose(onAction[b.id])} />
                ))}
              </View>
              {repeating ? <Text style={s.note} {...({ dataSet: { holdSkipNote: '1' } } as object)}>{skipNote()}</Text> : null}
            </View>
          )}
          <Pressable style={s.cancel} onPress={() => settled() && onClose()} accessibilityRole="button" accessibilityLabel="Cancel">
            <Text style={s.cancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
