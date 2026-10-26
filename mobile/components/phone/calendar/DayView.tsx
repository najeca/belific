import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import { radius, type ColorTokens } from '../../../lib/tokens';
import { buildPhoneDay, minuteAtY } from '../../../lib/phoneDay';
import { GRID_HEIGHT_PX, PX_PER_HOUR, hourLabel } from '../../../lib/timebox';
import { nowLineTop } from '../../../lib/calendarView';
import { labelColor, tintFor } from '../../../lib/labelColors';
import { isMustDo, MUST_DO_MARK } from '../../../lib/mustDo';
import { formatDuration } from '../../../lib/duration';
import { formatTime } from '../../../lib/data';
import { ActionMenu } from '../menu';
import { LabelDot } from '../ui';
import { TAP_MAX_MOVE, TAP_MAX_MS } from '../../../lib/touchRules';
import type { DeviceOccurrence } from '../../../lib/deviceCalendar';
import type { Project, ScheduleEvent, Task, TaskList } from '../../../lib/types';
import type { DaySource } from '../../../lib/phoneDay';
import { useStyles, useTheme } from '../theme';
import { PressRow } from '../touch';
import { inter, mono, type } from '../type';
import { PhoneBlock, type BlockLook } from './PhoneBlock';
import { DraggableBlock, type DragTarget } from './DraggableBlock';

// The Calendar's Day view on the phone (PLAN_phone P8): an all day row, then a 24 hour timeline
// (56 px an hour, the desktop's scale, so the block tiers of 2.47.0 apply), a red line at the current
// time, and the day's blocks side by side where they overlap. A tap on a block opens it; a tap on an
// empty part of the timeline opens the quick add with that quarter hour filled in (the tap layer sits
// under the blocks, so a tap never counts twice).
const GUTTER = 52;

const make = (c: ColorTokens) => ({
  allDay: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border },
  chip: { minHeight: 32, paddingHorizontal: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, maxWidth: '100%' as const },
  chipText: { ...inter(500), fontSize: 13, color: c.textPrimary, flexShrink: 1 },
  allDayLabel: { ...type.small, color: c.textSecondary, alignSelf: 'center' as const, marginRight: 4 },
  hour: { position: 'absolute' as const, left: 0, width: GUTTER - 6, textAlign: 'right' as const, ...mono(400), fontSize: 10, color: c.textSecondary },
  line: { position: 'absolute' as const, left: GUTTER, right: 0, height: 1, backgroundColor: c.border },
  now: { position: 'absolute' as const, left: GUTTER - 4, right: 0, height: 2, backgroundColor: c.now },
  nowDot: { position: 'absolute' as const, left: GUTTER - 6, width: 8, height: 8, borderRadius: 4, backgroundColor: c.now },
  mark: { fontSize: 11, color: c.danger },
});

export interface DayData {
  tasks: Task[];
  events: ScheduleEvent[];
  device: DeviceOccurrence[];
  projects: Project[];
  lists: TaskList[];
}

export function DayView({
  dayKey,
  todayKey,
  nowMin,
  data,
  onOpen,
  onAddAt,
  onDrop,
}: {
  dayKey: string;
  todayKey: string;
  nowMin: number;
  data: DayData;
  onOpen: (source: DaySource) => void;
  onAddAt: (minute: number) => void;
  // P10: a held block was dragged to a new start.
  onDrop?: (target: DragTarget) => void;
}) {
  const s = useStyles(make);
  const { c, name } = useTheme();
  const [width, setWidth] = useState(390);
  const scroller = useRef<React.ElementRef<typeof ScrollView>>(null);
  // P10: where the timeline is on screen and how far it is scrolled, for the auto scroll near its edges.
  const frame = useRef({ top: 0, height: 0, y: 0, max: 0 });
  const [dragging, setDragging] = useState(false);
  // 3.7.0: the break whose tasks are listed in the sheet (a tap on a break with tasks during it).
  const [sheet, setSheet] = useState<DaySource | null>(null);
  const autoScroll = (absY: number): number => {
    const f = frame.current;
    const step = absY < f.top + 56 ? -12 : absY > f.top + f.height - 56 ? 12 : 0;
    const next = Math.max(0, Math.min(f.max, f.y + step));
    const moved = next - f.y;
    if (moved !== 0) {
      f.y = next;
      scroller.current?.scrollTo({ y: next, animated: false });
    }
    return moved;
  };
  const day = useMemo(() => buildPhoneDay({ tasks: data.tasks, dayKey, todayKey, events: data.events, device: data.device }), [data, dayKey, todayKey]);

  // Opens near now on today (an hour before), at 8:00 on another day.
  useEffect(() => {
    const target = dayKey === todayKey ? Math.max(0, nowMin - 60) : 8 * 60;
    const t = setTimeout(() => scroller.current?.scrollTo({ y: (target / 60) * PX_PER_HOUR, animated: false }), 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayKey]);

  const lookOf = (src: DaySource): BlockLook => {
    if (src.kind === 'event') return { bg: c.breakTint, edge: c.borderStrong };
    if (src.kind === 'device') return { bg: c.surfaceRaised, edge: (src.seg.occ as DeviceOccurrence).color ?? c.textTertiary };
    const t = src.task;
    const p = t.projectKey ? data.projects.find((x) => x.key === t.projectKey) : undefined;
    const col = labelColor(p?.colorKey);
    const list = t.listKey ? data.lists.find((l) => l.key === t.listKey && !l.deletedAt) : undefined;
    const dots = src.hosted ? Object.fromEntries(src.hosted.map((h) => [h.id, dotOf(h.task)])) : undefined;
    return { bg: col ? tintFor(col, name === 'dark') : t.cutsBelow ? c.breakTint : c.plainBlock, edge: col?.edge ?? (t.cutsBelow ? c.textSecondary : c.accent), listEmoji: list?.emoji, ...(dots ? { dots } : {}) };
  };
  // The label colour of a task during a break (its chip's dot), else a neutral.
  const dotOf = (t: Task) => labelColor(data.projects.find((x) => x.key === t.projectKey)?.colorKey)?.edge ?? c.textSecondary;
  // A tap on a break with tasks during it lists them; any other block opens.
  const tap = (src: DaySource) => (src.kind === 'task' && src.hosted?.length ? setSheet(src) : onOpen(src));

  const area = width - GUTTER - 4;
  const empty = Gesture.Tap()
    .maxDistance(TAP_MAX_MOVE)
    .maxDuration(TAP_MAX_MS)
    .runOnJS(true)
    .onEnd((e, ok) => {
      if (ok) onAddAt(minuteAtY(e.y, PX_PER_HOUR));
    });

  const a11yOf = (src: DaySource) =>
    src.kind === 'task'
      ? `Task ${src.task.title}${src.task.startTime ? `, ${src.task.startTime}` : ''}${src.hosted?.length ? `, during it: ${src.hosted.map((h) => h.task.title).join(', ')}` : ''}`
      : src.kind === 'event'
        ? `Event ${src.event.title}, read only`
        : `Calendar event ${src.seg.occ.title}, read only`;
  const sheetTask = sheet && sheet.kind === 'task' ? sheet : null;

  return (
    <View style={{ flex: 1 }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} {...({ dataSet: { dayView: dayKey } } as object)}>
      {day.allDay.length + day.deviceAllDay.length > 0 ? (
        <View style={s.allDay}>
          <Text style={s.allDayLabel}>All day</Text>
          {day.allDay.map(({ task, projected }) => (
            <PressRow key={task.id} onTap={() => onOpen({ kind: 'task', task, projected })} a11y={`All day task ${task.title}`} style={s.chip} data={{ allDayChip: task.title }}>
              {isMustDo(task) ? <Text style={s.mark}>{MUST_DO_MARK}</Text> : null}
              <Text style={[s.chipText, task.completed && { textDecorationLine: 'line-through', color: c.textSecondary }]} numberOfLines={1}>
                {`${task.emoji ? `${task.emoji} ` : ''}${task.title}`}
              </Text>
            </PressRow>
          ))}
          {day.deviceAllDay.map((seg) => (
            <View key={seg.occ.id} style={[s.chip, { borderLeftWidth: 3, borderLeftColor: (seg.occ as DeviceOccurrence).color ?? c.textTertiary }]} accessible accessibilityLabel={`Calendar event ${seg.occ.title}, all day, read only`}>
              <Text style={[s.chipText, { color: c.textSecondary }]} numberOfLines={1}>
                {seg.occ.title}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      <ScrollView
        ref={scroller}
        contentContainerStyle={{ height: GRID_HEIGHT_PX + 24 }}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!dragging}
        scrollEventThrottle={16}
        onScroll={(e) => {
          frame.current.y = e.nativeEvent.contentOffset.y;
          frame.current.max = Math.max(0, e.nativeEvent.contentSize.height - e.nativeEvent.layoutMeasurement.height);
        }}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          frame.current.height = h;
          frame.current.max = Math.max(0, GRID_HEIGHT_PX + 24 - h);
          (scroller.current as unknown as { measureInWindow?: (cb: (x: number, y: number) => void) => void })?.measureInWindow?.((_x, y) => {
            frame.current.top = y;
          });
        }}
      >
        <View style={{ height: GRID_HEIGHT_PX, marginTop: 12 }}>
          {Array.from({ length: 24 }, (_, h) => (
            <React.Fragment key={h}>
              <Text style={[s.hour, { top: h * PX_PER_HOUR - 6 }]}>{hourLabel(h)}</Text>
              <View style={[s.line, { top: h * PX_PER_HOUR }]} />
            </React.Fragment>
          ))}
          {/* The empty timeline: a tap here adds a task at that time. Under the blocks. */}
          <GestureDetector gesture={empty} touchAction="pan-y">
            <View style={{ position: 'absolute', left: GUTTER, right: 0, top: 0, height: GRID_HEIGHT_PX }} accessible accessibilityRole="button" accessibilityLabel="Add a task at a time" {...({ dataSet: { emptySlots: '1' } } as object)} />
          </GestureDetector>
          {day.blocks.map((b) => {
            const w = area / b.cols;
            return (
              <View key={b.id} style={{ position: 'absolute', top: b.top, height: b.height, left: GUTTER + 2 + b.col * w, width: w - 2, paddingBottom: 1 }} {...({ dataSet: { phoneBlock: b.id } } as object)}>
                {b.source.kind === 'task' && !b.source.continuation && onDrop ? (
                  <DraggableBlock
                    source={b.source}
                    a11y={a11yOf(b.source)}
                    onTap={() => tap(b.source)}
                    onDrop={onDrop}
                    onDragging={setDragging}
                    autoScroll={autoScroll}
                    data={{ blockTap: b.id }}
                  >
                    <PhoneBlock source={b.source} height={b.height} look={lookOf(b.source)} />
                  </DraggableBlock>
                ) : (
                  <PressRow onTap={() => tap(b.source)} a11y={a11yOf(b.source)} style={{ flex: 1 }} data={{ blockTap: b.id }}>
                    <PhoneBlock source={b.source} height={b.height} look={lookOf(b.source)} />
                  </PressRow>
                )}
              </View>
            );
          })}
          {dayKey === todayKey ? (
            <>
              <View pointerEvents="none" style={[s.now, { top: nowLineTop(nowMin) }]} {...({ dataSet: { nowLine: '1' } } as object)} />
              <View pointerEvents="none" style={[s.nowDot, { top: nowLineTop(nowMin) - 3 }]} />
            </>
          ) : null}
        </View>
      </ScrollView>
      <ActionMenu
        visible={!!sheetTask}
        title={sheetTask ? `During ${sheetTask.task.title}` : undefined}
        items={
          sheetTask
            ? [
                ...(sheetTask.hosted ?? []).map((h) => ({
                  label: [h.task.title, formatTime(h.task.startTime ?? ''), formatDuration(h.task.durationMinutes) ?? ''].filter(Boolean).join(', '),
                  icon: 'ellipse' as const,
                  leading: <LabelDot color={dotOf(h.task)} size={10} />,
                  selected: h.task.completed,
                  run: () => onOpen({ kind: 'task', task: h.task, projected: h.projected }),
                })),
                { label: `Open ${sheetTask.task.title}`, icon: 'cafe-outline' as const, run: () => onOpen(sheetTask) },
              ]
            : []
        }
        onClose={() => setSheet(null)}
      />
    </View>
  );
}
