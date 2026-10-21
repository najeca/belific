import React, { useEffect } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { isTextEntryTarget, ownsKeys } from '../../lib/editable';
import LabelsPage from './LabelsPage';
import { isPopoverOpen } from './Popover';
import { closeOverlay } from './uiStore';
import { IconHeading } from './ui';

// Labels as an overlay (build plan phase 7), not a page: it opens over whatever
// screen is showing (Settings, or the home panes), so what was there stays
// behind it. Escape (when a field or popover is not using it), the close button
// or a press outside closes it, and focus goes back to the control that opened it.
export default function LabelsOverlay({ onChanged }: { onChanged: () => void }) {
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (isPopoverOpen() || isTextEntryTarget(e.target) || ownsKeys(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      closeOverlay();
    };
    window.addEventListener('keydown', onKey, true);
    const t = setTimeout(() => (document.querySelector('[data-labels-close]') as HTMLElement | null)?.focus(), 30);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey, true);
      if (before && before.isConnected) before.focus({ preventScroll: true });
    };
  }, []);
  return (
    <Pressable style={styles.scrim} onPress={closeOverlay} accessibilityLabel="Close labels">
      <Pressable onPress={() => {}} style={styles.card} accessibilityLabel="Labels" {...({ role: 'dialog', 'aria-modal': true } as object)}>
        <View style={styles.header}>
          <IconHeading icon="pricetag-outline" style={styles.title}>Labels</IconHeading>
          <Pressable onPress={closeOverlay} style={styles.close} accessibilityRole="button" accessibilityLabel="Close" {...({ dataSet: { labelsClose: '1' } } as object)}>
            <Ionicons name="close" size={18} color={Colors.textSecondary} />
          </Pressable>
        </View>
        <ScrollView style={{ flexGrow: 0 }} showsVerticalScrollIndicator={false}>
          <LabelsPage onChanged={onChanged} />
        </ScrollView>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 60, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.scrim },
  card: { width: 560, maxWidth: '94%', maxHeight: '88%', borderRadius: 16, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, padding: 18, gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  close: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
});
