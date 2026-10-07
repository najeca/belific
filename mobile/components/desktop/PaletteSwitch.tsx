import React from 'react';
import { Switch } from 'react-native';
import { Colors } from '../../lib/theme';

// The one switch for the desktop (checkpoint 9.1): an off white thumb, the
// sage track when on and the neutral border track when off. react-native-web
// ignores `thumbColor` while a switch is on and paints its own teal unless
// `activeThumbColor` is given too, so both are set. Web only; the iPhone
// settings screen keeps its own native Switch.
export default function PaletteSwitch({
  value,
  onValueChange,
  label,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  label: string;
}) {
  const web = { activeThumbColor: Colors.surface } as object;
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: Colors.border, true: Colors.accent }}
      thumbColor={Colors.surface}
      {...web}
      accessibilityLabel={label}
    />
  );
}
