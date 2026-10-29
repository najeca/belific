import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { radius, type ColorTokens } from '../../lib/tokens';
import { DEFAULT_REMINDERS, MAX_TASK_REMINDERS, REMINDER_LEADS, effectiveReminders, leadLabel, reminderHint, reminderPatch, reminderState, toggleLead } from '../../lib/reminder';
import { EACH_TIME_NOTE, isMultiTime } from '../../lib/times';
import type { Task } from '../../lib/types';
import { useStyles } from './theme';
import { inter, type } from './type';

// Reminders in the phone's task details (PLAN_phone P7): the desktop's Reminder menu (TaskPopovers)
// for a finger. Default (the phone's own default: at the start), None, or up to five leads; stored with
// the shared reminderPatch, so both devices read the same list. Each device then reminds only if its
// own "Remind me on this device" switch is on (decision 3).
const make = (c: ColorTokens) => ({
  chips: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 12, borderRadius: radius.full, borderWidth: 1, borderColor: c.borderStrong, alignItems: 'center' as const, justifyContent: 'center' as const },
  chipOn: { backgroundColor: c.accent, borderColor: c.accent },
  chipText: { ...inter(600), fontSize: 14, color: c.textPrimary },
  chipTextOn: { color: c.onAccent },
  note: { ...type.meta, color: c.textSecondary },
});

export function RemindersEditor({ task, onWrite }: { task: Task; onWrite: (fields: Partial<Task>) => void }) {
  const s = useStyles(make);
  const explicit = Array.isArray(task.reminders) || reminderState(task.reminderMinutes) !== 'default';
  const list = effectiveReminders(task, DEFAULT_REMINDERS);
  const chip = (label: string, on: boolean, onPress: () => void, a11y = label) => (
    <Pressable key={a11y} style={[s.chip, on && s.chipOn]} onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y} accessibilityState={{ selected: on }}>
      <Text style={[s.chipText, on && s.chipTextOn]}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ gap: 10 }} {...({ dataSet: { remindersEditor: '1' } } as object)}>
      <View style={s.chips}>
        {chip('Default', !explicit, () => onWrite(reminderPatch('default')), 'Reminders default')}
        {chip('None', explicit && list.length === 0, () => onWrite(reminderPatch([])), 'No reminders')}
      </View>
      <View style={s.chips}>
        {REMINDER_LEADS.map((lead) =>
          chip(leadLabel(lead), explicit && list.includes(lead), () => onWrite(reminderPatch(toggleLead(explicit ? list : effectiveReminders(task, DEFAULT_REMINDERS), lead))), `Remind ${leadLabel(lead)}`),
        )}
      </View>
      <Text style={s.note}>{`Up to ${MAX_TASK_REMINDERS}. ${isMultiTime(task) ? EACH_TIME_NOTE : ''}`}</Text>
      {reminderHint(task) ? (
        <Text style={s.note} {...({ dataSet: { reminderHint: '1' } } as object)}>
          {reminderHint(task)}
        </Text>
      ) : null}
    </View>
  );
}
