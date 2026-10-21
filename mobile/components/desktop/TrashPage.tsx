import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Colors } from '../../lib/theme';
import { agoText, TRASH_DAYS, type TrashEntry } from '../../lib/trash';
import { loadTrash, restoreFromTrash } from '../../lib/trashActions';
import { notifyChanged } from './uiStore';
import { DISPLAY_FONT_FAMILY } from './desktopFont';
import { IconHeading } from './ui';

// The Trash page (build plan phase 6): tasks deleted in the last 30 days.
// Restore makes a NEW task with the same fields (a deleted task can never come
// back under its own id: a tombstone always wins a sync) and the deleted one
// stays deleted. A repeating task deleted as a series is one entry that
// restores as one plain task, because its repeat was cleared when it was
// deleted. A task that was merged into another one is listed with a note and no
// Restore button. Nothing here is deleted for good: the tombstones stay for sync.
export default function TrashPage({ refreshKey }: { refreshKey: number }) {
  const [entries, setEntries] = useState<TrashEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setEntries(await loadTrash());
    setLoaded(true);
  }, []);
  useEffect(() => {
    reload();
  }, [reload, refreshKey]);

  async function restore(e: TrashEntry) {
    if (busy) return;
    setBusy(e.row.id);
    setNote(null);
    const result = await restoreFromTrash(e);
    setBusy(null);
    setNote(result ? `Restored “${e.title}” as a new task.` : `“${e.title}” was already restored.`);
    notifyChanged();
    await reload();
  }

  const now = Date.now();
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} accessibilityLabel="Trash">
      <View style={styles.column}>
        <IconHeading icon="trash-outline" style={styles.heading} size={20}>Trash</IconHeading>
        <Text style={styles.hint}>
          Tasks you deleted in the last {TRASH_DAYS} days. Restore makes a new copy of the task with the same details; the deleted one stays deleted.
        </Text>
        {note && (
          <Text style={styles.note} accessibilityLabel="Trash note">
            {note}
          </Text>
        )}
        {loaded && entries.length === 0 && (
          <View style={styles.card}>
            <Text style={styles.body} accessibilityLabel="Trash is empty">
              🗑️ The Trash is empty. A task you delete waits here for {TRASH_DAYS} days.
            </Text>
          </View>
        )}
        {entries.map((e) => (
          <View key={e.row.id} style={styles.card} accessibilityLabel={`Trash ${e.title}`}>
            <View style={styles.row}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.title} numberOfLines={2}>
                  {e.row.emoji ? `${e.row.emoji} ` : ''}
                  {e.title}
                </Text>
                <Text style={styles.meta}>
                  {agoText(e.deletedAt, now)}
                  {e.kind === 'series' ? ` · ${e.count} ${e.count === 1 ? 'day' : 'days'}` : ''}
                </Text>
                {e.note ? <Text style={styles.meta}>{e.note}</Text> : null}
              </View>
              {e.restorable && (
                <Pressable
                  onPress={() => restore(e)}
                  disabled={!!busy}
                  style={[styles.btn, !!busy && styles.off]}
                  accessibilityRole="button"
                  accessibilityLabel={`Restore ${e.title}`}
                >
                  <Text style={styles.btnText}>↩️ Restore</Text>
                </Pressable>
              )}
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 24, alignItems: 'center' },
  column: { width: '100%', maxWidth: 760, gap: 12 },
  heading: { fontSize: 20, fontFamily: DISPLAY_FONT_FAMILY, fontWeight: '700', color: Colors.textPrimary },
  hint: { fontSize: 13, color: Colors.textSecondary },
  note: { fontSize: 13, color: Colors.accentText },
  body: { fontSize: 14, color: Colors.textPrimary },
  card: { padding: 14, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  meta: { fontSize: 12, color: Colors.textSecondary },
  btn: { paddingHorizontal: 14, height: 34, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, justifyContent: 'center', backgroundColor: Colors.background },
  btnText: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  off: { opacity: 0.5 },
});
