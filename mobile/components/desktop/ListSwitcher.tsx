import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { BRAIN_DUMP_EMOJI, DEFAULT_LIST_EMOJI } from '../../lib/emoji';
import { BRAIN_DUMP_NAME, listTitle } from '../../lib/lists';
import { createList, removeList, renameList, setListEmoji } from '../../lib/taskCommands';
import type { TaskList } from '../../lib/types';
import EmojiField from './EmojiField';
import Popover, { PopoverHeading, Row, closePopover, togglePopover, useIsOpen, usePopoverAnchor, popoverStyles } from './Popover';
import { notifyChanged, selectList } from './uiStore';

const POPOVER_ID = 'list-switcher';

// The lists switcher at the top of the left pane (build plan phase 2). Brain
// Dump is the default list and always there; a named list is added here, with
// an emoji, renamed, re-emojied or deleted (its tasks go back to Brain Dump,
// none is deleted). The button names the current list; the popover lists them
// all with how many tasks wait in each.
export default function ListSwitcher({
  lists,
  counts,
  selected,
}: {
  lists: TaskList[];
  counts: Map<string, number>;
  // The key of the shown list; undefined is Brain Dump.
  selected: string | undefined;
}) {
  const { ref, get } = usePopoverAnchor();
  const open = useIsOpen(POPOVER_ID);
  const current = lists.find((l) => l.key === selected);
  return (
    <>
      <Pressable
        ref={ref as never}
        onPress={() => togglePopover(POPOVER_ID, get)}
        style={[styles.button, open && styles.buttonOpen]}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`List: ${current?.name ?? BRAIN_DUMP_NAME}. Change list`}
        {...({ dataSet: { ctl: 'lists' } } as object)}
      >
        <Text style={styles.buttonText} numberOfLines={1}>
          {listTitle(current)}
        </Text>
        <Ionicons name="chevron-down" size={14} color={Colors.textSecondary} />
      </Pressable>
      <Popover id={POPOVER_ID} anchor={get} width={300} label="Lists">
        <Body lists={lists} counts={counts} selected={selected} current={current} />
      </Popover>
    </>
  );
}

function Body({ lists, counts, selected, current }: { lists: TaskList[]; counts: Map<string, number>; selected: string | undefined; current: TaskList | undefined }) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState<string | undefined>();
  const [problem, setProblem] = useState<string | null>(null);
  const [renameText, setRenameText] = useState(current?.name ?? '');
  const [renameProblem, setRenameProblem] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const choose = (key: string | null) => {
    selectList(key);
    closePopover(true);
  };

  async function add() {
    const result = await createList(name, emoji);
    if ('problem' in result) {
      setProblem(result.problem);
      return;
    }
    setName('');
    setEmoji(undefined);
    setProblem(null);
    notifyChanged();
    choose(result.list.key);
  }

  async function rename() {
    if (!current) return;
    const p = await renameList(current.key, renameText);
    setRenameProblem(p);
    if (!p) notifyChanged();
  }

  return (
    <View>
      <PopoverHeading>Lists</PopoverHeading>
      <Row
        label={BRAIN_DUMP_NAME}
        leading={<Text style={styles.emoji}>{BRAIN_DUMP_EMOJI}</Text>}
        trailing={<Text style={styles.count}>{counts.get('') ?? 0}</Text>}
        selected={selected === undefined}
        onPress={() => choose(null)}
        a11y={`Show ${BRAIN_DUMP_NAME}`}
      />
      {lists.map((l) => (
        <Row
          key={l.key}
          label={l.name}
          leading={<Text style={styles.emoji}>{l.emoji ?? DEFAULT_LIST_EMOJI}</Text>}
          trailing={<Text style={styles.count}>{counts.get(l.key) ?? 0}</Text>}
          selected={selected === l.key}
          onPress={() => choose(l.key)}
          a11y={`Show list ${l.name}`}
        />
      ))}

      <PopoverHeading>New list</PopoverHeading>
      <View style={popoverStyles.pad}>
        <TextInput
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
        <EmojiField label="New list emoji" value={emoji} onChange={setEmoji} />
        {problem ? <Text style={popoverStyles.noteWarn}>{problem}</Text> : null}
      </View>

      {current && (
        <>
          <PopoverHeading>This list</PopoverHeading>
          <View style={popoverStyles.pad}>
            <TextInput
              style={styles.input}
              value={renameText}
              onChangeText={(t) => {
                setRenameText(t);
                setRenameProblem(null);
              }}
              onSubmitEditing={rename}
              onBlur={rename}
              accessibilityLabel={`Rename list ${current.name}`}
            />
            {renameProblem ? <Text style={popoverStyles.noteWarn}>{renameProblem}</Text> : null}
            <EmojiField
              label={`Emoji for list ${current.name}`}
              value={current.emoji}
              onChange={async (e) => {
                await setListEmoji(current.key, e);
                notifyChanged();
              }}
            />
            {confirming ? (
              <View style={styles.confirm}>
                <Text style={popoverStyles.note}>
                  Delete this list? Its {counts.get(current.key) ?? 0} waiting tasks go back to Brain Dump.
                </Text>
                <Pressable
                  onPress={async () => {
                    await removeList(current.key);
                    selectList(null);
                    notifyChanged();
                    closePopover(true);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Confirm delete list"
                >
                  <Text style={styles.yes}>Yes</Text>
                </Pressable>
                <Pressable onPress={() => setConfirming(false)} accessibilityRole="button" accessibilityLabel="Cancel delete list">
                  <Text style={styles.no}>No</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={() => setConfirming(true)} accessibilityRole="button" accessibilityLabel={`Delete list ${current.name}`}>
                <Text style={styles.danger}>Delete list</Text>
              </Pressable>
            )}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  button: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', maxWidth: '100%', paddingHorizontal: 10, height: 30, borderRadius: 10 },
  buttonOpen: { backgroundColor: Colors.background },
  buttonText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, color: Colors.textPrimary, flexShrink: 1 },
  emoji: { fontSize: 15, width: 22, textAlign: 'center' },
  count: { fontSize: 12, color: Colors.textSecondary, fontVariant: ['tabular-nums'] },
  input: { height: 34, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background, color: Colors.textPrimary, fontSize: 14, outlineColor: Colors.accent },
  confirm: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  yes: { fontSize: 13, fontWeight: '700', color: Colors.danger },
  no: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  danger: { fontSize: 13, fontWeight: '600', color: Colors.danger },
});
