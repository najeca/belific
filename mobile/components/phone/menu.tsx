import React, { useEffect, useRef } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { radius, type ColorTokens } from '../../lib/tokens';
import { useStyles, useTheme } from './theme';
import { useReducedMotion } from './touch';
import { inter, type } from './type';
import type { IconName } from './ui';

// The quick menu a press and hold opens (PLAN_phone P2): a sheet from the bottom with large rows and
// Cancel. A tap on the dim area closes it too. The phone's stand-in for the desktop's popovers.

// How long after opening a press is taken as the opening finger lifting.
export const MENU_SETTLE_MS = 350;

export interface MenuItem {
  label: string;
  icon: IconName;
  danger?: boolean;
  run: () => void;
}

const make = (c: ColorTokens) => ({
  scrim: { flex: 1, backgroundColor: c.scrim, justifyContent: 'flex-end' as const },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderWidth: 1, borderColor: c.border, paddingHorizontal: 8, paddingTop: 8 },
  title: { ...type.meta, color: c.textSecondary, paddingHorizontal: 12, paddingVertical: 10 },
  row: { minHeight: 52, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14, paddingHorizontal: 12, borderRadius: radius.md },
  rowText: { ...inter(500), fontSize: 17, color: c.textPrimary },
  danger: { color: c.danger },
  cancel: { ...inter(600), fontSize: 17, color: c.textPrimary, textAlign: 'center' as const, flex: 1 },
});

export function ActionMenu({ visible, title, items, onClose }: { visible: boolean; title?: string; items: MenuItem[]; onClose: () => void }) {
  const s = useStyles(make);
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  // The finger that held the row to open this menu lifts over it: that lift is not a choice. Presses in
  // the first moments after opening are ignored.
  const openedAt = useRef(0);
  useEffect(() => {
    if (visible) openedAt.current = Date.now();
  }, [visible]);
  const settled = () => Date.now() - openedAt.current > MENU_SETTLE_MS;
  return (
    <Modal visible={visible} transparent animationType={reduced ? 'none' : 'fade'} onRequestClose={onClose}>
      <Pressable style={s.scrim} onPress={() => settled() && onClose()} accessibilityLabel="Close menu" {...({ dataSet: { menuScrim: '1' } } as object)}>
        <Pressable style={[s.sheet, { paddingBottom: insets.bottom + 8 }]} onPress={() => {}} accessibilityViewIsModal {...({ dataSet: { actionMenu: title ?? '1' } } as object)}>
          {title ? (
            <Text style={s.title} numberOfLines={2}>
              {title}
            </Text>
          ) : null}
          {items.map((it) => (
            <Pressable
              key={it.label}
              style={({ pressed }) => [s.row, pressed && { backgroundColor: c.hover }]}
              onPress={() => {
                if (!settled()) return;
                onClose();
                it.run();
              }}
              accessibilityRole="button"
              accessibilityLabel={it.label}
            >
              <Ionicons name={it.icon} size={22} color={it.danger ? c.danger : c.textSecondary} />
              <Text style={[s.rowText, it.danger && s.danger]}>{it.label}</Text>
            </Pressable>
          ))}
          <View style={{ height: 1, backgroundColor: c.border, marginVertical: 6 }} />
          <Pressable style={({ pressed }) => [s.row, pressed && { backgroundColor: c.hover }]} onPress={() => settled() && onClose()} accessibilityRole="button" accessibilityLabel="Cancel">
            <Text style={s.cancel}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
