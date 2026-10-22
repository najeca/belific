import React from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, type ColorTokens } from '../../lib/tokens';
import { useStyles, useTheme } from './theme';
import { inter, type } from './type';

// The phone's small shared pieces (PLAN_phone P1), the desktop's look (components/desktop/ui.tsx)
// for a finger: flat surfaces with a 1px outline, the one radius scale, pills, label dots, round
// ticks and thin line icons. Every control is at least 44 x 44 pt.
export type IconName = React.ComponentProps<typeof Ionicons>['name'];
export const MIN_TOUCH = 44;

const make = (c: ColorTokens) => ({
  card: { backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border },
  divider: { height: 1, backgroundColor: c.border },
  pill: { minHeight: 22, paddingHorizontal: 8, borderRadius: radius.sm, backgroundColor: c.surfaceRaised, alignItems: 'center' as const, justifyContent: 'center' as const, flexDirection: 'row' as const, gap: 4 },
  pillAccent: { backgroundColor: c.accentSoft },
  pillText: { ...inter(600), fontSize: 12, lineHeight: 16, color: c.textSecondary },
  pillAccentText: { color: c.accentText },
  btn: { minHeight: MIN_TOUCH, paddingHorizontal: 16, borderRadius: radius.md, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.surface, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 6 },
  btnPrimary: { backgroundColor: c.accent, borderColor: c.accent },
  btnText: { ...inter(600), fontSize: 15, color: c.textPrimary },
  btnPrimaryText: { color: c.onAccent },
  btnDangerText: { color: c.danger },
  iconBtn: { width: MIN_TOUCH, height: MIN_TOUCH, borderRadius: radius.full, alignItems: 'center' as const, justifyContent: 'center' as const },
  section: { ...type.section, color: c.textSecondary },
});

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const s = useStyles(make);
  return <View style={[s.card, style]}>{children}</View>;
}

export function Divider() {
  const s = useStyles(make);
  return <View style={s.divider} />;
}

export function Pill({ children, tone = 'quiet', label }: { children: React.ReactNode; tone?: 'quiet' | 'accent'; label?: string }) {
  const s = useStyles(make);
  return (
    <View style={[s.pill, tone === 'accent' && s.pillAccent]} accessibilityLabel={label}>
      <Text style={[s.pillText, tone === 'accent' && s.pillAccentText]} numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
}

// A label's colour as a small dot (the label's name goes beside it, so colour is never the only signal).
export function LabelDot({ color, size = 8 }: { color: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
}

// The round tick of a task. Drawn only; the row decides what a press does. Done is a filled accent
// circle with the onAccent tick: the desktop's green on pale green is too faint on dark (under 3:1).
export function RoundCheck({ done, size = 22 }: { done: boolean; size?: number }) {
  const { c } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1.5,
        borderColor: done ? c.accent : c.borderStrong,
        backgroundColor: done ? c.accent : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {done ? <Ionicons name="checkmark" size={size * 0.62} color={c.onAccent} /> : null}
    </View>
  );
}

export function LineIcon({ name, size = 20, color }: { name: IconName; size?: number; color?: string }) {
  const { c } = useTheme();
  return <Ionicons name={name} size={size} color={color ?? c.textSecondary} />;
}

export function Button({
  label,
  onPress,
  kind = 'outlined',
  icon,
  a11y,
  disabled,
}: {
  label: string;
  onPress: () => void;
  kind?: 'outlined' | 'primary' | 'danger';
  icon?: IconName;
  a11y?: string;
  disabled?: boolean;
}) {
  const s = useStyles(make);
  const { c } = useTheme();
  const textStyle = [s.btnText, kind === 'primary' && s.btnPrimaryText, kind === 'danger' && s.btnDangerText];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [s.btn, kind === 'primary' && s.btnPrimary, (pressed || disabled) && { opacity: disabled ? 0.45 : 0.8 }]}
      accessibilityRole="button"
      accessibilityLabel={a11y ?? label}
      accessibilityState={{ disabled: !!disabled }}
    >
      {icon ? <Ionicons name={icon} size={18} color={kind === 'primary' ? c.onAccent : kind === 'danger' ? c.danger : c.textPrimary} /> : null}
      <Text style={textStyle}>{label}</Text>
    </Pressable>
  );
}

export function IconButton({ name, onPress, a11y, color, size = 22 }: { name: IconName; onPress: () => void; a11y: string; color?: string; size?: number }) {
  const s = useStyles(make);
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.iconBtn, pressed && { backgroundColor: c.hover }]}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      hitSlop={4}
    >
      <Ionicons name={name} size={size} color={color ?? c.textPrimary} />
    </Pressable>
  );
}

export function SectionHeader({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  const s = useStyles(make);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 18, paddingBottom: 8 }}>
      <Text style={s.section} accessibilityRole="header">
        {children}
      </Text>
      {right}
    </View>
  );
}
