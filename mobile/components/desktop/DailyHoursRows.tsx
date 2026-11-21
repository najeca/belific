// D3 of PLAN_desktop_parity (3.67.0): Settings, Daily hours on the desktop: a "Count in daily hours" switch per label,
// the same synced rows the phone's Settings and label sheet write (hoursStore.ts). With no row, Sleep and Break start off.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../lib/theme';
import { loadProjects } from '../../lib/storage';
import { countsInHours } from '../../lib/labelHours';
import type { Project } from '../../lib/types';
import PaletteSwitch from './PaletteSwitch';
import { loadHoursStored, setHoursCount, useHoursStored } from './hoursStore';

export default function DailyHoursRows() {
  const stored = useHoursStored();
  const [labels, setLabels] = useState<Project[]>([]);
  useEffect(() => {
    loadProjects()
      .then((ps) => setLabels(ps.filter((p) => !p.deletedAt)))
      .catch(() => {});
    loadHoursStored().catch(() => {});
  }, []);
  return (
    <View style={{ gap: 6 }} {...({ dataSet: { dailyHours: String(labels.length) } } as object)}>
      <Text style={styles.hint}>Count in daily hours: the labels in the Hours today bar on the Today view and on the iPhone. Sleep and Break start off. This follows your account.</Text>
      {labels.length === 0 ? <Text style={styles.hint}>No labels yet.</Text> : null}
      {labels.map((l) => (
        <View key={l.key} style={styles.row} {...({ dataSet: { hoursLabel: l.name } } as object)}>
          <Text style={styles.name} numberOfLines={1}>{`${l.emoji ? `${l.emoji} ` : ''}${l.name}`}</Text>
          <PaletteSwitch value={countsInHours(l, stored.get(l.key))} onValueChange={(v) => void setHoursCount(l.key, v)} label={`Count ${l.name} in daily hours`} />
        </View>
      ))}
    </View>
  );
}

// The same switch for one label, in the label form (edit only).
export function HoursSwitch({ label }: { label: Pick<Project, 'key' | 'name'> }) {
  const stored = useHoursStored();
  useEffect(() => {
    loadHoursStored().catch(() => {});
  }, []);
  return (
    <View style={styles.row} {...({ dataSet: { labelHoursSwitch: label.name } } as object)}>
      <Text style={styles.name}>Count in daily hours</Text>
      <PaletteSwitch value={countsInHours(label, stored.get(label.key))} onValueChange={(v) => void setHoursCount(label.key, v)} label={`Count ${label.name} in daily hours`} />
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 13, color: Colors.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36 },
  name: { flex: 1, fontSize: 14, color: Colors.textPrimary },
});
