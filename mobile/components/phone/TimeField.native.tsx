import React from 'react';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useTheme } from './theme';

// A time of day on the iPhone (PLAN_phone P6): the system's compact time picker (a small button that
// opens the wheel), in the phone's theme. The web export uses TimeField.tsx (a typed field).
export function TimeField({ value, onChange, a11y }: { value?: string; onChange: (time: string) => void; a11y: string }) {
  const { name } = useTheme();
  const d = new Date();
  const [h, m] = (value ?? '09:00').split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return (
    <DateTimePicker
      value={d}
      mode="time"
      display="compact"
      minuteInterval={5}
      themeVariant={name}
      accessibilityLabel={a11y}
      onChange={(_e: DateTimePickerEvent, picked?: Date) => {
        if (!picked) return;
        onChange(`${String(picked.getHours()).padStart(2, '0')}:${String(picked.getMinutes()).padStart(2, '0')}`);
      }}
    />
  );
}
