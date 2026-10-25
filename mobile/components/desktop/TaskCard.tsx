import React, { useCallback, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { formatClock } from '../../lib/duration';
import { counter } from '../../lib/subtasks';
import { dateKey } from '../../lib/kanban';
import { MUST_DO_MARK, MUST_DO_TIP, isMustDo } from '../../lib/mustDo';
import { tipRef } from './tip';
import type { LabelColor } from '../../lib/labelColors';
import type { Project, Task } from '../../lib/types';
import { isEditableTarget } from '../../lib/editable';
import { cardKeyAction } from '../../lib/cardKeys';
import { shortcutFor } from '../../lib/shortcuts';
import { duplicateTaskById } from '../../lib/taskCommands';
import { ensureFocusRingStyle } from './focusRing';
import HoverPressable from './HoverPressable';
import Popover, { togglePopover, useIsOpen, usePopoverAnchor, closePopover, isPopoverOpen } from './Popover';
import { LabelBody, OverflowBody } from './TaskPopovers';
import type { TaskOps } from './taskOps';
import { notifyChanged, openDetail, type DetailFocus } from './uiStore';
import { toggleTimer } from './timerUi';
import { timesLabel } from '../../lib/times';
import StreakLine from './StreakLine';
import { useTint } from './themeStore';
import { checkRing, checkRingDone } from './ui';

// A task on the board, in the left list, or in any list (2.27.0). The card is a
// face, not an editor: a click anywhere on it (except the tick box and the steps
// ring) opens the task details modal, the same in every view; there is no
// expanding in place and no row of controls. The face shows the tick, the emoji
// and title, the time (or the estimate), the list's emoji and the label as a
// coloured chip (2.27.1), the steps ring when there are steps, and a small Must do marker (plus, on today's card
// of a repeating task, decision 007's quiet run line). On hover (or with the
// keyboard inside) at most three small icons show at the top right: Label, Move
// to today and the ⋮ menu. Everything else is in the modal and the ⋮ menu.
// Drag works from anywhere on the card that is not a button.
// 2.26.0 look kept: the label's tint (white with no label), 12 px corners, a
// light shadow that deepens on hover, padding 11 x 12.
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
  projected,
  onOpen,
  showDay,
  listEmoji,
}: {
  task: Task;
  ops: TaskOps;
  label?: Project;
  color?: LabelColor;
  // 'card' on the board, 'row' in the left list.
  variant: 'card' | 'row';
  todayKey: string;
  onChanged: () => void;
  nodeRef?: (node: unknown) => void;
  dragging?: boolean;
  divider?: boolean;
  // A projected occurrence of a repeating series (decision 023): not stored,
  // lighter, edits apply to every day, ticking stores that day.
  projected?: boolean;
  // Opens the details another way (a legacy phone item is converted first).
  onOpen?: (focus?: DetailFocus) => void;
  // A list shows the day of a scheduled task on its card (2.27.0, item 4).
  showDay?: boolean;
  // The emoji of the task's list (2.27.1), first on the meta line; none when the
  // task has no list or its list has no emoji.
  listEmoji?: string;
}) {
  // Ctrl+Delete opens the ⋮ menu already asking "Delete? Yes / No".
  const tint = useTint();
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);

  // Applies an edit, then refreshes the panes.
  const run = useCallback(
    <T,>(fn: () => Promise<T>) =>
      fn().then((r) => {
        onChanged();
        return r;
      }),
    [onChanged],
  );
  const wrapped: TaskOps = {
    patch: (fields) => run(() => ops.patch(fields)),
    setCompleted: (d) => run(() => ops.setCompleted(d)),
    setTimeDone: (time, d) => run(() => ops.setTimeDone(time, d)),
    toggleSubtask: (sid) => run(() => ops.toggleSubtask(sid)),
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
  const placed = !!task.dueDate && !!task.startTime;
  const steps = counter(task.subtasks);
  const mustDo = isMustDo(task);
  // A projected day moves that day only (3.2.0, taskOps), like a stored one.
  const canMoveToday = !task.completed && task.dueDate !== todayKey;
  const open = (focus: DetailFocus = 'title') => (onOpen ? onOpen(focus) : openDetail(id, focus));
  const openRef = useRef(open);
  openRef.current = open;

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
      case 'openDetails':
      case 'toggleSubtasks':
      case 'toggleTimeSection':
        openRef.current('title');
        return true;
      case 'newSubtask':
        openRef.current('subtask');
        return true;
      case 'editEstimate':
        openRef.current('estimate');
        return true;
      case 'editActual':
        if (proj) return false;
        openRef.current('actual');
        return true;
      case 'selectLabel':
        return click('label');
      case 'toggleTimer':
        toggleTimer(t);
        return true;
      case 'duplicateTask':
        if (proj || t.id.startsWith('dump:')) return false;
        duplicateTaskById(t.id).then(() => notifyChanged());
        return true;
      case 'deleteTask':
        setDeleteArmed(true);
        return click('more');
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
  const cleanupKeys = useRef<(() => void) | null>(null);
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
      const onKey = (e: KeyboardEvent) => {
        const action = cardKeyAction({
          key: e.key,
          onCardItself: e.target === el,
          editable: isEditableTarget(e.target),
          modified: e.ctrlKey || e.metaKey || e.altKey || e.shiftKey,
        });
        if (action === 'open') {
          e.preventDefault();
          e.stopPropagation();
          openRef.current('title');
          return;
        }
        // The shortcut registry (lib/shortcuts.ts): never while typing, never
        // while a popover is open, never a held key (except the arrows).
        if (e.repeat && !e.key.startsWith('Arrow')) return;
        const sc = shortcutFor(e, { typing: isEditableTarget(e.target), blocked: isPopoverOpen(), scope: 'card' });
        if (!sc) return;
        if (runCardShortcut(sc, el)) {
          e.preventDefault();
          e.stopPropagation();
        }
      };
      el.addEventListener('keydown', onKey);
      // The hover icons also show while the keyboard is anywhere inside the card.
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

  const labelOpen = useIsOpen(`${id}:label`);
  const moreOpen = useIsOpen(`${id}:more`);
  const dayText = showDay && task.dueDate ? dayLabel(task.dueDate, todayKey) : null;
  const hasMeta = !!listEmoji || !!label || steps.total > 0 || mustDo || !!dayText;

  return (
    <HoverPressable
      nodeRef={setNode}
      onPress={(e) => {
        const target = (e as { target?: unknown } | undefined)?.target;
        if (isEditableTarget(target)) return;
        open('title');
      }}
      style={[
        styles.card,
        { backgroundColor: (color ? tint(color) : CARD_PLAIN) },
        // 2.27.0: the label's strong colour as a left edge, so labels are easy to
        // tell apart (the tints stay light for readable text).
        color && { borderLeftWidth: 3, borderLeftColor: color.edge, paddingLeft: 9 },
        task.completed && styles.done,
        dragging && styles.dragging,
        projected && styles.projected,
      ]}
      hoverStyle={styles.hover}
      // Not a button: RN web renders role button as a native <button>, and a
      // field inside a <button> turns a typed Space into a click on it.
      accessibilityLabel={`Task ${task.title}`}
      accessibilityHint={[label ? `Label ${label.name}` : '', mustDo ? MUST_DO_TIP : ''].filter(Boolean).join(', ') || undefined}
      {...(task.id.startsWith('dump:') || projected ? {} : ({ dataSet: { taskCard: task.id } } as object))}
      {...(projected ? ({ dataSet: { projected: '1' } } as object) : {})}
    >
      {(hovered) => {
        const iconsShown = hovered || focusWithin || labelOpen || moreOpen || deleteArmed;
        return (
          <>
            <View style={styles.titleRow}>
              <Pressable
                onPress={() => wrapped.setCompleted(!task.completed)}
                style={styles.check}
                accessibilityRole="button"
                accessibilityLabel={task.completed ? `Mark ${task.title} incomplete` : `Mark ${task.title} complete`}
              >
                <View style={[styles.box, task.completed && styles.boxDone]}>{task.completed && <Ionicons name="checkmark" size={13} color={Colors.success} />}</View>
              </Pressable>
              <Text style={[styles.title, task.completed && styles.titleDone]} numberOfLines={3} accessibilityLabel={`Title ${task.title}`}>
                {task.emoji ? `${task.emoji} ` : ''}
                {task.title}
              </Text>
              <Text
                style={[styles.chipText, !placed && task.durationMinutes === undefined && styles.chipTextMuted, task.completed && styles.chipDone]}
                accessibilityLabel={placed ? `Starts ${timesLabel(task).replace(/ ✓/g, ' (done)')}` : `Estimate ${formatClock(task.durationMinutes)}`}
                {...MONO}
                {...({ dataSet: { cardTime: '1', mono: '1' } } as object)}
              >
                {placed ? timesLabel(task) : formatClock(task.durationMinutes)}
              </Text>
            </View>

            {/* Decision 007: the quiet run line on today's card of a repeating task (from 2). */}
            <StreakLine task={task} />

            {hasMeta && (
              <View style={styles.meta} accessible={false} {...({ dataSet: { cardMeta: '1' } } as object)}>
                {listEmoji ? (
                  <Text style={styles.listEmoji} accessibilityLabel="List emoji" {...({ dataSet: { cardListEmoji: '1' } } as object)}>
                    {listEmoji}
                  </Text>
                ) : null}
                {label && (
                  // The label as a coloured chip: its colour, its emoji and its name.
                  <View style={styles.labelChip} {...({ dataSet: { cardLabel: label.key } } as object)}>
                    <View style={[styles.dot, { backgroundColor: color?.edge ?? Colors.textSecondary }]} />
                    <Text style={styles.labelChipText} numberOfLines={1}>
                      {label.emoji ? `${label.emoji} ` : ''}
                      {label.name}
                    </Text>
                  </View>
                )}
                {dayText && (
                  <Text style={styles.metaDay} {...({ dataSet: { cardDay: '1' } } as object)}>
                    {dayText}
                    {placed ? ` · ${timesLabel(task)}` : ''}
                  </Text>
                )}
                {steps.total > 0 && (
                  // The ring ticks the next open step (the modal has the list).
                  <Pressable
                    onPress={() => {
                      const next = (task.subtasks ?? []).find((s) => !s.done);
                      if (next) wrapped.toggleSubtask(next.id);
                      else open('subtask');
                    }}
                    style={styles.ringBtn}
                    accessibilityRole="button"
                    accessibilityLabel={`Steps ${steps.done} of ${steps.total}${steps.done < steps.total ? ', tick the next step' : ''}`}
                    {...({ dataSet: { ctl: 'steps' } } as object)}
                  >
                    <StepsRing done={steps.done} total={steps.total} />
                    <Text style={[styles.counter, steps.done === steps.total && styles.counterDone]} {...MONO}>
                      {steps.done}/{steps.total}
                    </Text>
                  </Pressable>
                )}
                {mustDo && (
                  <Text
                    ref={tipRef(MUST_DO_TIP) as never}
                    style={styles.mustDo}
                    accessibilityLabel={MUST_DO_TIP}
                    {...({ dataSet: { mustDo: '1' }, 'aria-label': MUST_DO_TIP } as object)}
                  >
                    {MUST_DO_MARK}
                  </Text>
                )}
              </View>
            )}

            {/* At most three icons, over the top right corner in the card's own colour. */}
            <View style={[styles.icons, { backgroundColor: (color ? tint(color) : CARD_PLAIN) }, !iconsShown && styles.quiet]} {...({ dataSet: { cardControls: '1' } } as object)}>
              <IconControl id={`${id}:label`} ctl="label" a11y={label ? `Label: ${label.name}` : 'Select label'} shown={iconsShown} glyph="🏷️">
                {(anchor) => (
                  <Popover id={`${id}:label`} anchor={anchor} width={284} maxHeight={540}>
                    <LabelBody task={task} ops={wrapped} done={() => closePopover(true)} />
                  </Popover>
                )}
              </IconControl>
              {canMoveToday && (
                <Pressable
                  onPress={() => wrapped.patch({ dueDate: dateKey(new Date()) })}
                  style={styles.icon}
                  focusable={iconsShown}
                  accessibilityRole="button"
                  accessibilityLabel={`Move ${task.title} to today`}
                  {...({ dataSet: { ctl: 'today' } } as object)}
                >
                  <Text style={styles.glyph}>☀️</Text>
                </Pressable>
              )}
              <IconControl id={`${id}:more`} ctl="more" a11y={`More actions for ${task.title}`} shown={iconsShown} icon="ellipsis-vertical">
                {(anchor) => (
                  <Popover id={`${id}:more`} anchor={anchor} width={248}>
                    <OverflowBody task={task} ops={wrapped} armed={deleteArmed} projected={projected} onOpen={() => open('title')} done={() => (setDeleteArmed(false), closePopover())} />
                  </Popover>
                )}
              </IconControl>
            </View>
          </>
        );
      }}
    </HoverPressable>
  );
}

// "Today", "Tomorrow", "Mon 19 Oct": the day of a scheduled task in a list.
function dayLabel(day: string, todayKey: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const [ty, tm, td] = todayKey.split('-').map(Number);
  const diff = Math.round((date.getTime() - new Date(ty, tm - 1, td).getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

// The steps of a task as a small ring that fills in sage as they are ticked and
// turns solid with a tick when every one is done (2.26.0). Web only (a conic
// gradient on a plain element).
export function StepsRing({ done, total, size = 16 }: { done: number; total: number; size?: number }) {
  const all = total > 0 && done >= total;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const track = Colors.trackLine;
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
        <span style={{ width: size - 5, height: size - 5, borderRadius: '50%', background: Colors.surface }} />
      )}
    </div>
  );
}

// The timer and clock figures use Roboto Mono (2.26.0, lib's desktopFonts).
const MONO = { dataSet: { mono: '1' } } as object;
const CARD_PLAIN = Colors.plainBlock;

// A small icon that opens its popover (rendered by `children`, in a portal).
// Hidden, it keeps its place but is transparent and out of the tab order.
function IconControl({
  id,
  ctl,
  a11y,
  shown,
  glyph,
  icon,
  children,
}: {
  id: string;
  ctl: string;
  a11y: string;
  shown: boolean;
  glyph?: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  children: (anchor: () => HTMLElement | null) => React.ReactNode;
}) {
  const { ref, get } = usePopoverAnchor();
  const open = useIsOpen(id);
  return (
    <>
      <Pressable
        ref={ref as never}
        onPress={() => togglePopover(id, get)}
        style={[styles.icon, open && styles.iconOpen]}
        focusable={shown}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={a11y}
        {...({ dataSet: { ctl } } as object)}
      >
        {glyph ? <Text style={styles.glyph}>{glyph}</Text> : <Ionicons name={icon ?? 'ellipsis-vertical'} size={14} color={Colors.textSecondary} />}
      </Pressable>
      {children(get)}
    </>
  );
}

const styles = StyleSheet.create({
  // Flat and raised: a 1px outline, no shadow (the Ellie look). Hover only changes the outline's colour: nothing moves (real check cp8e).
  card: { paddingVertical: 11, paddingHorizontal: 12, gap: 6, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, transitionDuration: '120ms', transitionProperty: 'border-color', cursor: 'pointer' } as object,
  hover: { borderColor: Colors.borderStrong } as object,
  done: { opacity: 0.72 },
  dragging: { opacity: 0.35 },
  projected: { opacity: 0.82 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  check: { paddingTop: 1 },
  box: { ...checkRing(18), borderColor: Colors.trackLine } as object,
  boxDone: { ...checkRingDone },
  title: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '600', color: Colors.textPrimary, minWidth: 0 },
  titleDone: { textDecorationLine: 'line-through', color: Colors.textSecondary },
  chipText: { fontSize: 11.5, lineHeight: 20, fontWeight: '600', color: Colors.textPrimary, paddingHorizontal: 7, borderRadius: 6, backgroundColor: Colors.chip, overflow: 'hidden' } as object,
  chipTextMuted: { color: Colors.textSecondary },
  chipDone: { color: Colors.textTertiary },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 20, paddingLeft: 26, overflow: 'hidden' },
  metaDay: { fontSize: 11.5, fontWeight: '500', color: Colors.textSecondary },
  listEmoji: { fontSize: 11, lineHeight: 16 },
  // A label is a coloured dot and its name, not a filled chip.
  labelChip: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 18, maxWidth: 150, flexShrink: 1 },
  labelChipText: { fontSize: 11.5, fontWeight: '500', color: Colors.textSecondary, flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  ringBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 20, paddingRight: 2 },
  counter: { fontSize: 11.5, fontWeight: '500', color: Colors.textSecondary },
  counterDone: { color: Colors.accentText, fontWeight: '700' },
  mustDo: { fontSize: 12, lineHeight: 16, color: Colors.textPrimary },
  icons: { position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: 8, paddingLeft: 4 },
  quiet: { opacity: 0, pointerEvents: 'none' } as object,
  icon: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  iconOpen: { backgroundColor: Colors.chipStrong },
  glyph: { fontSize: 13, lineHeight: 18, color: Colors.textPrimary },
});
