import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Colors } from '../../lib/theme';
import { dateKey } from '../../lib/kanban';
import { listTitle, resolveSelectedList } from '../../lib/lists';
import { createTaskIn } from '../../lib/taskCommands';
import { loadLists } from '../../lib/storage';
import type { TaskList } from '../../lib/types';
import { closeOverlay, getSelectedList, notifyChanged } from './uiStore';
import { IconHeading } from './ui';

// Quick capture (Q, and T for today; build plan phase 3). One box over the home
// screen, wherever the keyboard focus was, whichever panes are open: type, press
// Enter, and the task exists. Q adds it to the list the left pane shows (Brain
// Dump by default), T adds it to today. Shift+Enter adds it and keeps the box
// open for the next one. Escape closes it and returns focus to where it was. It
// is an overlay, not a screen.
export default function QuickCapture({ mode }: { mode: 'list' | 'today' }) {
  const [text, setText] = useState('');
  const [lists, setLists] = useState<TaskList[]>([]);
  const [added, setAdded] = useState(0);
  const input = useRef<TextInput>(null);

  useEffect(() => {
    loadLists().then(setLists);
    const before = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => input.current?.focus(), 20);
    return () => {
      clearTimeout(t);
      if (before && before.isConnected) before.focus({ preventScroll: true });
    };
  }, []);

  const selected = resolveSelectedList(getSelectedList(), lists);
  const where = mode === 'today' ? 'Today' : listTitle(lists.find((l) => l.key === selected));

  async function submit(keepOpen: boolean) {
    const title = text.trim();
    if (!title) return;
    await createTaskIn(title, mode === 'today' ? { dueDate: dateKey(new Date()) } : { listKey: selected });
    notifyChanged();
    if (keepOpen) {
      setText('');
      setAdded((n) => n + 1);
      input.current?.focus();
    } else {
      closeOverlay();
    }
  }

  return (
    <Pressable style={styles.scrim} onPress={closeOverlay} accessibilityLabel="Close quick capture">
      <Pressable onPress={() => {}} style={styles.card} accessibilityLabel="Quick capture" {...({ role: 'dialog', 'aria-modal': true } as object)}>
        <IconHeading icon="flash-outline" style={styles.heading}>Quick capture to {where}</IconHeading>
        <TextInput
          ref={input}
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="What needs doing?"
          placeholderTextColor={Colors.textSecondary}
          onKeyPress={(e) => {
            const ev = e.nativeEvent as { key?: string; shiftKey?: boolean };
            if (ev.key === 'Escape') {
              (e as { stopPropagation?: () => void }).stopPropagation?.();
              closeOverlay();
            } else if (ev.key === 'Enter') {
              (e as { preventDefault?: () => void }).preventDefault?.();
              submit(!!ev.shiftKey);
            }
          }}
          accessibilityLabel="Quick capture task"
        />
        <Text style={styles.hint}>
          Enter adds it. Shift+Enter adds it and keeps this open. Escape closes.
          {added > 0 ? `  ${added} added.` : ''}
        </Text>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 60, alignItems: 'center', paddingTop: 140, backgroundColor: Colors.scrim },
  card: { width: 520, maxWidth: '92%', borderRadius: 16, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, padding: 16, gap: 10, alignSelf: 'center' },
  heading: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, color: Colors.textSecondary },
  input: { height: 44, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background, color: Colors.textPrimary, fontSize: 16, outlineColor: Colors.accent },
  hint: { fontSize: 12, color: Colors.textSecondary },
});
