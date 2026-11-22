// D5 of PLAN_desktop_parity (3.71.0): the phone's Repeats on the desktop, in the left pane (the list switcher's "Repeats").
// Repeating tasks grouped by how often they repeat (Daily, Weekly, Every 2 weeks, Every few weeks, Monthly, Every year,
// Other), each group folds (a click, Enter or Space on its heading) and the fold is remembered on this computer only (kv,
// never synced); each row says the pattern in words with "Until 17 Dec" when it ends (lib/repeatGroups.ts, the same words
// as the phone) and is a slab card like the phone's. A tick, Skip and Today are the Quests page's own actions.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { dateKey } from '../../lib/kanban';
import { kv } from '../../lib/kv';
import { buildQuests, canPlanToday, questsBySection, streakText, type Quest } from '../../lib/quests';
import { completeQuest, planQuestToday, reopenQuest, skipQuest } from '../../lib/questActions';
import { questEmoji, questWords } from '../../lib/repeatGroups';
import { DESKTOP_REPEAT_FOLDS_KEY, parseFolds, toggleFold } from '../../lib/repeatFolds';
import { cardSlab } from '../../lib/tokens';
import { loadRoutineCompletions, loadTasksRaw } from '../../lib/storage';
import { notifyChanged, openDetail } from './uiStore';
import { useResolvedTheme } from './themeStore';
import { contextMenuProps } from './cardMenuStore';
import { opsForProjected, opsForTask } from '../../lib/taskOps';
import { RoundCheck } from './ui';

export default function RepeatsList({ refreshKey, onChanged, onCount }: { refreshKey: number; onChanged: () => void; onCount?: (n: number) => void }) {
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [folds, setFolds] = useState<string[]>([]);
  const theme = useResolvedTheme();
  const todayKey = dateKey(new Date());

  const reload = useCallback(async () => {
    const [tasks, completions] = await Promise.all([loadTasksRaw(), loadRoutineCompletions()]);
    const q = buildQuests(tasks, completions, dateKey(new Date()));
    setQuests(q);
    setLoaded(true);
    onCount?.(q.length);
  }, [onCount]);
  useEffect(() => {
    void reload();
  }, [reload, refreshKey]);
  useEffect(() => {
    kv.getItem(DESKTOP_REPEAT_FOLDS_KEY).then((v) => setFolds(parseFolds(v))).catch(() => {});
  }, []);

  const groups = useMemo(() => questsBySection(quests), [quests]);
  const fold = (key: string) => {
    const next = toggleFold(folds, key);
    setFolds(next);
    kv.setItem(DESKTOP_REPEAT_FOLDS_KEY, JSON.stringify(next)).catch(() => {});
  };
  const act = (fn: () => Promise<unknown>) => () => {
    void fn().then(() => {
      notifyChanged();
      onChanged();
      void reload();
    });
  };
  const slab = theme !== 'dark' ? ({ boxShadow: `${cardSlab.offset}px ${cardSlab.offset}px 0 0 ${Colors.borderStrong}` } as object) : null;

  return (
    <View style={styles.wrap} accessibilityLabel="Repeats" {...({ dataSet: { repeatsList: String(quests.length) } } as object)}>
      {loaded && groups.length === 0 ? <Text style={styles.empty}>No repeating tasks yet. Give a task a repeat and it shows here.</Text> : null}
      {groups.map(({ section, quests: qs }) => {
        const folded = folds.includes(section.key);
        return (
          <View key={section.key} {...({ dataSet: { repeatGroup: section.key } } as object)}>
            <Pressable
              onPress={() => fold(section.key)}
              style={styles.groupHead}
              accessibilityRole="button"
              accessibilityState={{ expanded: !folded }}
              accessibilityLabel={`${section.title}, ${qs.length}. ${folded ? 'Folded, press to show' : 'Press to fold'}`}
              {...({ dataSet: { groupHead: section.key, folded: folded ? '1' : '0' } } as object)}
            >
              <Text style={styles.groupTitle}>{`${section.emoji} ${section.title} · ${qs.length}`}</Text>
              <Ionicons name={folded ? 'chevron-down' : 'chevron-up'} size={16} color={Colors.textSecondary} />
            </Pressable>
            {folded ? null : qs.map((q) => <QuestRow key={q.root} quest={q} todayKey={todayKey} act={act} slab={slab} />)}
          </View>
        );
      })}
    </View>
  );
}

function QuestRow({ quest: q, todayKey, act, slab }: { quest: Quest; todayKey: string; act: (fn: () => Promise<unknown>) => () => void; slab: object | null }) {
  const done = q.due.kind === 'done';
  const target = q.target;
  const streak = streakText(q);
  const words = questWords(q, todayKey);
  const occ = target ?? (q.undo ? { task: q.undo, stored: true } : null);
  const menu = occ
    ? contextMenuProps(() => ({
        task: occ.task,
        projected: !occ.stored,
        ops: occ.stored ? opsForTask(occ.task) : opsForProjected(occ.task),
        open: () => openDetail(occ.task.id),
        onChanged: () => notifyChanged(),
      }))
    : {};
  return (
    <View style={[styles.card, slab, done && styles.cardDone]} accessibilityLabel={`Repeat ${q.title}`} {...menu} {...({ dataSet: { quest: q.title, repeatRow: q.root } } as object)}>
      <View style={styles.line}>
        <Pressable
          onPress={done && q.undo ? act(() => reopenQuest(q.undo!)) : target ? act(() => completeQuest(target)) : undefined}
          disabled={!target && !(done && q.undo)}
          style={styles.tick}
          accessibilityRole="button"
          accessibilityLabel={done ? `Reopen ${q.title}` : `Complete ${q.title}`}
        >
          <RoundCheck done={done} size={22} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.title, done && styles.titleDone]} numberOfLines={2}>{`${questEmoji(q)} ${q.title}`}</Text>
          <Text style={styles.words} {...({ dataSet: { questWords: '1' } } as object)}>{words}</Text>
        </View>
      </View>
      <View style={[styles.line, { paddingLeft: 40, flexWrap: 'wrap' }]}>
        <Text style={[styles.due, (q.due.kind === 'dueToday' || q.due.kind === 'due') && styles.dueNow]}>{q.due.text}</Text>
        {streak ? <Text style={styles.streak}>{streak}</Text> : null}
        {target ? (
          <>
            <Pressable onPress={act(() => skipQuest(target))} style={styles.action} accessibilityRole="button" accessibilityLabel={`Skip ${q.title} this time`}>
              <Text style={styles.actionText}>Skip</Text>
            </Pressable>
            {canPlanToday(q, todayKey) ? (
              <Pressable onPress={act(() => planQuestToday(target, todayKey))} style={styles.action} accessibilityRole="button" accessibilityLabel={`Put ${q.title} on today`}>
                <Text style={styles.actionText}>Today</Text>
              </Pressable>
            ) : null}
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingBottom: 24 },
  empty: { fontSize: 13, color: Colors.textSecondary, paddingVertical: 12 },
  groupHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 36, paddingHorizontal: 4, marginTop: 6 },
  groupTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 0.8, color: Colors.textSecondary, textTransform: 'uppercase' },
  card: { padding: 12, gap: 6, marginRight: cardSlab.offset, marginBottom: cardSlab.offset + 4, borderRadius: 12, borderWidth: 2, borderColor: Colors.border, backgroundColor: Colors.surface },
  cardDone: { backgroundColor: Colors.background },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tick: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  titleDone: { color: Colors.textSecondary },
  words: { fontSize: 12, color: Colors.textSecondary },
  due: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: Colors.background },
  dueNow: { color: Colors.accentText },
  streak: { fontSize: 12, color: Colors.textSecondary },
  action: { paddingHorizontal: 10, height: 28, justifyContent: 'center', backgroundColor: Colors.hostPill },
  actionText: { fontSize: 12, fontWeight: '700', color: Colors.onHostPill },
});
