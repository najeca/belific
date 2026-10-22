import React, { useEffect, useState } from 'react';
import { TextInput } from 'react-native';
import { radius } from '../../lib/tokens';
import { useTheme } from './theme';
import { mono } from './type';

// A time of day on the web export (the phone layout below 640 px, used by the real checks): a typed
// 24 hour "HH:MM". The iPhone uses TimeField.native.tsx (the system picker).
export function TimeField({ value, onChange, a11y }: { value?: string; onChange: (time: string) => void; a11y: string }) {
  const { c } = useTheme();
  const [text, setText] = useState(value ?? '');
  useEffect(() => setText(value ?? ''), [value]);
  const commit = () => {
    const m = /^(\d{1,2}):?(\d{2})$/.exec(text.trim());
    if (!m) return setText(value ?? '');
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return setText(value ?? '');
    onChange(`${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
  };
  return (
    <TextInput
      value={text}
      onChangeText={setText}
      onSubmitEditing={commit}
      onBlur={commit}
      placeholder="09:00"
      placeholderTextColor={c.textTertiary}
      accessibilityLabel={a11y}
      style={{ ...mono(500), fontSize: 17, color: c.textPrimary, minHeight: 44, width: 110, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.pane }}
    />
  );
}
