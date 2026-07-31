import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  FlatList,
  Modal,
  KeyboardAvoidingView,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { createBrainDumpItem, STARTER_BRAIN_DUMP } from '../../lib/data';
import {
  loadBrainDumpItems,
  addBrainDumpItem,
  updateBrainDumpItem,
  deleteBrainDumpItem,
  shouldShowStarterRoutine,
} from '../../lib/storage';
import type { BrainDumpItem } from '../../lib/types';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

const DELETE_WIDTH = 88;

// Swipe-left-to-delete card, built on react-native-gesture-handler's
// Swipeable. A hand-rolled PanResponder version shipped first to avoid a
// native dependency, but on-device testing showed it only completing
// partial swipes instead of a clean full reveal — the risk flagged when
// that choice was made. Swipeable is the standard, battle-tested
// component for exactly this and needs no reanimated dependency.
function DumpCard({
  item,
  onPress,
  onDelete,
}: {
  item: BrainDumpItem;
  onPress: () => void;
  onDelete: () => void;
}) {
  const swipeableRef = useRef<Swipeable>(null);
  const isOpenRef = useRef(false);

  function handlePress() {
    if (isOpenRef.current) {
      swipeableRef.current?.close();
      return;
    }
    onPress();
  }

  function handleDeletePress() {
    swipeableRef.current?.close();
    onDelete();
  }

  return (
    <Swipeable
      ref={swipeableRef}
      containerStyle={styles.swipeContainer}
      overshootRight={false}
      rightThreshold={DELETE_WIDTH / 2}
      onSwipeableWillOpen={() => { isOpenRef.current = true; }}
      onSwipeableClose={() => { isOpenRef.current = false; }}
      renderRightActions={() => (
        <TouchableOpacity
          style={styles.deleteAction}
          onPress={handleDeletePress}
          accessibilityLabel="Delete"
          accessibilityRole="button"
        >
          <Ionicons name="trash-outline" size={20} color={Colors.onAccent} />
        </TouchableOpacity>
      )}
    >
      <Pressable
        style={styles.card}
        onPress={handlePress}
        accessibilityLabel={item.title}
        accessibilityHint="Tap to edit. Swipe left to delete."
      >
        <View style={styles.cardHeader}>
          <Ionicons name="bulb-outline" size={18} color={Colors.accentText} />
          <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
        </View>
        {!!item.notes && (
          <Text style={styles.cardNotes} numberOfLines={3}>{item.notes}</Text>
        )}
      </Pressable>
    </Swipeable>
  );
}

// Simple edit view — title and notes only. Brain Dump is fast capture,
// nothing more; no scheduling, no promotion, no date/time fields
// anywhere in this flow. Deleting lives entirely in the swipe gesture,
// not duplicated here.
function DumpEditForm({
  item,
  onClose,
  onSaved,
}: {
  item: BrainDumpItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState(item.title);
  const [notes, setNotes] = useState(item.notes);

  useEffect(() => {
    setTitle(item.title);
    setNotes(item.notes);
  }, [item.id]);

  const canSave = title.trim().length > 0;

  async function handleSave() {
    if (!canSave) return;
    await updateBrainDumpItem({ ...item, title: title.trim(), notes: notes.trim() });
    onSaved();
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.editContainer, { paddingTop: insets.top + 16 }]}>
        <View style={styles.editHeader}>
          <Text style={styles.editHeaderTitle}>Edit thought</Text>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <TextInput
          style={styles.editTitleInput}
          placeholder="What's on your mind?"
          placeholderTextColor={Colors.textSecondary}
          value={title}
          onChangeText={setTitle}
          returnKeyType="done"
        />

        <Text style={styles.editLabel}>Notes</Text>
        <TextInput
          style={styles.editNotesInput}
          placeholder="Add more detail… (optional)"
          placeholderTextColor={Colors.textSecondary}
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />

        <View style={{ flex: 1 }} />

        <View style={[styles.editFooter, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose} accessibilityLabel="Cancel" accessibilityRole="button">
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!canSave}
            accessibilityLabel="Save changes"
            accessibilityRole="button"
          >
            <Text style={styles.saveText}>Save changes</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

export default function InboxScreen() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<BrainDumpItem[]>([]);
  const [captureText, setCaptureText] = useState('');
  const [editVisible, setEditVisible] = useState(false);
  const [activeItem, setActiveItem] = useState<BrainDumpItem | undefined>(undefined);
  const [starterMode, setStarterMode] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useFocusEffect(
    useCallback(() => {
      loadBrainDumpItems().then(setItems);
      shouldShowStarterRoutine().then(setStarterMode);
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

  function openEdit(item: BrainDumpItem) {
    setActiveItem(item);
    setEditVisible(true);
  }

  async function handleDeleteItem(item: BrainDumpItem) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    await deleteBrainDumpItem(item.id);
  }

  function handleEditClose() {
    setEditVisible(false);
    setActiveItem(undefined);
  }

  function handleEditSaved() {
    setEditVisible(false);
    setActiveItem(undefined);
    loadBrainDumpItems().then(setItems);
  }

  const sorted = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Brain Dump</Text>
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
        starterMode ? (
          <View style={styles.listContent}>
            {STARTER_BRAIN_DUMP.map((title) => (
              <View key={title} style={[styles.card, styles.swipeContainer]}>
                <View style={styles.cardHeader}>
                  <Ionicons name="bulb-outline" size={18} color={Colors.accentText} />
                  <Text style={styles.cardTitle} numberOfLines={2}>{title}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateTitle}>Nothing on your mind</Text>
            <Text style={styles.emptyStateSubtext}>Type above to capture a thought</Text>
          </View>
        )
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(item) => item.id}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <DumpCard
              item={item}
              onPress={() => openEdit(item)}
              onDelete={() => handleDeleteItem(item)}
            />
          )}
        />
      )}

      <Modal
        visible={editVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleEditClose}
        onDismiss={handleEditClose}
      >
        {activeItem && (
          <DumpEditForm item={activeItem} onClose={handleEditClose} onSaved={handleEditSaved} />
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
  swipeContainer: {
    marginBottom: 10,
    borderRadius: 14,
    overflow: 'hidden',
  },
  deleteAction: {
    width: DELETE_WIDTH,
    backgroundColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
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
  editContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: 20,
  },
  editHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  editHeaderTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editTitleInput: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  editLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    letterSpacing: 0.3,
    marginBottom: 8,
    marginTop: 16,
  },
  editNotesInput: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.textPrimary,
    minHeight: 100,
    paddingTop: 14,
  },
  editFooter: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  cancelText: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  saveBtn: {
    flex: 1,
    backgroundColor: Colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveText: {
    color: Colors.onAccent,
    fontSize: 16,
    fontWeight: '700',
  },
});
