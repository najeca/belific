// Settings, Daily hours (PLAN_phone_stepflow section 2, decision B1.4, 3.60.0): a "Count in daily hours" switch per
// label, for the hours strip on Today. Stored as synced user_settings rows `hours.count.<labelKey>` (no database change).
// With no row, Sleep and Break are off and every other label is on (lib/labelHours.ts). It moves to the label's own
// sheet when the Tasks tab redesign adds one.
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useTheme } from '../../components/phone/theme';
import Toggle from '../../components/Toggle';
import { loadProjects, loadUserSettingsRaw, setUserSetting } from '../../lib/storage';
import { countsInHours, hoursCountKey, HOURS_COUNT_PREFIX } from '../../lib/labelHours';
import type { Project } from '../../lib/types';

export default function DailyHoursSection({ styles }: { styles: { sectionHeader: object; card: object; row: object; rowLabel: object } }) {
  const { c: Colors } = useTheme();
  const [labels, setLabels] = useState<Project[]>([]);
  const [stored, setStored] = useState<Map<string, string>>(new Map());

  const load = useCallback(async () => {
    const [ps, rows] = await Promise.all([loadProjects(), loadUserSettingsRaw()]);
    setLabels(ps.filter((p) => !p.deletedAt));
    setStored(new Map(rows.filter((r) => !r.deletedAt && r.key.startsWith(HOURS_COUNT_PREFIX)).map((r) => [r.key.slice(HOURS_COUNT_PREFIX.length), r.value])));
  }, []);
  useFocusEffect(
    useCallback(() => {
      load().catch(() => {});
    }, [load]),
  );

  if (labels.length === 0) return null;
  const set = (key: string, on: boolean) => {
    setStored((m) => new Map(m).set(key, on ? 'on' : 'off'));
    void setUserSetting(hoursCountKey(key), on ? 'on' : 'off');
  };
  return (
    <>
      <Text style={styles.sectionHeader}>Daily hours</Text>
      <View style={styles.card} {...({ dataSet: { dailyHours: '1' } } as object)}>
        <Text style={[styles.rowLabel, { fontSize: 13, color: Colors.textSecondary, paddingHorizontal: 16, paddingTop: 12 }]}>Count in daily hours: the labels in the Hours today bar. Sleep and Break start off.</Text>
        {labels.map((l) => {
          const name = `${l.emoji ? `${l.emoji} ` : ''}${l.name}`;
          return (
            <View key={l.key} style={styles.row} {...({ dataSet: { hoursLabel: l.name } } as object)}>
              <Text style={styles.rowLabel} numberOfLines={1}>{name}</Text>
              <Toggle value={countsInHours(l, stored.get(l.key))} onValueChange={(v) => set(l.key, v)} label={`Count ${l.name} in daily hours`} colors={Colors} />
            </View>
          );
        })}
      </View>
    </>
  );
}
