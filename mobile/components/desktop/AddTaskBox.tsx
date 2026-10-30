import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { Colors } from '../../lib/theme';
import { loadLabels } from '../../lib/labels';
import { labelColor } from '../../lib/labelColors';
import type { Project, Task } from '../../lib/types';
import Popover, { closePopover, togglePopover, useIsOpen, usePopoverAnchor } from './Popover';
import { LabelBody } from './TaskPopovers';
import DurationSelect from './DurationSelect';
import { DESKTOP_FONT_FAMILY } from './desktopFont';
import type { TaskOps } from './taskOps';
import { INPUT_MIN, NEEDS_TITLE, TYPING_MIN, addRoom } from '../../lib/addBox';
import { Ionicons } from '@expo/vector-icons';

// The "Add a task" box (2.27.0), the same on a day column and in the left list:
// the title, an optional time (on a day only, since a time belongs to a Day), an
// optional estimate (2.27.1, the shared time drop-down) and the Label button,
// which is always there and never pushed out of the box. Everything else is set
// in the details modal.
//
// 3.16.0: the row is a full width field, "+ Add a task", whose placeholder is never cut: at a narrow width the
// secondary controls go away (the total of the day first, then the time and estimate, then the label), never the
// text. The + focuses the field (so does a click in it); the details icon at the right creates the task from the
// typed title and opens its details with the title focused (with no title typed it only focuses the field and says so). Enter adds and keeps the box ready for the next one; the
// chosen label is kept for it, the time and the estimate start empty again.
export default function AddTaskBox({
  id,
  a11y,
  withTime,
  trailing,
  autoFocus,
  inputRef,
  warning,
  onAdd,
}: {
  // Unique per box (the label popover's id).
  id: string;
  a11y: string;
  withTime?: boolean;
  // Shown at the right while nothing is typed (the day's totals, "5h planned").
  trailing?: React.ReactNode;
  autoFocus?: boolean;
  inputRef?: React.RefObject<TextInput | null>;
  // A quiet line under the box (an away day, item 8).
  warning?: string | null;
  // `openDetails`: the details icon was pressed; the caller opens the new task's details once it is created.
  onAdd: (title: string, extra: { startTime?: string; projectKey?: string; durationMinutes?: number }, openDetails?: boolean) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [time, setTime] = useState('');
  const [estimate, setEstimate] = useState<number | undefined>(undefined);
  const [projectKey, setProjectKey] = useState<string | undefined>(undefined);
  const [label, setLabel] = useState<Project | undefined>(undefined);
  const own = useRef<TextInput>(null);
  const field = (inputRef ?? own) as React.RefObject<TextInput>;
  const [width, setWidth] = useState<number | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const anchor = usePopoverAnchor();
  const popId = `add:${id}:label`;
  const open = useIsOpen(popId);

  useEffect(() => {
    if (!projectKey) setLabel(undefined);
    else loadLabels().then((ls) => setLabel(ls.find((l) => l.key === projectKey)));
  }, [projectKey]);

  async function add(openDetails = false) {
    if (!text.trim()) {
      if (openDetails) {
        setHint(NEEDS_TITLE);
        field.current?.focus();
      }
      return;
    }
    setHint(null);
    const t = text;
    setText('');
    await onAdd(t, { startTime: withTime && time ? time : undefined, projectKey, durationMinutes: estimate }, openDetails);
    setTime('');
    setEstimate(undefined);
  }

  // The label menu edits the box's choice, not a stored task.
  const draft = { id: popId, title: text, completed: false, createdAt: '', updatedAt: '', projectKey } as Task;
  const ops: TaskOps = {
    patch: async (f) => {
      if ('projectKey' in f) setProjectKey(f.projectKey);
    },
    patchDay: async (f) => {
      if ('projectKey' in f) setProjectKey(f.projectKey);
    },
    setCompleted: async () => {},
    setTimeDone: async () => {},
    toggleSubtask: async () => {},
    remove: async () => {},
  };
  const color = labelColor(label?.colorKey);
  const typing = text.trim().length > 0;
  const room = addRoom(width, { typing, time: !!withTime && (typing || !!time), estimate: typing || estimate !== undefined, trailing: !typing && !time && estimate === undefined && !!trailing });

  return (
    <View style={styles.wrap}>
      <View style={styles.box} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} {...({ dataSet: { addBox: id } } as object)}>
        <Pressable onPress={() => field.current?.focus()} style={styles.plus} accessibilityRole="button" accessibilityLabel="Add a task: focus the field" focusable={false} {...({ dataSet: { addPlus: id } } as object)}>
          <Ionicons name="add-circle-outline" size={17} color={Colors.textSecondary} />
        </Pressable>
        <TextInput
          ref={field as never}
          value={text}
          onChangeText={(t) => {
            setText(t);
            if (hint) setHint(null);
          }}
          onSubmitEditing={() => void add()}
          blurOnSubmit={false}
          placeholder="Add a task"
          placeholderTextColor={Colors.textSecondary}
          style={[styles.input, typing && { minWidth: TYPING_MIN }]}
          accessibilityLabel={a11y}
          autoFocus={autoFocus}
        />
        {room.time && withTime && (typing || time) ? (
          <input type="time" step={300} value={time} aria-label="Time for the new task" onChange={(e) => setTime(e.target.value)} style={timeStyle} />
        ) : null}
        {room.estimate && (typing || estimate !== undefined) ? <DurationSelect id={`add:${id}`} label="Estimated time for the new task" value={estimate} onChange={setEstimate} placeholder="⏳" compact /> : null}
        {room.trailing && !typing && !time && estimate === undefined ? trailing : null}
        {room.details ? (
          <Pressable
            onPress={() => void add(true)}
            style={styles.labelBtn}
            accessibilityRole="button"
            accessibilityLabel="Add the task and open its details"
            {...({ title: 'Add and open the details', dataSet: { ctl: 'addDetails' } } as object)}
          >
            <Ionicons name="create-outline" size={15} color={Colors.textSecondary} />
          </Pressable>
        ) : null}
        {room.label ? (
        <Pressable
          ref={anchor.ref as never}
          onPress={() => togglePopover(popId, anchor.get)}
          style={[styles.labelBtn, (open || label) && styles.labelOn]}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={label ? `Label for the new task: ${label.name}` : 'Label for the new task'}
          {...({ dataSet: { ctl: 'addLabel' } } as object)}
        >
          {label ? label.emoji ? <Text style={styles.glyph}>{label.emoji}</Text> : <View style={[styles.dot, { backgroundColor: color?.edge ?? Colors.textSecondary }]} /> : <Ionicons name="pricetag-outline" size={15} color={Colors.textSecondary} />}
        </Pressable>
        ) : null}
        <Popover id={popId} anchor={anchor.get} width={284} maxHeight={540}>
          <LabelBody task={draft} ops={ops} done={() => closePopover(true)} />
        </Popover>
      </View>
      {hint ? (
        <Text style={styles.warning} accessibilityRole="alert" {...({ dataSet: { addHint: '1' } } as object)}>
          {hint}
        </Text>
      ) : null}
      {warning ? (
        <Text style={styles.warning} accessibilityLabel={warning}>
          {warning}
        </Text>
      ) : null}
    </View>
  );
}

const timeStyle: React.CSSProperties = {
  height: 28,
  width: 84,
  flex: 'none',
  padding: '0 4px',
  borderRadius: 8,
  border: `1px solid ${Colors.border}`,
  background: Colors.surface,
  color: Colors.textPrimary,
  fontSize: 12,
  fontFamily: DESKTOP_FONT_FAMILY,
  outlineColor: Colors.accent,
};

const styles = StyleSheet.create({
  wrap: { marginBottom: 10, gap: 4 },
  box: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingLeft: 10, paddingRight: 6, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, minWidth: 0 },
  plus: { width: 22, height: 28, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginLeft: -3 },
  input: { flex: 1, minWidth: INPUT_MIN, height: 40, fontSize: 14, color: Colors.textPrimary, outlineStyle: 'none' } as object,
  labelBtn: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  labelOn: { backgroundColor: Colors.hover },
  glyph: { fontSize: 13 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  warning: { fontSize: 12, color: Colors.textSecondary, paddingHorizontal: 4 },
});
