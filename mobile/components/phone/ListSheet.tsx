import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, type ColorTokens } from '../../lib/tokens';
import { createListState, sharedEmojiNote, takenEmojis } from '../../lib/lists';
import { createList, editList, removeList } from '../../lib/taskCommands';
import type { TaskList } from '../../lib/types';
import { useStyles, useTheme } from './theme';
import { useReducedMotion, useSettled } from './touch';
import { inter, type } from './type';
import { Button } from './ui';
import { EmojiPick } from './EmojiPick';

// A new list, or one list's name and emoji with Delete list (PLAN_phone P5): the desktop's list edit box
// (2.48.0) for a finger. The same shared commands (createList, editList, removeList), so the name rules,
// the key and the tasks stay exactly as on the desktop. The emoji is chosen from the picker (EmojiPick, 3.13.0)
// or typed with the iPhone's emoji keyboard; the first emoji is kept.
const make = (c: ColorTokens) => ({
  scrim: { flex: 1, backgroundColor: c.scrim, justifyContent: 'flex-end' as const },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderWidth: 1, borderColor: c.border, padding: 16, maxHeight: '92%' as const },
  title: { ...type.sheetTitle, color: c.textPrimary },
  label: { ...type.small, color: c.textSecondary },
  input: { ...inter(500), fontSize: 17, color: c.textPrimary, minHeight: 48, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.pane },
  problem: { ...type.meta, color: c.danger },
  row: { flexDirection: 'row' as const, gap: 10, justifyContent: 'flex-end' as const },
  danger: { ...inter(600), fontSize: 15, color: c.danger },
  note: { ...type.meta, color: c.textSecondary },
});

export function ListSheet({ visible, list, lists, count, onClose, onSaved }: { visible: boolean; list: TaskList | null; lists: TaskList[]; count: number; onClose: () => void; onSaved: (key: string | null) => void }) {
  const s = useStyles(make);
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const settled = useSettled(visible);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!visible) return;
    setName(list?.name ?? '');
    setEmoji(list?.emoji ?? '');
    setProblem(null);
    setConfirming(false);
  }, [visible, list]);

  const create = createListState(lists, name);
  // 3.14.0: a list that already shares its emoji with another keeps it; this says so.
  const shared = list ? sharedEmojiNote(lists, list.key) : null;
  async function save() {
    if (!list && !create.enabled) {
      setProblem(create.why);
      return;
    }
    const result = list ? await editList(list.key, name, emoji || undefined) : await createList(name, emoji || undefined);
    if ('problem' in result) {
      setProblem(result.problem);
      return;
    }
    onSaved(result.list.key);
  }

  return (
    <Modal visible={visible} transparent animationType={reduced ? 'none' : 'slide'} onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={s.scrim} onPress={() => settled() && onClose()} accessibilityLabel="Cancel">
          <Pressable style={[s.sheet, { paddingBottom: insets.bottom + 16 }]} onPress={() => {}} {...({ dataSet: { listSheet: list?.key ?? 'new' } } as object)}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12 }}>
            <Text style={s.title} accessibilityRole="header">
              {list ? 'Edit list' : 'New list'}
            </Text>
            <Text style={s.label}>Name</Text>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TextInput
              style={[s.input, { flex: 1, minWidth: 0 }]}
              value={name}
              onChangeText={(t) => {
                setName(t);
                setProblem(null);
              }}
              placeholder="Reading, Work, Proload…"
              placeholderTextColor={c.textTertiary}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={save}
              accessibilityLabel="List name"
            />
            {list ? null : <Button label="Create list" kind="primary" onPress={save} disabled={!create.enabled} a11y="Create list" />}
            </View>
            {!list && create.why ? <Text style={s.note}>{create.why}</Text> : null}
            <Text style={s.label}>Emoji</Text>
            <EmojiPick value={emoji} onChange={setEmoji} taken={takenEmojis(lists, list?.key)} />
            {list && shared && emoji === (list.emoji ?? '') ? (
              <Text style={s.note} {...({ dataSet: { sharedEmoji: list.key } } as object)}>
                {shared}
              </Text>
            ) : null}
            {problem && problem !== create.why ? <Text style={s.problem}>{problem}</Text> : null}
            <View style={s.row}>
              <Button label="Cancel" onPress={onClose} a11y="Cancel list edit" />
              {list ? <Button label="Save" kind="primary" onPress={save} a11y={`Save list ${list.name}`} /> : null}
            </View>
            {list ? (
              <View style={{ borderTopWidth: 1, borderTopColor: c.border, paddingTop: 12, gap: 8 }}>
                {confirming ? (
                  <>
                    <Text style={s.note}>{`Delete this list? Its ${count} waiting tasks go back to Brain Dump.`}</Text>
                    <View style={s.row}>
                      <Button label="No" onPress={() => setConfirming(false)} a11y="Cancel delete list" />
                      <Button
                        label="Yes, delete"
                        kind="danger"
                        onPress={async () => {
                          await removeList(list.key);
                          onSaved(null);
                        }}
                        a11y="Confirm delete list"
                      />
                    </View>
                  </>
                ) : (
                  <Pressable onPress={() => setConfirming(true)} style={{ minHeight: 44, justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel={`Delete list ${list.name}`}>
                    <Text style={s.danger}>Delete list</Text>
                  </Pressable>
                )}
              </View>
            ) : null}
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
