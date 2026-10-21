import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { addDays, dateKey, parseDateKey } from '../../lib/kanban';
import { isTextEntryTarget } from '../../lib/editable';
import { missedItems } from '../../lib/missed';
import { loadTasksRaw } from '../../lib/storage';
import { loadLabels } from '../../lib/labels';
import { doMissedToday, dropDay, moveMissedAllToday, moveTaskTo, skipMissed } from '../../lib/missedActions';
import type { Project, Task } from '../../lib/types';
import MissedList from './MissedList';
import { isPopoverOpen } from './Popover';
import { closeOverlay, notifyChanged } from './uiStore';

// The Missed panel (2.27.0, item 6), opened from the button in the left pane.
// Every action writes at once (an ordinary task edit, queued for sync); nothing
// here moves a date by itself, and the list is worked out afresh every time.
export default function MissedPanel({ refreshKey }: { refreshKey: number }) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [labels, setLabels] = useState<Project[]>([]);
  const todayKey = dateKey(new Date());
  const tomorrow = dateKey(addDays(parseDateKey(todayKey), 1));
  const reload = useCallback(() => {
    loadTasksRaw().then(setTasks);
    loadLabels().then(setLabels);
  }, []);
  useEffect(() => reload(), [reload, refreshKey]);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || isPopoverOpen() || isTextEntryTarget(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      closeOverlay();
    };
    window.addEventListener('keydown', onKey, true);
    const t = setTimeout(() => (document.querySelector('[data-missed-close]') as HTMLElement | null)?.focus(), 30);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey, true);
      if (before && before.isConnected) before.focus({ preventScroll: true });
    };
  }, []);

  const items = useMemo(() => (tasks ? missedItems(tasks, todayKey) : []), [tasks, todayKey]);
  const done = (p: Promise<unknown>) => p.then(() => (notifyChanged(), reload()));

  return (
    <Pressable style={styles.scrim} onPress={closeOverlay} accessibilityLabel="Close missed">
      <Pressable onPress={() => {}} style={styles.card} accessibilityLabel="Missed" {...({ role: 'dialog', 'aria-modal': true } as object)}>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            🕓 Missed
          </Text>
          <Pressable onPress={closeOverlay} style={styles.close} accessibilityRole="button" accessibilityLabel="Close" {...({ dataSet: { missedClose: '1' } } as object)}>
            <Ionicons name="close" size={18} color={Colors.textSecondary} />
          </Pressable>
        </View>
        <Text style={styles.hint}>Planned for an earlier day and not done yet. Nothing moves until you choose. Repeating days are never moved: skip them, or do one today as a separate task.</Text>
        <ScrollView style={{ flexGrow: 0 }} showsVerticalScrollIndicator={false}>
          {tasks && (
            <MissedList
              items={items}
              labels={labels}
              todayKey={todayKey}
              empty="Nothing missed. 🌤️"
              actions={{
                today: (t) => done(moveTaskTo(t.id, todayKey)),
                tomorrow: (t) => done(moveTaskTo(t.id, tomorrow)),
                pickDay: (t, day) => done(moveTaskTo(t.id, day)),
                drop: (t) => done(dropDay(t.id)),
                skip: (occ) => done(skipMissed(occ)),
                doToday: (occ) => done(doMissedToday(occ, todayKey)),
                allToday: () => done(moveMissedAllToday(todayKey)),
              }}
            />
          )}
        </ScrollView>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 60, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.scrim },
  card: { width: 560, maxWidth: '94%', maxHeight: '88%', borderRadius: 18, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, padding: 18, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  hint: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
  close: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
});
