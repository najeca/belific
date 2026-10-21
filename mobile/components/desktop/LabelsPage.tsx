import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { colorClash, freeColorKey, labelColor, sharedColorGroups } from '../../lib/labelColors';
import { useNewColorsOk } from './uiStore';
import { LabelColorPicker } from './LabelColorPicker';
import { availableSuggestions, deletedLabelTarget, findLabelByName } from '../../lib/labelRules';
import { openCountText, openTaskCounts } from '../../lib/labelUsage';
import { countTasksWithLabel, createLabel, deleteLabel, loadLabels, renameLabel, setLabelColor, setLabelEmoji } from '../../lib/labels';
import EmojiField from './EmojiField';
import LabelForm from './LabelForm';
import { loadTasks } from '../../lib/storage';
import type { Project, Task } from '../../lib/types';
import Popover, { closePopover, togglePopover, useIsOpen, usePopoverAnchor } from './Popover';
import { DISPLAY_FONT_FAMILY } from './desktopFont';

// The Labels page (checkpoint 9, decision 025): every label with its colour,
// name and the number of open tasks using it. Its colour, emoji or name opens
// one form with all three (2.27.1), delete with an inline confirm (the existing rule:
// tasks move to a same named label, otherwise lose the label), add from the
// suggestions or by typing. Duplicate names are refused as everywhere else.
// No reordering. The trash button is always there (no hover only controls).
// Since build plan phase 7 this is the BODY of the Labels overlay
// (LabelsOverlay.tsx), not a page; each label also has an emoji.
export default function LabelsPage({ onChanged }: { onChanged: () => void }) {
  const [labels, setLabels] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmoji, setNewEmoji] = useState<string | undefined>(undefined);
  const [newColor, setNewColor] = useState<string | null>(null);
  const [addProblem, setAddProblem] = useState<string | null>(null);
  const nameRef = useRef<TextInput>(null);

  const reload = useCallback(async () => {
    const [l, t] = await Promise.all([loadLabels(), loadTasks()]);
    setLabels(l);
    setTasks(t);
    setLoaded(true);
  }, []);
  useEffect(() => {
    reload().catch(() => setLoaded(true));
  }, [reload]);

  const changed = useCallback(async () => {
    await reload();
    onChanged();
  }, [reload, onChanged]);

  const counts = openTaskCounts(tasks);
  const suggestions = availableSuggestions(labels);
  const newColorsOk = useNewColorsOk();
  // 2.27.0: labels that already share a colour are left alone, with a notice.
  const shared = sharedColorGroups(labels);

  // The colour shown for the next label: the person's pick, else the next free one.
  const addColor = newColor && !colorClash(labels, newColor) ? newColor : freeColorKey(labels, newColorsOk);

  async function add(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (findLabelByName(labels, trimmed)) {
      setAddProblem('A label with that name already exists');
      return;
    }
    if (!addColor) {
      setAddProblem('Pick a colour first.');
      return;
    }
    const clash = colorClash(labels, addColor);
    if (clash) {
      setAddProblem(`"${clash.name}" already has that colour. Pick another.`);
      return;
    }
    setAddProblem(null);
    await createLabel(trimmed, newEmoji, addColor, newColorsOk);
    setNewName('');
    setNewEmoji(undefined);
    setNewColor(null);
    await changed();
  }

  return (
    <View style={styles.column}>
        {shared.length > 0 && (
          <View style={styles.notice} accessibilityLabel="Labels that share a colour" {...({ dataSet: { sharedColors: '1' } } as object)}>
            <Text style={styles.noticeText}>
              {shared.map((g) => g.map((l) => l.name).join(' and ')).join('; ')} share a colour. Change one of them to tell them apart on the board and the calendar.
            </Text>
          </View>
        )}
        <View style={styles.card}>
          {loaded && labels.length === 0 && <Text style={styles.empty}>No labels yet. Add one below.</Text>}
          {labels.map((label, i) => (
            <LabelRow
              key={label.key}
              label={label}
              labels={labels}
              open={counts.get(label.key) ?? 0}
              all={countTasksWithLabel(tasks, label.key)}
              first={i === 0}
              onChanged={changed}
            />
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Add a label</Text>
          {/* 2.27.1: a new label always shows its name, emoji and colour together. */}
          <View style={styles.addRow} {...({ dataSet: { newLabelForm: 'page' } } as object)}>
            <TextInput
              ref={nameRef}
              style={styles.input}
              value={newName}
              onChangeText={(v) => {
                setNewName(v);
                setAddProblem(null);
              }}
              onSubmitEditing={() => add(newName)}
              placeholder="New label name"
              placeholderTextColor={Colors.textSecondary}
              accessibilityLabel="New label name"
              maxLength={40}
            />
            <Pressable
              onPress={() => add(newName)}
              disabled={!newName.trim()}
              accessibilityRole="button"
              accessibilityLabel="Add label"
              style={[styles.btnPrimary, !newName.trim() && styles.disabled]}
            >
              <Text style={styles.btnPrimaryText}>Add</Text>
            </Pressable>
          </View>
          <View style={styles.addParts}>
            <EmojiField label="New label emoji" value={newEmoji} onChange={setNewEmoji} />
            <LabelColorPicker value={addColor} forName="the new label" labels={labels} onPick={setNewColor} />
          </View>
          {addProblem && <Text style={styles.problem}>{addProblem}</Text>}
          {suggestions.length > 0 && (
            <>
              <Text style={styles.hint}>Suggested</Text>
              <View style={styles.chips}>
                {suggestions.map((s) => (
                  <Pressable
                    key={s}
                    // Fills the form (its colour and emoji are chosen there), never adds blind.
                    onPress={() => {
                      setNewName(s);
                      setAddProblem(null);
                      nameRef.current?.focus();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Add suggested label ${s}`}
                    style={styles.chip}
                  >
                    <Ionicons name="add" size={14} color={Colors.textSecondary} />
                    <Text style={styles.chipText}>{s}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}
        </View>
    </View>
  );
}

function LabelRow({
  label,
  labels,
  open,
  all,
  first,
  onChanged,
}: {
  label: Project;
  labels: Project[];
  open: number;
  all: number;
  first: boolean;
  onChanged: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const editId = `label-edit:${label.key}`;
  const { ref, get } = usePopoverAnchor();
  const editOpen = useIsOpen(editId);
  const color = labelColor(label.colorKey);
  // 2.27.1: the colour, the emoji and the name all open the same small form with
  // name, emoji and colour together (any label, whatever version made it).
  const edit = () => togglePopover(editId, get);

  async function confirmDelete() {
    await deleteLabel(label.key);
    setConfirming(false);
    await onChanged();
  }

  const target = deletedLabelTarget(labels, label.key);
  const targetName = target ? labels.find((l) => l.key === target)?.name : undefined;

  return (
    <View style={[styles.rowWrap, !first && styles.rowDivider]} accessibilityLabel={`Label ${label.name}`}>
      <View style={styles.row} ref={ref as never}>
        <Pressable
          onPress={edit}
          accessibilityRole="button"
          accessibilityState={{ expanded: editOpen }}
          accessibilityLabel={`Colour of ${label.name}`}
          style={[styles.swatchBtn, editOpen && styles.swatchBtnOpen]}
        >
          <View style={[styles.swatch, { backgroundColor: color?.edge ?? Colors.border }]} />
        </Pressable>
        <Pressable onPress={edit} accessibilityRole="button" accessibilityLabel={`Emoji of ${label.name}`} style={styles.swatchBtn}>
          <Text style={styles.emoji}>{label.emoji ?? '🙂'}</Text>
        </Pressable>
        <View style={styles.nameWrap}>
          <Pressable onPress={edit} accessibilityRole="button" accessibilityLabel={`Rename label ${label.name}`}>
            <Text style={styles.name} numberOfLines={1}>
              {label.name}
            </Text>
          </Pressable>
        </View>
        <Text style={styles.count}>{openCountText(open)}</Text>
        <Pressable
          onPress={() => setConfirming((c) => !c)}
          accessibilityRole="button"
          accessibilityLabel={`Delete label ${label.name}`}
          style={styles.iconBtn}
        >
          <Ionicons name="trash-outline" size={18} color={Colors.textSecondary} />
        </Pressable>
      </View>
      {confirming && (
        <View style={styles.confirm}>
          <Text style={styles.body}>
            {all === 0
              ? `Delete the label ${label.name}?`
              : targetName
                ? `Delete the label ${label.name}? Its ${all} task${all === 1 ? '' : 's'} will move to the other label called ${targetName}.`
                : `Delete the label ${label.name}? Its ${all} task${all === 1 ? '' : 's'} will lose the label.`}
          </Text>
          <View style={styles.confirmRow}>
            <Pressable onPress={confirmDelete} accessibilityRole="button" accessibilityLabel={`Confirm delete label ${label.name}`} style={styles.btn}>
              <Text style={styles.dangerText}>Delete</Text>
            </Pressable>
            <Pressable onPress={() => setConfirming(false)} accessibilityRole="button" accessibilityLabel="Cancel delete" style={styles.btn}>
              <Text style={styles.btnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}
      <Popover id={editId} anchor={get} width={300} maxHeight={560} label={`Edit ${label.name}`}>
        <LabelForm
          mode="edit"
          initial={{ name: label.name, emoji: label.emoji, colorKey: label.colorKey ?? '' }}
          labels={labels}
          editKey={label.key}
          forName={label.name}
          onCancel={() => closePopover(true)}
          onLiveChange={async (c) => {
            if (c.colorKey !== undefined && c.colorKey !== label.colorKey) {
              const problem = await setLabelColor(label.key, c.colorKey);
              if (problem) return problem;
            }
            if ('emoji' in c && c.emoji !== label.emoji) await setLabelEmoji(label.key, c.emoji);
            await onChanged();
            return null;
          }}
          onSubmit={async (v) => {
            const problem = await renameLabel(label.key, v.name);
            if (problem) return problem;
            closePopover(true);
            await onChanged();
            return null;
          }}
        />
      </Popover>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 16, paddingTop: 4, alignItems: 'center' },
  column: { width: '100%', maxWidth: 640, gap: 12 },
  heading: { fontSize: 18, fontFamily: DISPLAY_FONT_FAMILY, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
  card: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  empty: { fontSize: 14, color: Colors.textSecondary, paddingVertical: 12 },
  sectionTitle: { marginTop: 8, marginBottom: 6, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: Colors.textSecondary },
  rowWrap: { paddingVertical: 6 },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 },
  swatchBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  swatchBtnOpen: { borderColor: Colors.accent },
  swatch: { width: 18, height: 18, borderRadius: 9 },
  emoji: { fontSize: 18 },
  nameWrap: { flex: 1, minWidth: 0 },
  name: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  nameInput: {
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    color: Colors.textPrimary,
    fontSize: 14,
    outlineColor: Colors.accent,
  },
  count: { fontSize: 12, color: Colors.textSecondary },
  iconBtn: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  problem: { marginTop: 4, fontSize: 12, color: Colors.danger },
  notice: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  noticeText: { fontSize: 13, color: Colors.textPrimary, lineHeight: 18 },
  confirm: { marginTop: 6, marginBottom: 4, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background, gap: 8 },
  confirmRow: { flexDirection: 'row', gap: 8 },
  body: { fontSize: 14, color: Colors.textPrimary },
  hint: { marginTop: 10, fontSize: 12, color: Colors.textSecondary },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addParts: { gap: 8, marginTop: 8 },
  input: {
    flex: 1,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    color: Colors.textPrimary,
    fontSize: 14,
    outlineColor: Colors.accent,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, marginBottom: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, height: 32, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background },
  chipText: { fontSize: 13, color: Colors.textPrimary },
  dot: { width: 12, height: 12, borderRadius: 6 },
  btn: { paddingHorizontal: 14, height: 36, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, justifyContent: 'center' },
  btnText: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  btnPrimary: { paddingHorizontal: 16, height: 36, borderRadius: 14, backgroundColor: Colors.accent, justifyContent: 'center' },
  btnPrimaryText: { fontSize: 13, fontWeight: '600', color: Colors.onAccent },
  dangerText: { fontSize: 13, fontWeight: '600', color: Colors.danger },
  disabled: { opacity: 0.4 },
});
