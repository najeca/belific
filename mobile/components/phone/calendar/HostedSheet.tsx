import React from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { radius, type ColorTokens } from '../../../lib/tokens';
import { formatTime } from '../../../lib/data';
import { formatDuration } from '../../../lib/duration';
import type { HostedTask } from '../../../lib/phoneDay';
import { useStyles, useTheme } from '../theme';
import { useReducedMotion, useSettled } from '../touch';
import { inter, type } from '../type';
import { LabelDot, RoundCheck } from '../ui';

// The tasks during a break (3.7.0; 3.9.0 adds Tick and Move out per row): a sheet from the bottom like
// the hold menu. Each row: its tick (44 pt), its title (a tap opens the task), and "Move out" (puts it
// right after the break, with Undo). The last row opens the break itself.
const make = (c: ColorTokens) => ({
  scrim: { flex: 1, backgroundColor: c.scrim, justifyContent: 'flex-end' as const },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderWidth: 1, borderColor: c.border, paddingHorizontal: 8, paddingTop: 8 },
  title: { ...type.meta, color: c.textSecondary, paddingHorizontal: 12, paddingVertical: 10 },
  row: { minHeight: 56, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, borderRadius: radius.md },
  tick: { width: 44, height: 44, alignItems: 'center' as const, justifyContent: 'center' as const },
  open: { flex: 1, minHeight: 44, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, paddingRight: 4 },
  name: { ...inter(500), fontSize: 16, color: c.textPrimary, flexShrink: 1 },
  done: { color: c.textSecondary, textDecorationLine: 'line-through' as const },
  when: { ...type.meta, color: c.textSecondary },
  out: { minHeight: 44, minWidth: 64, paddingHorizontal: 10, borderRadius: radius.md, borderWidth: 1, borderColor: c.borderStrong, alignItems: 'center' as const, justifyContent: 'center' as const },
  outText: { ...inter(600), fontSize: 14, color: c.textPrimary },
  plain: { minHeight: 52, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14, paddingHorizontal: 12, borderRadius: radius.md },
  plainText: { ...inter(500), fontSize: 17, color: c.textPrimary },
  cancel: { ...inter(600), fontSize: 17, color: c.textPrimary, textAlign: 'center' as const, flex: 1 },
});

export function HostedSheet({
  breakTitle,
  hosted,
  dotOf,
  onOpen,
  onTick,
  onMoveOut,
  onOpenBreak,
  onClose,
}: {
  breakTitle: string | null;
  hosted: HostedTask[];
  dotOf: (h: HostedTask) => string;
  onOpen: (h: HostedTask) => void;
  onTick: (h: HostedTask) => void;
  onMoveOut: (h: HostedTask) => void;
  onOpenBreak: () => void;
  onClose: () => void;
}) {
  const s = useStyles(make);
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const visible = breakTitle !== null;
  const settled = useSettled(visible);
  const act = (fn: () => void) => () => {
    if (!settled()) return;
    onClose();
    fn();
  };
  return (
    <Modal visible={visible} transparent animationType={reduced ? 'none' : 'fade'} onRequestClose={onClose}>
      <Pressable style={s.scrim} onPress={() => settled() && onClose()} accessibilityLabel="Close menu">
        <Pressable style={[s.sheet, { paddingBottom: insets.bottom + 8 }]} onPress={() => {}} accessibilityViewIsModal {...({ dataSet: { hostedSheet: breakTitle ?? '1' } } as object)}>
          <Text style={s.title} numberOfLines={2}>
            During {breakTitle}
          </Text>
          {hosted.map((h) => {
            const t = h.task;
            const when = [formatTime(t.startTime ?? ''), formatDuration(t.durationMinutes) ?? ''].filter(Boolean).join(', ');
            return (
              <View key={h.id} style={s.row} {...({ dataSet: { hostedRow: h.id } } as object)}>
                <Pressable
                  onPress={act(() => onTick(h))}
                  style={s.tick}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: !!t.completed }}
                  accessibilityLabel={t.completed ? `Untick ${t.title}` : `Tick ${t.title}`}
                  {...({ dataSet: { hostedTick: h.id } } as object)}
                >
                  <RoundCheck done={!!t.completed} />
                </Pressable>
                <Pressable onPress={act(() => onOpen(h))} style={s.open} accessibilityRole="button" accessibilityLabel={`Open ${t.title}`} {...({ dataSet: { hostedOpen: h.id } } as object)}>
                  <LabelDot color={dotOf(h)} size={8} />
                  <View style={{ flexShrink: 1 }}>
                    <Text style={[s.name, t.completed && s.done]} numberOfLines={1}>
                      {t.title}
                    </Text>
                    <Text style={s.when}>{when}</Text>
                  </View>
                </Pressable>
                <Pressable onPress={act(() => onMoveOut(h))} style={s.out} accessibilityRole="button" accessibilityLabel={`Move ${t.title} out`} {...({ dataSet: { hostedOut: h.id } } as object)}>
                  <Text style={s.outText}>Move out</Text>
                </Pressable>
              </View>
            );
          })}
          <Pressable style={({ pressed }) => [s.plain, pressed && { backgroundColor: c.hover }]} onPress={act(onOpenBreak)} accessibilityRole="button" accessibilityLabel={`Open ${breakTitle}`}>
            <Ionicons name="cafe-outline" size={22} color={c.textSecondary} />
            <Text style={s.plainText}>Open {breakTitle}</Text>
          </Pressable>
          <View style={{ height: 1, backgroundColor: c.border, marginVertical: 6 }} />
          <Pressable style={({ pressed }) => [s.plain, pressed && { backgroundColor: c.hover }]} onPress={() => settled() && onClose()} accessibilityRole="button" accessibilityLabel="Cancel">
            <Text style={s.cancel}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
