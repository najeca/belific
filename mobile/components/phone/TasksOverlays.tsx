import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { type ColorTokens } from '../../lib/tokens';
import { searchTasks } from '../../lib/taskSearch';
import { agoText, type TrashEntry } from '../../lib/trash';
import { loadTrash, restoreFromTrash } from '../../lib/trashActions';
import type { Project, Task, TaskList } from '../../lib/types';
import { useStyles, useTheme } from './theme';
import { inter, type } from './type';
import { Button, Card } from './ui';

// Search and Trash on the phone's Tasks tab (PLAN_phone_stepflow section 4, 3.61.0): two full screens that use the
// shared rules (lib/taskSearch.ts, lib/trash.ts and lib/trashActions.ts), never a phone copy.
const make = (c: ColorTokens) => ({
  screen: { flex: 1, backgroundColor: c.background },
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  title: { ...type.sheetTitle, color: c.textPrimary, flex: 1 },
  close: { width: 44, height: 44, alignItems: 'center' as const, justifyContent: 'center' as const },
  input: { ...inter(400), fontSize: 16, color: c.textPrimary, minHeight: 46, marginHorizontal: 16, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
  hit: { minHeight: 56, paddingHorizontal: 14, paddingVertical: 10, justifyContent: 'center' as const, borderTopWidth: 1, borderTopColor: c.border },
  hitTitle: { ...inter(500), fontSize: 16, color: c.textPrimary },
  meta: { ...type.meta, color: c.textSecondary },
  empty: { ...type.meta, color: c.textSecondary, padding: 16 },
  entry: { padding: 14, gap: 6, borderTopWidth: 1, borderTopColor: c.border },
});

function Shell({ visible, title, onClose, children, name }: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode; name: string }) {
  const s = useStyles(make);
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[s.screen, { paddingTop: insets.top + 8, paddingBottom: insets.bottom }]} {...({ dataSet: { overlay: name } } as object)}>
        <View style={s.head}>
          <Text style={s.title} accessibilityRole="header">
            {title}
          </Text>
          <Pressable style={s.close} onPress={onClose} accessibilityRole="button" accessibilityLabel={`Close ${title}`} {...({ dataSet: { overlayClose: name } } as object)}>
            <Ionicons name="close" size={24} color={c.textPrimary} />
          </Pressable>
        </View>
        {children}
      </View>
    </Modal>
  );
}

export function SearchScreen({ visible, tasks, labels, lists, onClose, onOpen }: { visible: boolean; tasks: Task[]; labels: Project[]; lists: TaskList[]; onClose: () => void; onOpen: (t: Task) => void }) {
  const s = useStyles(make);
  const { c } = useTheme();
  const [q, setQ] = useState('');
  useEffect(() => {
    if (visible) setQ('');
  }, [visible]);
  const hits = useMemo(() => searchTasks(tasks, labels, lists, q), [tasks, labels, lists, q]);
  return (
    <Shell visible={visible} title="Search" onClose={onClose} name="search">
      <TextInput style={s.input} value={q} onChangeText={setQ} autoFocus placeholder="Search titles and notes" placeholderTextColor={c.textTertiary} returnKeyType="search" accessibilityLabel="Search tasks" {...({ dataSet: { searchInput: '1' } } as object)} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 8, paddingBottom: 120, paddingHorizontal: 16 }}>
        {q.trim() && hits.length === 0 ? <Text style={s.empty}>Nothing found.</Text> : null}
        {hits.length > 0 ? (
          <Card>
            {hits.map(({ task }) => (
              <Pressable key={task.id} style={s.hit} onPress={() => onOpen(task)} accessibilityRole="button" accessibilityLabel={task.title} {...({ dataSet: { searchHit: task.title } } as object)}>
                <Text style={s.hitTitle} numberOfLines={2}>{`${task.emoji ? `${task.emoji} ` : ''}${task.title}`}</Text>
                {task.dueDate ? <Text style={s.meta}>{task.dueDate}</Text> : null}
              </Pressable>
            ))}
          </Card>
        ) : null}
      </ScrollView>
    </Shell>
  );
}

export function TrashScreen({ visible, onClose, onChanged }: { visible: boolean; onClose: () => void; onChanged: () => void }) {
  const s = useStyles(make);
  const [entries, setEntries] = useState<TrashEntry[] | null>(null);
  const reload = () => void loadTrash().then(setEntries).catch(() => setEntries([]));
  useEffect(() => {
    if (visible) reload();
  }, [visible]);
  async function restore(e: TrashEntry) {
    await restoreFromTrash(e);
    reload();
    onChanged();
  }
  const now = Date.now();
  return (
    <Shell visible={visible} title="Trash" onClose={onClose} name="trash">
      <ScrollView contentContainerStyle={{ paddingBottom: 120, paddingHorizontal: 16 }}>
        <Text style={s.meta}>Deleted tasks stay here for 30 days.</Text>
        {entries && entries.length === 0 ? <Text style={s.empty}>The Trash is empty.</Text> : null}
        {entries && entries.length > 0 ? (
          <Card style={{ marginTop: 8 }}>
            {entries.map((e) => (
              <View key={e.row.id} style={s.entry} {...({ dataSet: { trashEntry: e.title } } as object)}>
                <Text style={s.hitTitle}>{e.title}</Text>
                <Text style={s.meta}>{agoText(e.deletedAt, now)}</Text>
                {e.note ? <Text style={s.meta}>{e.note}</Text> : null}
                {e.restorable ? (
                  <View style={{ flexDirection: 'row' }}>
                    <Button label="Restore" onPress={() => void restore(e)} a11y={`Restore ${e.title}`} />
                  </View>
                ) : null}
              </View>
            ))}
          </Card>
        ) : null}
      </ScrollView>
    </Shell>
  );
}
