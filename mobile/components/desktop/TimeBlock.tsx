import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { formatTime } from '../../lib/data';
import { formatDuration } from '../../lib/duration';
import { isCompactBlock, toMinutes, toTime, blockHeightPx } from '../../lib/timebox';
import { pieceTimeText, type CutPiece } from '../../lib/cuts';
import { nudgeBlock, slotLabel, taskDuration, yToMinutes, type BlockNudge } from '../../lib/drag';
import { dateKey } from '../../lib/kanban';
import { shortcutFor } from '../../lib/shortcuts';
import { updateTask } from '../../lib/storage';
import { patchSeries } from '../../lib/seriesActions';
import type { LabelColor } from '../../lib/labelColors';
import type { Project, Task } from '../../lib/types';
import { domNode, useDrag } from './DragProvider';
import { isPopoverOpen } from './Popover';
import { openDetail } from './uiStore';
import { isLate } from '../../lib/lateTasks';
import { lateMoveFor, moveLateTask } from '../../lib/lateActions';
import { tipRef } from './tip';
import PriorityMark from './PriorityMark';
import { isMustDo } from '../../lib/mustDo';
import { useVibrant, vibrantLook, vibrantText, VIBRANT_WHITE } from './vibrantStore';

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
const BREAK_TINT = '#E6E4DD';

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
  fullText,
  piece,
  note,
  badge,
}: {
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
  const look = vibrantLook(useVibrant(), color, !!task.cutsBelow);
  const vt = look ? vibrantText : undefined;
  const resizing = drag?.mode === 'resize' && drag.item.id === task.id && drag.item.scope === scope ? drag.resizeDuration : undefined;
  const lifted = drag?.mode === 'move' && drag.item.id === task.id;
  const startMin = toMinutes(task.startTime) ?? 0;
  const lastPiece = !piece || piece.last;
  const headPiece = !piece || piece.head;
  // Pieces after the first get their own block key, so the first keeps the task's (tests and focus).
  const blockKey = piece && piece.index > 0 ? `${task.id}~${piece.index + 1}` : task.id;
  const live = useRef({ task, projected });
  live.current = { task, projected };

  const dragRef = sourceRef(`block:${scope}${task.id}`, (e) => {
    const grid = gridNode();
    const start = toMinutes(live.current.task.startTime);
    if (!grid || start === null) return null;
    return {
      kind: 'block',
      task: live.current.task,
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
  useEffect(() => {
    if (fullText) tipRef(blockTip(task, piece, note))(elRef.current);
  }, [fullText, task.title, task.emoji, task.startTime, task.durationMinutes, task.recurrence, piece, note]);
  const blockRef = useCallback(
    (instance: unknown) => {
      dragRef(instance);
      keysCleanup.current?.();
      keysCleanup.current = null;
      const el = domNode(instance);
      elRef.current = el;
      if (fullText) tipRef(blockTip(live.current.task, piece, note))(el);
      if (!el) return;
      const onKey = (e: KeyboardEvent) => {
        if (e.target !== el || e.repeat) return;
        const sc = shortcutFor(e, { typing: false, blocked: isPopoverOpen(), scope: 'block' });
        const nudge = sc ? KEY_NUDGE[sc] : undefined;
        if (!nudge) return;
        e.preventDefault();
        e.stopPropagation();
        const { task: t, projected: proj } = live.current;
        const patch = nudgeBlock(t, nudge, dateKey(new Date()), proj);
        if (!patch) return;
        const done = proj ? patchSeries(t, patch) : updateTask({ ...t, ...patch });
        Promise.resolve(done).then(() => {
          onChanged();
          // The block is drawn again (maybe in another column): put the keyboard back on it.
          setTimeout(() => {
            const sel = scope ? `[data-cal-block="${scope.replace(/"/g, '')}${t.id.replace(/"/g, '')}"]` : `[data-block-id="${t.id.replace(/"/g, '')}"]`;
            const again = document.querySelector<HTMLElement>(sel) ?? document.querySelector<HTMLElement>(`[data-block-task="${t.id.replace(/"/g, '')}"]`);
            again?.focus();
          }, 120);
        });
      };
      el.addEventListener('keydown', onKey);
      keysCleanup.current = () => el.removeEventListener('keydown', onKey);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dragRef, scope, fullText],
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
        startResize(e, live.current.task, start, grid, live.current.projected, scope);
      };
      el.style.cursor = 'ns-resize';
      el.addEventListener('pointerdown', down);
      handleCleanup.current = () => el.removeEventListener('pointerdown', down);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [startResize, scope],
  );

  // Late (2.27.0): placed, not done, its end has passed. The block fades and
  // offers one move: the next free slot today, or tomorrow when there is none.
  // The panes redraw every 30 seconds, so a block turns late on its own.
  const late = isLate(task, new Date(), projected);
  const [move, setMove] = useState<{ label: string; short: string } | null>(null);
  // A press on the pill is a click, never a drag (DragProvider), so it must not
  // cover the block: on a narrow or short block it is a small arrow, and on a
  // tall one it sits at the bottom, away from where a block is picked up.
  const [blockW, setBlockW] = useState(0);
  useEffect(() => {
    if (!late) {
      setMove(null);
      return;
    }
    let live = true;
    lateMoveFor(task.id).then((m) => {
      if (live) setMove(m ? { label: m.label, short: m.patch.dueDate === dateKey(new Date()) ? `→ ${m.patch.startTime}` : '→ Tomorrow' } : null);
    });
    return () => {
      live = false;
    };
  }, [late, task.id, task.startTime, task.durationMinutes, task.dueDate]);

  // Resizing a cut task: the last piece follows the handle (its length is the new end less its own start).
  const resizedH = resizing === undefined ? undefined : piece ? blockHeightPx(Math.max(15, startMin + resizing - piece.startMin)) : blockHeightPx(resizing);
  const sized = resizedH !== undefined && lastPiece ? { ...positioned, height: resizedH } : positioned;
  const compact = isCompactBlock(resizedH !== undefined && lastPiece ? resizedH : height);
  const pieceData = piece ? { piece: String(piece.index + 1), pieceCount: String(piece.count) } : {};
  const baseData = scope ? { calBlock: `${scope}${blockKey}`, blockTask: task.id } : { blockId: blockKey, blockTask: task.id };
  const dataSet = { ...baseData, ...pieceData, ...(task.cutsBelow ? { cuts: '1' } : {}) };

  return (
    <View style={[styles.wrap, sized, lifted && styles.lifted]}>
      <View style={styles.base}>
        <Pressable
          ref={blockRef as never}
          onLayout={(e) => setBlockW(e.nativeEvent.layout.width)}
          onPress={() => openDetail(task.id)}
          style={[
            styles.block,
            look
              ? { backgroundColor: look.bg, borderLeftColor: look.edge }
              : { backgroundColor: color?.tint ?? (task.cutsBelow ? BREAK_TINT : '#FFFFFF'), borderLeftColor: color?.edge ?? (task.cutsBelow ? Colors.textSecondary : Colors.accent) },
            continues && styles.continues,
            projected && styles.projected,
            late && styles.late,
            resizing !== undefined && styles.active,
          ]}
          accessibilityRole="button"
          accessibilityLabel={piece ? `${a11y}, part ${piece.index + 1} of ${piece.count}` : a11y}
          {...({ dataSet: late ? { ...dataSet, late: '1' } : dataSet } as object)}
        >
          <View style={[styles.titleRow, fullText && styles.titleRowTop]}>
            <Text style={[styles.title, fullText && styles.titleWrap, task.completed && styles.titleDone, vt]} numberOfLines={fullText ? undefined : 1}>
              {task.emoji ? `${task.emoji} ` : ''}
              {task.title}
            </Text>
            {/* A short block shows one line: title and its true duration ("10m"). */}
            {compact && resizing === undefined && (headPiece ? formatDuration(task.durationMinutes) : formatDuration(piece?.leftMin)) && (
              <Text style={[styles.timeInline, vt]}>
                {/* A break and a later piece also say when they start: their block is one line. */}
                {task.cutsBelow || (piece && !piece.head) ? `${formatTime(piece ? toTime(piece.startMin) : task.startTime ?? '')} ` : ''}
                {headPiece ? formatDuration(task.durationMinutes) : `${formatDuration(piece?.leftMin)} left`}
              </Text>
            )}
            {/* A refused cut on a short block (no room for the badge): a small info mark with the whole sentence. */}
            {badge && compact && resizing === undefined && (
              <Text ref={tipRef(note) as never} style={[styles.cutInfo, vt]} accessibilityLabel={note} {...({ 'aria-label': note, dataSet: { cutNoteIcon: '1' } } as object)}>
                {'ⓘ'}
              </Text>
            )}
            {isMustDo(task) && <PriorityMark chip={!!look} />}
            {task.recurrence && (
              <View style={fullText ? styles.repeatTop : undefined}>
                <Ionicons name="repeat" size={12} color={look ? VIBRANT_WHITE : Colors.textSecondary} accessibilityLabel="Repeats" />
              </View>
            )}
          </View>
          {resizing !== undefined ? (
            <Text style={[styles.snap, vt]} {...({ dataSet: { mono: '1' } } as object)}>
              {slotLabel(startMin, resizing)}
            </Text>
          ) : (
            !compact && (
              <Text style={[styles.time, vt]} {...({ dataSet: { mono: '1' } } as object)}>
                {listEmoji ? <Text {...({ dataSet: { blockListEmoji: '1' } } as object)}>{listEmoji} </Text> : null}
                {piece && !piece.head
                  ? pieceTimeText(formatTime(toTime(piece.startMin)), undefined, formatDuration(piece.leftMin), false)
                  : `${formatTime(task.startTime ?? '')} ${formatDuration(task.durationMinutes) ?? ''}`}{' '}
                {task.completed && lastPiece ? 'done' : ''}
              </Text>
            )
          )}
          {badge && !compact && resizing === undefined && (
            <Text style={[styles.cutNote, vt]} {...({ dataSet: { cutNote: '1' } } as object)}>
              {badge}
            </Text>
          )}
          {/* Inside the block, so a drag that starts on it still moves the block. */}
          {late && move && resizing === undefined && lastPiece && (
            <Pressable
              onPress={() => moveLateTask(task.id).then((ok) => ok && onChanged())}
              style={[styles.lateBtn, compact ? styles.lateTop : styles.lateBottom]}
              accessibilityRole="button"
              accessibilityLabel={`${move.label}: ${task.title}`}
              {...({ dataSet: { lateMove: task.id }, title: move.label } as object)}
            >
              <Text style={styles.lateText} {...({ dataSet: { mono: '1' } } as object)}>
                {compact || blockW < 130 ? '→' : move.short}
              </Text>
            </Pressable>
          )}
        </Pressable>
        {continues && (
          <View pointerEvents="none" style={styles.continuesTag} accessibilityLabel="Continues after 24:00">
            <Text style={[styles.continuesText, vt]}>continues</Text>
            <Ionicons name="arrow-down" size={10} color={look ? VIBRANT_WHITE : Colors.textSecondary} />
          </View>
        )}
        {lastPiece && <View ref={handleRef as never} style={styles.handle} accessibilityLabel={`Resize ${task.title}`} />}
      </View>
    </View>
  );
}

// The whole block as one line of text, for the hover tooltip.
function blockTip(task: Task, piece?: CutPiece, note?: string): string {
  const dur = formatDuration(task.durationMinutes);
  const when = piece && !piece.head ? `${formatTime(toTime(piece.startMin))} ${formatDuration(piece.leftMin)} left` : [formatTime(task.startTime ?? ''), dur].filter(Boolean).join(' ');
  return [`${task.emoji ? `${task.emoji} ` : ''}${task.title}`, when, task.recurrence ? 'Repeats' : '', note ?? ''].filter(Boolean).join(', ');
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
  base: { flex: 1, borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 2px rgba(38,37,31,0.08)' } as object,
  block: { flex: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden', borderLeftWidth: 3 },
  continues: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  projected: { opacity: 0.82 },
  late: { opacity: 0.5 },
  lateBtn: { position: 'absolute', right: 4, height: 18, minWidth: 18, paddingHorizontal: 5, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  lateTop: { top: 3 },
  lateBottom: { bottom: 8 },
  lateText: { fontSize: 10.5, fontWeight: '700', color: Colors.accentText },
  active: { boxShadow: `inset 0 0 0 1px ${Colors.accent}` } as object,
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  title: { flexShrink: 1, fontSize: 12, lineHeight: 16, fontWeight: '600', color: Colors.textPrimary },
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
  preview: { position: 'absolute', left: 0, right: 2, borderRadius: 8, borderWidth: 2, borderStyle: 'dashed', borderColor: Colors.accent, backgroundColor: 'rgba(92,122,107,0.10)', paddingHorizontal: 8, paddingVertical: 2, zIndex: 5 },
});
