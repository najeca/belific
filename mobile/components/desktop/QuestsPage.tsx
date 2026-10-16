import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { dateKey } from '../../lib/kanban';
import { buildQuests, canPlanToday, nextHalfHour, questsBySection, streakText, QUEST_SECTIONS, type Quest } from '../../lib/quests';
import { completeQuest, planQuestToday, reopenQuest, skipQuest, timeboxQuestToday } from '../../lib/questActions';
import { loadRoutineCompletions, loadTasksRaw } from '../../lib/storage';
import { notifyChanged } from './uiStore';

// The Quests page (build plan phase 4): every repeating task, grouped by how
// often it repeats (Daily, Weekly, Every 2 weeks, Every few weeks, Monthly,
// Every year, and any rule this version does not know), one card each. A page
// like Progress: opening it changes the screen, Back returns. Nothing is stored
// for a quest; it is its series (decision 023), so a tick here is the same tick
// as on the board.
//
// Each card: its emoji and name, how it repeats, what is due in this period
// ("Due today", "Done this week", "Next: Fri"), the current and best streak
// (only when there is one; never a zero, never a warning: decisions 007 and
// 027), and one tap to complete, a planned skip, Today, and Timebox.
export default function QuestsPage({ refreshKey }: { refreshKey: number }) {
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loaded, setLoaded] = useState(false);
  const todayKey = dateKey(new Date());

  const reload = useCallback(async () => {
    const [tasks, completions] = await Promise.all([loadTasksRaw(), loadRoutineCompletions()]);
    setQuests(buildQuests(tasks, completions, dateKey(new Date())));
    setLoaded(true);
  }, []);
  useEffect(() => {
    reload();
  }, [reload, refreshKey]);

  const groups = useMemo(() => questsBySection(quests), [quests]);
  const act = (fn: () => Promise<unknown>) => () => {
    fn().then(() => {
      notifyChanged();
      reload();
    });
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} accessibilityLabel="Quests">
      <View style={styles.column}>
        <Text style={styles.heading} accessibilityRole="header">
          🎯 Quests
        </Text>
        <Text style={styles.hint}>Your repeating tasks, by how often they repeat. A skipped day never breaks a streak.</Text>
        {loaded && groups.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.body}>🔁 No repeating tasks yet. Give a task a repeat (🔁 on its card) and it shows here.</Text>
          </View>
        )}
        {groups.map(({ section, quests: list }) => (
          <View key={section.key} style={styles.section} accessibilityLabel={`${section.title} quests`}>
            <Text style={styles.sectionTitle} accessibilityRole="header">
              {section.emoji} {section.title}
            </Text>
            <View style={styles.grid}>
              {list.map((q) => (
                <QuestCard key={q.root} quest={q} todayKey={todayKey} act={act} />
              ))}
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function QuestCard({ quest: q, todayKey, act }: { quest: Quest; todayKey: string; act: (fn: () => Promise<unknown>) => () => void }) {
  const done = q.due.kind === 'done';
  const streak = streakText(q);
  const sectionEmoji = QUEST_SECTIONS.find((s) => s.key === q.section)?.emoji ?? '🔁';
  const target = q.target;
  return (
    <View style={[styles.card, done && styles.cardDone]} accessibilityLabel={`Quest ${q.title}`} {...({ dataSet: { quest: q.root } } as object)}>
      <View style={styles.row}>
        <Pressable
          onPress={done && q.undo ? act(() => reopenQuest(q.undo!)) : target ? act(() => completeQuest(target)) : undefined}
          disabled={!target && !(done && q.undo)}
          style={styles.tick}
          accessibilityRole="button"
          accessibilityLabel={done ? `Reopen ${q.title}` : `Complete ${q.title}`}
        >
          <Ionicons name={done ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={done ? Colors.accent : Colors.textSecondary} />
        </Pressable>
        <View style={styles.main}>
          <Text style={[styles.title, done && styles.titleDone]} numberOfLines={2}>
            {q.emoji ?? sectionEmoji} {q.title}
          </Text>
          <Text style={styles.repeat}>{q.repeat}</Text>
        </View>
      </View>
      <View style={styles.row}>
        <Text style={[styles.due, (q.due.kind === 'dueToday' || q.due.kind === 'due') && styles.dueNow, done && styles.dueDone]} accessibilityLabel={`${q.title}: ${q.due.text}`}>
          {q.due.text}
        </Text>
        {streak ? <Text style={styles.streak}>{streak}</Text> : null}
      </View>
      {target && (
        <View style={styles.actions}>
          <Pressable onPress={act(() => skipQuest(target))} style={styles.action} accessibilityRole="button" accessibilityLabel={`Skip ${q.title} this time`}>
            <Text style={styles.actionText}>⏭️ Skip</Text>
          </Pressable>
          {canPlanToday(q, todayKey) && (
            <Pressable onPress={act(() => planQuestToday(target, todayKey))} style={styles.action} accessibilityRole="button" accessibilityLabel={`Put ${q.title} on today`}>
              <Text style={styles.actionText}>📅 Today</Text>
            </Pressable>
          )}
          {(canPlanToday(q, todayKey) || target.task.dueDate === todayKey) && !target.task.startTime && (
            <Pressable
              onPress={act(() => timeboxQuestToday(target, todayKey, nextHalfHour(new Date())))}
              style={styles.action}
              accessibilityRole="button"
              accessibilityLabel={`Put ${q.title} on the Timebox today`}
            >
              <Text style={styles.actionText}>🕐 Timebox</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 24, alignItems: 'center' },
  column: { width: '100%', maxWidth: 980, gap: 14 },
  heading: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  hint: { fontSize: 13, color: Colors.textSecondary },
  empty: { padding: 16, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  body: { fontSize: 14, color: Colors.textPrimary },
  section: { gap: 8, marginTop: 6 },
  sectionTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 1, color: Colors.textSecondary, textTransform: 'uppercase' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { width: 300, padding: 14, gap: 8, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  cardDone: { backgroundColor: Colors.background },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  tick: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  main: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  titleDone: { color: Colors.textSecondary },
  repeat: { fontSize: 12, color: Colors.textSecondary },
  due: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: Colors.background },
  dueNow: { color: Colors.accentText },
  dueDone: { color: Colors.accentText, backgroundColor: Colors.surface },
  streak: { fontSize: 12, color: Colors.textSecondary },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  action: { paddingHorizontal: 10, height: 30, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, justifyContent: 'center', backgroundColor: Colors.background },
  actionText: { fontSize: 12, color: Colors.textPrimary },
});
