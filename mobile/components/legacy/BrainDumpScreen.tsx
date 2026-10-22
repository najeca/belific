import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { FlatList as GHFlatList } from 'react-native-gesture-handler';
import { PressRow, SwipeRow } from '../phone/touch';
import { ActionMenu } from '../phone/menu';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { STARTER_BRAIN_DUMP } from '../../lib/data';
import {
  loadBrainDumpItems,
  loadListsRaw,
  loadTasks,
  updateTask,
  deleteTask,
  deleteBrainDumpItem,
  shouldShowStarterRoutine,
} from '../../lib/storage';
import { createThought, editDumpItem } from '../../lib/taskActions';
import { splitThoughts, rowId, type ThoughtRow } from '../../lib/thoughts';
import { effectiveListKey } from '../../lib/lists';
import { dateKey } from '../../lib/kanban';

// Brain Dump on the iPhone (build plan phase 4, iOS adaptation step 1): the
// thing you capture IS a task, as on the desktop. The list is every incomplete
// task with no Day and no list, plus the old Brain Dump items, which stay
// exactly as they are until they are edited: the first edit makes the item a
// task and tombstones the item (lib/dumpConvert.ts, the desktop's own path).
// Nothing is moved in bulk.
interface Thought {
  title: string;
  notes: string;
}
function thoughtOf(row: ThoughtRow): Thought {
  return row.kind === 'task' ? { title: row.task.title, notes: row.task.notes ?? '' } : { title: row.item.title, notes: row.item.notes };
}

async function loadThoughts(): Promise<ThoughtRow[]> {
  const [tasks, items, lists] = await Promise.all([loadTasks(), loadBrainDumpItems(), loadListsRaw()]);
  // Lists are desktop only until a later iPhone step: a task in a list is not
  // Brain Dump (it shows in Tasks).
  return splitThoughts(tasks.filter((t) => effectiveListKey(t, lists) === undefined), items, dateKey(new Date())).rows;
}

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

// The card (PLAN_phone P2): the phone's touch kit. A tap only counts when the finger barely moves,
// so scrolling the list never opens a card; press and hold opens a small menu (Edit, Delete); swipe
// left reveals Delete. Brain Dump moves into the Tasks tab in P5.
function DumpCard({
  item,
  onPress,
  onDelete,
}: {
  item: Thought;
  onPress: () => void;
  onDelete: () => void;
}) {
  const [menu, setMenu] = useState(false);
  return (
    <View style={styles.swipeContainer}>
      <SwipeRow left={[{ label: 'Delete', icon: 'trash-outline', tone: 'danger', run: onDelete }]} data={{ dumpRow: item.title }}>
        <PressRow
          style={styles.card}
          onTap={onPress}
          onHold={() => setMenu(true)}
          a11y={item.title}
          hint="Tap to edit. Press and hold for more. Swipe left to delete."
          actions={[{ name: 'Delete', run: onDelete }]}
          data={{ dumpCard: item.title }}
        >
          <View style={styles.cardHeader}>
            <Ionicons name="bulb-outline" size={18} color={Colors.accentText} />
            <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
          </View>
          {!!item.notes && (
            <Text style={styles.cardNotes} numberOfLines={3}>{item.notes}</Text>
          )}
        </PressRow>
      </SwipeRow>
      <ActionMenu
        visible={menu}
        title={item.title}
        onClose={() => setMenu(false)}
        items={[
          { label: 'Edit', icon: 'create-outline', run: onPress },
          { label: 'Delete', icon: 'trash-outline', danger: true, run: onDelete },
        ]}
      />
    </View>
  );
}

// Simple edit view — title and notes only. Brain Dump is fast capture,
// nothing more; no scheduling, no promotion, no date/time fields
// anywhere in this flow. Deleting lives entirely in the swipe gesture,
// not duplicated here.
function DumpEditForm({
  row,
  onClose,
  onSaved,
}: {
  row: ThoughtRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const insets = useSafeAreaInsets();
  const item = thoughtOf(row);
  const [title, setTitle] = useState(item.title);
  const [notes, setNotes] = useState(item.notes);

  useEffect(() => {
    setTitle(item.title);
    setNotes(item.notes);
  }, [rowId(row)]);

  const canSave = title.trim().length > 0;

  async function handleSave() {
    if (!canSave) return;
    const fields = { title: title.trim(), notes: notes.trim() || undefined };
    // An old Brain Dump item becomes a task on this first edit.
    if (row.kind === 'task') await updateTask({ ...row.task, ...fields });
    else await editDumpItem(row.item, fields);
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

// Inside the Tasks tab until P5 (PLAN_phone P3): the tab draws the header.
export default function InboxScreen() {
  const [items, setItems] = useState<ThoughtRow[]>([]);
  const [captureText, setCaptureText] = useState('');
  const [editVisible, setEditVisible] = useState(false);
  const [activeItem, setActiveItem] = useState<ThoughtRow | undefined>(undefined);
  const [starterMode, setStarterMode] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useFocusEffect(
    useCallback(() => {
      loadThoughts().then(setItems);
      shouldShowStarterRoutine().then(setStarterMode);
    }, []),
  );

  async function handleCapture() {
    const trimmed = captureText.trim();
    if (!trimmed) return;
    await createThought(trimmed);
    setCaptureText('');
    loadThoughts().then(setItems);
    inputRef.current?.focus();
  }

  function openEdit(item: ThoughtRow) {
    setActiveItem(item);
    setEditVisible(true);
  }

  async function handleDeleteItem(item: ThoughtRow) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setItems((prev) => prev.filter((i) => rowId(i) !== rowId(item)));
    if (item.kind === 'task') await deleteTask(item.task.id);
    else await deleteBrainDumpItem(item.item.id);
  }

  function handleEditClose() {
    setEditVisible(false);
    setActiveItem(undefined);
  }

  function handleEditSaved() {
    setEditVisible(false);
    setActiveItem(undefined);
    loadThoughts().then(setItems);
  }

  // Newest first (splitThoughts already sorts them).
  const sorted = items;

  return (
    <View style={styles.container}>
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
        <GHFlatList
          data={sorted}
          keyExtractor={(item) => rowId(item)}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <DumpCard
              item={thoughtOf(item)}
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
          <DumpEditForm row={activeItem} onClose={handleEditClose} onSaved={handleEditSaved} />
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
