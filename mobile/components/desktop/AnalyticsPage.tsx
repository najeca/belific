import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { dateKey, formatShortDate, parseDateKey, WEEKDAYS } from '../../lib/kanban';
import { formatClock } from '../../lib/duration';
import { labelColor } from '../../lib/labelColors';
import { chartLabelColor } from '../../lib/chartColors';
import { THEMES } from '../../lib/tokens';
import { useResolvedTheme } from './themeStore';
import { loadLabels } from '../../lib/labels';
import { loadBrainDumpItemsRaw, loadListsRaw, loadTasksRaw } from '../../lib/storage';
import {
  RANGES,
  brainDumpAge,
  bucketBars,
  completedCard,
  completedCsv,
  completedRows,
  daysIn,
  groupCompleted,
  rangeFor,
  tasksByLabel,
  timeCard,
  timePerDay,
  type GroupBy,
  type RangeKey,
} from '../../lib/analytics';
import { useBreakTwice } from './breakTwiceStore';
import type { BrainDumpItem, Project, Task, TaskList } from '../../lib/types';
import { DESKTOP_FONT_FAMILY } from './desktopFont';
import { dayStamp, downloadText } from './download';
import { DISPLAY_FONT_FAMILY } from './desktopFont';
import { IconHeading, type IconName } from './ui';

// The Analytics page (build plan phase 6): worked out from the tasks on this
// computer, nothing stored or sent (lib/analytics.ts). A page like Progress,
// opened from the profile menu; Back returns.
//
// Three cards (tasks completed against the period before, the estimated time
// of what was finished, how long Brain Dump thoughts wait), two charts (tasks
// per day, tasks by label) and the completed list with a CSV download. 3.26.0:
// Actual time is no longer shown (the stored minutes stay, and the CSV keeps its
// Actual column so nothing recorded is lost). Every bar shows its number and has a name for assistive
// technology; hover or press shows the same in the readout line. The bars are
// the sage chart token (a brighter one on dark), so a change of theme repaints them.
// Empty states say what is missing and nothing more.
const BAR = Colors.chartActual;
// A label's colour as a bar or swatch: its palette colour, darkened where it is
// too light to read as a graphic.
const shareColorOn = (surface: string, textSecondary: string) => (colorKey?: string) => chartLabelColor(labelColor(colorKey)?.edge ?? textSecondary, surface);
const BAR_AREA = 120;

export default function AnalyticsPage({ refreshKey }: { refreshKey: number }) {
  const theme = THEMES[useResolvedTheme()];
  const shareColor = shareColorOn(theme.surface, theme.textSecondary);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [labels, setLabels] = useState<Project[]>([]);
  const [lists, setLists] = useState<TaskList[]>([]);
  const [dump, setDump] = useState<BrainDumpItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const todayKey = dateKey(new Date());
  const [range, setRange] = useState<RangeKey>('last7');
  const [custom, setCustom] = useState<{ start: string; end: string }>({ start: dateKey(new Date(Date.now() - 6 * 86400000)), end: todayKey });
  const [group, setGroup] = useState<GroupBy>('day');
  const [readout, setReadout] = useState<Record<string, string>>({});

  const reload = useCallback(async () => {
    const [t, l, ls, d] = await Promise.all([loadTasksRaw(), loadLabels(), loadListsRaw(), loadBrainDumpItemsRaw()]);
    setTasks(t);
    setLabels(l);
    setLists(ls);
    setDump(d);
    setLoaded(true);
  }, []);
  useEffect(() => {
    reload();
  }, [reload, refreshKey]);

  const r = useMemo(() => rangeFor(range, todayKey, custom), [range, todayKey, custom]);
  const completed = useMemo(() => completedCard(tasks, r), [tasks, r]);
  const breakTwice = useBreakTwice();
  const time = useMemo(() => timeCard(tasks, r, breakTwice), [tasks, r, breakTwice]);
  const age = useMemo(() => brainDumpAge(tasks, dump, lists, Date.now()), [tasks, dump, lists]);
  const perDay = useMemo(() => bucketBars(timePerDay(tasks, r)), [tasks, r]);
  const shares = useMemo(() => tasksByLabel(tasks, r, labels), [tasks, r, labels]);
  const rows = useMemo(() => completedRows(tasks, r, labels, lists), [tasks, r, labels, lists]);
  const groups = useMemo(() => groupCompleted(rows, group), [rows, group]);
  const show = (chart: string) => (text: string) => setReadout((x) => ({ ...x, [chart]: text }));

  const maxDay = Math.max(1, ...perDay.map((g) => g.count));
  const nDays = daysIn(r).length;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} accessibilityLabel="Analytics">
      <View style={styles.column}>
        <IconHeading icon="bar-chart-outline" style={styles.heading} size={20}>Analytics</IconHeading>
        <Text style={styles.hint}>Worked out from the tasks on this computer. Nothing is sent anywhere.</Text>

        <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Date range">
          {RANGES.map((x) => (
            <Pressable
              key={x.key}
              onPress={() => setRange(x.key)}
              style={[styles.chip, range === x.key && styles.chipOn]}
              accessibilityRole="radio"
              accessibilityState={{ selected: range === x.key }}
              accessibilityLabel={`Range ${x.label}`}
            >
              <Text style={[styles.chipText, range === x.key && styles.chipTextOn]}>{x.label}</Text>
            </Pressable>
          ))}
        </View>
        {range === 'custom' && (
          <View style={styles.row}>
            <input type="date" value={custom.start} max={todayKey} aria-label="From" onChange={(e) => e.target.value && setCustom((c) => ({ ...c, start: e.target.value }))} style={domInput} />
            <Text style={styles.hint}>to</Text>
            <input type="date" value={custom.end} max={todayKey} aria-label="To" onChange={(e) => e.target.value && setCustom((c) => ({ ...c, end: e.target.value }))} style={domInput} />
          </View>
        )}
        <Text style={styles.hint} accessibilityLabel="Range shown">
          {formatShortDate(r.start)} to {formatShortDate(r.end)} · {nDays} {nDays === 1 ? 'day' : 'days'}
        </Text>

        <View style={styles.cards}>
          <Card icon="checkmark-circle-outline" title="Completed" accessibilityLabel="Completed card">
            <Text style={styles.big}>{completed.current}</Text>
            <Text style={styles.cardText}>{completed.text || 'No completed tasks in this range yet. Tasks you finish show up here.'}</Text>
          </Card>
          <Card icon="hourglass-outline" title="Estimated" accessibilityLabel="Time card">
            <Text style={styles.big}>{time.withEstimate > 0 ? formatClock(time.estimated) : '–'}</Text>
            <Text style={styles.cardText}>
              {time.withEstimate > 0
                ? `Estimated for ${time.withEstimate} finished ${time.withEstimate === 1 ? 'task' : 'tasks'}.${time.withoutEstimate > 0 ? ` ${time.withoutEstimate} finished without one.` : ''}`
                : 'No finished tasks with an estimate yet.'}
            </Text>
          </Card>
          <Card icon="bulb-outline" title="Brain Dump age" accessibilityLabel="Brain Dump age card">
            <Text style={styles.big}>{age.count > 0 ? `${age.averageDays}d` : '–'}</Text>
            <Text style={styles.cardText}>{age.text || 'Nothing is waiting in Brain Dump.'}</Text>
          </Card>
        </View>

        <Section title="Tasks per day" icon="calendar-outline">
          <Text style={styles.readout} accessibilityLabel="Time per day readout">
            {readout.day ?? 'Hover or press a bar for its numbers.'}
          </Text>
          {perDay.every((g) => g.count === 0) ? (
            <Text style={styles.empty}>No completed tasks in this range yet. A task counts on the day it is finished.</Text>
          ) : (
            <View style={styles.bars} accessibilityLabel="Time per day chart">
              {perDay.map((g) => {
                const value = g.count;
                const label = g.from === g.to ? dayName(g.from) : `${formatShortDate(g.from)} to ${formatShortDate(g.to)}`;
                const text = `${label}: ${g.count} ${g.count === 1 ? 'task' : 'tasks'}`;
                return (
                  <Pressable
                    key={g.from}
                    onPress={() => show('day')(text)}
                    {...({ onHoverIn: () => show('day')(text) } as object)}
                    style={styles.barCol}
                    accessibilityRole="button"
                    accessibilityLabel={text}
                  >
                    <Text style={styles.barValue}>{value > 0 ? value : ''}</Text>
                    <View style={{ height: BAR_AREA, justifyContent: 'flex-end' }}>
                      <View style={[styles.bar, { height: Math.max(value > 0 ? 3 : 0, (value / maxDay) * BAR_AREA), backgroundColor: BAR }]} />
                    </View>
                    <Text style={styles.barLabel} numberOfLines={1}>
                      {perDay.length <= 14 ? shortDay(g.from) : parseDateKey(g.from).getDate()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </Section>

        <Section title="Tasks by label" icon="pricetag-outline">
          <Text style={styles.readout} accessibilityLabel="Tasks by label readout">
            {readout.label ?? 'Hover or press a label for its numbers.'}
          </Text>
          {shares.length === 0 ? (
            <Text style={styles.empty}>No completed tasks in this range yet.</Text>
          ) : (
            <>
              <View style={styles.stack} accessibilityLabel="Tasks by label chart">
                {shares.map((s) => (
                  <View key={s.key || 'none'} style={{ flex: s.percent || 0.0001, backgroundColor: shareColor(s.colorKey) }} />
                ))}
              </View>
              {shares.map((s) => {
                const text = `${s.emoji ? `${s.emoji} ` : ''}${s.name}: ${s.count} ${s.count === 1 ? 'task' : 'tasks'}, ${s.percent}%`;
                return (
                  <Pressable key={s.key || 'none'} onPress={() => show('label')(text)} {...({ onHoverIn: () => show('label')(text) } as object)} style={styles.legendRow} accessibilityRole="button" accessibilityLabel={text}>
                    <View style={[styles.swatch, { backgroundColor: shareColor(s.colorKey) }]} />
                    <Text style={styles.legendName} numberOfLines={1}>
                      {s.emoji ? `${s.emoji} ` : ''}
                      {s.name}
                    </Text>
                    <Text style={styles.legendNums}>
                      {s.count} · {s.percent}%
                    </Text>
                  </Pressable>
                );
              })}
            </>
          )}
        </Section>

        <Section title="Completed tasks" icon="checkmark-done-outline">
          <View style={styles.row}>
            <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Group by">
              {(['none', 'day', 'label'] as GroupBy[]).map((g) => (
                <Pressable key={g} onPress={() => setGroup(g)} style={[styles.chip, group === g && styles.chipOn]} accessibilityRole="radio" accessibilityState={{ selected: group === g }} accessibilityLabel={`Group by ${g === 'none' ? 'nothing' : g}`}>
                  <Text style={[styles.chipText, group === g && styles.chipTextOn]}>{g === 'none' ? 'No grouping' : g === 'day' ? 'By day' : 'By label'}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              onPress={() => downloadText(`belific-completed-${dayStamp()}.csv`, completedCsv(rows, group), 'text/csv')}
              disabled={rows.length === 0}
              style={[styles.chip, rows.length === 0 && styles.off]}
              accessibilityRole="button"
              accessibilityLabel="Download completed tasks as CSV"
            >
              <Text style={styles.chipText}>Download CSV</Text>
            </Pressable>
          </View>
          {loaded && rows.length === 0 ? (
            <Text style={styles.empty}>No completed tasks in this range yet.</Text>
          ) : (
            groups.map((g) => (
              <View key={g.key} style={styles.group} accessibilityLabel={`Group ${g.title}`}>
                {group !== 'none' && (
                  <Text style={styles.groupTitle}>
                    {[group === 'day' ? formatShortDate(g.title) : g.title, String(g.rows.length), g.estimate ? formatClock(g.estimate) : undefined].filter(Boolean).join(' · ')}
                  </Text>
                )}
                {g.rows.map((x) => (
                  <View key={x.id} style={styles.doneRow} accessibilityLabel={`Completed ${x.title}`}>
                    <Text style={styles.doneTitle} numberOfLines={2}>
                      {x.emoji ? `${x.emoji} ` : ''}
                      {x.title}
                    </Text>
                    <Text style={styles.doneMeta}>
                      {[group === 'day' ? undefined : formatShortDate(x.day), x.label, x.list, x.estimate ? formatClock(x.estimate) : undefined].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                ))}
              </View>
            ))
          )}
        </Section>
      </View>
    </ScrollView>
  );
}

function dayName(key: string): string {
  const d = parseDateKey(key);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${formatShortDate(key).split(' ').slice(-1)[0]}`;
}
function shortDay(key: string): string {
  return WEEKDAYS[parseDateKey(key).getDay()].slice(0, 2);
}

function Card({ icon, title, accessibilityLabel, children }: { icon: IconName; title: string; accessibilityLabel: string; children: React.ReactNode }) {
  return (
    <View style={styles.card} accessibilityLabel={accessibilityLabel}>
      <View style={styles.cardTitleRow}>
        <Ionicons name={icon} size={15} color={Colors.textSecondary} />
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function Section({ title, icon, children }: { title: string; icon: IconName; children: React.ReactNode }) {
  return (
    <View style={styles.section} accessibilityLabel={`${title} section`}>
      <IconHeading icon={icon} style={styles.sectionTitle}>{title}</IconHeading>
      {children}
    </View>
  );
}

const domInput: React.CSSProperties = {
  height: 34,
  padding: '0 8px',
  borderRadius: 10,
  border: `1px solid ${Colors.border}`,
  background: Colors.background,
  color: Colors.textPrimary,
  fontSize: 13,
  fontFamily: DESKTOP_FONT_FAMILY,
  outlineColor: Colors.accent,
};

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 24, alignItems: 'center' },
  column: { width: '100%', maxWidth: 980, gap: 12 },
  heading: { fontSize: 20, fontFamily: DISPLAY_FONT_FAMILY, fontWeight: '700', color: Colors.textPrimary },
  hint: { fontSize: 13, color: Colors.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  chips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 12, height: 32, borderRadius: 0, justifyContent: 'center', backgroundColor: Colors.hostPill },
  chipOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  chipText: { fontSize: 13, fontWeight: '700', color: Colors.onHostPill },
  chipTextOn: { color: Colors.onAccent, fontWeight: '600' },
  off: { opacity: 0.4 },
  cards: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  card: { flexGrow: 1, flexBasis: 280, padding: 14, gap: 6, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, color: Colors.textSecondary },
  big: { fontSize: 28, fontWeight: '700', color: Colors.textPrimary, fontVariant: ['tabular-nums'] },
  cardText: { fontSize: 13, color: Colors.textSecondary },
  section: { padding: 16, gap: 10, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  readout: { fontSize: 13, color: Colors.accentText, minHeight: 18 },
  empty: { fontSize: 13, color: Colors.textSecondary },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  barCol: { flex: 1, minWidth: 8, alignItems: 'center', gap: 3 },
  barValue: { fontSize: 10, color: Colors.textPrimary, fontVariant: ['tabular-nums'], minHeight: 14 },
  bar: { width: '70%', minWidth: 6, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  barLabel: { fontSize: 10, color: Colors.textSecondary },
  stack: { flexDirection: 'row', height: 16, borderRadius: 8, overflow: 'hidden', backgroundColor: Colors.background },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 },
  swatch: { width: 12, height: 12, borderRadius: 4 },
  legendName: { flex: 1, fontSize: 13, color: Colors.textPrimary },
  legendNums: { fontSize: 13, color: Colors.textSecondary, fontVariant: ['tabular-nums'] },
  group: { gap: 4, marginTop: 6 },
  groupTitle: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  doneRow: { paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  doneTitle: { fontSize: 13, color: Colors.textPrimary },
  doneMeta: { fontSize: 11, color: Colors.textSecondary },
});
