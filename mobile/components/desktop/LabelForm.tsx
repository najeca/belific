import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import type { Project } from '../../lib/types';
import EmojiField from './EmojiField';
import { LabelColorPicker } from './LabelColorPicker';

export interface LabelValues {
  name: string;
  emoji?: string;
  colorKey: string;
}

// The one small label form (2.27.1): name, emoji and colour together, the same
// for a new label and an existing one, wherever a label is made or changed (the
// label menu of a task, the details, the Labels page). A new label is made only
// on Create, with the colour shown; an existing label saves its colour and emoji
// as they are picked and its name on Enter or Save. `onSubmit` returns a problem
// to show (a duplicate name, a taken colour) or null.
export default function LabelForm({
  mode,
  initial,
  labels,
  editKey,
  onSubmit,
  onLiveChange,
  onCancel,
  onDelete,
  forName,
}: {
  mode: 'new' | 'edit';
  initial: LabelValues;
  // Every live label: the colours already taken.
  labels: Pick<Project, 'key' | 'name' | 'colorKey' | 'deletedAt'>[];
  // The label being edited (its own colour is not taken).
  editKey?: string;
  onSubmit: (values: LabelValues) => Promise<string | null>;
  // Edit only: a colour or emoji picked is saved at once.
  onLiveChange?: (change: Partial<LabelValues>) => Promise<string | null>;
  onCancel: () => void;
  onDelete?: () => void;
  // The label's current name, for the screen reader.
  forName?: string;
}) {
  const [values, setValues] = useState<LabelValues>(initial);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const who = mode === 'new' ? 'the new label' : forName ?? initial.name;

  const submit = async () => {
    if (busy || !values.name.trim()) return;
    setBusy(true);
    const p = await onSubmit({ ...values, name: values.name.trim() });
    setBusy(false);
    setProblem(p);
  };
  const live = async (change: Partial<LabelValues>) => {
    const before = values;
    setValues((v) => ({ ...v, ...change }));
    setProblem(null);
    if (!onLiveChange) return;
    const p = await onLiveChange(change);
    if (p) {
      setValues(before);
      setProblem(p);
    }
  };

  return (
    <View style={styles.form} {...({ dataSet: mode === 'new' ? { newLabelForm: '1' } : { editLabelForm: editKey ?? '1' } } as object)}>
      <View style={styles.head}>
        <Pressable onPress={onCancel} style={styles.back} accessibilityRole="button" accessibilityLabel={mode === 'new' ? 'Back to the labels' : 'Close label editing'}>
          <Ionicons name="chevron-back" size={15} color={Colors.textSecondary} />
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          {mode === 'new' ? 'New label' : 'Edit label'}
        </Text>
      </View>
      <TextInput
        style={styles.input}
        value={values.name}
        placeholder="Label name"
        placeholderTextColor={Colors.textSecondary}
        onChangeText={(name) => {
          setValues((v) => ({ ...v, name }));
          setProblem(null);
        }}
        onSubmitEditing={submit}
        // Enter keeps the field so a refused name can be fixed.
        blurOnSubmit={false}
        maxLength={40}
        autoFocus
        selectTextOnFocus={mode === 'edit'}
        accessibilityLabel={mode === 'new' ? 'New label name' : `Rename ${forName ?? initial.name}`}
      />
      <EmojiField label={mode === 'new' ? 'New label emoji' : `Emoji for ${who}`} value={values.emoji} onChange={(emoji) => live({ emoji })} />
      <LabelColorPicker value={values.colorKey} forName={who} labels={labels} exceptKey={editKey} onPick={(colorKey) => live({ colorKey })} />
      {problem && (
        <Text style={styles.problem} accessibilityLabel="Label note">
          {problem}
        </Text>
      )}
      <View style={styles.buttons}>
        {onDelete && (
          <Pressable onPress={onDelete} style={styles.btn} accessibilityRole="button" accessibilityLabel={`Delete label ${forName ?? initial.name}`}>
            <Text style={styles.danger}>Delete</Text>
          </Pressable>
        )}
        <View style={{ flex: 1 }} />
        <Pressable onPress={onCancel} style={styles.btn} accessibilityRole="button" accessibilityLabel={mode === 'new' ? 'Cancel new label' : 'Done editing the label'}>
          <Text style={styles.btnText}>{mode === 'new' ? 'Cancel' : 'Done'}</Text>
        </Pressable>
        <Pressable
          onPress={submit}
          disabled={!values.name.trim() || busy}
          style={[styles.primary, (!values.name.trim() || busy) && styles.off]}
          accessibilityRole="button"
          accessibilityLabel={mode === 'new' ? 'Create the new label' : `Save name of ${forName ?? initial.name}`}
        >
          <Text style={styles.primaryText}>{mode === 'new' ? 'Create' : 'Save'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { padding: 10, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  back: { width: 24, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  input: { height: 32, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background, color: Colors.textPrimary, fontSize: 14, outlineColor: Colors.accent },
  problem: { fontSize: 12, color: Colors.danger },
  buttons: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  btn: { paddingHorizontal: 10, height: 28, borderRadius: 8, justifyContent: 'center' },
  btnText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  danger: { fontSize: 13, fontWeight: '600', color: Colors.danger },
  primary: { paddingHorizontal: 14, height: 28, borderRadius: 8, backgroundColor: Colors.accent, justifyContent: 'center' },
  primaryText: { fontSize: 13, fontWeight: '600', color: Colors.onAccent },
  off: { opacity: 0.4 },
});
