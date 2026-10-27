import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { BRAIN_DUMP_EMOJI, DEFAULT_LIST_EMOJI } from '../../lib/emoji';
import { BRAIN_DUMP_NAME, createListState, listTitle } from '../../lib/lists';
import { createList, editList, removeList } from '../../lib/taskCommands';
import type { TaskList } from '../../lib/types';
import EmojiField from './EmojiField';
import Popover, { PopoverHeading, Row, closePopover, togglePopover, useIsOpen, usePopoverAnchor, popoverStyles } from './Popover';
import { outlinedBtn, outlinedBtnHover, outlinedBtnText } from './ui';
import { notifyChanged, selectList } from './uiStore';

const POPOVER_ID = 'list-switcher';

// The lists switcher at the top of the left pane (build plan phase 2). Brain
// Dump is the default list and always there; a named list is added here, with
// an emoji. A pencil on each list's row (not Brain Dump, which is not a stored
// list) opens its edit box: name, emoji, Save, Cancel and Delete list (its tasks
// go back to Brain Dump, none is deleted). The button names the current list; the
// popover lists them all with how many tasks wait in each.
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
        <Body lists={lists} counts={counts} selected={selected} />
      </Popover>
    </>
  );
}

function Body({ lists, counts, selected }: { lists: TaskList[]; counts: Map<string, number>; selected: string | undefined }) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState<string | undefined>();
  const [problem, setProblem] = useState<string | null>(null);
  // The key of the list whose edit box is open.
  const [editing, setEditing] = useState<string | null>(null);
  const editTarget = editing ? lists.find((l) => l.key === editing) : undefined;

  const choose = (key: string | null) => {
    selectList(key);
    closePopover(true);
  };

  const create = createListState(lists, name);
  async function add() {
    if (!create.enabled) {
      setProblem(create.why);
      return;
    }
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

  if (editTarget) return <EditBox list={editTarget} count={counts.get(editTarget.key) ?? 0} onDone={() => setEditing(null)} />;

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
          trailing={
            <>
              <Text style={styles.count}>{counts.get(l.key) ?? 0}</Text>
              <Pressable
                onPress={() => setEditing(l.key)}
                style={(state) => {
                  const st = state as typeof state & { hovered?: boolean; focused?: boolean };
                  return [styles.pencil, (st.hovered || st.focused) && styles.pencilOn];
                }}
                accessibilityRole="button"
                accessibilityLabel={`Edit list ${l.name}`}
                {...({ dataSet: { listEdit: l.key } } as object)}
              >
                <Ionicons name="pencil-outline" size={14} color={Colors.textSecondary} />
              </Pressable>
            </>
          }
          selected={selected === l.key}
          onPress={() => choose(l.key)}
          a11y={`Show list ${l.name}`}
        />
      ))}

      <PopoverHeading>New list</PopoverHeading>
      <View style={popoverStyles.pad}>
        <View style={styles.nameRow}>
          <TextInput
            style={[styles.input, styles.nameInput]}
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
            disabled={!create.enabled}
            style={(state) => {
              const st = state as typeof state & { hovered?: boolean };
              return [styles.btn, create.enabled ? styles.btnPrimary : styles.btnOff, create.enabled && st.hovered && { opacity: 0.9 }];
            }}
            accessibilityRole="button"
            accessibilityLabel="Create list"
            accessibilityState={{ disabled: !create.enabled }}
            {...({ dataSet: { createList: create.enabled ? 'on' : 'off' } } as object)}
          >
            <Text style={[outlinedBtnText, create.enabled ? styles.btnPrimaryText : styles.btnOffText]}>Create list</Text>
          </Pressable>
        </View>
        {create.why ? (
          <Text style={popoverStyles.note} {...({ dataSet: { createWhy: '1' } } as object)}>
            {create.why}
          </Text>
        ) : null}
        <EmojiField label="New list emoji" value={emoji} onChange={setEmoji} />
        {problem && problem !== create.why ? <Text style={popoverStyles.noteWarn}>{problem}</Text> : null}
      </View>
    </View>
  );
}

// The edit box of one list: its name and emoji, Save, Cancel, and Delete list (with the same confirmation).
function EditBox({ list, count, onDone }: { list: TaskList; count: number; onDone: () => void }) {
  const [text, setText] = useState(list.name);
  const [emoji, setEmoji] = useState<string | undefined>(list.emoji);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function save() {
    const result = await editList(list.key, text, emoji);
    if ('problem' in result) {
      setProblem(result.problem);
      return;
    }
    notifyChanged();
    onDone();
  }

  const button = (label: string, a11y: string, onPress: () => void, primary = false) => (
    <Pressable
      onPress={onPress}
      style={(state) => {
        const st = state as typeof state & { hovered?: boolean };
        return [styles.btn, primary ? styles.btnPrimary : st.hovered && outlinedBtnHover];
      }}
      accessibilityRole="button"
      accessibilityLabel={a11y}
    >
      <Text style={[outlinedBtnText, primary && styles.btnPrimaryText]}>{label}</Text>
    </Pressable>
  );

  return (
    <View {...({ dataSet: { listEditBox: list.key } } as object)}>
      <PopoverHeading>Edit list</PopoverHeading>
      <View style={popoverStyles.pad}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={(t) => {
            setText(t);
            setProblem(null);
          }}
          onSubmitEditing={save}
          autoFocus
          accessibilityLabel={`Name of list ${list.name}`}
        />
        <EmojiField label={`Emoji for list ${list.name}`} value={emoji} onChange={setEmoji} />
        {problem ? <Text style={popoverStyles.noteWarn}>{problem}</Text> : null}
        <View style={styles.buttons}>
          {button('Save', `Save list ${list.name}`, save, true)}
          {button('Cancel', 'Cancel list edit', onDone)}
        </View>
      </View>
      <View style={styles.sep} />
      <View style={popoverStyles.pad}>
        {confirming ? (
          <View style={styles.confirm}>
            <Text style={popoverStyles.note}>Delete this list? Its {count} waiting tasks go back to Brain Dump.</Text>
            <Pressable
              onPress={async () => {
                await removeList(list.key);
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
          <Pressable onPress={() => setConfirming(true)} accessibilityRole="button" accessibilityLabel={`Delete list ${list.name}`}>
            <Text style={styles.danger}>Delete list</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  button: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', maxWidth: '100%', paddingHorizontal: 10, height: 30, borderRadius: 10 },
  buttonOpen: { backgroundColor: Colors.background },
  buttonText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, color: Colors.textPrimary, flexShrink: 1 },
  emoji: { fontSize: 15, width: 22, textAlign: 'center' },
  pencil: { width: 26, height: 26, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  pencilOn: { backgroundColor: Colors.surfaceRaised },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 4 },
  btn: { ...outlinedBtn, height: 30 },
  btnPrimary: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  btnPrimaryText: { color: Colors.onAccent, fontWeight: '700' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nameInput: { flex: 1, minWidth: 0 },
  btnOff: { borderColor: Colors.border, backgroundColor: Colors.background, opacity: 0.7 },
  btnOffText: { color: Colors.textSecondary },
  sep: { height: 1, backgroundColor: Colors.border, marginHorizontal: 10 },
  count: { fontSize: 12, color: Colors.textSecondary, fontVariant: ['tabular-nums'] },
  input: { height: 34, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background, color: Colors.textPrimary, fontSize: 14, outlineColor: Colors.accent },
  confirm: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  yes: { fontSize: 13, fontWeight: '700', color: Colors.danger },
  no: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  danger: { fontSize: 13, fontWeight: '600', color: Colors.danger },
});
