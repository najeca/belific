import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  FlatList,
  Modal,
  Animated,
  PanResponder,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { createBrainDumpItem } from '../../lib/data';
import { loadBrainDumpItems, addBrainDumpItem, deleteBrainDumpItem } from '../../lib/storage';
import { EventForm } from '../components/AddEventModal';
import type { BrainDumpItem, CustomEvent } from '../../lib/types';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

const DELETE_WIDTH = 88;

// Swipe-left-to-delete card. No gesture-handler/reanimated dependency —
// this project's native build is already fragile (see IOS_BUILD_NOTES.md),
// so this uses only core PanResponder + Animated, which need no native
// linking. A small horizontal-drag threshold in onMoveShouldSetPanResponder
// means ordinary taps still reach the inner Pressable untouched.
function DumpCard({
  item,
  onPress,
  onDelete,
}: {
  item: BrainDumpItem;
  onPress: () => void;
  onDelete: () => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const isOpenRef = useRef(false);
  const baseRef = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gesture) =>
        Math.abs(gesture.dx) > 10 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
      onPanResponderGrant: () => {
        baseRef.current = isOpenRef.current ? -DELETE_WIDTH : 0;
      },
      onPanResponderMove: (_evt, gesture) => {
        const next = Math.max(-DELETE_WIDTH, Math.min(0, baseRef.current + gesture.dx));
        translateX.setValue(next);
      },
      onPanResponderRelease: (_evt, gesture) => {
        const current = baseRef.current + gesture.dx;
        const shouldOpen = current < -DELETE_WIDTH / 2;
        isOpenRef.current = shouldOpen;
        Animated.spring(translateX, {
          toValue: shouldOpen ? -DELETE_WIDTH : 0,
          useNativeDriver: true,
          bounciness: 0,
        }).start();
      },
    }),
  ).current;

  function handlePress() {
    if (isOpenRef.current) {
      isOpenRef.current = false;
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
      return;
    }
    onPress();
  }

  return (
    <View style={styles.swipeContainer}>
      <View style={styles.deleteBackdrop}>
        <TouchableOpacity
          style={styles.deleteAction}
          onPress={onDelete}
          accessibilityLabel="Delete"
          accessibilityRole="button"
        >
          <Ionicons name="trash-outline" size={20} color={Colors.onAccent} />
        </TouchableOpacity>
      </View>
      <Animated.View
        style={[styles.card, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        <Pressable
          onPress={handlePress}
          accessibilityLabel={item.title}
          accessibilityHint="Opens the schedule form. Swipe left to delete."
        >
          <View style={styles.cardHeader}>
            <Ionicons name="bulb-outline" size={18} color={Colors.accentText} />
            <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
          </View>
          {!!item.notes && (
            <Text style={styles.cardNotes} numberOfLines={3}>{item.notes}</Text>
          )}
        </Pressable>
      </Animated.View>
    </View>
  );
}

export default function InboxScreen() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<BrainDumpItem[]>([]);
  const [captureText, setCaptureText] = useState('');
  const [formVisible, setFormVisible] = useState(false);
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

  function openForm(item: BrainDumpItem) {
    setActiveItem(item);
    setFormVisible(true);
  }

  async function handleDeleteItem(item: BrainDumpItem) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    await deleteBrainDumpItem(item.id);
  }

  // Scheduling copies the item onto the calendar — the dump item is left
  // untouched. Swipe-to-delete is the only removal path now.
  function handleScheduled(_event: CustomEvent) {
    setFormVisible(false);
    setActiveItem(undefined);
  }

  // Closing without saving leaves the item exactly as it was — this is
  // the entire "keep in Dump" behavior, no dedicated action needed for it.
  function handleFormClose() {
    setFormVisible(false);
    setActiveItem(undefined);
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
            <DumpCard
              item={item}
              onPress={() => openForm(item)}
              onDelete={() => handleDeleteItem(item)}
            />
          )}
        />
      )}

      <Modal
        visible={formVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleFormClose}
        onDismiss={handleFormClose}
      >
        {activeItem && (
          <EventForm
            date={new Date()}
            initialTitle={activeItem.title}
            origin="dump"
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
  swipeContainer: {
    marginBottom: 10,
    borderRadius: 14,
    overflow: 'hidden',
  },
  deleteBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.danger,
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  deleteAction: {
    width: DELETE_WIDTH,
    height: '100%',
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
});
