import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { dateKey } from '../../lib/kanban';
import { isTextEntryTarget } from '../../lib/editable';
import { stack, type UndoEntry } from '../../lib/undoStack';
import { undoEntry } from '../../lib/undoActions';
import { allOpen, earlierItems, showToday, tickAllText, tickedAllText, type WrapChoice, type WrapItem } from '../../lib/wrapUp';
import { tickAll } from '../../lib/wrapActions';
import type { Task } from '../../lib/types';
import { isPopoverOpen } from './Popover';
import { closeOverlay, notifyChanged, openOverlay, showNotice } from './uiStore';
import { IconHeading } from './ui';
import { WrapRow, runChoice, useWrapRows, styles as wrap } from './WrapUp';

// The Earlier panel (F3 of PLAN_daily_flow; it was the Missed panel, 2.27.0), opened from the Earlier pill in the left
// pane. It lists the one off tasks planned for a day before today and not ticked (D5: they no longer stay on the board's
// past columns). Each row has the Wrap up buttons (Tomorrow, Back to its list, Let go; Today too before 14:00) and a tick
// that marks it done on its own day; Tick all marks every one done on its own day. Every action saves at once and folds
// the row with its own Undo (Ctrl+Z works too). Nothing moves by itself. Repeating days are never listed.
export default function MissedPanel({ refreshKey, back }: { refreshKey: number; back?: 'planning' }) {
  // F4: opened from Plan my day, it goes back there when it closes.
  const close = () => (back === 'planning' ? openOverlay({ kind: 'flow', mode: 'planning' }) : closeOverlay());
  const todayKey = useRef(dateKey(new Date())).current;
  const list = useCallback((raw: Task[]) => earlierItems(raw, todayKey), [todayKey]);
  const { rows, act, undoRow, reload } = useWrapRows(list, refreshKey);
  const [all, setAll] = useState<{ n: number; entry: UndoEntry } | null>(null);
  const today = showToday(new Date().getHours());

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || isPopoverOpen() || isTextEntryTarget(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      close();
    };
    window.addEventListener('keydown', onKey, true);
    const t = setTimeout(() => (document.querySelector('[data-missed-close]') as HTMLElement | null)?.focus(), 30);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey, true);
      if (before && before.isConnected) before.focus({ preventScroll: true });
    };
  }, []);

  const live = (rows ?? []).filter((r) => !r.decision).map((r) => ({ ...r.item, inside: r.kids.filter((k) => !k.decision).map((k) => k.item) }));
  const open = allOpen(live);
  // A tick here is Done on its own day (as Tick all, for one).
  const onTick = (item: WrapItem) => void act(item, 'done', () => tickAll([item.task]));
  const onChoose = (item: WrapItem, choice: WrapChoice) => void act(item, choice, () => runChoice(item, choice, dateKey(new Date())));
  const onTickAll = async () => {
    const group = live.flatMap((i) => [i, ...(i.inside ?? [])]);
    const n = open.length;
    const entry = await act(group[0], 'done', () => tickAll(open), group);
    if (entry) setAll({ n, entry });
  };
  const allShown = all && stack.has(all.entry) ? all : null;

  return (
    <Pressable style={styles.scrim} onPress={close} accessibilityLabel="Close Earlier">
      <Pressable onPress={() => {}} style={styles.card} accessibilityLabel="Earlier" {...({ role: 'dialog', 'aria-modal': true, dataSet: { earlier: '1' } } as object)}>
        <View style={styles.header}>
          <IconHeading icon="time-outline" style={styles.title}>Earlier</IconHeading>
          <View style={styles.headRight}>
            {open.length > 1 && (
              <Pressable onPress={() => void onTickAll()} style={wrap.primary} accessibilityRole="button" accessibilityLabel={`${tickAllText(open.length)}: done on their own days`} {...({ dataSet: { earlierTickAll: String(open.length) } } as object)}>
                <Text style={wrap.primaryText}>{tickAllText(open.length)}</Text>
              </Pressable>
            )}
            <Pressable onPress={close} style={styles.close} accessibilityRole="button" accessibilityLabel="Close" {...({ dataSet: { missedClose: '1' } } as object)}>
              <Ionicons name="close" size={20} color={Colors.textSecondary} />
            </Pressable>
          </View>
        </View>
        <Text style={wrap.hint}>Planned for an earlier day and not ticked. Nothing moves until you choose. A tick, or Tick all, marks a task done on its own day.</Text>
        {allShown && (
          <View style={[wrap.row, wrap.folded]} {...({ dataSet: { earlierTicked: String(allShown.n) } } as object)}>
            <Text style={wrap.foldText}>{tickedAllText(allShown.n)}</Text>
            <Pressable
              onPress={async () => {
                const r = await undoEntry(allShown.entry);
                if (!r.ok) showNotice(r.text);
                setAll(null);
                notifyChanged();
                reload();
              }}
              style={wrap.undo}
              accessibilityRole="button"
              accessibilityLabel="Undo Tick all"
              {...({ dataSet: { earlierTickAllUndo: '1' } } as object)}
            >
              <Text style={wrap.undoText}>Undo</Text>
            </Pressable>
          </View>
        )}
        <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 6 }} showsVerticalScrollIndicator={false}>
          {rows && rows.length === 0 && <Text style={wrap.hint}>Nothing waiting from earlier days. 🌤️</Text>}
          {rows?.map(({ item, decision, kids }) => (
            <View key={item.key} style={{ gap: 6 }}>
              <WrapRow item={item} decision={decision} onTick={onTick} onChoose={onChoose} onUndo={undoRow} showDay showToday={today} />
              {kids.map((x) => (
                <WrapRow key={x.item.key} item={x.item} decision={x.decision} onTick={onTick} onChoose={onChoose} onUndo={undoRow} showDay showToday={today} nested />
              ))}
            </View>
          ))}
        </ScrollView>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 60, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.scrim },
  card: { width: 760, maxWidth: '94%', maxHeight: '88%', borderRadius: 16, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, padding: 18, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
});
