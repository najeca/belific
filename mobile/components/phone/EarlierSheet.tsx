// 3.59.1: Earlier on the phone. A one off task planned for a day before today and not ticked is not shown on Today or
// the Tasks tab; it waits in one quiet "Earlier" pill. The pill opens this sheet with the desktop's rules (lib/wrapUp.ts:
// earlierItems, buttonsFor, showToday) and the desktop's writes (lib/wrapActions.ts): a tick (done on its own day),
// Today (before 14:00), Tomorrow (its time kept), Back to its list (Day and time cleared), Let go (to the Trash, never
// done), the steps or smaller tasks left to tomorrow, and Tick all. Every answer saves at once and has its own Undo
// (lib/earlierUndo.ts: the phone's undo stack does not record). Nothing moves by itself; no red, no counts of loss.
import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Platform, Pressable, Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { radius, type ColorTokens } from '../../lib/tokens';
import { addDays, dateKey, formatDayTitle, parseDateKey } from '../../lib/kanban';
import { formatTime } from '../../lib/data';
import { loadListsRaw, loadTasksRaw, updateTasks } from '../../lib/storage';
import { allOpen, buttonsFor, choiceText, earlierItems, partsButton, showToday, stepsButton, tickAllText, tickedAllText, type WrapChoice, type WrapItem } from '../../lib/wrapUp';
import { tickAll, wrapLetGo, wrapMove, wrapParts, wrapSteps, wrapToList } from '../../lib/wrapActions';
import { earlierA11y, undoRows } from '../../lib/earlierUndo';
import { BRAIN_DUMP_NAME, liveLists } from '../../lib/lists';
import type { Task, TaskList } from '../../lib/types';
import { useStyles, useTheme } from './theme';
import { haptic, useReducedMotion } from './touch';
import { inter, type } from './type';
import { RoundCheck } from './ui';
import { UndoBar, type UndoMessage } from './UndoBar';

const make = (c: ColorTokens) => ({
  pill: { alignSelf: 'flex-start' as const, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: radius.full, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.surface },
  pillText: { ...inter(600), fontSize: 14, color: c.textPrimary },
  pillCount: { ...inter(600), fontSize: 13, color: c.textSecondary },
  screen: { flex: 1, backgroundColor: c.background, borderTopWidth: 8, borderTopColor: c.accent },
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: 16, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.pane },
  title: { ...type.sheetTitle, color: c.textPrimary },
  close: { minWidth: 64, minHeight: 44, alignItems: 'flex-end' as const, justifyContent: 'center' as const },
  closeText: { ...inter(700), fontSize: 17, color: c.accentText },
  hint: { ...inter(400), fontSize: 14, lineHeight: 20, color: c.textSecondary },
  card: { backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: 12, gap: 10 },
  nested: { marginLeft: 20 },
  rowTop: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  tick: { width: 44, height: 44, alignItems: 'center' as const, justifyContent: 'center' as const },
  name: { ...inter(600), fontSize: 16, lineHeight: 21, color: c.textPrimary, flexShrink: 1 },
  meta: { ...inter(400), fontSize: 13, color: c.textSecondary, marginTop: 2 },
  btns: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  btn: { minHeight: 44, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.background, alignItems: 'center' as const, justifyContent: 'center' as const },
  btnText: { ...inter(600), fontSize: 14, color: c.textPrimary },
  primary: { minHeight: 44, paddingHorizontal: 16, borderRadius: radius.md, backgroundColor: c.accent, alignItems: 'center' as const, justifyContent: 'center' as const, alignSelf: 'flex-start' as const },
  primaryText: { ...inter(700), fontSize: 15, color: c.onAccent },
  empty: { ...inter(400), fontSize: 15, color: c.textSecondary, paddingVertical: 24, textAlign: 'center' as const },
});

// The pill on Today and the Tasks tab; drawn only when something waits.
export function EarlierPill({ count, onPress }: { count: number; onPress: () => void }) {
  const s = useStyles(make);
  const { c } = useTheme();
  if (count <= 0) return null;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.pill, pressed && { backgroundColor: c.hover }]} accessibilityRole="button" accessibilityLabel={earlierA11y(count)} {...({ dataSet: { earlierPill: String(count) } } as object)}>
      <Ionicons name="time-outline" size={16} color={c.textSecondary} />
      <Text style={s.pillText}>Earlier</Text>
      <Text style={s.pillCount}>{count}</Text>
    </Pressable>
  );
}

// How many wait (the desktop pill's count: a shift with its blocks counts once).
export const earlierCount = (raw: Task[], todayKey: string): number => earlierItems(raw, todayKey).length;

export function EarlierSheet({ visible, onClose, onChanged }: { visible: boolean; onClose: () => void; onChanged: () => void }) {
  const s = useStyles(make);
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [items, setItems] = useState<WrapItem[] | null>(null);
  const [lists, setLists] = useState<TaskList[]>([]);
  const [undo, setUndo] = useState<UndoMessage | null>(null);
  const todayKey = dateKey(new Date());
  const tomorrowKey = dateKey(addDays(parseDateKey(todayKey), 1));

  const reload = useCallback(async () => {
    const [raw, ls] = await Promise.all([loadTasksRaw(), loadListsRaw()]);
    setItems(earlierItems(raw, dateKey(new Date())));
    setLists(ls);
  }, []);
  useEffect(() => {
    if (!visible) return;
    setUndo(null);
    void reload();
  }, [visible, reload]);

  // One answer: the rows before and after it give its Undo.
  async function answer(text: string, run: () => Promise<unknown>) {
    const before = await loadTasksRaw();
    await run();
    const after = await loadTasksRaw();
    const back = undoRows(before, after);
    await reload();
    onChanged();
    setUndo({
      id: Date.now(),
      text,
      undo: back.length
        ? () =>
            void updateTasks(back).then(async () => {
              await reload();
              onChanged();
            })
        : undefined,
    });
  }

  const choose = (item: WrapItem, choice: WrapChoice) => {
    const run = () => {
      if (choice === 'today') return wrapMove(item, todayKey);
      if (choice === 'tomorrow') return wrapMove(item, tomorrowKey);
      if (choice === 'list') return wrapToList(item);
      if (choice === 'steps') return wrapSteps(item, tomorrowKey);
      if (choice === 'parts') return wrapParts(item, tomorrowKey);
      return wrapLetGo(item);
    };
    void answer(`${choiceText(choice)}: ${item.task.title}`, run);
  };
  const tickOne = (item: WrapItem) => {
    haptic('success');
    void answer(`Done on its own day: ${item.task.title}`, () => tickAll([item.task]));
  };
  const open = items ? allOpen(items) : [];
  const live = liveLists(lists);
  const today = showToday(new Date().getHours());

  const btn = (label: string, run: () => void, data: string, a11y: string) => (
    <Pressable key={data} onPress={run} style={({ pressed }) => [s.btn, pressed && { backgroundColor: c.hover }]} accessibilityRole="button" accessibilityLabel={a11y} {...({ dataSet: { earlierBtn: data } } as object)}>
      <Text style={s.btnText}>{label}</Text>
    </Pressable>
  );
  const row = (item: WrapItem, nested = false) => {
    const t = item.task;
    const b = buttonsFor(item);
    const list = t.listKey ? live.find((l) => l.key === t.listKey) : undefined;
    const where = list ? `${list.emoji ? `${list.emoji} ` : ''}${list.name}` : BRAIN_DUMP_NAME;
    const when = `${t.dueDate ? formatDayTitle(t.dueDate, todayKey) : ''}${t.startTime ? `, ${formatTime(t.startTime)}` : ''}`;
    return (
      <View key={item.key} style={[s.card, nested && s.nested]} {...({ dataSet: { earlierRow: t.title } } as object)}>
        <View style={s.rowTop}>
          <Pressable onPress={() => tickOne(item)} style={s.tick} accessibilityRole="checkbox" accessibilityState={{ checked: false }} accessibilityLabel={`Tick ${t.title}, done on its own day`} {...({ dataSet: { earlierTick: t.title } } as object)}>
            <RoundCheck done={false} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.name} numberOfLines={2}>{`${t.emoji ? `${t.emoji} ` : ''}${t.title}`}</Text>
            <Text style={s.meta} numberOfLines={1}>{[when, where].filter(Boolean).join(' · ')}</Text>
          </View>
        </View>
        <View style={s.btns}>
          {today && b.tomorrow ? btn('Today', () => choose(item, 'today'), `today:${t.title}`, `Today: ${t.title}`) : null}
          {b.tomorrow ? btn('Tomorrow', () => choose(item, 'tomorrow'), `tomorrow:${t.title}`, `Tomorrow: ${t.title}`) : null}
          {b.list ? btn('Back to its list', () => choose(item, 'list'), `list:${t.title}`, `Back to its list: ${t.title}`) : null}
          {b.letGo ? btn('Let go', () => choose(item, 'letGo'), `letGo:${t.title}`, `Let go of ${t.title}, it goes to the Trash`) : null}
          {b.stepsLeft ? btn(stepsButton(b.stepsLeft), () => choose(item, 'steps'), `steps:${t.title}`, stepsButton(b.stepsLeft)) : null}
          {b.partsLeft ? btn(partsButton(b.partsLeft), () => choose(item, 'parts'), `parts:${t.title}`, partsButton(b.partsLeft)) : null}
        </View>
      </View>
    );
  };

  if (!visible) return null;
  return (
    <Modal visible animationType={reduced ? 'none' : 'slide'} presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={s.screen} {...({ dataSet: { earlierSheet: String(items?.length ?? 0) } } as object)}>
        <View style={[s.head, { paddingTop: Platform.OS === 'ios' ? 12 : insets.top + 12 }]}>
          <Text style={s.title} accessibilityRole="header">Earlier</Text>
          <Pressable onPress={onClose} style={s.close} accessibilityRole="button" accessibilityLabel="Close Earlier" {...({ dataSet: { earlierClose: '1' } } as object)}>
            <Text style={s.closeText}>Done</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 100 }}>
          <Text style={s.hint}>Planned for an earlier day and not ticked. Nothing moves until you choose. A tick marks it done on its own day; Let go puts it in the Trash.</Text>
          {open.length > 1 ? (
            <Pressable
              onPress={() => {
                const n = open.length;
                haptic('success');
                void answer(tickedAllText(n), () => tickAll(open));
              }}
              style={s.primary}
              accessibilityRole="button"
              accessibilityLabel={`${tickAllText(open.length)}: done on their own days`}
              {...({ dataSet: { earlierTickAll: String(open.length) } } as object)}
            >
              <Text style={s.primaryText}>{tickAllText(open.length)}</Text>
            </Pressable>
          ) : null}
          {items && items.length === 0 ? <Text style={s.empty}>Nothing waiting from earlier days.</Text> : null}
          {(items ?? []).map((i) => (
            <View key={i.key} style={{ gap: 8 }}>
              {row(i)}
              {(i.inside ?? []).map((x) => row(x, true))}
            </View>
          ))}
        </ScrollView>
        <UndoBar message={undo} onDone={() => setUndo(null)} />
      </View>
    </Modal>
  );
}
