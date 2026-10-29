import React from 'react';
import { Pressable, View, type PressableStateCallbackType } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../lib/theme';
import type { ColorTokens } from '../lib/tokens';

// The one switch of the app (3.15.0): Settings, the filter, the task details (Must do, Split) and the
// phone (Settings, Top priority). One size (44 x 26, a 22 point knob, the same track and knob in light and
// dark) and one focus ring. On: the dark sage track, the knob to the right with a tick. Off: a plain grey
// track, the knob to the left, nothing in it. The knob is light in both themes; the tracks come from the
// `switchOn` / `switchOff` tokens (contrast tested). Desktop reads `Colors` (CSS variables, so a change of
// theme repaints with no re-render); the phone passes its live theme's `c`. `onColor` overrides the on track
// (the phone's Top priority switch is danger red).
export const TOGGLE_W = 44;
export const TOGGLE_H = 26;
const KNOB = 20;

export default function Toggle({
  value,
  onValueChange,
  label,
  colors = Colors,
  onColor,
  dataSet,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  label: string;
  colors?: Readonly<ColorTokens>;
  onColor?: string;
  dataSet?: Record<string, string>;
}) {
  const on = onColor ?? colors.switchOn;
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      hitSlop={{ top: 9, bottom: 9, left: 4, right: 4 }}
      style={(state: PressableStateCallbackType) => [
        {
          width: TOGGLE_W,
          height: TOGGLE_H,
          borderRadius: TOGGLE_H / 2,
          padding: (TOGGLE_H - KNOB) / 2,
          justifyContent: 'center',
          backgroundColor: value ? on : colors.switchOff,
        },
        (state as { focused?: boolean }).focused ? ({ outlineWidth: 2, outlineStyle: 'solid', outlineColor: colors.accent, outlineOffset: 2 } as object) : null,
      ]}
      {...({ 'aria-checked': value, dataSet: { toggle: value ? '1' : '0', ...dataSet } } as object)}
    >
      <View
        pointerEvents="none"
        style={{
          width: KNOB,
          height: KNOB,
          borderRadius: KNOB / 2,
          alignSelf: value ? 'flex-end' : 'flex-start',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.switchKnob,
          borderWidth: 1,
          borderColor: colors.switchEdge,
        }}
      >
        {value ? <Ionicons name="checkmark" size={14} color={on} /> : null}
      </View>
    </Pressable>
  );
}
