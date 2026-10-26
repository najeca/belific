import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, type ColorTokens } from '../../lib/tokens';
import { createTaskIn } from '../../lib/taskCommands';
import { breakRefusal } from '../../lib/hostActions';
import type { Task } from '../../lib/types';
import { useStyles, useTheme } from './theme';
import { useReducedMotion, useSettled } from './touch';
import { inter, type } from './type';
import { Button } from './ui';

// The quick add sheet (PLAN_phone P3): the round + and (P8) a tap on an empty Day slot open it with
// the place filled in (a day, a time, a list). A title and Add; Cancel is one tap. Everything else
// is set later in the task's details. The task is written by the shared createTaskIn (taskCommands.ts),
// the same as the desktop's capture boxes.
export interface QuickAddWhere {
  dueDate?: string;
  startTime?: string;
  durationMinutes?: number;
  listKey?: string;
  // What the sheet says the task will be ("Today", "Thu 23 Oct at 14:00", "Brain Dump").
  label: string;
}

const make = (c: ColorTokens) => ({
  scrim: { flex: 1, backgroundColor: c.scrim, justifyContent: 'flex-end' as const },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderWidth: 1, borderColor: c.border, padding: 16, gap: 12 },
  where: { ...type.small, color: c.accentText },
  input: { ...inter(500), fontSize: 18, color: c.textPrimary, minHeight: 48, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.pane },
  row: { flexDirection: 'row' as const, gap: 10, justifyContent: 'flex-end' as const },
  note: { ...type.meta, color: c.danger },
});

export function QuickAdd({ visible, where, onClose, onAdded }: { visible: boolean; where: QuickAddWhere; onClose: () => void; onAdded?: (task: Task) => void }) {
  const s = useStyles(make);
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const settled = useSettled(visible);
  const [title, setTitle] = useState('');
  // 3.11.0: why the task was not added (a time inside a break it does not fit in).
  const [note, setNote] = useState<string | null>(null);
  const input = useRef<TextInput>(null);
  useEffect(() => {
    if (visible) {
      setTitle('');
      setNote(null);
    }
  }, [visible]);

  async function add() {
    if (!title.trim()) return;
    const refused = where.startTime ? await breakRefusal(null, { dueDate: where.dueDate, startTime: where.startTime, durationMinutes: where.durationMinutes }, 'drop') : null;
    if (refused) {
      setNote(refused);
      return;
    }
    const task = await createTaskIn(title, where);
    if (!task) return;
    setTitle('');
    onAdded?.(task);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType={reduced ? 'none' : 'slide'} onRequestClose={onClose} onShow={() => input.current?.focus()}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={s.scrim} onPress={() => settled() && onClose()} accessibilityLabel="Cancel adding">
          <Pressable style={[s.sheet, { paddingBottom: insets.bottom + 16 }]} onPress={() => {}} {...({ dataSet: { quickAdd: where.label } } as object)}>
            <Text style={s.where}>{where.label}</Text>
            {note ? (
              <Text style={s.note} accessibilityRole="alert" {...({ dataSet: { quickAddNote: '1' } } as object)}>
                {note}
              </Text>
            ) : null}
            <TextInput
              ref={input}
              style={s.input}
              value={title}
              onChangeText={setTitle}
              placeholder="What needs doing?"
              placeholderTextColor={c.textTertiary}
              returnKeyType="done"
              onSubmitEditing={add}
              autoFocus
              accessibilityLabel="New task title"
            />
            <View style={s.row}>
              <Button label="Cancel" onPress={onClose} a11y="Cancel adding" />
              <Button label="Add" kind="primary" onPress={add} disabled={!title.trim()} a11y="Add task" />
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
