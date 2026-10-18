import React, { useCallback, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { formatClock } from '../../lib/duration';
import { counter } from '../../lib/subtasks';
import { dateKey } from '../../lib/kanban';
import { isMustDo } from '../../lib/mustDo';
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
import StreakLine from './StreakLine';

// A task on the board, in the left list, or in any list (2.27.0). The card is a
// face, not an editor: a click anywhere on it (except the tick box and the steps
// ring) opens the task details modal, the same in every view; there is no
// expanding in place and no row of controls. The face shows the tick, the emoji
// and title, the time (or the estimate), the label's colour and emoji, the steps
// ring when there are steps, and a small Must do marker (plus, on today's card
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
}) {
  // Ctrl+Delete opens the ⋮ menu already asking "Delete? Yes / No".
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
  const canMoveToday = !projected && !task.completed && task.dueDate !== todayKey;
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
  const hasMeta = !!label || steps.total > 0 || mustDo || !!dayText;

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
        { backgroundColor: color?.tint ?? CARD_PLAIN },
        task.completed && styles.done,
        dragging && styles.dragging,
        projected && styles.projected,
      ]}
      hoverStyle={styles.hover}
      // Not a button: RN web renders role button as a native <button>, and a
      // field inside a <button> turns a typed Space into a click on it.
      accessibilityLabel={`Task ${task.title}`}
      accessibilityHint={[label ? `Label ${label.name}` : '', mustDo ? 'Must do' : ''].filter(Boolean).join(', ') || undefined}
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
                <View style={[styles.box, task.completed && styles.boxDone]}>{task.completed && <Ionicons name="checkmark" size={13} color={Colors.onAccent} />}</View>
              </Pressable>
              <Text style={[styles.title, task.completed && styles.titleDone]} numberOfLines={3} accessibilityLabel={`Title ${task.title}`}>
                {task.emoji ? `${task.emoji} ` : ''}
                {task.title}
              </Text>
              <Text
                style={[styles.chipText, !placed && task.durationMinutes === undefined && styles.chipTextMuted]}
                accessibilityLabel={placed ? `Starts ${task.startTime}` : `Estimate ${formatClock(task.durationMinutes)}`}
                {...MONO}
                {...({ dataSet: { cardTime: '1', mono: '1' } } as object)}
              >
                {placed ? task.startTime : formatClock(task.durationMinutes)}
              </Text>
            </View>

            {/* Decision 007: the quiet run line on today's card of a repeating task (from 2). */}
            <StreakLine task={task} />

            {hasMeta && (
              <View style={styles.meta} accessible={false} {...({ dataSet: { cardMeta: '1' } } as object)}>
                {label && (label.emoji ? <Text style={styles.labelEmoji}>{label.emoji}</Text> : <View style={[styles.dot, { backgroundColor: color?.edge ?? Colors.textSecondary }]} />)}
                {dayText && (
                  <Text style={styles.metaDay} {...({ dataSet: { cardDay: '1' } } as object)}>
                    {dayText}
                    {placed ? ` · ${task.startTime}` : ''}
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
                  <Text style={styles.mustDo} {...({ dataSet: { mustDo: '1' } } as object)}>
                    Must do
                  </Text>
                )}
              </View>
            )}

            {/* At most three icons, over the top right corner in the card's own colour. */}
            <View style={[styles.icons, { backgroundColor: color?.tint ?? CARD_PLAIN }, !iconsShown && styles.quiet]} {...({ dataSet: { cardControls: '1' } } as object)}>
              <IconControl id={`${id}:label`} ctl="label" a11y={label ? `Label: ${label.name}` : 'Select label'} shown={iconsShown} glyph="🏷️">
                {(anchor) => (
                  <Popover id={`${id}:label`} anchor={anchor} width={272}>
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

const SHADOW = '0 1px 2px rgba(38,37,31,0.06), 0 2px 6px rgba(38,37,31,0.05)';
const SHADOW_HOVER = '0 2px 4px rgba(38,37,31,0.07), 0 6px 14px rgba(38,37,31,0.09)';

const styles = StyleSheet.create({
  card: { paddingVertical: 11, paddingHorizontal: 12, gap: 6, borderRadius: 12, boxShadow: SHADOW, transitionDuration: '120ms', transitionProperty: 'box-shadow', cursor: 'pointer' } as object,
  // Only the shadow changes on hover: nothing moves (real check cp8e).
  hover: { boxShadow: SHADOW_HOVER } as object,
  done: { opacity: 0.72 },
  dragging: { opacity: 0.35 },
  projected: { opacity: 0.82 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  check: { paddingTop: 1 },
  box: { width: 18, height: 18, borderRadius: 6, borderWidth: 1.5, borderColor: 'rgba(38,37,31,0.35)', backgroundColor: 'rgba(255,255,255,0.7)', alignItems: 'center', justifyContent: 'center' },
  boxDone: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  title: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '600', color: Colors.textPrimary, minWidth: 0 },
  titleDone: { textDecorationLine: 'line-through', color: Colors.textSecondary },
  chipText: { fontSize: 11.5, lineHeight: 20, fontWeight: '500', color: Colors.textPrimary, paddingHorizontal: 6, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.75)' },
  chipTextMuted: { color: Colors.textSecondary },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 20, paddingLeft: 26, overflow: 'hidden' },
  metaDay: { fontSize: 11.5, fontWeight: '500', color: Colors.textSecondary },
  labelEmoji: { fontSize: 12 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  ringBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 20, paddingRight: 2 },
  counter: { fontSize: 11.5, fontWeight: '500', color: Colors.textSecondary },
  counterDone: { color: Colors.accentText, fontWeight: '700' },
  mustDo: { fontSize: 10.5, fontWeight: '700', color: Colors.accentText, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5, borderWidth: 1, borderColor: Colors.accentText },
  icons: { position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: 8, paddingLeft: 4 },
  quiet: { opacity: 0, pointerEvents: 'none' } as object,
  icon: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center', borderRadius: 7 },
  iconOpen: { backgroundColor: 'rgba(255,255,255,0.85)' },
  glyph: { fontSize: 13, lineHeight: 18 },
});
