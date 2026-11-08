import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { pressStyle } from './pressStyle';
import { tipRef } from './tip';
import { outlinedBtn, outlinedBtnHover, outlinedBtnOn, outlinedBtnText, outlinedBtnTextOn } from './ui';

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
      <Ionicons name="today-outline" size={17} color={on ? Colors.onAccent : Colors.onHostPill} />
      <Text style={[styles.text, on && styles.textOn]}>Only today</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { ...outlinedBtn, height: 38, transitionDuration: '120ms', transitionProperty: 'background-color' } as object,
  btnOn: { ...outlinedBtnOn },
  hover: { ...outlinedBtnHover },
  text: { ...outlinedBtnText },
  textOn: { ...outlinedBtnTextOn },
});
