import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, type ColorTokens } from '../../lib/tokens';
import { LABEL_COLORS, colorClash, nextColorKey } from '../../lib/labelColors';
import { countTasksWithLabel, createLabel, deleteLabel, renameLabel, setLabelColor, setLabelEmoji } from '../../lib/labels';
import { countsInHours, hoursCountKey } from '../../lib/labelHours';
import { deletedLabelTarget } from '../../lib/labelRules';
import { loadTasksRaw, loadUserSettingsRaw, setUserSetting } from '../../lib/storage';
import type { Project } from '../../lib/types';
import Toggle from '../Toggle';
import { useStyles, useTheme } from './theme';
import { useReducedMotion, useSettled } from './touch';
import { inter, type } from './type';
import { Button } from './ui';
import { EmojiPick } from './EmojiPick';

// A new label, or one label's name, emoji and colour (PLAN_phone_stepflow section 4, 3.61.0), with the "Count in daily
// hours" switch (it lives here as well as in Settings; the same synced row hours.count.<labelKey>). The shared label
// commands (createLabel, renameLabel, setLabelColor, setLabelEmoji) keep the name and colour rules of the desktop.
const make = (c: ColorTokens) => ({
  scrim: { flex: 1, backgroundColor: c.scrim, justifyContent: 'flex-end' as const },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderWidth: 1, borderColor: c.border, borderTopWidth: 8, borderTopColor: c.accent, padding: 16, maxHeight: '92%' as const },
  title: { ...type.sheetTitle, color: c.textPrimary },
  label: { ...type.small, color: c.textSecondary },
  input: { ...inter(500), fontSize: 17, color: c.textPrimary, minHeight: 48, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.pane },
  problem: { ...type.meta, color: c.textPrimary },
  row: { flexDirection: 'row' as const, gap: 10, justifyContent: 'flex-end' as const },
  swatches: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 4 },
  swatch: { width: 44, height: 44, alignItems: 'center' as const, justifyContent: 'center' as const, borderRadius: 22 },
  swatchDot: { width: 28, height: 28, borderRadius: 14 },
  swatchOn: { borderWidth: 2, borderColor: c.textPrimary },
  switchRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, minHeight: 48 },
  switchText: { ...inter(500), fontSize: 15, color: c.textPrimary, flexShrink: 1 },
});

export function LabelSheet({ visible, label, labels, onClose, onSaved, onDeleted }: { visible: boolean; label: Project | null; labels: Project[]; onClose: () => void; onSaved: (key: string) => void; onDeleted?: (key: string) => void }) {
  const s = useStyles(make);
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const settled = useSettled(visible);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');
  const [color, setColor] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [counts, setCounts] = useState(true);
  const [confirm, setConfirm] = useState<string | null>(null);
  useEffect(() => {
    if (!visible) return;
    setName(label?.name ?? '');
    setEmoji(label?.emoji ?? '');
    setColor(label?.colorKey ?? nextColorKey(labels, true));
    setProblem(null);
    setConfirm(null);
    if (label) {
      loadUserSettingsRaw()
        .then((rows) => setCounts(countsInHours(label, rows.find((r) => !r.deletedAt && r.key === hoursCountKey(label.key))?.value)))
        .catch(() => {});
    } else setCounts(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, label]);

  async function save() {
    if (!name.trim()) {
      setProblem('Give the label a name.');
      return;
    }
    if (!label) {
      const res = await createLabel(name, emoji || undefined, color || undefined, true);
      if (!res) return;
      if (!counts) await setUserSetting(hoursCountKey(res.label.key), 'off');
      onSaved(res.label.key);
      return;
    }
    const bad = await renameLabel(label.key, name);
    if (bad) {
      setProblem(bad);
      return;
    }
    if (color && color !== label.colorKey) {
      const clash = await setLabelColor(label.key, color);
      if (clash) {
        setProblem(clash);
        return;
      }
    }
    if ((emoji || '') !== (label.emoji ?? '')) await setLabelEmoji(label.key, emoji || undefined);
    await setUserSetting(hoursCountKey(label.key), counts ? 'on' : 'off');
    onSaved(label.key);
  }

  // Delete label: the desktop's rule (labels.deleteLabel): its tasks move to another label of the same name if there is
  // one, else just lose the label; the tasks stay.
  async function askDelete() {
    if (!label) return;
    const n = countTasksWithLabel(await loadTasksRaw(), label.key);
    const target = deletedLabelTarget(labels, label.key);
    const targetName = target ? labels.find((l) => l.key === target)?.name : undefined;
    setConfirm(
      n === 0
        ? `Delete the label ${label.name}?`
        : targetName
          ? `Delete the label ${label.name}? Its ${n} task${n === 1 ? '' : 's'} will move to the other label called ${targetName}.`
          : `Delete the label ${label.name}? Its ${n} task${n === 1 ? '' : 's'} will lose the label. The tasks stay.`,
    );
  }
  async function doDelete() {
    if (!label) return;
    await deleteLabel(label.key);
    onDeleted?.(label.key);
  }

  return (
    <Modal visible={visible} transparent animationType={reduced ? 'none' : 'slide'} onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={s.scrim} onPress={() => settled() && onClose()} accessibilityLabel="Cancel">
          <Pressable style={[s.sheet, { paddingBottom: insets.bottom + 16 }]} onPress={() => {}} {...({ dataSet: { labelSheet: label?.key ?? 'new' } } as object)}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12 }}>
              <Text style={s.title} accessibilityRole="header">
                {label ? 'Edit label' : 'New label'}
              </Text>
              <Text style={s.label}>Name</Text>
              <TextInput
                style={s.input}
                value={name}
                onChangeText={(t) => {
                  setName(t);
                  setProblem(null);
                }}
                placeholder="Health, Money, Errands…"
                placeholderTextColor={c.textTertiary}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={save}
                accessibilityLabel="Label name"
              />
              <Text style={s.label}>Colour</Text>
              <View style={s.swatches} accessibilityLabel="Colour" {...({ dataSet: { labelColors: color } } as object)}>
                {LABEL_COLORS.map((col) => {
                  const on = color === col.key;
                  const taken = !on && !!colorClash(labels, col.key, label?.key);
                  return (
                    <Pressable key={col.key} onPress={() => !taken && setColor(col.key)} disabled={taken} style={[s.swatch, on && s.swatchOn, taken && { opacity: 0.25 }]} accessibilityRole="button" accessibilityLabel={col.name} accessibilityState={{ selected: on, disabled: taken }} {...({ dataSet: { labelColor: col.key } } as object)}>
                      <View style={[s.swatchDot, { backgroundColor: col.edge }]} />
                    </Pressable>
                  );
                })}
              </View>
              <Text style={s.label}>Emoji</Text>
              <EmojiPick value={emoji} onChange={setEmoji} />
              <View style={s.switchRow} {...({ dataSet: { labelHours: '1' } } as object)}>
                <Text style={s.switchText}>Count in daily hours</Text>
                <Toggle value={counts} onValueChange={setCounts} label="Count in daily hours" colors={c} />
              </View>
              {problem ? <Text style={s.problem}>{problem}</Text> : null}
              {label && !confirm ? (
                <View style={{ flexDirection: 'row' }}>
                  <Button label="Delete label" onPress={() => void askDelete()} a11y={`Delete label ${label.name}`} />
                </View>
              ) : null}
              {confirm ? (
                <Text style={s.problem} {...({ dataSet: { labelDeleteConfirm: '1' } } as object)}>
                  {confirm}
                </Text>
              ) : null}
            </ScrollView>
            {confirm ? (
              <View style={[s.row, { paddingTop: 12 }]}>
                <Button label="Keep" onPress={() => setConfirm(null)} a11y="Keep the label" />
                <Button label="Delete" kind="primary" onPress={() => void doDelete()} a11y={`Confirm delete label ${label?.name ?? ''}`} />
              </View>
            ) : (
              <View style={[s.row, { paddingTop: 12 }]}>
                <Button label="Cancel" onPress={onClose} a11y="Cancel label edit" />
                <Button label={label ? 'Save' : 'Create label'} kind="primary" onPress={save} a11y={label ? `Save label ${label.name}` : 'Create label'} />
              </View>
            )}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
