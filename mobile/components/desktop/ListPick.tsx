import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { BRAIN_DUMP_EMOJI } from '../../lib/emoji';
import { BRAIN_DUMP_NAME, createListState, listOptionText, listTitle } from '../../lib/lists';
import { createList } from '../../lib/taskCommands';
import type { TaskList } from '../../lib/types';
import Popover, { Row, closePopover, togglePopover, useIsOpen, usePopoverAnchor, popoverStyles } from './Popover';
import { DESKTOP_FONT_FAMILY } from './desktopFont';
import { outlinedBtnText } from './ui';
import { notifyChanged } from './uiStore';

// A list without an emoji shows its name only (the details have always read so); the rows keep the emoji column.
// The List row of the task details (3.15.1): the app's own themed list in place of the browser's select, which
// drew a white popup with invisible names in dark mode. The button shows the list's emoji and name; the popover
// has one row per list (Brain Dump first, a tick on the chosen one) and "New list" at the bottom, which asks for a
// name and creates it there, then chooses it. `value` is the list key, undefined for Brain Dump.
export default function ListPick({ lists, value, onChange }: { lists: TaskList[]; value: string | undefined; onChange: (key: string | undefined) => void }) {
  const { ref, get } = usePopoverAnchor();
  const id = 'detail-list-pick';
  const open = useIsOpen(id);
  const current = lists.find((l) => l.key === value);
  return (
    <>
      <Pressable
        ref={ref as never}
        onPress={() => togglePopover(id, get)}
        style={[styles.trigger, open && styles.triggerOpen]}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`List: ${current?.name ?? BRAIN_DUMP_NAME}`}
        {...({ dataSet: { listPick: value ?? '' } } as object)}
      >
        <Text style={styles.triggerText} numberOfLines={1}>
          {current ? listOptionText(current) : listTitle(undefined)}
        </Text>
        <Ionicons name="chevron-down" size={14} color={Colors.textSecondary} />
      </Pressable>
      <Popover id={id} anchor={get} width={280} maxHeight={400} label="Choose a list">
        <Body lists={lists} value={value} onChange={onChange} />
      </Popover>
    </>
  );
}

function Body({ lists, value, onChange }: { lists: TaskList[]; value: string | undefined; onChange: (key: string | undefined) => void }) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const choose = (key: string | undefined) => {
    onChange(key);
    closePopover(true);
  };
  const state = createListState(lists, name);
  async function add() {
    if (!state.enabled) {
      setProblem(state.why);
      return;
    }
    const result = await createList(name);
    if ('problem' in result) {
      setProblem(result.problem);
      return;
    }
    notifyChanged();
    choose(result.list.key);
  }
  return (
    <View {...({ dataSet: { listPickBody: '1' } } as object)}>
      <View {...({ dataSet: { popoverFocus: '1' } } as object)}>
        <Row label={BRAIN_DUMP_NAME} leading={<Text style={styles.emoji}>{BRAIN_DUMP_EMOJI}</Text>} selected={value === undefined} onPress={() => choose(undefined)} a11y={`Move to ${BRAIN_DUMP_NAME}`} />
        {lists.map((l) => (
          <Row key={l.key} label={l.name} leading={l.emoji ? <Text style={styles.emoji}>{l.emoji}</Text> : <View style={styles.emojiGap} />} selected={value === l.key} onPress={() => choose(l.key)} a11y={`Move to list ${l.name}`} />
        ))}
      </View>
      <View style={styles.rule} />
      {creating ? (
        <View style={popoverStyles.pad}>
          <View style={styles.nameRow}>
            <TextInput
              autoFocus
              style={styles.input}
              value={name}
              onChangeText={(t) => {
                setName(t);
                setProblem(null);
              }}
              onSubmitEditing={add}
              placeholder="Name, then Enter"
              placeholderTextColor={Colors.textSecondary}
              accessibilityLabel="New list name"
            />
            <Pressable
              onPress={add}
              disabled={!state.enabled}
              style={[styles.btn, state.enabled ? styles.btnOn : styles.btnOff]}
              accessibilityRole="button"
              accessibilityLabel="Create list"
              accessibilityState={{ disabled: !state.enabled }}
              {...({ dataSet: { createList: state.enabled ? 'on' : 'off' } } as object)}
            >
              <Text style={[outlinedBtnText, state.enabled ? styles.btnOnText : styles.btnOffText]}>Create list</Text>
            </Pressable>
          </View>
          {state.why || problem ? <Text style={popoverStyles.note}>{problem ?? state.why}</Text> : null}
        </View>
      ) : (
        <Row label="New list" icon="add" onPress={() => setCreating(true)} a11y="New list" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  trigger: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 28, paddingHorizontal: 6, borderRadius: 8, borderWidth: 1, borderColor: 'transparent' },
  triggerOpen: { backgroundColor: Colors.hover },
  triggerText: { fontSize: 13, color: Colors.textPrimary },
  emoji: { fontSize: 16, width: 22, textAlign: 'center' },
  emojiGap: { width: 22 },
  rule: { height: 1, backgroundColor: Colors.border, marginVertical: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  input: { flex: 1, minWidth: 0, height: 32, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background, color: Colors.textPrimary, fontSize: 13, fontFamily: DESKTOP_FONT_FAMILY, outlineColor: Colors.accent } as never,
  btn: { height: 32, paddingHorizontal: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  btnOn: { backgroundColor: Colors.accent },
  btnOff: { backgroundColor: Colors.hover },
  btnOnText: { color: Colors.onAccent },
  btnOffText: { color: Colors.textSecondary },
});
