import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Colors } from '../../lib/theme';
import { dateKey, formatShortDate, parseDateKey } from '../../lib/kanban';
import { formatTime } from '../../lib/data';
import { formatMinutes } from '../../lib/timebox';
import { tomorrowOf } from '../../lib/rollover';
import { isEditableTarget } from '../../lib/editable';
import { loadTasksRaw } from '../../lib/storage';
import { stack, type UndoEntry } from '../../lib/undoStack';
import { undoEntry } from '../../lib/undoActions';
import { buttonsFor, choiceText, dayItems, stepsButton, tomorrowText, type WrapChoice, type WrapItem } from '../../lib/wrapUp';
import { wrapLetGo, wrapMove, wrapSteps, wrapTick, wrapToList } from '../../lib/wrapActions';
import type { Task } from '../../lib/types';
import { useCutMin } from './cutStore';
import { runRedo, runUndo } from './useUndoRedo';
import { closeOverlay, notifyChanged, showNotice } from './uiStore';
import { RoundCheck } from './ui';
import { DISPLAY_FONT_FAMILY } from './desktopFont';

// F3 of PLAN_daily_flow: Wrap up, ONE screen (it replaces the two steps of Shut down). Today's tasks with a tick each;
// an unticked one has Tomorrow, Back to its list and Let go (D2: to the Trash). Every button saves at once (D1) and
// the row folds to one grey line with its own Undo; Ctrl+Z works here too. Done only closes: there is no draft, no
// Cancel and nothing moves on Done. A repeating day never moves (its tick and Let go, which skips that day).

interface Decision {
  choice: WrapChoice;
  entry: UndoEntry;
  // Ticked with Tick all: the Undo is the one at the top.
  group?: boolean;
}

export interface ShownRow {
  item: WrapItem;
  decision?: Decision;
  // A shift's rows.
  kids: ShownRow[];
}

// The rows as they are now, plus the ones decided here (folded, in the place they had).
// `keys`: this list handles Ctrl+Z and Ctrl+Y (one list per screen does, or a press would undo twice).
export function useWrapRows(list: (raw: Task[]) => WrapItem[], refreshKey: number, keys = true) {
  const [raw, setRaw] = useState<Task[] | null>(null);
  const [decided, setDecided] = useState<Map<string, Decision>>(new Map());
  const order = useRef<string[]>([]);
  const kidOrder = useRef(new Map<string, string[]>());
  const cache = useRef(new Map<string, WrapItem>());
  const reload = useCallback(() => {
    loadTasksRaw().then(setRaw);
  }, []);
  useEffect(() => reload(), [reload, refreshKey]);
  const rows = useMemo((): ShownRow[] | null => {
    if (!raw) return null;
    const live = new Map(list(raw).map((i) => [i.key, i]));
    const see = (keys: string[], i: WrapItem) => {
      cache.current.set(i.key, i);
      if (!keys.includes(i.key)) keys.push(i.key);
    };
    for (const i of live.values()) {
      see(order.current, i);
      const kids = kidOrder.current.get(i.key) ?? [];
      for (const x of i.inside ?? []) see(kids, x);
      kidOrder.current.set(i.key, kids);
    }
    // A row decided here stays, folded, while its change can be undone.
    const fold = (k: string) => {
      const d = decided.get(k);
      return d && stack.has(d.entry) ? d : undefined;
    };
    return order.current.flatMap((k): ShownRow[] => {
      const decision = fold(k);
      const item = decision ? cache.current.get(k) : live.get(k);
      if (!item) return [];
      const liveKids = new Map((live.get(k)?.inside ?? []).map((x) => [x.key, x]));
      const kids = (kidOrder.current.get(k) ?? []).flatMap((c): ShownRow[] => {
        const d = fold(c);
        const x = d ? cache.current.get(c) : liveKids.get(c);
        return x ? [{ item: x, ...(d ? { decision: d } : {}), kids: [] }] : [];
      });
      return [{ item, ...(decision ? { decision } : {}), kids }];
    });
    // `decided` and the stack: a reload follows every change of either.
  }, [raw, decided, list]);
  const act = useCallback(
    async (item: WrapItem, choice: WrapChoice | null, run: () => Promise<UndoEntry | undefined>, group?: WrapItem[]) => {
      const entry = await run();
      if (entry && choice) {
        setDecided((m) => {
          const n = new Map(m);
          for (const i of group ?? [item]) n.set(i.key, { choice, entry, ...(group ? { group: true } : {}) });
          return n;
        });
      }
      notifyChanged();
      reload();
      return entry;
    },
    [reload],
  );
  const undoRow = useCallback(
    async (d: Decision) => {
      const r = await undoEntry(d.entry);
      if (!r.ok) showNotice(r.text);
      notifyChanged();
      reload();
    },
    [reload],
  );
  // Ctrl+Z and Ctrl+Y here as on the home screen (the home keys stand aside while an overlay is open).
  useEffect(() => {
    if (!keys) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.repeat || isEditableTarget(e.target)) return;
      const k = e.key.toLowerCase();
      const redo = k === 'y' || (k === 'z' && e.shiftKey);
      if (k !== 'z' && !redo) return;
      e.preventDefault();
      e.stopPropagation();
      void (redo ? runRedo() : runUndo()).then(reload);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [reload, keys]);
  return { raw, rows, act, undoRow, reload };
}

// One row: the tick, the title and its time, and the buttons; or, once decided, one grey line with Undo.
export function WrapRow({
  item,
  decision,
  onTick,
  onChoose,
  onUndo,
  showDay,
  showToday,
  nested,
}: {
  item: WrapItem;
  decision?: Decision;
  onTick: (item: WrapItem) => void;
  onChoose: (item: WrapItem, choice: WrapChoice) => void;
  onUndo: (d: Decision) => void;
  showDay?: boolean;
  showToday?: boolean;
  nested?: boolean;
}) {
  const t = item.task;
  const name = `${t.emoji ? `${t.emoji} ` : ''}${t.title}`;
  if (decision) {
    return (
      <View style={[styles.row, styles.folded, nested && styles.nested]} accessibilityLabel={`Wrap up ${t.title}, ${choiceText(decision.choice)}`} {...({ dataSet: { wrapRow: item.key, wrapDecided: decision.choice } } as object)}>
        <Text style={styles.foldText} numberOfLines={1}>
          {name} · {choiceText(decision.choice)}
          {decision.choice === 'tomorrow' && item.inside && item.inside.some((i) => !i.done && !i.series) ? ', with what is inside it' : ''}
        </Text>
        {!decision.group && (
          <Pressable onPress={() => onUndo(decision)} style={styles.undo} accessibilityRole="button" accessibilityLabel={`Undo ${t.title}`} {...({ dataSet: { wrapUndo: item.key } } as object)}>
            <Text style={styles.undoText}>Undo</Text>
          </Pressable>
        )}
      </View>
    );
  }
  const b = buttonsFor(item);
  const meta = [showDay && t.dueDate ? formatShortDate(t.dueDate) : '', item.row?.row.time ? formatTime(item.row.row.time) : t.startTime ? formatTime(t.startTime) : '', t.durationMinutes && !item.row?.row.time ? formatMinutes(t.durationMinutes) : item.row?.row.minutes ? formatMinutes(item.row.row.minutes) : '', item.series ? '↻ repeats' : '']
    .filter(Boolean)
    .join(' · ');
  const steps = t.subtasks && t.subtasks.length > 0 && !item.inside ? `${t.subtasks.filter((s) => s.done).length} of ${t.subtasks.length} steps` : '';
  return (
    <View style={[styles.row, nested && styles.nested]} accessibilityLabel={`Wrap up ${t.title}`} {...({ dataSet: { wrapRow: item.key } } as object)}>
      <View style={styles.head}>
        <Pressable onPress={() => onTick(item)} style={styles.tick} accessibilityRole="checkbox" accessibilityState={{ checked: item.done }} accessibilityLabel={item.done ? `Mark ${t.title} not done` : `Mark ${t.title} done`} {...({ dataSet: { wrapTick: item.key } } as object)}>
          <RoundCheck done={item.done} size={20} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.title, item.done && styles.done]} numberOfLines={2}>
            {name}
          </Text>
          {meta || steps ? <Text style={styles.meta}>{[meta, steps].filter(Boolean).join(' · ')}</Text> : null}
        </View>
        <View style={styles.buttons}>
          {showToday && b.tomorrow && <Btn text="Today" a11y={`Move ${t.title} to today`} id="today" item={item} onPress={() => onChoose(item, 'today')} />}
          {b.tomorrow && <Btn text="Tomorrow" a11y={`Move ${t.title} to tomorrow`} id="tomorrow" item={item} onPress={() => onChoose(item, 'tomorrow')} />}
          {b.list && <Btn text="Back to its list" a11y={`Put ${t.title} back in its list`} id="list" item={item} onPress={() => onChoose(item, 'list')} />}
          {b.letGo && <Btn text="Let go" a11y={item.series ? `Let go of ${t.title} for this day` : `Let go of ${t.title}, to the Trash`} id="letgo" item={item} onPress={() => onChoose(item, item.series ? 'skip' : 'letGo')} />}
        </View>
      </View>
      {b.stepsLeft > 0 && (
        <View style={styles.stepsRow}>
          <Btn text={stepsButton(b.stepsLeft)} a11y={`${stepsButton(b.stepsLeft)}, ${t.title}`} id="steps" item={item} onPress={() => onChoose(item, 'steps')} />
        </View>
      )}
    </View>
  );
}

function Btn({ text, a11y, id, item, onPress }: { text: string; a11y: string; id: string; item: WrapItem; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.btn} accessibilityRole="button" accessibilityLabel={a11y} {...({ dataSet: { wrapBtn: id, wrapFor: item.key } } as object)}>
      <Text style={styles.btnText}>{text}</Text>
    </Pressable>
  );
}

// What each choice writes; `today`: Earlier's Today.
export function runChoice(item: WrapItem, choice: WrapChoice, todayKey: string): Promise<UndoEntry | undefined> {
  const tomorrow = tomorrowOf(todayKey);
  if (choice === 'tomorrow') return wrapMove(item, tomorrow);
  if (choice === 'today') return wrapMove(item, todayKey);
  if (choice === 'list') return wrapToList(item);
  if (choice === 'steps') return wrapSteps(item, tomorrow);
  return wrapLetGo(item);
}

export default function WrapUp({ refreshKey }: { refreshKey: number }) {
  const cutMin = useCutMin();
  // The day Wrap up is about, fixed when it opens (left open past midnight, it still wraps up that day).
  const todayKey = useRef(dateKey(new Date())).current;
  const tomorrow = tomorrowOf(todayKey);
  const list = useCallback((raw: Task[]) => dayItems(raw, todayKey, dateKey(new Date()), cutMin), [todayKey, cutMin]);
  const { raw, rows, act, undoRow } = useWrapRows(list, refreshKey);
  const day = parseDateKey(todayKey).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const onTick = (item: WrapItem) => void act(item, null, () => wrapTick(item));
  const onChoose = (item: WrapItem, choice: WrapChoice) => void act(item, choice, () => runChoice(item, choice, todayKey));
  const figure = raw ? tomorrowText(raw, tomorrow, dateKey(new Date()), cutMin, Date.now()) : '';

  return (
    <View style={styles.overlay} accessibilityLabel="Wrap up" {...({ role: 'dialog', 'aria-modal': true, dataSet: { flow: 'shutdown', wrapUp: '1' } } as object)}>
      <View style={styles.bar}>
        <Text style={styles.heading} accessibilityRole="header">
          Wrap up · {day}
        </Text>
        <Pressable onPress={closeOverlay} style={styles.primary} accessibilityRole="button" accessibilityLabel="Done" {...({ dataSet: { wrapDone: '1' } } as object)}>
          <Text style={styles.primaryText}>Done</Text>
        </Pressable>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body}>
        <Text style={styles.hint}>Tick what is done. Each button saves at once; Undo on the row, or Ctrl+Z, puts it back.</Text>
        {!rows ? (
          <Text style={styles.hint}>Loading…</Text>
        ) : rows.length === 0 ? (
          <Text style={styles.hint}>Nothing was planned for today.</Text>
        ) : (
          rows.map(({ item, decision, kids }) => (
            <View key={item.key} style={{ gap: 6 }}>
              <WrapRow item={item} decision={decision} onTick={onTick} onChoose={onChoose} onUndo={undoRow} />
              {kids.map((x) => (
                <WrapRow key={x.item.key} item={x.item} decision={x.decision} onTick={onTick} onChoose={onChoose} onUndo={undoRow} nested />
              ))}
            </View>
          ))
        )}
        {figure ? (
          <Text style={styles.figure} {...({ dataSet: { wrapFigure: '1' } } as object)}>
            {figure}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

export const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 65, backgroundColor: Colors.background },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingHorizontal: 24, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.surface },
  heading: { fontSize: 20, fontFamily: DISPLAY_FONT_FAMILY, fontWeight: '700', color: Colors.textPrimary },
  primary: { minWidth: 120, height: 44, paddingHorizontal: 20, borderRadius: 10, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 15, fontWeight: '700', color: Colors.onAccent },
  body: { width: '100%', maxWidth: 920, alignSelf: 'center', padding: 24, gap: 8 },
  hint: { fontSize: 14, color: Colors.textSecondary, marginBottom: 6 },
  row: { padding: 10, borderRadius: 10, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, gap: 8 },
  nested: { marginLeft: 32 },
  folded: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.background },
  foldText: { flex: 1, fontSize: 14, color: Colors.textSecondary },
  undo: { paddingHorizontal: 12, height: 32, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, justifyContent: 'center', backgroundColor: Colors.surface },
  undoText: { fontSize: 14, fontWeight: '600', color: Colors.accentText },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  tick: { padding: 2 },
  title: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  done: { textDecorationLine: 'line-through', color: Colors.textSecondary },
  meta: { fontSize: 14, color: Colors.textSecondary },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  btn: { paddingHorizontal: 12, height: 34, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background, justifyContent: 'center' },
  btnText: { fontSize: 14, fontWeight: '600', color: Colors.accentText },
  stepsRow: { flexDirection: 'row', paddingLeft: 34 },
  figure: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary, marginTop: 12 },
});
