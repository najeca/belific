import React, { useCallback, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { formatDuration } from '../../lib/duration';
import { counter } from '../../lib/subtasks';
import { dateKey } from '../../lib/kanban';
import { MUST_DO_MARK, MUST_DO_TIP, isMustDo } from '../../lib/mustDo';
import { BREAK_CUP, BREAK_TAG } from '../../lib/taskKind';
import { tipRef } from './tip';
import { movedCaption, movedCaptionLong, movedFrom } from '../../lib/series';
import { duringCaption, insidePill } from '../../lib/hosting';
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
import { timesLabel } from '../../lib/times';
import StreakLine from './StreakLine';
import { useResolvedTheme, useTint } from './themeStore';
import { THEMES, band, labelTint, radius } from '../../lib/tokens';
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
  during,
  inside,
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
  // 3.10.0: a hosted task's "During Lunch" and a break's "3 inside" (lib/hosting.ts hostIndex).
  during?: string;
  inside?: number;
}) {
  // Ctrl+Delete opens the ⋮ menu already asking "Delete? Yes / No".
  const tint = useTint();
  // 3.32.0: a labelled card has a soft outline of its colour (20 % over the surface) and a 6 px band of it on top.
  const theme = useResolvedTheme();
  const outline = color ? labelTint(color.edge, THEMES[theme].surface) : undefined;
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
    patchDay: (fields) => run(() => ops.patchDay(fields)),
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
      case 'selectLabel':
        return click('label');
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
  // 3.3.0: a day of a repeating task moved on its own says where it came from.
  const moved = movedCaption(task);
  // 3.15.2: the start time lives in the meta line only (with the day when it is shown); the bold figure at the top
  // right is the length, on every card.
  const whenText = [dayText, placed ? timesLabel(task) : null].filter(Boolean).join(' · ');
  const lengthText = formatDuration(task.durationMinutes);
  const isBreak = !!task.cutsBelow;
  const hasLine2 = !!whenText || steps.total > 0 || mustDo || !!moved || !!during || !!inside || isBreak;
  const hasMeta = isBreak || !!whenText || !!listEmoji || !!label || steps.total > 0 || mustDo || !!dayText || !!moved || !!during || !!inside;

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
        // 3.31.0: a Brain Dump row with no label is a quiet raised row (the Motorways mock), not an outlined card.
        variant === 'row' && !color && styles.rowPlain,
        // 3.32.0: the label's strong colour is a band across the top (it was a left edge until 3.31); no label, no band.
        color && { borderColor: outline, paddingTop: 6 + 10 },
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
            {color ? <View pointerEvents="none" style={[styles.band, { backgroundColor: color.edge }]} {...({ dataSet: { cardBand: color.key } } as object)} /> : null}
            <View style={styles.titleRow}>
              <Pressable
                onPress={() => wrapped.setCompleted(!task.completed)}
                style={styles.check}
                accessibilityRole="button"
                accessibilityLabel={task.completed ? `Mark ${task.title} incomplete` : `Mark ${task.title} complete`}
              >
                <View style={[styles.box, task.completed && styles.boxDone]}>{task.completed && <Ionicons name="checkmark" size={14} color={Colors.onAccent} />}</View>
              </Pressable>
              <Text style={[styles.title, task.completed && styles.titleDone]} numberOfLines={3} accessibilityLabel={`Title ${task.title}`}>
                {task.emoji ? `${task.emoji} ` : ''}
                {task.title}
              </Text>
              {lengthText ? (
                <Text
                  style={[styles.chipText, task.completed && styles.chipDone]}
                  accessibilityLabel={`Estimate ${lengthText}`}
                  {...({ dataSet: { cardTime: '1', cardLength: '1' } } as object)}
                >
                  {lengthText}
                </Text>
              ) : null}
            </View>

            {/* Decision 007: the quiet run line on today's card of a repeating task (from 2). */}
            <StreakLine task={task} />

            {hasMeta && (
              // 3.23.0: two lines. Line 1: the list emoji, the label dot and the label name (an ellipsis only when the name
              // truly cannot fit the card). Line 2: the date and time, the host captions, the steps and the must do mark.
              <View style={styles.meta} accessible={false} {...({ dataSet: { cardMeta: '1' } } as object)}>
                {listEmoji || label ? (
                  <View style={[styles.metaLine, { flexWrap: 'nowrap' }]} {...({ dataSet: { cardMetaLine: '1' } } as object)}>
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
                  </View>
                ) : null}
                {hasLine2 ? (
                  <View style={styles.metaLine} {...({ dataSet: { cardMetaLine: '2' } } as object)}>
                    {isBreak && (
                      // 3.27.0: a Break says so on its card (the stored value is cutsBelow).
                      <View style={styles.breakTag} accessibilityLabel={BREAK_TAG} {...({ dataSet: { breakTag: '1' } } as object)}>
                        <Text style={styles.breakTagText}>{`${BREAK_CUP} ${BREAK_TAG}`}</Text>
                      </View>
                    )}
                    {whenText ? (
                      <Text
                        style={styles.metaDay}
                        accessibilityLabel={placed ? `${dayText ? `${dayText}, ` : ''}Starts ${timesLabel(task).replace(/ ✓/g, ' (done)')}` : undefined}
                        {...({ dataSet: { cardDay: '1' } } as object)}
                      >
                        {whenText}
                      </Text>
                    ) : null}
                    {!!inside && (
                      <View style={styles.hostPill} accessibilityLabel={`${insidePill(inside)} this break`} {...({ dataSet: { hostPill: String(inside) } } as object)}>
                        <Text style={styles.hostPillText}>{insidePill(inside)}</Text>
                      </View>
                    )}
                    {during && (
                      <Text style={styles.hostCaption} numberOfLines={1} {...({ dataSet: { hostCaption: during } } as object)}>
                        {duringCaption(during)}
                      </Text>
                    )}
                    {moved && (
                      <Text
                        ref={tipRef(movedCaptionLong(task)) as never}
                        style={styles.metaNote}
                        accessibilityLabel={movedCaptionLong(task)}
                        {...({ dataSet: { movedFrom: movedFrom(task) } } as object)}
                      >
                        ↪ {moved}
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
                ) : null}
              </View>
            )}

            {/* At most three icons, over the top right corner in the card's own colour. */}
            <View style={[styles.icons, { backgroundColor: (color ? tint(color) : variant === 'row' ? Colors.surfaceRaised : CARD_PLAIN) }, color && { top: 8 + band.card }, !iconsShown && styles.quiet]} {...({ dataSet: { cardControls: '1' } } as object)}>
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
  card: { paddingVertical: 12, paddingHorizontal: 14, gap: 8, borderRadius: radius.card, borderWidth: 2, borderColor: Colors.border, overflow: 'hidden', transitionDuration: '120ms', transitionProperty: 'border-color', cursor: 'pointer' } as object,
  hover: { borderColor: Colors.borderStrong } as object,
  rowPlain: { backgroundColor: Colors.surfaceRaised, borderColor: Colors.surfaceRaised, borderRadius: radius.lg } as object,
  band: { position: 'absolute', top: 0, left: 0, right: 0, height: band.card, borderTopLeftRadius: radius.card - 2, borderTopRightRadius: radius.card - 2 } as object,
  done: {},
  dragging: { opacity: 0.35 },
  projected: { opacity: 0.82 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  check: { paddingTop: 1 },
  box: { ...checkRing(20) } as object,
  boxDone: { ...checkRingDone },
  title: { flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '700', color: Colors.textPrimary, minWidth: 0 },
  titleDone: { textDecorationLine: 'line-through', color: Colors.textSecondary },
  chipText: { fontSize: 13, lineHeight: 20, fontWeight: '800', color: Colors.textPrimary, paddingHorizontal: 7, borderRadius: radius.square, backgroundColor: Colors.chip, overflow: 'hidden' } as object,
  chipTextMuted: { color: Colors.textSecondary },
  chipDone: { color: Colors.textTertiary },
  meta: { gap: 2, paddingLeft: 30, minHeight: 20 },
  metaLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 8, rowGap: 2, minHeight: 20, minWidth: 0 },
  // The day and time: bold, in the text colour (the label name beside it is the quiet grey).
  metaDay: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  metaNote: { fontSize: 13, fontWeight: '500', color: Colors.textSecondary },
  breakTag: { height: 20, paddingHorizontal: 7, borderRadius: radius.square, backgroundColor: Colors.surfaceRaised, justifyContent: 'center' },
  breakTagText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  hostPill: { height: 20, paddingHorizontal: 8, borderRadius: 10, backgroundColor: Colors.hostPill, justifyContent: 'center' },
  hostPillText: { fontSize: 12, fontWeight: '700', color: Colors.onHostPill },
  hostCaption: { fontSize: 13, fontWeight: '600', color: Colors.onHostPill, flexShrink: 1 },
  listEmoji: { fontSize: 13, lineHeight: 18 },
  // A label is a coloured dot and its name, not a filled chip.
  labelChip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 20, flexShrink: 1, minWidth: 0 },
  labelChipText: { fontSize: 13, fontWeight: '500', color: Colors.textSecondary, flexShrink: 1 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  ringBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 20, paddingRight: 2 },
  counter: { fontSize: 13, fontWeight: '500', color: Colors.textSecondary },
  counterDone: { color: Colors.accentText, fontWeight: '700' },
  mustDo: { fontSize: 12, lineHeight: 16, color: Colors.textPrimary },
  icons: { position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: 8, paddingLeft: 4 },
  quiet: { opacity: 0, pointerEvents: 'none' } as object,
  icon: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  iconOpen: { backgroundColor: Colors.chipStrong },
  glyph: { fontSize: 13, lineHeight: 18, color: Colors.textPrimary },
});
