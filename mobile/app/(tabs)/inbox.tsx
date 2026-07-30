import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  FlatList,
  Modal,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { createBrainDumpItem } from '../../lib/data';
import { loadBrainDumpItems, addBrainDumpItem, deleteBrainDumpItem } from '../../lib/storage';
import { EventForm } from '../components/AddEventModal';
import type { BrainDumpItem, CustomEvent } from '../../lib/types';

export default function InboxScreen() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<BrainDumpItem[]>([]);
  const [captureText, setCaptureText] = useState('');
  // One Modal, mode picks the content — same pattern as calendar.tsx's
  // unified sheet, so there's no chained close/reopen between the actions
  // sheet and the schedule form.
  const [modalVisible, setModalVisible] = useState(false);
  const [mode, setMode] = useState<'actions' | 'schedule' | null>(null);
  const [activeItem, setActiveItem] = useState<BrainDumpItem | undefined>(undefined);
  const inputRef = useRef<TextInput>(null);

  useFocusEffect(
    useCallback(() => {
      loadBrainDumpItems().then(setItems);
    }, []),
  );

  async function handleCapture() {
    const trimmed = captureText.trim();
    if (!trimmed) return;
    await addBrainDumpItem(createBrainDumpItem(trimmed));
    setCaptureText('');
    loadBrainDumpItems().then(setItems);
    inputRef.current?.focus();
  }

  function openActions(item: BrainDumpItem) {
    setActiveItem(item);
    setMode('actions');
    setModalVisible(true);
  }

  async function handleDelete() {
    if (!activeItem) return;
    await deleteBrainDumpItem(activeItem.id);
    setModalVisible(false);
    setMode(null);
    setActiveItem(undefined);
    loadBrainDumpItems().then(setItems);
  }

  // Fires once the promoted event is actually saved — the dump item is
  // fully converted at this point, so it's deleted and the sheet closes
  // entirely (there's nothing left on this item to act on).
  async function handleScheduled(_event: CustomEvent) {
    if (activeItem) {
      await deleteBrainDumpItem(activeItem.id);
    }
    setModalVisible(false);
    setMode(null);
    setActiveItem(undefined);
    loadBrainDumpItems().then(setItems);
  }

  // Cancel from the schedule form drops back to the actions sheet for the
  // same item, rather than closing outright — mirrors calendar.tsx's
  // edit-cancel-returns-to-detail behavior.
  function handleFormClose() {
    setMode('actions');
  }

  function handleModalDismiss() {
    setModalVisible(false);
    setMode(null);
    setActiveItem(undefined);
  }

  const sorted = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Dump</Text>
      </View>

      <View style={styles.captureRow}>
        <TextInput
          ref={inputRef}
          style={styles.captureInput}
          placeholder="Capture a thought…"
          placeholderTextColor={Colors.textSecondary}
          value={captureText}
          onChangeText={setCaptureText}
          onSubmitEditing={handleCapture}
          returnKeyType="done"
          accessibilityLabel="Capture a thought"
        />
        <TouchableOpacity
          style={[styles.captureBtn, !captureText.trim() && styles.captureBtnDisabled]}
          onPress={handleCapture}
          disabled={!captureText.trim()}
          accessibilityLabel="Add to inbox"
          accessibilityRole="button"
        >
          <Ionicons name="add" size={24} color={Colors.onAccent} />
        </TouchableOpacity>
      </View>

      {sorted.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateTitle}>Nothing on your mind</Text>
          <Text style={styles.emptyStateSubtext}>Type above to capture a thought</Text>
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(item) => item.id}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
              onPress={() => openActions(item)}
              accessibilityLabel={item.title}
              accessibilityHint="Tap to schedule or delete"
            >
              <View style={styles.cardHeader}>
                <Ionicons name="bulb-outline" size={18} color={Colors.accentText} />
                <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
              </View>
              {!!item.notes && (
                <Text style={styles.cardNotes} numberOfLines={3}>{item.notes}</Text>
              )}
            </Pressable>
          )}
        />
      )}

      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}
        onDismiss={handleModalDismiss}
      >
        {mode === 'actions' && activeItem && (
          <View style={[styles.actionsContainer, { paddingTop: insets.top + 16 }]}>
            <View style={styles.actionsHeader}>
              <Text style={styles.actionsTitle} numberOfLines={2}>{activeItem.title}</Text>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setModalVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.actionRow}
              onPress={() => setMode('schedule')}
              accessibilityLabel="Schedule this"
              accessibilityRole="button"
            >
              <Ionicons name="calendar-outline" size={20} color={Colors.accentText} style={{ marginRight: 12 }} />
              <Text style={styles.actionText}>Schedule</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionRow}
              onPress={handleDelete}
              accessibilityLabel="Delete"
              accessibilityRole="button"
            >
              <Ionicons name="trash-outline" size={20} color={Colors.danger} style={{ marginRight: 12 }} />
              <Text style={[styles.actionText, { color: Colors.danger }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}
        {mode === 'schedule' && activeItem && (
          <EventForm
            date={new Date()}
            initialTitle={activeItem.title}
            onClose={handleFormClose}
            onSaved={handleScheduled}
          />
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: 16,
  },
  header: {
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  captureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 16,
  },
  captureInput: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.textPrimary,
  },
  captureBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureBtnDisabled: {
    opacity: 0.5,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 24,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardTitle: {
    flex: 1,
    fontSize: 15,
    color: Colors.textPrimary,
  },
  cardNotes: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 6,
  },
  emptyState: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: Colors.textSecondary,
    opacity: 0.7,
  },
  actionsContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: 20,
  },
  actionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  actionsTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginRight: 12,
  },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 10,
  },
  actionText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
});
