import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { formatShortDate } from '../../lib/kanban';
import { formatClock, formatHM, formatSecondsHM, parseDuration } from '../../lib/duration';
import { liveActualSeconds, elapsedSeconds, storedForTyped } from '../../lib/timer';
import { taskTimer } from '../../lib/taskTimer';
import { loadTasksRaw } from '../../lib/storage';
import { useNow, useRunningTimer } from './useTaskTimer';
import { generateId } from '../../lib/data';
import { shortRepeat } from '../../lib/repeat';
import { reminderState } from '../../lib/reminder';
import { addSubtask, counterLabel, deleteSubtask, moveSubtask, renameSubtask } from '../../lib/subtasks';
import type { LabelColor } from '../../lib/labelColors';
import type { Project, Task } from '../../lib/types';
import { isEditableTarget } from '../../lib/editable';
import HoverPressable from './HoverPressable';
import Popover, { togglePopover, useIsOpen, usePopoverAnchor, closePopover } from './Popover';
import { DurationBody, LabelBody, MoveToDayBody, OverflowBody, PriorityBody, ReminderBody, RepeatBody } from './TaskPopovers';
import type { TaskOps } from './taskOps';

// A task on the board or in the left list (checkpoint 8.2, decision 021). Every
// edit happens on the card: the title renames in place, each small icon opens a
// small dropdown beside it, and clicking the card body expands it in place to
// show notes and subtasks. There is no modal. Drag still works from anywhere on
// the card that is not a button, and the card keeps the label tint and edge.
export default function TaskCard({
  task,
  ops,
  label,
  color,
  variant,
  todayKey,
  onChanged,
  nodeRef,
  dragging,
  overdueFrom,
  divider,
  dropHighlight,
}: {
  task: Task;
  ops: TaskOps;
  label?: Project;
  color?: LabelColor;
  // 'card' on the week board (tint and edge), 'row' in the left list.
  variant: 'card' | 'row';
  todayKey: string;
  onChanged: () => void;
  nodeRef?: (node: unknown) => void;
  dragging?: boolean;
  overdueFrom?: string;
  divider?: boolean;
  // "Add as subtask" while a dragged task is armed over this card.
  dropHighlight?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(task.title);
  const cancelled = useRef(false);

  // Applies an edit, then refreshes the panes.
  const run = useCallback(
    <T,>(fn: () => Promise<T>) =>
      fn().then((r) => {
        onChanged();
        return r;
      }),
    [onChanged],
  );
  const patch = useCallback((fields: Partial<Task>) => run(() => ops.patch(fields)), [ops, run]);
  const wrapped: TaskOps = {
    patch,
    setCompleted: (d) => run(() => ops.setCompleted(d)),
    toggleSubtask: (id) => run(() => ops.toggleSubtask(id)),
    remove: () => run(() => ops.remove()),
  };

  const id = task.id;
  const clock = formatClock(task.durationMinutes);
  const placed = !!task.dueDate && !!task.startTime;
  const runningHere = useRunningTimer()?.taskId === id;
  const bell = reminderState(task.reminderMinutes);
  const repeatText = task.recurrence ? shortRepeat(task, todayKey) : undefined;
  const subCount = counterLabel(task.subtasks);

  function startRename() {
    cancelled.current = false;
    setTitle(task.title);
    setRenaming(true);
  }
  function finishRename() {
    setRenaming(false);
    const t = title.trim();
    if (cancelled.current || !t || t === task.title) return;
    patch({ title: t });
  }

  // The card element: not in the tab order but focusable, so after Escape in
  // Notes the next Escape (target = the card itself) can collapse it.
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const cleanupKeys = useRef<(() => void) | null>(null);
  const cardEl = useRef<HTMLElement | null>(null);
  const setNode = useCallback(
    (node: unknown) => {
      nodeRef?.(node);
      cleanupKeys.current?.();
      cleanupKeys.current = null;
      const el = node as HTMLElement | null;
      if (!el || typeof el.addEventListener !== 'function') return;
      el.tabIndex = -1;
      cardEl.current = el;
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && e.target === el && expandedRef.current) {
          e.stopPropagation();
          setExpanded(false);
        }
      };
      el.addEventListener('keydown', onKey);
      cleanupKeys.current = () => el.removeEventListener('keydown', onKey);
    },
    // nodeRef is a cached ref callback per card; re-attaching is harmless.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodeRef],
  );

  const dayOpen = useIsOpen(`${id}:day`);
  const moreOpen = useIsOpen(`${id}:more`);

  return (
    <>
      <HoverPressable
        nodeRef={setNode}
        // A press that comes from a field (a click into the rename box, or Enter
        // or Space typed in one) is never a press on the card.
        onPress={(e) => {
          const target = (e as { target?: unknown } | undefined)?.target;
          if (isEditableTarget(target)) return;
          setExpanded((x) => !x);
        }}
        style={[
          styles.card,
          variant === 'row' && styles.row,
          divider && !(variant === 'card' && color) && styles.divider,
          variant === 'card' && color && [styles.labelled, { backgroundColor: color.tint, borderLeftColor: color.edge }],
          dragging && styles.dragging,
          dropHighlight && styles.dropTarget,
        ]}
        hoverStyle={variant === 'card' && color ? styles.labelledHover : styles.hover}
        // Not a button: RN web renders role button as a native <button>, and a
        // field inside a <button> turns a typed Space into a click on it.
        accessibilityLabel={`Task ${task.title}`}
        // The board finds the card under a dragged task through this (a legacy
        // phone item is not a real task yet, so it is never a drop host).
        {...(task.id.startsWith('dump:') ? {} : ({ dataSet: { taskCard: task.id } } as object))}
      >
        {(hovered) => (
          <>
            <View style={styles.titleRow}>
              {renaming ? (
                // A Pressable so the nearest press handler for keys typed in the field
                // is this one, not the card's (Enter must not toggle the card).
                <Pressable onPress={() => {}} style={styles.renameWrap}>
                <TextInput
                  style={styles.titleInput}
                  value={title}
                  onChangeText={setTitle}
                  onSubmitEditing={finishRename}
                  onBlur={finishRename}
                  onKeyPress={(e) => {
                    const key = (e.nativeEvent as { key?: string }).key;
                    // Enter and Escape here are for the field, never a press on the card.
                    if (key === 'Enter' || key === 'Escape') (e as { stopPropagation?: () => void }).stopPropagation?.();
                    if (key === 'Escape') {
                      cancelled.current = true;
                      setRenaming(false);
                    }
                  }}
                  autoFocus
                  selectTextOnFocus
                  accessibilityLabel={`Rename ${task.title}`}
                />
                </Pressable>
              ) : (
                <Text
                  onPress={startRename}
                  style={[styles.title, task.completed && styles.titleDone, !task.completed && task.priority === 'low' && styles.titleLow]}
                  accessibilityLabel={`Title ${task.title}`}
                >
                  {task.title}
                </Text>
              )}
              {/* Both icons are always laid out and only fade in on hover, so nothing
                  in the card moves when the pointer arrives or leaves. */}
              <HeaderIcon id={`${id}:day`} icon="calendar-outline" a11y={`Move ${task.title} to day`} shown={!renaming && (hovered || dayOpen)}>
                  {(anchor) => (
                    <Popover id={`${id}:day`} anchor={anchor} width={248}>
                      <MoveToDayBody task={task} ops={wrapped} done={() => closePopover(true)} />
                    </Popover>
                  )}
                </HeaderIcon>
              <HeaderIcon id={`${id}:more`} icon="ellipsis-horizontal" a11y={`More actions for ${task.title}`} shown={!renaming && (hovered || moreOpen)}>
                  {(anchor) => (
                    <Popover id={`${id}:more`} anchor={anchor} width={200}>
                      <OverflowBody ops={wrapped} done={() => closePopover()} />
                    </Popover>
                  )}
                </HeaderIcon>
              {/* The start time of a placed task sits beside the chip as its own small
                  muted text, so "15:00" and "0:15" are never read as one value. */}
              {placed && <Text style={styles.startTime}>{task.startTime}</Text>}
              <Control id={`${id}:duration`} a11y={`Duration of ${task.title}: ${clock}${placed ? `, starts ${task.startTime}` : ''}`} style={styles.chip}>
                {(anchor) => (
                  <>
                    <Text style={[styles.chipText, task.durationMinutes === undefined && styles.chipTextMuted]}>{clock}</Text>
                    <Popover id={`${id}:duration`} anchor={anchor} width={272}>
                      <DurationBody task={task} ops={wrapped} done={() => closePopover(true)} />
                    </Popover>
                  </>
                )}
              </Control>
            </View>
            {overdueFrom && <Text style={styles.from}>from {formatShortDate(overdueFrom)}</Text>}

            <View style={styles.controls}>
              <Pressable
                onPress={() => wrapped.setCompleted(!task.completed)}
                style={styles.icon}
                accessibilityRole="button"
                accessibilityLabel={task.completed ? `Mark ${task.title} incomplete` : `Mark ${task.title} complete`}
              >
                <Ionicons
                  name={task.completed ? 'checkmark-circle' : 'ellipse-outline'}
                  size={18}
                  color={task.completed ? Colors.accent : Colors.textSecondary}
                />
              </Pressable>

              <Control id={`${id}:repeat`} a11y={task.recurrence ? `Repeat: ${repeatText}` : 'Repeat'} style={styles.icon}>
                {(anchor) => (
                  <>
                    <Ionicons name="repeat" size={16} color={task.recurrence ? Colors.accentText : Colors.textSecondary} />
                    <Popover id={`${id}:repeat`} anchor={anchor} width={300}>
                      <RepeatBody task={task} ops={wrapped} done={() => closePopover(true)} />
                    </Popover>
                  </>
                )}
              </Control>

              <Pressable
                onPress={() => setExpanded((e) => !e)}
                style={styles.iconWithText}
                accessibilityRole="button"
                accessibilityLabel={`Subtasks ${subCount}`}
              >
                <Ionicons name="checkbox-outline" size={15} color={task.subtasks && task.subtasks.length > 0 ? Colors.accentText : Colors.textSecondary} />
                <Text style={styles.counter}>{subCount}</Text>
              </Pressable>

              <Control id={`${id}:priority`} a11y={`Priority: ${task.priority ?? 'normal'}`} style={styles.icon}>
                {(anchor) => (
                  <>
                    <Ionicons
                      name={task.priority ? 'flag' : 'flag-outline'}
                      size={15}
                      color={task.priority === 'high' ? Colors.accentText : Colors.textSecondary}
                    />
                    <Popover id={`${id}:priority`} anchor={anchor} width={220}>
                      <PriorityBody task={task} ops={wrapped} done={() => closePopover(true)} />
                    </Popover>
                  </>
                )}
              </Control>

              <Control id={`${id}:reminder`} a11y={`Reminder: ${bell === 'default' ? 'default' : bell === 'off' ? 'off' : 'set'}`} style={styles.icon}>
                {(anchor) => (
                  <>
                    <Ionicons
                      name={bell === 'off' ? 'notifications-off-outline' : bell === 'set' ? 'notifications' : 'notifications-outline'}
                      size={15}
                      color={bell === 'set' ? Colors.accentText : Colors.textSecondary}
                    />
                    <Popover id={`${id}:reminder`} anchor={anchor} width={240}>
                      <ReminderBody task={task} ops={wrapped} done={() => closePopover(true)} />
                    </Popover>
                  </>
                )}
              </Control>

              {runningHere && <View style={styles.runDot} accessibilityLabel="Timer running" />}

              <View style={{ flex: 1 }} />

              <Control id={`${id}:label`} a11y={label ? `Label: ${label.name}` : 'Select label'} style={styles.labelBtn}>
                {(anchor) => (
                  <>
                    {label ? (
                      <>
                        <View style={[styles.dot, { backgroundColor: color?.edge ?? Colors.border }]} />
                        <Text style={styles.labelText} numberOfLines={1}>
                          {label.name}
                        </Text>
                      </>
                    ) : (
                      <Text style={styles.labelPlaceholder} numberOfLines={1}>
                        Select label
                      </Text>
                    )}
                    <Popover id={`${id}:label`} anchor={anchor} width={272}>
                      <LabelBody task={task} ops={wrapped} done={() => closePopover(true)} />
                    </Popover>
                  </>
                )}
              </Control>
            </View>

            {dropHighlight && <Text style={styles.dropText}>Add as subtask</Text>}
            {expanded && <ExpandedBody task={task} ops={wrapped} cardNode={() => cardEl.current} onChanged={onChanged} />}
          </>
        )}
      </HoverPressable>
    </>
  );
}

// A small icon button in the title row (calendar, overflow).
function HeaderIcon({
  id,
  icon,
  a11y,
  shown,
  children,
}: {
  id: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  a11y: string;
  // Visible and pressable (on hover or while its popover is open); otherwise
  // it still takes its space but is transparent, inert and out of the tab order.
  shown: boolean;
  children: (anchor: () => HTMLElement | null) => React.ReactNode;
}) {
  const { ref, get } = usePopoverAnchor();
  return (
    <>
      <Pressable
        ref={ref as never}
        onPress={() => togglePopover(id, get)}
        style={[styles.headerIcon, !shown && styles.headerIconHidden]}
        focusable={shown}
        accessibilityRole="button"
        accessibilityLabel={a11y}
      >
        <Ionicons name={icon} size={15} color={Colors.textSecondary} />
      </Pressable>
      {children(get)}
    </>
  );
}

// A trigger that opens its popover (rendered by `children`, in a portal).
function Control({
  id,
  a11y,
  style,
  children,
}: {
  id: string;
  a11y: string;
  style: object;
  children: (anchor: () => HTMLElement | null) => React.ReactNode;
}) {
  const { ref, get } = usePopoverAnchor();
  const open = useIsOpen(id);
  return (
    <Pressable
      ref={ref as never}
      onPress={() => togglePopover(id, get)}
      style={[style, open && styles.controlOpen]}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={a11y}
    >
      {children(get)}
    </Pressable>
  );
}

// ---- expanded in place: notes and subtasks ----
function ExpandedBody({ task, ops, cardNode, onChanged }: { task: Task; ops: TaskOps; cardNode: () => HTMLElement | null; onChanged: () => void }) {
  const notesRef = useRef<TextInput>(null);
  const [notes, setNotes] = useState(task.notes ?? '');
  const [newText, setNewText] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const rowNodes = useRef(new Map<string, HTMLElement>());
  const list = task.subtasks ?? [];

  useEffect(() => setNotes(task.notes ?? ''), [task.notes]);

  function saveNotes() {
    const next = notes.trim();
    if (next !== (task.notes ?? '')) ops.patch({ notes: next.length > 0 ? next : undefined });
  }

  async function add() {
    const t = newText.trim();
    if (!t) return;
    setNewText('');
    await ops.patch({ subtasks: addSubtask(list, t, generateId()) });
  }

  // Reorder inside the card with the handle: pointer events, no modal and no
  // board drag (the handle is a button, which the board drag ignores).
  function startReorder(e: React.PointerEvent | PointerEvent, from: number) {
    const move = (ev: PointerEvent) => {
      const ids = list.map((s) => s.id);
      let to = from;
      ids.forEach((sid, i) => {
        const node = rowNodes.current.get(sid);
        if (!node) return;
        const r = node.getBoundingClientRect();
        if (ev.clientY >= r.top && ev.clientY <= r.bottom) to = i;
      });
      setOverIndex(to);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      const ids = list.map((s) => s.id);
      let to = from;
      ids.forEach((sid, i) => {
        const node = rowNodes.current.get(sid);
        if (!node) return;
        const r = node.getBoundingClientRect();
        if (ev.clientY >= r.top && ev.clientY <= r.bottom) to = i;
      });
      setOverIndex(null);
      if (to !== from) ops.patch({ subtasks: moveSubtask(list, from, to) });
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
  }

  return (
    // A Pressable so a press inside never reaches the card's own press (which
    // would collapse it), and marked so the board drag ignores it.
    <Pressable onPress={() => {}} style={styles.expanded} {...({ dataSet: { noDrag: '1' } } as object)}>
      <TimerRow task={task} ops={ops} onChanged={onChanged} />
      <TextInput
        style={styles.notes}
        placeholder="Notes"
        placeholderTextColor={Colors.textSecondary}
        ref={notesRef}
        value={notes}
        onChangeText={setNotes}
        onBlur={saveNotes}
        onKeyPress={(e) => {
          // Escape leaves the field (which saves it) without collapsing the card;
          // a second Escape, now on the card itself, collapses it.
          if ((e.nativeEvent as { key?: string }).key === 'Escape') {
            notesRef.current?.blur();
            cardNode()?.focus({ preventScroll: true });
          }
        }}
        multiline
        accessibilityLabel={`Notes for ${task.title}`}
      />

      {list.map((s, i) => (
        <SubtaskRow
          key={s.id}
          registerNode={(n) => (n ? rowNodes.current.set(s.id, n) : rowNodes.current.delete(s.id))}
          title={s.title}
          done={s.done}
          editing={editing === s.id}
          editText={editText}
          over={overIndex === i}
          onTick={() => ops.toggleSubtask(s.id)}
          onStartEdit={() => {
            setEditing(s.id);
            setEditText(s.title);
          }}
          onEditText={setEditText}
          onCommit={() => {
            const t = editText.trim();
            setEditing(null);
            if (t && t !== s.title) ops.patch({ subtasks: renameSubtask(list, s.id, t) });
          }}
          onCancel={() => setEditing(null)}
          onDelete={() => ops.patch({ subtasks: deleteSubtask(list, s.id) })}
          onHandleDown={(e) => startReorder(e, i)}
        />
      ))}

      <View style={styles.addRow}>
        <Ionicons name="add" size={16} color={Colors.textSecondary} />
        <TextInput
          style={styles.addInput}
          placeholder="Add subtask"
          placeholderTextColor={Colors.textSecondary}
          value={newText}
          onChangeText={setNewText}
          onSubmitEditing={add}
          // Enter adds and keeps the field open for the next one.
          blurOnSubmit={false}
          accessibilityLabel={`Add subtask to ${task.title}`}
        />
      </View>
    </Pressable>
  );
}

// ---- Estimated and Actual (checkpoint 8.3, decision 022) ----
// One quiet row: a play/pause button on the left, then Actual and Estimated
// on the right. Estimated is the duration (clicking it opens the same
// dropdown); Actual is the time spent, and clicking it lets you type a
// corrected value. No colour, comparison or count: it only reports.
type LongPrompt = { subjectId: string; subjectTitle?: string; seconds: number; startAfter: boolean };

function TimerRow({ task, ops, onChanged }: { task: Task; ops: TaskOps; onChanged: () => void }) {
  const id = task.id;
  const timer = useRunningTimer();
  const running = timer?.taskId === id;
  const now = useNow(running);
  const live = liveActualSeconds(task.actualSeconds, timer, id, now);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [bad, setBad] = useState(false);
  const [prompt, setPrompt] = useState<LongPrompt | null>(null);
  const [promptText, setPromptText] = useState('');
  const [promptBad, setPromptBad] = useState(false);
  const { ref: estRef, get: estAnchor } = usePopoverAnchor();
  const estOpen = useIsOpen(`${id}:estimate`);

  async function toggle() {
    if (running) {
      const r = await taskTimer.stop(id);
      if (r.kind === 'confirm') openPrompt({ subjectId: id, seconds: r.seconds, startAfter: false });
    } else {
      const r = await taskTimer.start(id);
      if (r.kind === 'confirm') {
        const other = (await loadTasksRaw()).find((t) => t.id === r.taskId);
        openPrompt({ subjectId: r.taskId, subjectTitle: other?.title, seconds: r.seconds, startAfter: true });
      }
    }
    onChanged();
  }
  function openPrompt(p: LongPrompt) {
    setPromptText('');
    setPromptBad(false);
    setPrompt(p);
  }
  async function answer(seconds: number) {
    if (!prompt) return;
    await taskTimer.resolveLong(prompt.subjectId, seconds);
    if (prompt.startAfter) await taskTimer.start(id);
    setPrompt(null);
    onChanged();
  }
  function submitPrompt() {
    const minutes = parseDuration(promptText, { allowZero: true });
    if (minutes === null) setPromptBad(true);
    else answer(minutes * 60);
  }
  function startEdit() {
    setText('');
    setBad(false);
    setEditing(true);
  }
  async function submitEdit() {
    const minutes = parseDuration(text, { allowZero: true });
    if (minutes === null) {
      setBad(true);
      return;
    }
    const runningNow = timer && timer.taskId === id ? elapsedSeconds(timer.startedAt, Date.now()) : 0;
    setEditing(false);
    await ops.patch({ actualSeconds: storedForTyped(minutes * 60, runningNow) });
  }
  const fieldKeys = (close: () => void) => (e: { nativeEvent: unknown; stopPropagation?: () => void }) => {
    const key = (e.nativeEvent as { key?: string }).key;
    if (key === 'Enter' || key === 'Escape') e.stopPropagation?.();
    if (key === 'Escape') close();
  };

  const promptTitle = prompt?.subjectTitle ? `"${prompt.subjectTitle}" ran for` : "That's";
  return (
    <View style={styles.timerWrap}>
      <View style={styles.timerRow}>
        <Pressable
          onPress={toggle}
          disabled={task.completed && !running}
          style={[styles.playBtn, task.completed && !running && styles.playDisabled]}
          accessibilityRole="button"
          accessibilityLabel={running ? `Stop timer for ${task.title}` : `Start timer for ${task.title}`}
        >
          <Ionicons name={running ? 'pause' : 'play'} size={13} color={Colors.textSecondary} />
          {running && <View style={styles.runDotRow} accessibilityLabel="Timer running" />}
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }} />
        {editing ? (
          <View style={styles.timerEdit}>
            <TextInput
              style={styles.timerInput}
              value={text}
              onChangeText={(t) => {
                setText(t);
                setBad(false);
              }}
              onSubmitEditing={submitEdit}
              // Enter with an invalid value keeps the field open for the hint.
              blurOnSubmit={false}
              onBlur={() => setEditing(false)}
              onKeyPress={fieldKeys(() => setEditing(false))}
              placeholder="45m, 1h 30m"
              placeholderTextColor={Colors.textSecondary}
              autoFocus
              accessibilityLabel={`Actual time for ${task.title}`}
            />
          </View>
        ) : (
          <Pressable onPress={startEdit} accessibilityRole="button" accessibilityLabel={`Actual time: ${formatSecondsHM(live)}. Click to correct`}>
            <Text style={styles.timerText}>Actual {formatSecondsHM(live)}</Text>
          </Pressable>
        )}
        <Pressable
          ref={estRef as never}
          onPress={() => togglePopover(`${id}:estimate`, estAnchor)}
          style={[styles.estimate, estOpen && styles.controlOpen]}
          accessibilityRole="button"
          accessibilityState={{ expanded: estOpen }}
          accessibilityLabel={`Estimated time: ${formatHM(task.durationMinutes)}. Click to change`}
        >
          <Text style={styles.timerText}>Estimated {formatHM(task.durationMinutes)}</Text>
        </Pressable>
        <Popover id={`${id}:estimate`} anchor={estAnchor} width={240}>
          <DurationBody task={task} ops={ops} done={() => closePopover(true)} />
        </Popover>
      </View>
      {editing && bad && <Text style={styles.timerHint}>Not a time. Try 45m, 1h 30m or 130 (minutes).</Text>}
      {prompt && (
        <View style={styles.longPrompt}>
          <Text style={styles.timerPromptText}>
            {promptTitle} {formatSecondsHM(prompt.seconds)}. Add it, or enter a different time?
          </Text>
          <View style={styles.promptRow}>
            <Pressable onPress={() => answer(prompt.seconds)} style={styles.promptBtn} accessibilityRole="button" accessibilityLabel="Add the time">
              <Text style={styles.promptBtnText}>Add</Text>
            </Pressable>
            <TextInput
              style={styles.timerInput}
              value={promptText}
              onChangeText={(t) => {
                setPromptText(t);
                setPromptBad(false);
              }}
              onSubmitEditing={submitPrompt}
              blurOnSubmit={false}
              onKeyPress={fieldKeys(() => setPrompt(null))}
              placeholder="1h 30m"
              placeholderTextColor={Colors.textSecondary}
              accessibilityLabel="A different time"
            />
            <Pressable onPress={() => setPrompt(null)} style={styles.promptBtn} accessibilityRole="button" accessibilityLabel="Keep the timer running">
              <Text style={styles.timerText}>Keep running</Text>
            </Pressable>
          </View>
          {promptBad && <Text style={styles.timerHint}>Not a time. Try 45m, 1h 30m or 130 (minutes). 0 adds nothing.</Text>}
        </View>
      )}
    </View>
  );
}

function SubtaskRow({
  registerNode,
  title,
  done,
  editing,
  editText,
  over,
  onTick,
  onStartEdit,
  onEditText,
  onCommit,
  onCancel,
  onDelete,
  onHandleDown,
}: {
  registerNode: (node: HTMLElement | null) => void;
  title: string;
  done: boolean;
  editing: boolean;
  editText: string;
  over: boolean;
  onTick: () => void;
  onStartEdit: () => void;
  onEditText: (t: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onHandleDown: (e: PointerEvent) => void;
}) {
  const handleRef = useRef<HTMLElement | null>(null);
  const downRef = useRef(onHandleDown);
  downRef.current = onHandleDown;
  const setHandle = useCallback((node: unknown) => {
    const el = node as HTMLElement | null;
    if (handleRef.current) handleRef.current.removeEventListener('pointerdown', (handleRef.current as never as { __d: EventListener }).__d);
    handleRef.current = el;
    if (!el || typeof el.addEventListener !== 'function') return;
    const listener = (e: Event) => {
      e.stopPropagation();
      downRef.current(e as PointerEvent);
    };
    (el as never as { __d: EventListener }).__d = listener;
    el.addEventListener('pointerdown', listener);
  }, []);
  return (
    <HoverPressable
      nodeRef={(n) => registerNode(n as HTMLElement | null)}
      onPress={() => {}}
      style={[styles.subRow, over && styles.subRowOver]}
      accessibilityLabel={`Subtask ${title}`}
    >
      {(hovered) => (
        <>
          <Pressable ref={setHandle as never} style={styles.handle} accessibilityRole="button" accessibilityLabel={`Reorder ${title}`}>
            <Ionicons name="reorder-two" size={14} color={Colors.textSecondary} />
          </Pressable>
          <Pressable onPress={onTick} style={styles.subTick} accessibilityRole="button" accessibilityLabel={done ? `Untick ${title}` : `Tick ${title}`}>
            <Ionicons name={done ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={done ? Colors.accent : Colors.textSecondary} />
          </Pressable>
          {editing ? (
            <TextInput
              style={styles.subInput}
              value={editText}
              onChangeText={onEditText}
              onSubmitEditing={onCommit}
              onBlur={onCommit}
              onKeyPress={(e) => {
                if ((e.nativeEvent as { key?: string }).key === 'Escape') onCancel();
              }}
              autoFocus
              selectTextOnFocus
              accessibilityLabel={`Edit subtask ${title}`}
            />
          ) : (
            <Text onPress={onStartEdit} style={[styles.subTitle, done && styles.titleDone]} numberOfLines={2}>
              {title}
            </Text>
          )}
          {hovered && !editing && (
            <Pressable onPress={onDelete} style={styles.subDelete} accessibilityRole="button" accessibilityLabel={`Delete subtask ${title}`}>
              <Ionicons name="close" size={14} color={Colors.textSecondary} />
            </Pressable>
          )}
        </>
      )}
    </HoverPressable>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: 8, paddingHorizontal: 4, gap: 4 },
  row: { minHeight: 44 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  labelled: { borderLeftWidth: 4, borderRadius: 8, marginVertical: 2, paddingLeft: 6 },
  hover: { backgroundColor: Colors.background },
  // Hover on a tinted card: a hairline outline instead of replacing the tint.
  labelledHover: { outlineWidth: 1, outlineStyle: 'solid', outlineColor: Colors.border },
  dragging: { opacity: 0.4 },
  dropTarget: { outlineWidth: 2, outlineStyle: 'solid', outlineColor: Colors.accent, borderRadius: 8 },
  dropText: { fontSize: 11, fontWeight: '700', color: Colors.accentText },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  title: { flex: 1, fontSize: 14, color: Colors.textPrimary, minWidth: 0 },
  titleDone: { textDecorationLine: 'line-through', color: Colors.textSecondary },
  titleLow: { color: Colors.textSecondary },
  renameWrap: { flex: 1, minWidth: 0 },
  titleInput: {
    minWidth: 0,
    fontSize: 14,
    color: Colors.textPrimary,
    paddingVertical: 0,
    paddingHorizontal: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.accent,
    backgroundColor: Colors.surface,
    outlineWidth: 0,
  },
  headerIcon: { padding: 3, width: 21, height: 21, alignItems: 'center', justifyContent: 'center' },
  headerIconHidden: { opacity: 0, pointerEvents: 'none' },
  chip: { paddingHorizontal: 7, height: 22, borderRadius: 11, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border, justifyContent: 'center', backgroundColor: Colors.surface },
  chipText: { fontSize: 11, fontWeight: '500', color: Colors.textPrimary, fontVariant: ['tabular-nums'] },
  startTime: { fontSize: 11, lineHeight: 22, color: Colors.textSecondary, fontVariant: ['tabular-nums'] },
  runDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.accent, marginLeft: 6 },
  chipTextMuted: { color: Colors.textSecondary },
  from: { fontSize: 12, color: Colors.textSecondary },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 28 },
  icon: { width: 24, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 8, flexDirection: 'row' },
  iconWithText: { height: 28, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center', borderRadius: 8, flexDirection: 'row', gap: 3 },
  counter: { fontSize: 11, color: Colors.textSecondary, fontVariant: ['tabular-nums'] },
  controlOpen: { backgroundColor: Colors.background },
  labelBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 28, paddingHorizontal: 4, borderRadius: 8, flexShrink: 1, minWidth: 0 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  labelText: { fontSize: 12, color: Colors.textPrimary, flexShrink: 1 },
  labelPlaceholder: { fontSize: 12, color: Colors.textSecondary },
  expanded: { gap: 4, paddingTop: 4 },
  notes: {
    minHeight: 54,
    padding: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    color: Colors.textPrimary,
    fontSize: 13,
    outlineColor: Colors.accent,
  },
  timerWrap: { gap: 4 },
  // Wraps (rather than clips) when a long Actual and Estimated do not fit.
  timerRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 2, minHeight: 28 },
  playBtn: { width: 26, height: 26, borderRadius: 13, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  playDisabled: { opacity: 0.4 },
  runDotRow: { position: 'absolute', top: 1, right: 1, width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.accent },
  timerText: { fontSize: 12, color: Colors.textSecondary, fontVariant: ['tabular-nums'] },
  estimate: { paddingHorizontal: 4, height: 26, justifyContent: 'center', borderRadius: 8 },
  timerEdit: { flexDirection: 'row', alignItems: 'center' },
  timerInput: {
    minWidth: 96,
    fontSize: 12,
    color: Colors.textPrimary,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.accent,
    backgroundColor: Colors.surface,
    outlineColor: Colors.accent,
  },
  timerHint: { fontSize: 12, color: Colors.textSecondary },
  longPrompt: { gap: 6, padding: 8, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border, backgroundColor: Colors.surface },
  timerPromptText: { fontSize: 12, color: Colors.textPrimary },
  promptRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  promptBtn: { paddingHorizontal: 10, height: 26, borderRadius: 13, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border, justifyContent: 'center', backgroundColor: Colors.background },
  promptBtnText: { fontSize: 12, fontWeight: '600', color: Colors.textPrimary },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 28 },
  subRowOver: { borderTopWidth: 2, borderTopColor: Colors.accent },
  handle: { width: 18, height: 24, alignItems: 'center', justifyContent: 'center' },
  subTick: { padding: 2 },
  subTitle: { flex: 1, fontSize: 13, color: Colors.textPrimary },
  subInput: {
    flex: 1,
    fontSize: 13,
    color: Colors.textPrimary,
    paddingVertical: 0,
    paddingHorizontal: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.accent,
    backgroundColor: Colors.surface,
    outlineColor: Colors.accent,
  },
  subDelete: { padding: 4 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 28 },
  addInput: { flex: 1, fontSize: 13, color: Colors.textPrimary, paddingVertical: 2, outlineColor: Colors.accent },
});
