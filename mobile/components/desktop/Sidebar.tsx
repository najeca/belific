import React from 'react';
import { View, Text, Pressable, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { pressStyle } from './pressStyle';
import { DISPLAY_FONT_FAMILY } from './desktopFont';

// The left pane (2.26.0): the Belific mark and name with the hide button in one
// header, then the selected list (the list switcher, the add task box and its
// tasks, passed in as children). The mark is only a picture, never a button.
// Hidden, the pane is brought back by the show button at the left of the
// centre pane's top row; on a narrow window it opens over the centre
// (lib/paneState.ts).
export const MARK = require('../../assets/belific-mark.png');

export default function Sidebar({ onHide, overlay, children }: { onHide: () => void; overlay: boolean; children: React.ReactNode }) {
  return (
    <View style={[styles.sidebar, overlay && styles.overlay]} accessibilityLabel="Sidebar" {...({ dataSet: { sidebar: overlay ? 'overlay' : 'docked' } } as object)}>
      <View style={styles.head}>
        <Image source={MARK} style={styles.mark} accessibilityLabel="Belific" />
        <Text style={styles.name}>Belific</Text>
        <View style={{ flex: 1 }} />
        <Pressable onPress={onHide} style={pressStyle(({ hovered }) => [styles.hide, hovered && styles.hover])} accessibilityRole="button" accessibilityLabel="Hide sidebar">
          <Ionicons name="chevron-back" size={18} color={Colors.textSecondary} />
        </Pressable>
      </View>
      <View style={styles.list}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: { flex: 1, backgroundColor: Colors.pane, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, paddingTop: 14, paddingBottom: 8, minWidth: 0 } as object,
  overlay: { boxShadow: Colors.shadowLg } as object,
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, marginBottom: 10 },
  mark: { width: 28, height: 28, borderRadius: 8 },
  name: { fontSize: 16, fontFamily: DISPLAY_FONT_FAMILY, fontWeight: '700', color: Colors.textPrimary, letterSpacing: -0.2 },
  hide: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  hover: { backgroundColor: Colors.background },
  list: { flex: 1, minHeight: 0 },
});
