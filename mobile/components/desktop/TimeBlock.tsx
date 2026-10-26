import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { formatTime } from '../../lib/data';
import { formatDuration } from '../../lib/duration';
import { toMinutes, toTime, blockHeightPx, COMPACT_BLOCK_PX } from '../../lib/timebox';
import { chipPlan } from '../../lib/hosting';
import { BLOCK_DROP_ORDER, blockPlan } from '../../lib/blockLayout';
import { pieceTimeText, type CutPiece } from '../../lib/cuts';
import { nudgeBlock, slotLabel, taskDuration, yToMinutes, type BlockNudge } from '../../lib/drag';
import { moveTimeFields } from '../../lib/times';
import { dateKey } from '../../lib/kanban';
import { shortcutFor } from '../../lib/shortcuts';
import { updateTask } from '../../lib/storage';
import { editRepeatingTime, moveDay } from '../../lib/seriesActions';
import { withoutDay } from '../../lib/taskOps';
import { movedCaption, movedCaptionLong, movedFrom } from '../../lib/series';
import type { LabelColor } from '../../lib/labelColors';
import type { Project, Task } from '../../lib/types';
import { domNode, useDrag } from './DragProvider';
import { isPopoverOpen } from './Popover';
import { openDetail } from './uiStore';
import { isLate } from '../../lib/lateTasks';
import { tipRef } from './tip';
import PriorityMark from './PriorityMark';
import ListEmoji from './ListEmoji';
import { isMustDo } from '../../lib/mustDo';
import { useTint } from './themeStore';
import { useVibrant, vibrantLook, vibrantMeta, vibrantText, VIBRANT_WHITE } from './vibrantStore';
import { HostChip, MoreBadge, hostedTip, type HostedGuest } from './HostChips';

// One placed task on a time grid (2.26.0): the Timebox pane and the Calendar's
// day and week views draw the same block, so they behave the same. A press
// opens the task details modal (2.27.0, as a card does); a drag moves it (DragProvider and lib/drag.ts: 30
// minute steps, never onto a past day; a projected occurrence of a repeating
// series changes the series' time, never its day); the bottom edge resizes
// it (the estimate); with the keyboard on the block, the arrows move it
// (lib/shortcuts.ts, scope 'block'; lib/drag.ts nudgeBlock).
// `scope` tells the places that draw the same task apart (the Timebox has none,
// the Calendar `cal<day>:`), for the menu, the drag source and the anchor.
const KEY_NUDGE: Partial<Record<string, BlockNudge>> = {
  blockEarlier: 'earlier',
  blockLater: 'later',
  blockDayBefore: 'dayBefore',
  blockDayAfter: 'dayAfter',
  blockShorter: 'shorter',
  blockLonger: 'longer',
};

// A break (a task with "Split" on) with no label colour: a neutral grey, no new colour in the palette.
const BREAK_TINT = Colors.breakTint;

export default function TimeBlock({
  task,
  label,
  color,
  projected,
  positioned,
  height,
  continues,
  scope = '',
  a11y,
  gridNode,
  onChanged,
  listEmoji,
  listName,
  fullText,
  piece,
  note,
  badge,
  fullTask,
  time,
  blockSuffix,
  hosted,
}: {
  // A break (3.6.0, lib/hosting.ts): the tasks fully inside it, drawn as chips in this block.
  hosted?: HostedGuest[];
  // A task with several times a day (Part C) is drawn once per time: `task` is the single-time copy this
  // block shows, `fullTask` the real task (what a drag, a resize or a key writes), `time` this block's time
  // and `blockSuffix` ('@HH:mm' for every time after the first) tells the blocks of one task apart.
  fullTask?: Task;
  time?: string;
  blockSuffix?: string;
  // "Cut tasks underneath" (Part B): this block is one piece of a task that a break cuts. A press, a
  // drag and the keys act on the whole task; only the last piece has the resize handle and the
  // late button; a later piece shows its start and the time left instead of the full length.
  piece?: CutPiece;
  // Why a break could not cut: the whole sentence (lib/cuts.ts refusalNote, in the tooltip) and the
  // short badge drawn on the block.
  note?: string;
  badge?: string;
  // The Calendar (2.28.0): the title wraps over as many lines as it needs, never an ellipsis;
  // a block too short for it clips at the bottom and the hover tooltip has all of it.
  fullText?: boolean;
  // The emoji of the task's list (2.27.1), on the time line of a block tall enough for it.
  listEmoji?: string;
  // The list's name: the tooltip of its emoji.
  listName?: string;
  task: Task;
  label?: Project;
  color?: LabelColor;
  projected: boolean;
  positioned: object;
  height: number;
  // The task runs past 24:00 (the rest is drawn on the next day).
  continues?: boolean;
  scope?: string;
  a11y: string;
  gridNode: () => HTMLElement | null;
  onChanged: () => void;
}) {
  const { drag, sourceRef, startResize } = useDrag();
  // "Vibrant task colours" (Settings): a saturated block with bold white text; null = as before.
  const tint = useTint();
  const look = vibrantLook(useVibrant(), color, !!task.cutsBelow);
  const vt = look ? vibrantText : undefined;
  const vm = look ? vibrantMeta : undefined;
  const resizing = drag?.mode === 'resize' && drag.item.id === task.id && drag.item.scope === scope ? drag.resizeDuration : undefined;
  const lifted = drag?.mode === 'move' && drag.item.id === task.id && drag.item.time === time;
  const startMin = toMinutes(task.startTime) ?? 0;
  const lastPiece = !piece || piece.last;
  const headPiece = !piece || piece.head;
  // Pieces after the first get their own block key, so the first keeps the task's (tests and focus).
  const blockKey = `${task.id}${blockSuffix ?? ''}${piece && piece.index > 0 ? `~${piece.index + 1}` : ''}`;
  const [fit, setFit] = useState({ key: '', dropped: 0 });
  const [boxW, setBoxW] = useState(0);
  const titleEl = useRef<HTMLElement | null>(null);
  const metaEl = useRef<HTMLElement | null>(null);
  const live = useRef({ task, projected, full: fullTask, time });
  live.current = { task, projected, full: fullTask, time };

  const dragRef = sourceRef(`block:${scope}${task.id}${blockSuffix ?? ''}`, (e) => {
    const grid = gridNode();
    const start = toMinutes(live.current.task.startTime);
    if (!grid || start === null) return null;
    return {
      kind: 'block',
      task: live.current.full ?? live.current.task,
      ...(live.current.time ? { time: live.current.time } : {}),
      id: live.current.task.id,
      title: live.current.task.title,
      emoji: live.current.task.emoji,
      duration: taskDuration(live.current.task),
      projected: live.current.projected,
      scope,
      grabOffsetMin: yToMinutes(e.clientY, grid.getBoundingClientRect().top) - start,
    };
  });

  // The block's own keys: the arrows move it (never while a menu is open).
  const keysCleanup = useRef<(() => void) | null>(null);
  const elRef = useRef<HTMLElement | null>(null);
  // The Calendar's hover tooltip holds the whole block, kept current as the task changes.
  // A block too short to show everything has the same tooltip (2.47.0).
  // A break with tasks during it always has one: it lists them all.
  const hostTip = hostedTip(hosted ?? []);
  const tipped = !!fullText || blockPlan(height).tier !== 3 || !!hostTip;
  useEffect(() => {
    if (tipped) tipRef(blockTip(task, piece, note, hostTip))(elRef.current);
  }, [tipped, task.id, task.dueDate, task.title, task.emoji, task.startTime, task.durationMinutes, task.recurrence, piece, note, hostTip]);
  // The block's width decides which parts still fit.
  useEffect(() => {
    const el = elRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setBoxW(Math.round(el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const blockRef = useCallback(
    (instance: unknown) => {
      dragRef(instance);
      keysCleanup.current?.();
      keysCleanup.current = null;
      const el = domNode(instance);
      elRef.current = el;
      if (tipped) tipRef(blockTip(live.current.task, piece, note, hostTip))(el);
      if (!el) return;
      const onKey = (e: KeyboardEvent) => {
        if (e.target !== el || e.repeat) return;
        const sc = shortcutFor(e, { typing: false, blocked: isPopoverOpen(), scope: 'block' });
        const nudge = sc ? KEY_NUDGE[sc] : undefined;
        if (!nudge) return;
        e.preventDefault();
        e.stopPropagation();
        const { task: shown, full, time: at, projected: proj } = live.current;
        // The real task is what is written; a block of several times moves only its own time.
        const t = full ?? shown;
        let patch: Partial<Task> | null = nudgeBlock(shown, nudge, dateKey(new Date()), proj);
        if (at && patch && patch.startTime) {
          const moved = moveTimeFields(t, at, patch.startTime);
          patch = moved.ok ? moved.fields : null;
        } else if (at && patch && patch.dueDate) {
          patch = { dueDate: patch.dueDate };
        }
        if (!patch || Object.keys(patch).length === 0) return;
        // 3.2.0: a new day for a day of a repeating task moves that day only.
        // 3.4.0: a new time or length for it asks This day only / All days.
        const done = t.recurrence
          ? patch.dueDate
            ? moveDay(t, patch.dueDate, withoutDay(patch))
            : editRepeatingTime(t, !!proj, patch)
          : updateTask({ ...t, ...patch });
        Promise.resolve(done).then(() => {
          onChanged();
          // The block is drawn again (maybe in another column): put the keyboard back on it.
          setTimeout(() => {
            const key = `${t.id}${blockSuffix ?? ''}`;
            const sel = scope ? `[data-cal-block="${scope.replace(/"/g, '')}${key.replace(/"/g, '')}"]` : `[data-block-id="${key.replace(/"/g, '')}"]`;
            const again = document.querySelector<HTMLElement>(sel) ?? document.querySelector<HTMLElement>(`[data-block-task="${t.id.replace(/"/g, '')}"]`);
            again?.focus();
          }, 120);
        });
      };
      el.addEventListener('keydown', onKey);
      keysCleanup.current = () => el.removeEventListener('keydown', onKey);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dragRef, scope, tipped],
  );

  // The bottom edge: dragging it changes the estimate.
  const handleCleanup = useRef<(() => void) | null>(null);
  const handleRef = useCallback(
    (instance: unknown) => {
      handleCleanup.current?.();
      handleCleanup.current = null;
      const el = domNode(instance);
      if (!el) return;
      const down = (e: PointerEvent) => {
        const grid = gridNode();
        const start = toMinutes(live.current.task.startTime);
        if (!grid || start === null) return;
        startResize(e, live.current.full ?? live.current.task, start, grid, live.current.projected, scope);
      };
      el.style.cursor = 'ns-resize';
      el.addEventListener('pointerdown', down);
      handleCleanup.current = () => el.removeEventListener('pointerdown', down);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [startResize, scope],
  );

  // Late (2.27.0): placed, not done, its end has passed. The block fades. (The on-block "move to the next free
  // slot" button was removed: nothing sits on top of a block's text.)
  // The panes redraw every 30 seconds, so a block turns late on its own.
  const late = isLate(task, new Date(), projected);
  // 3.3.0: a day of a repeating task moved on its own: a line on a tall block, an arrow on a short one.
  const moved = movedCaption(task);
  const movedLong = movedCaptionLong(task);
  const movedArrow = moved ? (
    <Text ref={tipRef(movedLong) as never} style={[styles.movedIcon, vm]} accessibilityLabel={movedLong} {...({ 'aria-label': movedLong, dataSet: { movedIcon: '1' } } as object)}>
      ↪
    </Text>
  ) : null;

  // Resizing a cut task: the last piece follows the handle (its length is the new end less its own start).
  const resizedH = resizing === undefined ? undefined : piece ? blockHeightPx(Math.max(15, startMin + resizing - piece.startMin)) : blockHeightPx(resizing);
  const sized = resizedH !== undefined && lastPiece ? { ...positioned, height: resizedH } : positioned;
  const shownH = resizedH !== undefined && lastPiece ? resizedH : height;
  // What the block shows at this height (lib/blockLayout.ts); the width then takes parts away one at a time.
  const fitKey = `${shownH}|${boxW}|${task.title}|${task.emoji ?? ''}|${task.startTime}|${task.durationMinutes}|${!!task.recurrence}|${listEmoji ?? ''}|${piece?.index ?? ''}|${isMustDo(task)}|${resizing ?? ''}|${badge ?? ''}`;
  const plan = blockPlan(shownH, fit.key === fitKey ? fit.dropped : 0);
  const tier = plan.tier;
  // 3.6.0: the chips of the tasks during this break (not while it is being resized).
  const guests = hosted && hosted.length > 0 && resizing === undefined ? hosted : undefined;
  const chips = guests ? chipPlan(shownH, boxW, guests.length, COMPACT_BLOCK_PX) : null;
  useLayoutEffect(() => {
    if (tier === 3 || chips) return;
    if (fit.key !== fitKey) {
      setFit({ key: fitKey, dropped: 0 });
      return;
    }
    const t = titleEl.current;
    if (!t) return;
    const rowW = t.parentElement?.clientWidth ?? t.clientWidth;
    // The title is cut short of what it needs (and of 60% of the line), or the second line is wider than the block.
    const squeezed = t.scrollWidth > t.clientWidth + 1 && t.clientWidth < Math.min(t.scrollWidth, rowW * 0.6);
    const m = metaEl.current;
    const metaOver = !!m && m.scrollWidth > m.clientWidth + 1;
    if ((squeezed || metaOver) && fit.dropped < BLOCK_DROP_ORDER.length) setFit({ key: fitKey, dropped: fit.dropped + 1 });
  });
  // Tier 1's right hand text: a break and a later piece also say when they start.
  const lengthText = headPiece ? formatDuration(task.durationMinutes) : formatDuration(piece?.leftMin) ? `${formatDuration(piece?.leftMin)} left` : undefined;
  const clockText = formatTime(piece ? toTime(piece.startMin) : task.startTime ?? '');
  const inlineText = lengthText ? `${task.cutsBelow || (piece && !piece.head) ? `${clockText} ` : ''}${lengthText}` : '';
  // Tier 2's second line: the time, then the length ("left" on a later piece).
  const metaText = [plan.showTime ? clockText : '', plan.showLeft ? lengthText ?? '' : ''].filter(Boolean).join(' ') + (task.completed && lastPiece && plan.showTime ? ' done' : '');
  const pieceData = piece ? { piece: String(piece.index + 1), pieceCount: String(piece.count) } : {};
  const baseData = scope ? { calBlock: `${scope}${blockKey}`, blockTask: task.id } : { blockId: blockKey, blockTask: task.id };
  const dataSet = { ...baseData, ...pieceData, ...(task.cutsBelow ? { cuts: '1' } : {}), ...(time ? { blockTime: time } : {}), ...(hosted?.length ? { hostCount: String(hosted.length) } : {}) };

  return (
    <View style={[styles.wrap, sized, lifted && styles.lifted]}>
      <View style={styles.base}>
        <Pressable
          ref={blockRef as never}
          onPress={() => openDetail(task.id)}
          style={[
            styles.block,
            look
              ? { backgroundColor: look.bg, borderLeftColor: look.edge }
              : { backgroundColor: (color ? tint(color) : undefined) ?? (task.cutsBelow ? BREAK_TINT : Colors.plainBlock), borderLeftColor: color?.edge ?? (task.cutsBelow ? Colors.textSecondary : Colors.accent) },
            tier === 1 && styles.blockOne,
            continues && styles.continues,
            projected && styles.projected,
            late && styles.late,
            resizing !== undefined && styles.active,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`${a11y}${time ? `, ${formatTime(time)}` : ''}${piece ? `, part ${piece.index + 1} of ${piece.count}` : ''}${moved ? `, ${moved}` : ''}${hosted?.length ? `, ${hostTip.toLowerCase()}` : ''}`}
          {...({ dataSet: late ? { ...dataSet, late: '1' } : dataSet } as object)}
        >
          {chips && guests ? (
            <>
              {/* A break with tasks during it: one line (the title, a chip, "+N") or the title row and a chip per row. */}
              <View style={[styles.titleRow, chips.mode === 'inline' && styles.titleRowOne]} {...({ dataSet: { hostRow: chips.mode } } as object)}>
                <Text style={[styles.title, styles.hostTitle, task.completed && styles.titleDone, vt]} numberOfLines={1} {...({ dataSet: { hostTitle: '1' } } as object)}>
                  {task.emoji ? `${task.emoji} ` : ''}
                  {task.title}
                </Text>
                {chips.mode === 'inline' && chips.shown > 0 && <HostChip g={guests[0]} onChanged={onChanged} inline />}
                {chips.mode === 'stack' && !!inlineText && (
                  <Text style={[styles.timeInline, styles.hostTime, vm]} numberOfLines={1}>
                    {inlineText}
                  </Text>
                )}
                {chips.more > 0 && <MoreBadge n={chips.more} tip={hostTip} />}
              </View>
              {chips.mode === 'stack' && guests.slice(0, chips.shown).map((g) => <HostChip key={g.blockId} g={g} onChanged={onChanged} />)}
            </>
          ) : tier === 3 ? (
            <>
              <View style={[styles.titleRow, fullText && styles.titleRowTop]}>
                <Text style={[styles.title, fullText && styles.titleWrap, task.completed && styles.titleDone, vt]} numberOfLines={fullText ? undefined : 1}>
                  {task.emoji ? `${task.emoji} ` : ''}
                  {task.title}
                </Text>
                {isMustDo(task) && <PriorityMark chip={!!look} />}
                {task.recurrence && (
                  <View style={fullText ? styles.repeatTop : styles.noShrink}>
                    <Ionicons name="repeat" size={12} color={look ? VIBRANT_WHITE : Colors.textSecondary} accessibilityLabel="Repeats" />
                  </View>
                )}
              </View>
              {resizing !== undefined ? (
                <Text style={[styles.snap, vm]} {...({ dataSet: look ? {} : { mono: '1' } } as object)}>
                  {slotLabel(startMin, resizing)}
                </Text>
              ) : (
                <Text style={[styles.time, vm]} {...({ dataSet: look ? {} : { mono: '1' } } as object)}>
                  {piece && !piece.head
                    ? pieceTimeText(formatTime(toTime(piece.startMin)), undefined, formatDuration(piece.leftMin), false)
                    : `${formatTime(task.startTime ?? '')} ${formatDuration(task.durationMinutes) ?? ''}`}
                  {listEmoji ? ' ' : ''}
                  <ListEmoji emoji={listEmoji} name={listName} />{' '}
                  {task.completed && lastPiece ? 'done' : ''}
                </Text>
              )}
              {badge && resizing === undefined && (
                <Text style={[styles.cutNote, vm]} {...({ dataSet: { cutNote: '1' } } as object)}>
                  {badge}
                </Text>
              )}
              {moved && resizing === undefined && (
                <Text style={[styles.movedLine, vm]} numberOfLines={1} {...({ dataSet: { movedFrom: movedFrom(task) } } as object)}>
                  ↪ {moved}
                </Text>
              )}
            </>
          ) : (
            <>
              <View style={[styles.titleRow, tier === 1 && styles.titleRowOne]}>
                <Text
                  ref={((n: unknown) => { titleEl.current = domNode(n); }) as never}
                  style={[styles.title, task.completed && styles.titleDone, vt]}
                  numberOfLines={1}
                >
                  {task.emoji ? `${task.emoji} ` : ''}
                  {task.title}
                </Text>
                {movedArrow}
                {/* A refused cut on a short block (no room for the badge): a small info mark with the whole sentence. */}
                {badge && resizing === undefined && (
                  <Text ref={tipRef(note) as never} style={[styles.cutInfo, vm]} accessibilityLabel={note} {...({ 'aria-label': note, dataSet: { cutNoteIcon: '1' } } as object)}>
                    {'ⓘ'}
                  </Text>
                )}
                {isMustDo(task) && plan.showPriority && <PriorityMark chip={!!look} />}
                {/* One line: the length (or the snapped time while resizing) on the right, if it fits. */}
                {tier === 1 && (resizing !== undefined || (plan.showTime && !!inlineText)) && (
                  <Text style={[styles.timeInline, styles.rightText, vm]} numberOfLines={1}>
                    {resizing !== undefined ? slotLabel(startMin, resizing) : inlineText}
                  </Text>
                )}
              </View>
              {tier === 2 && (
                <View style={styles.metaRow}>
                  <Text
                    ref={((n: unknown) => { metaEl.current = domNode(n); }) as never}
                    style={[resizing !== undefined ? styles.snap : styles.time, styles.metaText, vm]}
                    numberOfLines={1}
                    {...({ dataSet: look ? {} : { mono: '1' } } as object)}
                  >
                    {resizing !== undefined ? slotLabel(startMin, resizing) : metaText}
                    {resizing === undefined && !!listEmoji && plan.showListEmoji ? ' ' : ''}
                    {resizing === undefined && plan.showListEmoji ? <ListEmoji emoji={listEmoji} name={listName} /> : null}
                  </Text>
                  {resizing === undefined && !!task.recurrence && plan.showRepeat && (
                    <View style={styles.noShrink}>
                      <Ionicons name="repeat" size={12} color={look ? VIBRANT_WHITE : Colors.textSecondary} accessibilityLabel="Repeats" />
                    </View>
                  )}
                </View>
              )}
            </>
          )}
        </Pressable>
        {continues && (
          <View pointerEvents="none" style={styles.continuesTag} accessibilityLabel="Continues after 24:00">
            <Text style={[styles.continuesText, vm]}>continues</Text>
            <Ionicons name="arrow-down" size={10} color={look ? VIBRANT_WHITE : Colors.textSecondary} />
          </View>
        )}
        {lastPiece && <View ref={handleRef as never} style={styles.handle} accessibilityLabel={`Resize ${task.title}`} />}
      </View>
    </View>
  );
}

// The whole block as one line of text, for the hover tooltip.
function blockTip(task: Task, piece?: CutPiece, note?: string, hosted?: string): string {
  const dur = formatDuration(task.durationMinutes);
  const when = piece && !piece.head ? `${formatTime(toTime(piece.startMin))} ${formatDuration(piece.leftMin)} left` : [formatTime(task.startTime ?? ''), dur].filter(Boolean).join(' ');
  return [`${task.emoji ? `${task.emoji} ` : ''}${task.title}`, when, task.recurrence ? 'Repeats' : '', movedCaptionLong(task) ?? '', note ?? '', hosted ?? ''].filter(Boolean).join(', ');
}

// Where a drag would land on a time grid: a dashed outline at the snapped slot
// with its time, the same in the Timebox and the Calendar.
export function SlotPreview({ startMin, duration, top }: { startMin: number; duration: number; top: number }) {
  return (
    <View pointerEvents="none" style={[styles.preview, { top, height: blockHeightPx(duration) }]} {...({ dataSet: { slotPreview: '1' } } as object)}>
      <Text style={styles.snap} {...({ dataSet: { mono: '1' } } as object)}>
        {slotLabel(startMin, duration)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', paddingRight: 2, paddingBottom: 1 },
  lifted: { opacity: 0.35 },
  // Flat: a 1px inset outline (no layout change), small 4px corners.
  base: { flex: 1, borderRadius: 4, overflow: 'hidden' } as object,
  block: { flex: 1, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3, minWidth: 0, overflow: 'hidden', borderLeftWidth: 3, boxShadow: `inset 0 0 0 1px ${Colors.border}` } as object,
  // The shortest blocks (20px) fit one 16px line only with 1px above and below.
  blockOne: { paddingVertical: 1, justifyContent: 'center' },
  continues: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  projected: { opacity: 0.82 },
  late: { opacity: 0.5 },
  movedLine: { fontSize: 11, fontWeight: '500', color: Colors.textSecondary, marginTop: 1 },
  movedIcon: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, flexShrink: 0 },
  active: { boxShadow: `inset 0 0 0 1px ${Colors.accent}` } as object,
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 0, overflow: 'hidden' } as object,
  titleRowOne: { flex: 1 },
  // A break's title keeps some room beside its chip; its own time gives way first.
  hostTitle: { minWidth: 36 },
  hostTime: { flexShrink: 10, minWidth: 0, marginLeft: 'auto' } as object,
  rightText: { marginLeft: 'auto' },
  noShrink: { flexShrink: 0 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 0, overflow: 'hidden' } as object,
  metaText: { flexShrink: 1, minWidth: 0 },
  title: { flexShrink: 1, minWidth: 0, fontSize: 12, lineHeight: 16, fontWeight: '600', color: Colors.textPrimary },
  cutInfo: { fontSize: 11, lineHeight: 16, color: Colors.textSecondary, flexShrink: 0 },
  cutNote: { fontSize: 10, lineHeight: 13, fontStyle: 'italic', color: Colors.textSecondary, minWidth: 0, overflowWrap: 'normal', wordBreak: 'normal', wordWrap: 'normal' } as object,
  titleRowTop: { alignItems: 'flex-start' },
  titleWrap: { minWidth: 0, overflowWrap: 'normal', wordBreak: 'normal', wordWrap: 'normal' } as object,
  repeatTop: { marginTop: 2, flexShrink: 0 },
  titleDone: { textDecorationLine: 'line-through', color: Colors.textSecondary },
  time: { fontSize: 11, color: Colors.textSecondary, minWidth: 0, overflowWrap: 'normal', wordBreak: 'normal', wordWrap: 'normal' } as object,
  timeInline: { fontSize: 11, lineHeight: 16, color: Colors.textSecondary, flexShrink: 0 },
  snap: { fontSize: 11, fontWeight: '700', color: Colors.accentText },
  continuesTag: { position: 'absolute', right: 6, bottom: 2, flexDirection: 'row', alignItems: 'center', gap: 2 },
  continuesText: { fontSize: 10, color: Colors.textSecondary },
  handle: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 6 },
  preview: { position: 'absolute', left: 0, right: 2, borderRadius: 4, borderWidth: 2, borderStyle: 'dashed', borderColor: Colors.accent, backgroundColor: Colors.accentSoft, paddingHorizontal: 8, paddingVertical: 2, zIndex: 5 },
});
