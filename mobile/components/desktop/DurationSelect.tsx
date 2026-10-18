import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { TIME_CHOICES, parseDuration, shortDuration } from '../../lib/duration';
import Popover, { Row, closePopover, togglePopover, useIsOpen, usePopoverAnchor } from './Popover';
import { DESKTOP_FONT_FAMILY } from './desktopFont';

// The one time drop-down (2.27.1) for every task length: Estimated time and
// Actual time in the details, the Add a task box and the Planning flows. A small
// button with the value as short text ("45 min", "1 h 30") opens a short list of
// common lengths, then Custom (type minutes, or hours and minutes) and Clear.
// The value is whole minutes, stored exactly as before. Keyboard: Enter, Space
// or Down on the button opens it at the current value (marked for the shared
// Popover's first focus); Up and Down move through the list, Enter chooses,
// Escape closes.
export default function DurationSelect({
  id,
  value,
  onChange,
  label,
  placeholder = 'Click to set',
  compact,
}: {
  // Unique on the page (the popover's id).
  id: string;
  value: number | undefined;
  // undefined clears it. May refuse (returns false) so Custom can say so.
  onChange: (minutes: number | undefined) => void | boolean | Promise<void | boolean>;
  // What it sets, for the screen reader ("Estimated time").
  label: string;
  placeholder?: string;
  // A smaller button (the Add a task box).
  compact?: boolean;
}) {
  const { ref, get } = usePopoverAnchor();
  const popId = `duration:${id}`;
  const open = useIsOpen(popId);
  const text = shortDuration(value);
  return (
    <>
      <Pressable
        ref={ref as never}
        onPress={() => togglePopover(popId, get)}
        style={(state) => {
          const s = state as typeof state & { hovered?: boolean };
          return [styles.btn, compact && styles.btnCompact, (s.hovered || open) && styles.btnHover];
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${label}: ${text ?? 'not set'}`}
        {...({
          'aria-haspopup': 'listbox',
          dataSet: { durationSelect: label },
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === 'ArrowDown' && !open) {
              e.preventDefault();
              togglePopover(popId, get);
            }
          },
        } as object)}
      >
        <Text style={[styles.value, compact && styles.valueCompact, !text && styles.placeholder]} numberOfLines={1} {...({ dataSet: { durationValue: '1', ...(text ? { mono: '1' } : {}) } } as object)}>
          {text ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={compact ? 11 : 12} color={Colors.textSecondary} />
      </Pressable>
      <Popover id={popId} anchor={get} width={190} label={label}>
        <DurationList value={value} label={label} onChange={onChange} />
      </Popover>
    </>
  );
}

function DurationList({ value, label, onChange }: { value: number | undefined; label: string; onChange: (minutes: number | undefined) => void | boolean | Promise<void | boolean> }) {
  const [custom, setCustom] = useState(false);
  const [text, setText] = useState('');
  const [bad, setBad] = useState(false);
  const known = value !== undefined && TIME_CHOICES.includes(value);

  const choose = async (m: number | undefined) => {
    const ok = await onChange(m);
    if (ok === false) {
      setBad(true);
      return;
    }
    closePopover(true);
  };
  const submit = () => {
    const m = parseDuration(text);
    if (m === null) setBad(true);
    else choose(m);
  };

  return (
    <View style={styles.list} {...({ role: 'listbox', 'aria-label': label } as object)}>
      {TIME_CHOICES.map((m) => (
        <View key={m} {...({ dataSet: value === m ? { popoverFocus: '1' } : {} } as object)}>
          <Row label={shortDuration(m) as string} selected={value === m} onPress={() => choose(m)} a11y={`${label} ${shortDuration(m)}`} />
        </View>
      ))}
      {value !== undefined && !known && (
        <View {...({ dataSet: { popoverFocus: '1' } } as object)}>
          <Row label={shortDuration(value) as string} sub="Set before" selected onPress={() => closePopover(true)} a11y={`${label} ${shortDuration(value)}`} />
        </View>
      )}
      {custom ? (
        <View style={styles.custom}>
          <input
            type="text"
            value={text}
            autoFocus
            placeholder="90, 1:30 or 1 h 30"
            aria-label={`Custom ${label.toLowerCase()}`}
            aria-invalid={bad}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => {
              setText(e.target.value);
              setBad(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
            style={domInput}
          />
          {bad && <Text style={styles.bad}>Not a time. Type minutes (90) or hours and minutes (1:30).</Text>}
        </View>
      ) : (
        <Row label="Custom…" leading={<Ionicons name="create-outline" size={14} color={Colors.textSecondary} />} onPress={() => setCustom(true)} a11y={`Custom ${label.toLowerCase()}`} />
      )}
      {value !== undefined && <Row label="Clear" leading={<Ionicons name="close" size={14} color={Colors.textSecondary} />} onPress={() => choose(undefined)} a11y={`Clear ${label.toLowerCase()}`} />}
    </View>
  );
}

const domInput: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  height: 30,
  padding: '0 8px',
  borderRadius: 8,
  border: `1px solid ${Colors.border}`,
  background: Colors.background,
  color: Colors.textPrimary,
  fontSize: 13,
  fontFamily: DESKTOP_FONT_FAMILY,
  outlineColor: Colors.accent,
};

const styles = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 28, paddingHorizontal: 6, borderRadius: 8, alignSelf: 'flex-start' },
  btnCompact: { height: 26, paddingHorizontal: 5 },
  btnHover: { backgroundColor: Colors.background },
  value: { fontSize: 13, color: Colors.textPrimary },
  valueCompact: { fontSize: 12 },
  placeholder: { color: Colors.textSecondary },
  list: { paddingVertical: 4 },
  custom: { paddingHorizontal: 10, paddingVertical: 6, gap: 4 },
  bad: { fontSize: 11, color: Colors.danger, lineHeight: 15 },
});
