import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { formatClock } from '../../lib/duration';
import { generateId } from '../../lib/data';
import { shortRepeat } from '../../lib/repeat';
import { reminderState } from '../../lib/reminder';
import { addSubtask, counter, counterLabel, deleteSubtask, moveSubtask, renameSubtask } from '../../lib/subtasks';
import type { LabelColor } from '../../lib/labelColors';
import type { Project, Task } from '../../lib/types';
import { isEditableTarget } from '../../lib/editable';
import { cardKeyAction } from '../../lib/cardKeys';
import { shortcutFor } from '../../lib/shortcuts';
import { isTimerRunning, shownMinutes } from '../../lib/taskTimer';
import { duplicateTaskById } from '../../lib/taskCommands';
import { ensureFocusRingStyle } from './focusRing';
import HoverPressable from './HoverPressable';
import Popover, { togglePopover, useIsOpen, usePopoverAnchor, closePopover, isPopoverOpen } from './Popover';
import StreakLine from './StreakLine';
import { ActualBody, DurationBody, LabelBody, MoveToDayBody, OverflowBody, ReminderBody, RepeatBody, SeriesNote } from './TaskPopovers';
import type { TaskOps } from './taskOps';
import { notifyChanged, openDetail } from './uiStore';
import { useFeatures } from './featureStore';
import { startFocus } from './pomodoroStore';
import { toggleTimer, useNow } from './timerUi';

// A task on the board or in the left list (checkpoint 8.2, decision 021). Every
// edit happens on the card: the title renames in place, each small icon opens a
// small dropdown beside it, and clicking the card body expands it in place to
// show notes and subtasks. Drag works from anywhere on the card that is not a
// button.
// 2.26.0 look: a soft solid fill in the label's colour (white with no label),
// 12 px corners, a light shadow that deepens on hover, padding 11 x 12. Two lines:
// the tick, the emoji and title and the estimate; then what the task carries
// (label, time, steps ring, repeat, reminder, time spent), as plain text. On
// hover, or while the keyboard is inside the card, the row of controls (label,
// steps, repeat, reminder, timer, actual time, move to day, more) lies over
// that second line in the card's own colour, so the card never changes height;
// an expanded card shows the controls in the flow, above its notes and steps.
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
  divider,
  projected,
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
  divider?: boolean;
  // A projected occurrence of a repeating series (decision 023): not stored,
  // lighter, edits apply to every day, ticking stores this day.
  projected?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  // Ctrl+Delete opens the More menu already asking "Delete? Yes / No".
  const [deleteArmed, setDeleteArmed] = useState(false);
  // Ctrl+I: the time section (actual against estimated, start or stop).
  const [showTime, setShowTime] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [focusWithin, setFocusWithin] = useState(false);
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
    series: ops.series
      ? {
          projected: ops.series.projected,
          skipDay: () => run(() => ops.series!.skipDay()),
          deleteSeries: () => run(() => ops.series!.deleteSeries()),
        }
      : undefined,
  };

  const id = task.id;
  const running = isTimerRunning(task);
  const clock = formatClock(task.durationMinutes);
  const placed = !!task.dueDate && !!task.startTime;
  const feats = useFeatures();
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

  // The card element is in the tab order (checkpoint 9): Tab reaches it, Enter
  // expands or collapses it, Escape collapses it (cardKeyAction decides; a key
  // from any field or inner button is never the card's, so typing is safe).
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const cleanupKeys = useRef<(() => void) | null>(null);
  const cardEl = useRef<HTMLElement | null>(null);
  // The latest task, ops and flags for the key handler, which is attached once.
  const live = useRef({ task, wrapped: null as TaskOps | null, projected: !!projected });
  live.current.task = task;
  live.current.wrapped = wrapped;
  live.current.projected = !!projected;
  const runCardShortcut = (sc: ReturnType<typeof shortcutFor>, el: HTMLElement): boolean => {
    const { task: t, wrapped: w, projected: proj } = live.current;
    const click = (ctl: string) => {
      const b = el.querySelector<HTMLElement>(`[data-ctl="${ctl}"]`);
      if (!b) return false;
      b.click();
      return true;
    };
    switch (sc) {
      case 'complete':
        w?.setCompleted(!t.completed);
        return true;
      case 'toggleSubtasks':
        setExpanded((x) => !x);
        return true;
      case 'newSubtask':
        setExpanded(true);
        setTimeout(() => el.querySelector<HTMLElement>('input[aria-label^="Add subtask"]')?.focus(), 0);
        return true;
      case 'openDetails':
        if (proj) return false;
        openDetail(t.id);
        return true;
      case 'editEstimate':
        return click('duration');
      case 'editActual':
        return proj ? false : click('actual');
      case 'selectLabel':
        return click('label');
      case 'toggleTimer':
        if (proj) return false;
        toggleTimer(t);
        return true;
      case 'duplicateTask':
        if (proj || t.id.startsWith('dump:')) return false;
        duplicateTaskById(t.id).then(() => notifyChanged());
        return true;
      case 'deleteTask':
        setDeleteArmed(true);
        return click('more');
      case 'toggleTimeSection':
        if (proj) return false;
        setShowTime((v) => !v);
        return true;
      case 'prevDay':
      case 'nextDay': {
        // The first task of the column before or after this card's day; from
        // the left list, Right goes to the first day on the board.
        const cols = Array.from(document.querySelectorAll<HTMLElement>('[data-day-col]')).filter((n) => n.offsetParent !== null);
        const mine = el.closest<HTMLElement>('[data-day-col]');
        const at = mine ? cols.indexOf(mine) : -1;
        const target = mine ? cols[at + (sc === 'nextDay' ? 1 : -1)] : sc === 'nextDay' ? cols[0] : undefined;
        const first = target?.querySelector<HTMLElement>('[data-card-focus]');
        if (first) {
          first.focus({ preventScroll: true });
          first.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
        return true;
      }
      case 'nextTask':
      case 'prevTask': {
        const all = Array.from(document.querySelectorAll<HTMLElement>('[data-card-focus]')).filter((n) => n.offsetParent !== null);
        const at = all.indexOf(el);
        const next = all[at + (sc === 'nextTask' ? 1 : -1)];
        if (!next) return true;
        next.focus({ preventScroll: true });
        next.scrollIntoView({ block: 'nearest' });
        return true;
      }
      default:
        return false;
    }
  };
  const setNode = useCallback(
    (node: unknown) => {
      nodeRef?.(node);
      cleanupKeys.current?.();
      cleanupKeys.current = null;
      const el = node as HTMLElement | null;
      if (!el || typeof el.addEventListener !== 'function') return;
      el.tabIndex = 0;
      el.setAttribute('data-card-focus', '1');
      ensureFocusRingStyle();
      cardEl.current = el;
      const onKey = (e: KeyboardEvent) => {
        const action = cardKeyAction({
          key: e.key,
          onCardItself: e.target === el,
          editable: isEditableTarget(e.target),
          expanded: expandedRef.current,
          modified: e.ctrlKey || e.metaKey || e.altKey || e.shiftKey,
        });
        if (action) {
          e.preventDefault();
          e.stopPropagation();
          setExpanded(action === 'toggle' ? !expandedRef.current : false);
          return;
        }
        // The shortcut registry (lib/shortcuts.ts): never while typing, never
        // while a popover is open, never a held key (except the arrows).
        if (e.repeat && !e.key.startsWith('Arrow')) return;
        const sc = shortcutFor(e, { typing: isEditableTarget(e.target), blocked: isPopoverOpen(), scope: 'card' });
        if (!sc) return;
        const handled = runCardShortcut(sc, el);
        if (handled) {
          e.preventDefault();
          e.stopPropagation();
        }
      };
      el.addEventListener('keydown', onKey);
      // The quiet controls show while the keyboard is anywhere inside the card.
      const onIn = () => setFocusWithin(true);
      const onOut = (e: FocusEvent) => {
        if (!el.contains(e.relatedTarget as Node | null)) setFocusWithin(false);
      };
      el.addEventListener('focusin', onIn);
      el.addEventListener('focusout', onOut);
      cleanupKeys.current = () => {
        el.removeEventListener('keydown', onKey);
        el.removeEventListener('focusin', onIn);
        el.removeEventListener('focusout', onOut);
      };
    },
    // nodeRef is a cached ref callback per card; re-attaching is harmless.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodeRef],
  );

  const dayOpen = useIsOpen(`${id}:day`);
  const moreOpen = useIsOpen(`${id}:more`);

  const steps = counter(task.subtasks);
  const actualShown = running || (task.actualMinutes ?? 0) > 0;

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
          { backgroundColor: color?.tint ?? CARD_PLAIN },
          task.completed && styles.done,
          dragging && styles.dragging,
          projected && styles.projected,
        ]}
        hoverStyle={styles.hover}
        // Not a button: RN web renders role button as a native <button>, and a
        // field inside a <button> turns a typed Space into a click on it.
        accessibilityLabel={`Task ${task.title}`}
        {...(task.id.startsWith('dump:') || projected ? {} : ({ dataSet: { taskCard: task.id } } as object))}
        {...(projected ? ({ dataSet: { projected: '1' } } as object) : {})}
      >
        {(hovered) => {
          const live = hovered || focusWithin || expanded;
          return (
          <>
            <View style={styles.titleRow}>
              <Pressable
                onPress={() => wrapped.setCompleted(!task.completed)}
                style={styles.check}
                accessibilityRole="button"
                accessibilityLabel={task.completed ? `Mark ${task.title} incomplete` : `Mark ${task.title} complete`}
              >
                <View style={[styles.box, task.completed && styles.boxDone]}>{task.completed && <Ionicons name="checkmark" size={13} color={Colors.onAccent} />}</View>
              </Pressable>
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
                  style={[styles.title, task.completed && styles.titleDone]}
                  accessibilityLabel={`Title ${task.title}`}
                >
                  {task.emoji ? `${task.emoji} ` : ''}
                  {task.title}
                </Text>
              )}
              <Control id={`${id}:duration`} ctl="duration" a11y={`Duration of ${task.title}: ${clock}${placed ? `, starts ${task.startTime}` : ''}`} style={styles.chip}>
                {(anchor) => (
                  <>
                    <Text style={[styles.chipText, task.durationMinutes === undefined && styles.chipTextMuted]} {...MONO}>
                      {clock}
                    </Text>
                    <Popover id={`${id}:duration`} anchor={anchor} width={272}>
                      <DurationBody task={task} ops={wrapped} done={() => closePopover(true)} />
                    </Popover>
                  </>
                )}
              </Control>
            </View>
            <StreakLine task={task} />

            {running && !projected && <Text style={styles.timerActive}>⏱️ Timer active</Text>}
            {showTime && !projected && (
              <View style={styles.timeSection} accessibilityLabel={`Time of ${task.title}`}>
                <Text style={styles.timeSectionText}>
                  ⏱️ Actual <ActualText task={task} />   ⏳ Estimated {clock}
                </Text>
                <Pressable onPress={() => toggleTimer(task)} style={styles.timeBtn} accessibilityRole="button" accessibilityLabel={running ? `Stop timer for ${task.title}` : `Start timer for ${task.title}`}>
                  <Ionicons name={running ? 'pause' : 'play'} size={12} color={Colors.accentText} />
                  <Text style={styles.timeBtnText}>{running ? 'Stop' : 'Start'}</Text>
                </Pressable>
              </View>
            )}

            {/* What the task carries, as plain text (never a control). */}
            <View style={styles.meta} accessible={false} {...({ dataSet: { cardMeta: '1' } } as object)}>
              {label && (
                <View style={styles.metaItem}>
                  {label.emoji ? <Text style={styles.labelEmoji}>{label.emoji}</Text> : <View style={[styles.dot, { backgroundColor: color?.edge ?? Colors.textSecondary }]} />}
                  <Text style={styles.labelText} numberOfLines={1}>
                    {label.name}
                  </Text>
                </View>
              )}
              {placed && (
                <Text style={styles.metaTime} {...MONO}>
                  {task.startTime}
                </Text>
              )}
              {steps.total > 0 && (
                <View style={styles.metaItem}>
                  <StepsRing done={steps.done} total={steps.total} />
                  <Text style={[styles.counter, steps.done === steps.total && styles.counterDone]} {...MONO}>
                    {subCount}
                  </Text>
                </View>
              )}
              {task.recurrence && <Text style={styles.metaGlyph}>🔁</Text>}
              {bell === 'set' && feats.dueDates && <Text style={styles.metaGlyph}>🔔</Text>}
              {actualShown && !projected && <ActualText task={task} />}
            </View>

            {/* The controls: over the second line while hovered or focused, in the flow when expanded. */}
            <View
              style={[expanded ? styles.controlsInline : [styles.controlsOver, { backgroundColor: color?.tint ?? CARD_PLAIN }], !expanded && !live && !dayOpen && !moreOpen && !deleteArmed && styles.quiet]}
              {...({ dataSet: { cardControls: '1' } } as object)}
            >
              <Control id={`${id}:label`} ctl="label" a11y={label ? `Label: ${label.name}` : 'Select label'} style={styles.labelBtn}>
                {(anchor) => (
                  <>
                    {label ? (
                      label.emoji ? <Text style={styles.labelEmoji}>{label.emoji}</Text> : <View style={[styles.dot, { backgroundColor: color?.edge ?? Colors.textSecondary }]} />
                    ) : (
                      <Text style={styles.labelPlaceholder} numberOfLines={1}>
                        🏷️
                      </Text>
                    )}
                    <Popover id={`${id}:label`} anchor={anchor} width={272}>
                      <LabelBody task={task} ops={wrapped} done={() => closePopover(true)} />
                    </Popover>
                  </>
                )}
              </Control>
              <Pressable onPress={() => setExpanded((e) => !e)} style={styles.iconWithText} accessibilityRole="button" accessibilityLabel={`Subtasks ${subCount}`}>
                <StepsRing done={steps.done} total={steps.total} />
                <Text style={[styles.counter, steps.total > 0 && steps.done === steps.total && styles.counterDone]} {...MONO}>
                  {subCount}
                </Text>
              </Pressable>
              <Control id={`${id}:repeat`} a11y={task.recurrence ? `Repeat: ${repeatText}` : 'Repeat'} style={styles.icon}>
                {(anchor) => (
                  <>
                    <Glyph char="🔁" on={!!task.recurrence} />
                    <Popover id={`${id}:repeat`} anchor={anchor} width={300}>
                      <RepeatBody task={task} ops={wrapped} done={() => closePopover(true)} />
                    </Popover>
                  </>
                )}
              </Control>
              {feats.dueDates && (
                <Control id={`${id}:reminder`} a11y={`Reminder: ${bell === 'default' ? 'default' : bell === 'off' ? 'off' : 'set'}`} style={styles.icon}>
                  {(anchor) => (
                    <>
                      <Glyph char={bell === 'off' ? '🔕' : '🔔'} on={bell === 'set'} />
                      <Popover id={`${id}:reminder`} anchor={anchor} width={240}>
                        <ReminderBody task={task} ops={wrapped} done={() => closePopover(true)} />
                      </Popover>
                    </>
                  )}
                </Control>
              )}
              {!projected && (
                <>
                  <Pressable
                    onPress={() => toggleTimer(task)}
                    style={styles.icon}
                    accessibilityRole="button"
                    accessibilityLabel={running ? `Stop timer for ${task.title}` : `Start timer for ${task.title}`}
                    {...({ dataSet: { ctl: 'timer' } } as object)}
                  >
                    <Ionicons name={running ? 'pause' : 'play'} size={14} color={running ? Colors.accentText : Colors.textSecondary} />
                  </Pressable>
                  {feats.pomodoro && !task.completed && (
                    <Pressable
                      onPress={() => startFocus(task)}
                      style={styles.icon}
                      accessibilityRole="button"
                      accessibilityLabel={`Start a pomodoro on ${task.title}`}
                      {...({ dataSet: { ctl: 'pomodoro' } } as object)}
                    >
                      <Text style={{ fontSize: 13 }}>🍅</Text>
                    </Pressable>
                  )}
                </>
              )}
              <HeaderIcon id={`${id}:day`} glyph="📅" a11y={`Move ${task.title} to day`} shown={!renaming && !projected}>
                {(anchor) => (
                  <Popover id={`${id}:day`} anchor={anchor} width={248}>
                    <MoveToDayBody task={task} ops={wrapped} done={() => closePopover(true)} />
                  </Popover>
                )}
              </HeaderIcon>
              <HeaderIcon id={`${id}:more`} ctl="more" icon="ellipsis-horizontal" a11y={`More actions for ${task.title}`} shown={!renaming}>
                {(anchor) => (
                  <Popover id={`${id}:more`} anchor={anchor} width={236}>
                    <OverflowBody task={task} ops={wrapped} armed={deleteArmed} done={() => closePopover()} />
                  </Popover>
                )}
              </HeaderIcon>
              {!projected && (
                <Control id={`${id}:actual`} ctl="actual" a11y={`Actual time of ${task.title}`} style={styles.actualBtn}>
                    {(anchor) => (
                      <>
                        <ActualText task={task} />
                        <Popover id={`${id}:actual`} anchor={anchor} width={272}>
                          <ActualBody task={task} ops={wrapped} done={() => closePopover(true)} />
                        </Popover>
                      </>
                    )}
                  </Control>
              )}
            </View>

            {expanded && <ExpandedBody task={task} ops={wrapped} cardNode={() => cardEl.current} projected={projected} />}
          </>
          );
        }}
      </HoverPressable>
    </>
  );
}

// The steps of a task as a small ring that fills in sage as they are ticked and
// turns solid with a tick when every one is done (2.26.0). Grey and empty with
// no steps. Web only (a conic gradient on a plain element).
export function StepsRing({ done, total, size = 16 }: { done: number; total: number; size?: number }) {
  const all = total > 0 && done >= total;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const track = 'rgba(38,37,31,0.18)';
  return (
    <div
      aria-hidden="true"
      data-steps-ring={all ? 'done' : total > 0 ? 'part' : 'none'}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        flex: 'none',
        display: 'grid',
        placeItems: 'center',
        background: all ? Colors.accent : `conic-gradient(${Colors.accent} ${pct}%, ${track} 0)`,
      }}
    >
      {all ? (
        <span style={{ color: Colors.onAccent, fontSize: size * 0.62, lineHeight: 1, fontWeight: 800, fontFamily: 'Inter, sans-serif' }}>✓</span>
      ) : (
        <span style={{ width: size - 5, height: size - 5, borderRadius: '50%', background: '#FFFFFF' }} />
      )}
    </div>
  );
}

// The timer and clock figures use Roboto Mono (2.26.0, lib's desktopFonts).
const MONO = { dataSet: { mono: '1' } } as object;
const CARD_PLAIN = '#FFFFFF';

// A small icon button in the title row (calendar, overflow).
function HeaderIcon({
  id,
  icon,
  glyph,
  ctl,
  a11y,
  shown,
  children,
}: {
  id: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  // An emoji, when there is a natural one (build plan section 0, item 9).
  glyph?: string;
  ctl?: string;
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
        {...(ctl ? ({ dataSet: { ctl } } as object) : {})}
      >
        {glyph ? <Text style={styles.glyph}>{glyph}</Text> : <Ionicons name={icon ?? 'ellipsis-horizontal'} size={15} color={Colors.textSecondary} />}
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
  ctl,
  children,
}: {
  id: string;
  a11y: string;
  style: object;
  // Lets the card's keyboard shortcuts find this control.
  ctl?: string;
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
      {...(ctl ? ({ dataSet: { ctl } } as object) : {})}
    >
      {children(get)}
    </Pressable>
  );
}

// A small emoji standing in for an icon: full strength when it carries a value,
// quiet otherwise. Decoration only (the control has its own accessible name).
function Glyph({ char, on }: { char: string; on: boolean }) {
  return (
    <Text style={[styles.glyph, !on && styles.glyphQuiet]} accessible={false}>
      {char}
    </Text>
  );
}

// The actual time on the card: stored minutes, plus the live run while the
// timer is going (this child ticks once a second, the card does not).
function ActualText({ task }: { task: Task }) {
  const running = isTimerRunning(task);
  const now = useNow(running);
  const minutes = shownMinutes(task, now);
  return (
    <Text style={[styles.actualText, minutes === 0 && !running && styles.actualMuted, running && styles.actualRunning]} {...MONO}>
      {formatClock(minutes)}
    </Text>
  );
}

// ---- expanded in place: notes and subtasks ----
function ExpandedBody({ task, ops, cardNode, projected }: { task: Task; ops: TaskOps; cardNode: () => HTMLElement | null; projected?: boolean }) {
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
      {projected && <SeriesNote />}
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

const SHADOW = '0 1px 2px rgba(38,37,31,0.06), 0 2px 6px rgba(38,37,31,0.05)';
const SHADOW_HOVER = '0 2px 4px rgba(38,37,31,0.07), 0 6px 14px rgba(38,37,31,0.09)';

const styles = StyleSheet.create({
  // 2.26.0: the reference's measured card: padding 11 x 12, 12 px corners, a
  // light shadow, no hairline. The list sets the 10 px gap between cards.
  card: { paddingVertical: 11, paddingHorizontal: 12, gap: 6, borderRadius: 12, boxShadow: SHADOW, transitionDuration: '120ms', transitionProperty: 'box-shadow' } as object,
  row: {},
  // Only the shadow changes on hover: nothing moves (real check cp8e).
  hover: { boxShadow: SHADOW_HOVER } as object,
  done: { opacity: 0.72 },
  dragging: { opacity: 0.35 },
  // A projected occurrence reads a little lighter than a stored one.
  projected: { opacity: 0.82 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  check: { paddingTop: 1 },
  box: { width: 18, height: 18, borderRadius: 6, borderWidth: 1.5, borderColor: 'rgba(38,37,31,0.35)', backgroundColor: 'rgba(255,255,255,0.7)', alignItems: 'center', justifyContent: 'center' },
  boxDone: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  title: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '600', color: Colors.textPrimary, minWidth: 0 },
  titleDone: { textDecorationLine: 'line-through', color: Colors.textSecondary },
  renameWrap: { flex: 1, minWidth: 0 },
  titleInput: {
    minWidth: 0,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
    paddingVertical: 0,
    paddingHorizontal: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.accent,
    backgroundColor: Colors.surface,
    outlineWidth: 0,
  },
  headerIcon: { padding: 3, width: 22, height: 22, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  headerIconHidden: { opacity: 0, pointerEvents: 'none' },
  chip: { paddingHorizontal: 7, height: 22, borderRadius: 6, justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.75)' },
  chipText: { fontSize: 11.5, fontWeight: '500', color: Colors.textPrimary },
  startTime: { fontSize: 11.5, fontWeight: '500', color: Colors.textSecondary },
  chipTextMuted: { color: Colors.textSecondary },
  glyph: { fontSize: 13, lineHeight: 18 },
  glyphQuiet: { opacity: 0.45 },
  labelEmoji: { fontSize: 12 },
  timerActive: { fontSize: 11, fontWeight: '600', color: Colors.accentText },
  timeSection: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingVertical: 2 },
  timeSectionText: { fontSize: 12, color: Colors.textPrimary },
  timeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, height: 24, borderRadius: 8, borderWidth: 1, borderColor: Colors.border },
  timeBtnText: { fontSize: 11, color: Colors.accentText },
  actualBtn: { paddingHorizontal: 5, height: 24, borderRadius: 6, justifyContent: 'center' },
  actualText: { fontSize: 11.5, color: Colors.textPrimary },
  actualMuted: { color: Colors.textSecondary },
  actualRunning: { color: Colors.accentText, fontWeight: '700' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 22, paddingLeft: 26, overflow: 'hidden' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 0, flexShrink: 1 },
  metaTime: { fontSize: 11.5, fontWeight: '500', color: Colors.textSecondary },
  metaGlyph: { fontSize: 12 },
  controlsOver: { position: 'absolute', left: 34, right: 6, bottom: 9, height: 26, flexDirection: 'row', alignItems: 'center', gap: 0, borderRadius: 8, overflow: 'hidden' },
  controlsInline: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 2, minHeight: 26, paddingLeft: 22 },
  quiet: { opacity: 0 },
  icon: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 6, flexDirection: 'row' },
  iconWithText: { height: 24, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', borderRadius: 6, flexDirection: 'row', gap: 4 },
  counter: { fontSize: 11.5, fontWeight: '500', color: Colors.textSecondary },
  counterDone: { color: Colors.accentText, fontWeight: '700' },
  controlOpen: { backgroundColor: 'rgba(255,255,255,0.8)' },
  labelBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 24, paddingHorizontal: 4, borderRadius: 6, flexShrink: 1, minWidth: 0 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  labelText: { fontSize: 12, fontWeight: '500', color: Colors.textPrimary, flexShrink: 1 },
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
