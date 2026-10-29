import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { pressStyle } from './pressStyle';
import { tipRef } from './tip';
import { outlinedBtn, outlinedBtnOn, outlinedBtnText } from './ui';

// "Only today" (3.17.0): next to Day / Week / Month in the Calendar and next to Filter on the board. It narrows
// the view to today's column; on again shows everything. Its tooltip says what it does.
export const ONLY_TODAY_TIP = "Show only today's column. Press again to see every day (Shift+F).";

export default function OnlyTodayButton({ on, onPress }: { on: boolean; onPress: () => void }) {
  return (
    <Pressable
      ref={tipRef(ONLY_TODAY_TIP) as never}
      onPress={onPress}
      style={pressStyle(({ hovered }) => [styles.btn, on ? styles.btnOn : hovered && styles.hover])}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel="Show only today"
      {...({ 'aria-pressed': on, dataSet: { onlyToday: on ? '1' : '0' } } as object)}
    >
      <Ionicons name="today-outline" size={15} color={on ? Colors.accentText : Colors.textSecondary} />
      <Text style={[styles.text, on && styles.textOn]}>Only today</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { ...outlinedBtn, height: 32, transitionDuration: '120ms', transitionProperty: 'background-color' } as object,
  btnOn: { ...outlinedBtnOn },
  hover: { backgroundColor: Colors.hover },
  text: { ...outlinedBtnText, fontSize: 12 },
  textOn: { color: Colors.accentText },
});
