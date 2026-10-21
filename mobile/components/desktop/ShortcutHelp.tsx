import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { displayKeys, shortcutGroups } from '../../lib/shortcuts';
import { closeOverlay } from './uiStore';
import { IconHeading, type IconName } from './ui';

const GROUP_ICON: Record<string, IconName> = { General: 'keypad-outline', Navigation: 'compass-outline', Task: 'checkmark-circle-outline' };

// The keyboard shortcut help (Shift+/). Generated from the registry in
// lib/shortcuts.ts, so it lists exactly the keys that are wired and nothing
// else. An overlay on the home screen, not a screen: Escape, its button or a
// press outside closes it, and focus goes back to where it was.
export default function ShortcutHelp() {
  const box = useRef<View>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeOverlay();
      }
    };
    window.addEventListener('keydown', onKey, true);
    const t = setTimeout(() => (document.querySelector('[data-shortcut-help-close]') as HTMLElement | null)?.focus(), 30);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey, true);
      if (before && before.isConnected) before.focus({ preventScroll: true });
    };
  }, []);
  return (
    <Pressable style={styles.scrim} onPress={closeOverlay} accessibilityLabel="Close keyboard shortcuts">
      <Pressable ref={box} onPress={() => {}} style={styles.card} accessibilityLabel="Keyboard shortcuts" {...({ role: 'dialog', 'aria-modal': true } as object)}>
        <View style={styles.header}>
          <Text style={styles.title}>⌨️ Keyboard shortcuts</Text>
          <Pressable onPress={closeOverlay} style={styles.close} accessibilityRole="button" accessibilityLabel="Close" {...({ dataSet: { shortcutHelpClose: '1' } } as object)}>
            <Ionicons name="close" size={18} color={Colors.textSecondary} />
          </Pressable>
        </View>
        <ScrollView style={{ flexGrow: 0 }} showsVerticalScrollIndicator={false}>
          {shortcutGroups().map(({ group, items }) => (
            <View key={group} style={styles.group}>
              <IconHeading icon={GROUP_ICON[group] ?? 'keypad-outline'} style={styles.groupTitle} size={15}>{group}</IconHeading>
              {items.map((d) => (
                <View key={d.id} style={styles.row}>
                  <Text style={styles.label}>{d.label}</Text>
                  <Text style={styles.keys}>{displayKeys(d.keys)}</Text>
                </View>
              ))}
            </View>
          ))}
          <Text style={styles.note}>Letters work when you are not typing in a box. Task keys act on the card that has the keyboard focus (Tab to a card).</Text>
        </ScrollView>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 60, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.scrim },
  card: { width: 480, maxWidth: '92%', maxHeight: '86%', borderRadius: 16, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, padding: 18, gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  close: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  group: { marginTop: 10, gap: 2 },
  groupTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: Colors.textSecondary, textTransform: 'uppercase', marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 28 },
  label: { flex: 1, fontSize: 13, color: Colors.textPrimary },
  keys: { fontSize: 12, fontWeight: '600', color: Colors.accentText, backgroundColor: Colors.background, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: Colors.border },
  note: { marginTop: 14, fontSize: 12, color: Colors.textSecondary },
});
