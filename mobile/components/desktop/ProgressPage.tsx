import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { STREAK_TEXT, bestLine, dayLabel, streakLine, windowLine, type DayState, type SeriesStreak } from '../../lib/seriesStreak';
import { parseDateKey } from '../../lib/kanban';
import { useAllStreaks } from './streakStore';

// The Progress page (checkpoint 11, decision 025: a page inside the app, reached
// from the profile menu or File, Progress; no new top level navigation). For
// each repeating task: the run so far (from 2 days), the best run (from 2), how
// many of the last 7 and 30 days were done (hidden when none), and a strip of
// the last 7 days. Everything is worked out from the days you ticked; nothing is
// stored. Plain words (decision 007): no zero, no warning, no totals across
// tasks, no chart. Every square has a text name, and its SHAPE differs by state,
// so colour is never the only signal.
const LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function ProgressPage() {
  const { streaks, today } = useAllStreaks();
  const sorted = [...streaks].sort((a, b) => a.title.localeCompare(b.title));
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} accessibilityLabel="Progress">
      <View style={styles.column}>
        <Text style={styles.heading} accessibilityRole="header">
          {STREAK_TEXT.progressTitle}
        </Text>
        <Text style={styles.hint}>{STREAK_TEXT.progressIntro}</Text>
        {sorted.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.body}>{STREAK_TEXT.progressEmpty}</Text>
          </View>
        ) : (
          sorted.map((s) => <SeriesRow key={s.root} streak={s} today={today} />)
        )}
        {sorted.length > 0 && <Text style={styles.hint}>{STREAK_TEXT.skipNote}</Text>}
      </View>
    </ScrollView>
  );
}

function SeriesRow({ streak, today }: { streak: SeriesStreak; today: string }) {
  const lines = [streakLine(streak), bestLine(streak), windowLine(7, streak.done7, streak.scheduled7), windowLine(30, streak.done30, streak.scheduled30)].filter(
    (l): l is string => !!l,
  );
  return (
    <View style={styles.card} accessibilityLabel={`Progress for ${streak.title}`}>
      <View style={styles.titleRow}>
        <Text style={styles.title} numberOfLines={2}>
          {streak.title}
        </Text>
        {!!streak.repeat && <Text style={styles.repeat}>{streak.repeat}</Text>}
      </View>
      {lines.map((l) => (
        <Text key={l} style={styles.body}>
          {l}
        </Text>
      ))}
      <View style={styles.strip} role="list" accessibilityLabel={`${STREAK_TEXT.weekStrip}, ${streak.title}`}>
        {streak.week.map((d) => {
          const label = dayLabel(d, today);
          return (
            <View key={d.key} style={styles.cell} role="listitem">
              <View style={[styles.square, squareStyle(d.state)]} role="img" accessibilityLabel={label}>
                <Glyph state={d.state} />
              </View>
              <Text style={[styles.letter, d.key === today && styles.letterToday]}>{LETTER[parseDateKey(d.key).getDay()]}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// A different shape for each state: a tick in a filled square, an empty outline,
// a dash, a dot, and a sage outline for today still open.
function Glyph({ state }: { state: DayState }) {
  if (state === 'done') return <Ionicons name="checkmark" size={14} color={Colors.onAccent} />;
  if (state === 'skipped') return <View style={styles.dash} />;
  if (state === 'off') return <View style={styles.dot} />;
  return null;
}

function squareStyle(state: DayState) {
  switch (state) {
    case 'done':
      return styles.sqDone;
    case 'open':
      return styles.sqOpen;
    case 'notDone':
      return styles.sqEmpty;
    default:
      return styles.sqQuiet;
  }
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 16, paddingTop: 4, alignItems: 'center' },
  column: { width: '100%', maxWidth: 640, gap: 12 },
  heading: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
  hint: { fontSize: 12, color: Colors.textSecondary },
  card: { padding: 16, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  title: { flex: 1, fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  repeat: { fontSize: 12, color: Colors.textSecondary },
  body: { fontSize: 14, color: Colors.textPrimary },
  strip: { flexDirection: 'row', gap: 8, marginTop: 10 },
  cell: { alignItems: 'center', gap: 4 },
  square: { width: 26, height: 26, borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  sqDone: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  sqOpen: { backgroundColor: Colors.surface, borderColor: Colors.accent, borderStyle: 'dashed' },
  sqEmpty: { backgroundColor: Colors.surface, borderColor: Colors.textSecondary },
  sqQuiet: { backgroundColor: Colors.background, borderColor: Colors.border },
  dash: { width: 10, height: 2, backgroundColor: Colors.textSecondary },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.border },
  letter: { fontSize: 11, color: Colors.textSecondary },
  letterToday: { fontWeight: '700', color: Colors.textPrimary },
});
