import { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { dateKey } from '../../lib/kanban';
import { buildQuests, canPlanToday, questsBySection, streakText, QUEST_SECTIONS, type Quest } from '../../lib/quests';
import { completeQuest, planQuestToday, reopenQuest, skipQuest } from '../../lib/questActions';
import { loadRoutineCompletions, loadTasksRaw } from '../../lib/storage';

// Quests on the iPhone (build plan phase 4): the same quests as the desktop
// (lib/quests.ts), the same writes (lib/questActions.ts). Every repeating task,
// grouped Daily, Weekly, Every 2 weeks, Every few weeks, Monthly, Every year
// (and any rule this version does not know). One card each: emoji, name, what is
// due this period, current and best streak (never a zero, never a warning:
// decisions 007 and 027), one tap to complete, Skip, and Today. The iPhone has
// no Timebox, so there is no Timebox button here. Inside the Tasks tab until P5 (PLAN_phone P3).
export default function QuestsScreen() {
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    const [tasks, completions] = await Promise.all([loadTasksRaw(), loadRoutineCompletions()]);
    setQuests(buildQuests(tasks, completions, dateKey(new Date())));
    setLoaded(true);
  }, []);
  useFocusEffect(
    useCallback(() => {
      reload().catch(() => {});
    }, [reload]),
  );

  const todayKey = dateKey(new Date());
  const act = (fn: () => Promise<unknown>) => () => {
    fn().then(() => reload());
  };
  const groups = questsBySection(quests);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 96 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.hint}>Your repeating tasks. A skipped day never breaks a streak.</Text>
        {loaded && groups.length === 0 && (
          <View style={styles.card}>
            <Text style={styles.body}>🔁 No repeating tasks yet. Give a task a repeat and it shows here.</Text>
          </View>
        )}
        {groups.map(({ section, quests: list }) => (
          <View key={section.key} accessibilityLabel={`${section.title} quests`}>
            <Text style={styles.section} accessibilityRole="header">
              {section.emoji} {section.title}
            </Text>
            {list.map((q) => {
              const done = q.due.kind === 'done';
              const streak = streakText(q);
              const target = q.target;
              const emoji = q.emoji ?? QUEST_SECTIONS.find((s) => s.key === q.section)?.emoji ?? '🔁';
              return (
                <View key={q.root} style={[styles.card, done && styles.cardDone]} accessibilityLabel={`Quest ${q.title}`}>
                  <View style={styles.row}>
                    <TouchableOpacity
                      onPress={done && q.undo ? act(() => reopenQuest(q.undo!)) : target ? act(() => completeQuest(target)) : undefined}
                      disabled={!target && !(done && q.undo)}
                      style={styles.tick}
                      accessibilityRole="button"
                      accessibilityLabel={done ? `Reopen ${q.title}` : `Complete ${q.title}`}
                    >
                      <Ionicons name={done ? 'checkmark-circle' : 'ellipse-outline'} size={28} color={done ? Colors.accent : Colors.textSecondary} />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cardTitle, done && styles.cardTitleDone]}>
                        {emoji} {q.title}
                      </Text>
                      <Text style={styles.meta}>{q.repeat}</Text>
                    </View>
                  </View>
                  <View style={styles.row}>
                    <Text style={[styles.due, (q.due.kind === 'dueToday' || q.due.kind === 'due') && styles.dueNow]}>{q.due.text}</Text>
                    {streak ? <Text style={styles.meta}>{streak}</Text> : null}
                  </View>
                  {target && (
                    <View style={styles.row}>
                      <TouchableOpacity style={styles.action} onPress={act(() => skipQuest(target))} accessibilityRole="button" accessibilityLabel={`Skip ${q.title} this time`}>
                        <Text style={styles.actionText}>⏭️ Skip</Text>
                      </TouchableOpacity>
                      {canPlanToday(q, todayKey) && (
                        <TouchableOpacity style={styles.action} onPress={act(() => planQuestToday(target, todayKey))} accessibilityRole="button" accessibilityLabel={`Put ${q.title} on today`}>
                          <Text style={styles.actionText}>📅 Today</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: 16 },
  title: { fontSize: 32, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.5, paddingTop: 16, paddingBottom: 8 },
  hint: { fontSize: 13, color: Colors.textSecondary, marginBottom: 8 },
  section: { fontSize: 12, fontWeight: '700', letterSpacing: 1, color: Colors.textSecondary, textTransform: 'uppercase', marginTop: 16, marginBottom: 8 },
  card: { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, padding: 14, gap: 8, marginBottom: 10 },
  cardDone: { backgroundColor: Colors.background },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  tick: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary },
  cardTitleDone: { color: Colors.textSecondary },
  body: { fontSize: 15, color: Colors.textPrimary },
  meta: { fontSize: 13, color: Colors.textSecondary },
  due: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: Colors.background, overflow: 'hidden' },
  dueNow: { color: Colors.accentText },
  action: { minHeight: 44, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, justifyContent: 'center', backgroundColor: Colors.background },
  actionText: { fontSize: 14, color: Colors.textPrimary },
});
