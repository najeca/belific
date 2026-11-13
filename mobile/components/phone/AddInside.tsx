// Shifts S5 (PLAN_shifts): "Add inside" on the phone, the desktop's form (components/desktop/ShiftBody.tsx) for a finger:
// what is it, no time (a to do on the shift's checklist) or at a time (an ordinary task), and for a repeating shift This day
// only / This and following / All days of the shift. A time that does not fit says why in grey with "Fit inside". Text 14 px
// or more, targets 44 pt, nothing red. The rules are lib/shifts.ts; what it writes is lib/shiftActions.ts.
import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, type ColorTokens } from '../../lib/tokens';
import { formatMinutes } from '../../lib/timebox';
import { THIS_AND_FOLLOWING } from '../../lib/series';
import { ADD_INSIDE, DEFAULT_INSIDE_MIN, INSIDE_LENGTHS, allDaysOfShift, defaultStart, formCheck, type InsideForm, type InsideScope } from '../../lib/shifts';
import { addInside } from '../../lib/shiftActions';
import type { Task } from '../../lib/types';
import { useStyles, useTheme } from './theme';
import { useReducedMotion, useSettled } from './touch';
import { TimeField } from './TimeField';
import { inter } from './type';
import { Button } from './ui';

export interface InsideTarget {
  task: Task;
  projected: boolean;
}

const make = (c: ColorTokens) => ({
  scrim: { flex: 1, backgroundColor: c.scrim, justifyContent: 'flex-end' as const },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderWidth: 1, borderColor: c.border, padding: 16, gap: 10, maxHeight: '90%' as const },
  head: { ...inter(700), fontSize: 18, color: c.textPrimary },
  label: { ...inter(700), fontSize: 14, color: c.textSecondary, marginTop: 4 },
  input: { ...inter(500), fontSize: 17, color: c.textPrimary, minHeight: 48, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.pane },
  choice: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, minHeight: 44 },
  choiceOff: { opacity: 0.5 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: c.textPrimary, alignItems: 'center' as const, justifyContent: 'center' as const },
  radioOn: { borderColor: c.accent },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.accent },
  choiceText: { ...inter(500), fontSize: 16, color: c.textPrimary, flex: 1 },
  chips: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  chip: { minHeight: 44, minWidth: 56, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1, borderColor: c.borderStrong, alignItems: 'center' as const, justifyContent: 'center' as const },
  chipOn: { backgroundColor: c.accent, borderColor: c.accent },
  chipText: { ...inter(600), fontSize: 14, color: c.textPrimary },
  chipTextOn: { color: c.onAccent },
  note: { ...inter(500), fontSize: 14, lineHeight: 19, color: c.textSecondary },
  fit: { minHeight: 44, justifyContent: 'center' as const, alignSelf: 'flex-start' as const, paddingHorizontal: 4 },
  fitText: { ...inter(700), fontSize: 14, color: c.accentText, textDecorationLine: 'underline' as const },
  scopes: { gap: 2 },
  row: { flexDirection: 'row' as const, gap: 10, justifyContent: 'flex-end' as const, marginTop: 4 },
});

function Choice({ on, text, onPress, id, disabled }: { on: boolean; text: string; onPress: () => void; id: string; disabled?: boolean }) {
  const s = useStyles(make);
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[s.choice, disabled && s.choiceOff]} accessibilityRole="radio" accessibilityState={{ checked: on, disabled: !!disabled }} accessibilityLabel={text} {...({ dataSet: { addInsideWhen: id } } as object)}>
      <View style={[s.radio, on && s.radioOn]}>{on ? <View style={s.radioDot} /> : null}</View>
      <Text style={s.choiceText}>{text}</Text>
    </Pressable>
  );
}

export function AddInside({ target, onClose, onAdded }: { target: InsideTarget | null; onClose: () => void; onAdded: () => void }) {
  const s = useStyles(make);
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const settled = useSettled(!!target);
  const input = useRef<TextInput>(null);
  const [f, setF] = useState<InsideForm>({ title: '', timed: false, start: '09:00', length: DEFAULT_INSIDE_MIN, scope: 'day' });
  useEffect(() => {
    if (target) setF({ title: '', timed: false, start: defaultStart(target.task), length: DEFAULT_INSIDE_MIN, scope: target.task.recurrence ? 'all' : 'day' });
  }, [target]);
  if (!target) return null;
  const { task, projected } = target;
  const hasTime = !!task.startTime;
  const check = formCheck(task, f);
  const set = (p: Partial<InsideForm>) => setF((cur) => ({ ...cur, ...p }));
  const submit = async () => {
    if (!check.ok) return;
    await addInside(task, projected, f);
    onAdded();
    onClose();
  };
  const lengths = (INSIDE_LENGTHS as readonly number[]).includes(f.length) ? [...INSIDE_LENGTHS] : [...INSIDE_LENGTHS, f.length].sort((a, b) => a - b);
  const scopes: Array<[InsideScope, string]> = [
    ['day', 'This day only'],
    ['following', THIS_AND_FOLLOWING],
    ['all', allDaysOfShift(task.title)],
  ];
  return (
    <Modal visible transparent animationType={reduced ? 'none' : 'slide'} onRequestClose={onClose} onShow={() => input.current?.focus()}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={s.scrim} onPress={() => settled() && onClose()} accessibilityLabel="Cancel adding inside">
          <Pressable style={[s.sheet, { paddingBottom: insets.bottom + 16 }]} onPress={() => {}} {...({ dataSet: { addInsideForm: task.id } } as object)}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 10 }}>
              <Text style={s.head} accessibilityRole="header">{`${ADD_INSIDE} ${task.title}`}</Text>
              <Text style={s.label}>What is it?</Text>
              <TextInput
                ref={input}
                style={s.input}
                value={f.title}
                onChangeText={(title) => set({ title })}
                placeholder="For example: Lunch"
                placeholderTextColor={c.textTertiary}
                returnKeyType="done"
                onSubmitEditing={() => void submit()}
                accessibilityLabel="What is it?"
                {...({ dataSet: { addInsideName: '1' } } as object)}
              />
              <Text style={s.label}>When?</Text>
              <Choice on={!f.timed} text="No time, just a to do" onPress={() => set({ timed: false })} id="todo" />
              <Choice on={f.timed} text="At a time" onPress={() => hasTime && set({ timed: true })} id="timed" disabled={!hasTime} />
              {!hasTime ? <Text style={s.note}>{task.title} has no time yet, so only a to do can go inside it.</Text> : null}
              {f.timed ? (
                <View style={{ gap: 8 }} {...({ dataSet: { addInsideTimed: '1' } } as object)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <TimeField value={f.start} onChange={(start) => set({ start })} a11y="Time" />
                    <Text style={s.label}>for</Text>
                  </View>
                  <View style={s.chips}>
                    {lengths.map((m) => {
                      const on = f.length === m;
                      return (
                        <Pressable key={m} onPress={() => set({ length: m })} style={[s.chip, on && s.chipOn]} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`For ${formatMinutes(m)}`} {...({ dataSet: { addInsideLength: String(m) } } as object)}>
                          <Text style={[s.chipText, on && s.chipTextOn]}>{formatMinutes(m)}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}
              {f.timed && check.note ? (
                <View {...({ dataSet: { addInsideNote: '1' } } as object)}>
                  <Text style={s.note}>{check.note}</Text>
                  {check.fit ? (
                    <Pressable onPress={() => set({ start: check.fit!.start, length: check.fit!.length })} style={s.fit} accessibilityRole="button" accessibilityLabel="Fit inside" {...({ dataSet: { addInsideFit: '1' } } as object)}>
                      <Text style={s.fitText}>Fit inside</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
              {task.recurrence ? (
                <>
                  <Text style={s.label}>Repeat?</Text>
                  <View style={s.scopes}>
                    {scopes.map(([k, text]) => (
                      <Choice key={k} on={f.scope === k} text={text} onPress={() => set({ scope: k })} id={`scope-${k}`} />
                    ))}
                  </View>
                </>
              ) : null}
              <View style={s.row}>
                <Button label="Cancel" onPress={onClose} a11y="Cancel adding inside" />
                <Button label="Add" kind="primary" onPress={() => void submit()} disabled={!check.ok} a11y="Add inside" />
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
