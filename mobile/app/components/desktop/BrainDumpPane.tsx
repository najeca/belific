import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../lib/theme';
import { createBrainDumpItem } from '../../../lib/data';
import {
  loadBrainDumpItems,
  addBrainDumpItem,
  updateBrainDumpItem,
  deleteBrainDumpItem,
} from '../../../lib/storage';
import type { BrainDumpItem } from '../../../lib/types';

// Desktop Brain Dump pane (decision 009): capture only, no date, no
// scheduling here. Pinned input (Enter adds), flat list with hairline
// dividers, click a title to edit inline (Enter saves, Escape cancels),
// hover shows delete with an inline "Delete? Yes / No" (Alert.alert is a
// no-op on web, so there are no native dialogs on desktop paths).
export default function BrainDumpPane({
  refreshKey,
  onChanged,
  onMakeTask,
}: {
  refreshKey: number;
  onChanged: () => void;
  // Opens the task modal pre-filled with this item's title. On save the
  // Brain Dump item is deleted (promote to Task MOVES it).
  onMakeTask: (item: BrainDumpItem) => void;
}) {
  const [items, setItems] = useState<BrainDumpItem[]>([]);
  const [captureText, setCaptureText] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const captureRef = useRef<TextInput>(null);

  const reload = useCallback(() => {
    loadBrainDumpItems().then(setItems);
  }, []);

  useEffect(() => {
    reload();
  }, [reload, refreshKey]);

  async function handleCapture() {
    const trimmed = captureText.trim();
    if (!trimmed) return;
    await addBrainDumpItem(createBrainDumpItem(trimmed));
    setCaptureText('');
    onChanged();
    captureRef.current?.focus();
  }

  function startEdit(item: BrainDumpItem) {
    cancelledRef.current = false;
    setConfirmingId(null);
    setEditingId(item.id);
    setEditText(item.title);
  }

  async function saveEdit(item: BrainDumpItem) {
    if (cancelledRef.current) return;
    const trimmed = editText.trim();
    setEditingId(null);
    // An emptied title keeps the old one: Brain Dump items always have text.
    if (!trimmed || trimmed === item.title) return;
    await updateBrainDumpItem({ ...item, title: trimmed });
    onChanged();
  }

  function cancelEdit() {
    cancelledRef.current = true;
    setEditingId(null);
  }

  async function confirmDelete(item: BrainDumpItem) {
    setConfirmingId(null);
    await deleteBrainDumpItem(item.id);
    onChanged();
  }

  const sorted = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <View style={styles.pane}>
      <Text style={styles.paneLabel}>BRAIN DUMP</Text>

      <View style={styles.captureRow}>
        <TextInput
          ref={captureRef}
          style={styles.captureInput}
          placeholder="Capture a thought…"
          placeholderTextColor={Colors.textSecondary}
          value={captureText}
          onChangeText={setCaptureText}
          onSubmitEditing={handleCapture}
          accessibilityLabel="Capture a thought"
          autoFocus
        />
        <Pressable
          style={[styles.addBtn, !captureText.trim() && styles.addBtnDisabled]}
          onPress={handleCapture}
          disabled={!captureText.trim()}
          accessibilityRole="button"
          accessibilityLabel="Add to Brain Dump"
        >
          <Ionicons name="add" size={20} color={Colors.onAccent} />
        </Pressable>
      </View>

      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {sorted.length === 0 ? (
          <Text style={styles.empty}>Nothing on your mind. Type above and press Enter.</Text>
        ) : (
          sorted.map((item, index) => {
            const hovered = hoveredId === item.id;
            const editing = editingId === item.id;
            const confirming = confirmingId === item.id;
            return (
              <Pressable
                key={item.id}
                onHoverIn={() => setHoveredId(item.id)}
                onHoverOut={() => setHoveredId((id) => (id === item.id ? null : id))}
                style={[styles.row, index > 0 && styles.rowDivider, hovered && styles.rowHover]}
              >
                {editing ? (
                  <TextInput
                    style={[styles.title, styles.editInput]}
                    value={editText}
                    onChangeText={setEditText}
                    onSubmitEditing={() => saveEdit(item)}
                    onBlur={() => saveEdit(item)}
                    onKeyPress={(e) => {
                      if (e.nativeEvent.key === 'Escape') cancelEdit();
                    }}
                    autoFocus
                    selectTextOnFocus
                    accessibilityLabel="Edit thought"
                  />
                ) : (
                  <Pressable style={styles.titleWrap} onPress={() => startEdit(item)} accessibilityRole="button">
                    <Text style={styles.title}>{item.title}</Text>
                  </Pressable>
                )}

                {confirming ? (
                  <View style={styles.confirm}>
                    <Text style={styles.confirmText}>Delete?</Text>
                    <Pressable onPress={() => confirmDelete(item)} accessibilityRole="button" accessibilityLabel="Confirm delete">
                      <Text style={styles.confirmYes}>Yes</Text>
                    </Pressable>
                    <Pressable onPress={() => setConfirmingId(null)} accessibilityRole="button" accessibilityLabel="Cancel delete">
                      <Text style={styles.confirmNo}>No</Text>
                    </Pressable>
                  </View>
                ) : (
                  hovered &&
                  !editing && (
                    <View style={styles.actions}>
                      <Pressable
                        onPress={() => onMakeTask(item)}
                        style={styles.makeTaskBtn}
                        accessibilityRole="button"
                        accessibilityLabel={`Make task from ${item.title}`}
                      >
                        <Text style={styles.makeTaskText}>Make task</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setConfirmingId(item.id)}
                        style={styles.deleteBtn}
                        accessibilityRole="button"
                        accessibilityLabel={`Delete ${item.title}`}
                      >
                        <Ionicons name="trash-outline" size={16} color={Colors.textSecondary} />
                      </Pressable>
                    </View>
                  )
                )}
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  pane: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    minWidth: 0,
  },
  paneLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: Colors.textSecondary,
  },
  captureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    marginBottom: 8,
  },
  captureInput: {
    flex: 1,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    color: Colors.textPrimary,
    fontSize: 14,
    outlineColor: Colors.accent,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnDisabled: { opacity: 0.4 },
  list: { flex: 1 },
  empty: { marginTop: 12, fontSize: 14, color: Colors.textSecondary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingVertical: 6,
    paddingHorizontal: 4,
    gap: 8,
  },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  rowHover: { backgroundColor: Colors.background },
  titleWrap: { flex: 1, minWidth: 0 },
  title: { flex: 1, fontSize: 14, color: Colors.textPrimary },
  editInput: {
    height: 32,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.accent,
    backgroundColor: Colors.surface,
    outlineColor: Colors.accent,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  makeTaskBtn: { paddingHorizontal: 6, paddingVertical: 4 },
  makeTaskText: { fontSize: 12, fontWeight: '600', color: Colors.accentText },
  deleteBtn: { padding: 6 },
  confirm: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  confirmText: { fontSize: 13, color: Colors.textSecondary },
  confirmYes: { fontSize: 13, fontWeight: '700', color: Colors.danger },
  confirmNo: { fontSize: 13, fontWeight: '700', color: Colors.accentText },
});
