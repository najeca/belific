import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { radius } from '../../lib/tokens';

// The shared pieces of the Ellie Planner look (docs/DESIGN_SYSTEM.md): outlined small buttons, the
// segmented toggle, pills, the round checkbox and the one line icon style. Plain style objects
// (not StyleSheet.create) so a screen can spread one into its own style and still change a size.

// An outlined small button: a 1px outline, no fill, a quiet fill on hover (the top bar's Today,
// Filter, Only today, Quests, Back). The height is the caller's.
export const outlinedBtn = {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
  paddingHorizontal: 12,
  borderRadius: radius.md,
  borderWidth: 1,
  borderColor: Colors.borderStrong,
  backgroundColor: Colors.surface,
} as const;
export const outlinedBtnHover = { backgroundColor: Colors.hover } as const;
export const outlinedBtnOn = { borderColor: Colors.accent, backgroundColor: Colors.accentSoft } as const;
export const outlinedBtnText = { fontSize: 13, fontWeight: '600', color: Colors.textPrimary } as const;

// The segmented toggle (Calendar / Tasks, Day / Week / Month): a quiet track with a 1px border;
// the active segment is filled with the accent.
export const segTrack = { flexDirection: 'row', borderRadius: radius.lg, padding: 3, gap: 2, backgroundColor: Colors.surfaceRaised, borderWidth: 1, borderColor: Colors.border } as const;
export const segBtn = { paddingHorizontal: 12, height: 30, borderRadius: radius.md, justifyContent: 'center' } as const;
export const segBtnOn = { backgroundColor: Colors.accent } as const;
export const segBtnHover = { backgroundColor: Colors.hover } as const;
export const segLabel = { fontSize: 13, fontWeight: '600', color: Colors.textPrimary } as const;
export const segLabelOn = { color: Colors.onAccent, fontWeight: '700' } as const;

// A small soft pill: the duration (0:30), a count, the Today tag.
export const pillBox = { height: 20, paddingHorizontal: 7, borderRadius: radius.sm, backgroundColor: Colors.surfaceRaised, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4 } as const;
export const pillLabel = { fontSize: 11.5, lineHeight: 16, fontWeight: '600', color: Colors.textSecondary } as const;
export const pillAccentBox = { backgroundColor: Colors.accentSoft } as const;
export const pillAccentLabel = { color: Colors.accentText } as const;

export function Pill({ children, tone = 'quiet', mono = false, label }: { children: React.ReactNode; tone?: 'quiet' | 'accent'; mono?: boolean; label?: string }) {
  return (
    <View style={[pillBox, tone === 'accent' && pillAccentBox]}>
      <Text style={[pillLabel, tone === 'accent' && pillAccentLabel]} accessibilityLabel={label} {...({ dataSet: mono ? { mono: '1' } : {} } as object)}>
        {children}
      </Text>
    </View>
  );
}

// The round checkbox: an empty ring; done is the success green on its dark green (the tick sits
// inside). `size` is the diameter.
export const checkRing = (size = 18) =>
  ({ width: size, height: size, borderRadius: radius.full, borderWidth: 1.5, borderColor: Colors.borderStrong, backgroundColor: Colors.checkFill, alignItems: 'center', justifyContent: 'center' }) as const;
export const checkRingDone = { borderColor: Colors.success, backgroundColor: Colors.successBg } as const;

export function RoundCheck({ done, size = 18 }: { done: boolean; size?: number }) {
  return (
    <View style={[checkRing(size), done && checkRingDone]}>
      {done && <Ionicons name="checkmark" size={Math.round(size * 0.72)} color={Colors.success} />}
    </View>
  );
}

// The one icon style: thin line icons (Ionicons "-outline"), small, grey, in front of a label.
export function LineIcon({ name, size = 15, color = Colors.textSecondary }: { name: React.ComponentProps<typeof Ionicons>['name']; size?: number; color?: string }) {
  return <Ionicons name={name} size={size} color={color} />;
}
