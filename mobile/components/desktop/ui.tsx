import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { band, divider as dividerToken, fontWeight, radius } from '../../lib/tokens';
import { addDays, dateKey, isDateKey, parseDateKey } from '../../lib/kanban';

// The shared pieces of the Ellie Planner look (docs/DESIGN_SYSTEM.md): outlined small buttons, the
// segmented toggle, pills, the round checkbox and the one line icon style. Plain style objects
// (not StyleSheet.create) so a screen can spread one into its own style and still change a size.

// 3.31.0 (the Mini Motorways restyle, docs/design/motorways/): buttons are flat and square (`radius.square`).
// The secondary button (the top bar's Today, Filter, Only today, Quests, Back) is the soft green `hostPill` with its
// text colour, 16/700; the primary (a chosen toggle, Save) is the accent with `onAccent`. The names keep their old
// "outlined" spelling so no caller changes; there is no outline any more. The height is the caller's.
export const outlinedBtn = {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
  paddingHorizontal: 16,
  borderRadius: radius.square,
  backgroundColor: Colors.hostPill,
} as const;
export const outlinedBtnHover = { backgroundColor: Colors.pickerTabOn } as const;
export const outlinedBtnOn = { backgroundColor: Colors.accent } as const;
export const outlinedBtnText = { fontSize: 16, fontWeight: fontWeight.bold, color: Colors.onHostPill } as const;
export const outlinedBtnTextOn = { color: Colors.onAccent } as const;
// The same button in a small place (a popover's Save and Cancel, a form row).
export const compactBtnText = { ...outlinedBtnText, fontSize: 14 } as const;

// The segmented toggle (Tasks / Calendar, Day / Week / Month): two or three square buttons side by side, the chosen
// one primary, the others secondary (no track round them).
export const segTrack = { flexDirection: 'row', gap: 0 } as const;
export const segBtn = { paddingHorizontal: 16, height: 38, borderRadius: radius.square, justifyContent: 'center', backgroundColor: Colors.hostPill } as const;
export const segBtnOn = { backgroundColor: Colors.accent } as const;
export const segBtnHover = { backgroundColor: Colors.pickerTabOn } as const;
export const segLabel = { fontSize: 16, fontWeight: fontWeight.bold, color: Colors.onHostPill } as const;
export const segLabelOn = { color: Colors.onAccent, fontWeight: fontWeight.bold } as const;

// The coloured band across the top of a pane (and the details window, 8 px), inside the pane's own corner. The pane
// needs no `overflow: hidden` (popovers and drag previews are not clipped); the band follows its corner itself.
export function PaneBand({ corner = radius.xl - 1 }: { corner?: number }) {
  return <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: band.pane, backgroundColor: Colors.accent, borderTopLeftRadius: corner, borderTopRightRadius: corner }} />;
}

// The flat slab behind a pane: a solid copy of its shape moved right and down by `--ds-slab-offset` (7 px on light, 0
// on dark; themeStore sets it from tokens.slabOffset). A zero blur box shadow, so it follows the corner, takes no
// room and catches no mouse.
export const paneSlab = { boxShadow: `var(--ds-slab-offset, 0px) var(--ds-slab-offset, 0px) 0 0 ${Colors.border}` } as object;

// A short, thick, centred divider (under a title, between sections): replaces a full width hairline.
export function ShortDivider({ width = dividerToken.short, style }: { width?: number; style?: object }) {
  return <View style={[{ height: dividerToken.height, width, backgroundColor: Colors.border, alignSelf: 'center' }, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />;
}

// A small soft pill: the duration (0:30), a count, the Today tag.
export const pillBox = { height: 20, paddingHorizontal: 7, borderRadius: radius.square, backgroundColor: Colors.surfaceRaised, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4 } as const;
export const pillLabel = { fontSize: 11.5, lineHeight: 16, fontWeight: fontWeight.bold, color: Colors.textSecondary } as const;
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
  ({ width: size, height: size, borderRadius: radius.full, borderWidth: 2.5, borderColor: Colors.textPrimary, backgroundColor: Colors.checkFill, alignItems: 'center', justifyContent: 'center' }) as const;
// 3.32.0: a done box is the accent with a white tick (the ring of an empty one is the text colour, 2.5 px).
export const checkRingDone = { borderColor: Colors.accent, backgroundColor: Colors.accent } as const;

export function RoundCheck({ done, size = 18 }: { done: boolean; size?: number }) {
  return (
    <View style={[checkRing(size), done && checkRingDone]}>
      {done && <Ionicons name="checkmark" size={Math.round(size * 0.72)} color={Colors.onAccent} />}
    </View>
  );
}

// The one icon style: thin line icons (Ionicons "-outline"), small, grey, in front of a label.
export function LineIcon({ name, size = 15, color = Colors.textSecondary }: { name: React.ComponentProps<typeof Ionicons>['name']; size?: number; color?: string }) {
  return <Ionicons name={name} size={size} color={color} />;
}

// A thin divider between sections (the modal, a popover's footer): 1px, low contrast.
export const divider = { height: 1, backgroundColor: Colors.border, marginVertical: 8 } as const;

// The search field of a popover: a magnifier in front, a quiet well.
export function SearchField({
  value,
  onChangeText,
  placeholder,
  a11y,
  onSubmitEditing,
  autoFocus,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  a11y: string;
  onSubmitEditing?: () => void;
  autoFocus?: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 34, paddingHorizontal: 10, borderRadius: radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background }}>
      <Ionicons name="search-outline" size={15} color={Colors.textSecondary} />
      <TextInput
        style={[{ flex: 1, minWidth: 0, height: 32, fontSize: 14, color: Colors.textPrimary }, { outlineStyle: 'none' } as object]}
        placeholder={placeholder}
        placeholderTextColor={Colors.textSecondary}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        accessibilityLabel={a11y}
        autoFocus={autoFocus}
      />
    </View>
  );
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

// A month grid for choosing a day (the date popover), Monday first. Nothing before `min` can be
// chosen; the chosen day is a filled accent rounded square, today is in the accent colour.
export function MonthGrid({ selected, min, onPick, a11y }: { selected?: string; min: string; onPick: (key: string) => void; a11y: (key: string) => string }) {
  const start = parseDateKey(selected && isDateKey(selected) && selected >= min ? selected : min);
  const [month, setMonth] = useState(() => new Date(start.getFullYear(), start.getMonth(), 1));
  const todayKey = dateKey(new Date());
  const minMonth = parseDateKey(min);
  const atMin = month.getFullYear() === minMonth.getFullYear() && month.getMonth() === minMonth.getMonth();
  const lead = (month.getDay() + 6) % 7;
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: Array<string | null> = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= count; d++) cells.push(dateKey(addDays(month, d - 1)));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: Array<Array<string | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const shift = (by: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + by, 1));
  return (
    <View style={{ paddingHorizontal: 10, paddingTop: 6, paddingBottom: 6, gap: 2 }} {...({ dataSet: { monthGrid: '1' } } as object)}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 30 }}>
        <Pressable onPress={() => shift(-1)} disabled={atMin} style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, opacity: atMin ? 0.3 : 1 }} accessibilityRole="button" accessibilityLabel="Previous month">
          <Ionicons name="chevron-back" size={16} color={Colors.textSecondary} />
        </Pressable>
        <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.textPrimary }}>
          {MONTH_NAMES[month.getMonth()]} {month.getFullYear()}
        </Text>
        <Pressable onPress={() => shift(1)} style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md }} accessibilityRole="button" accessibilityLabel="Next month">
          <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row' }}>
        {WEEKDAY_LETTERS.map((l, i) => (
          <Text key={i} style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600', color: Colors.textTertiary }}>
            {l}
          </Text>
        ))}
      </View>
      {weeks.map((w, wi) => (
        <View key={wi} style={{ flexDirection: 'row' }}>
          {w.map((key, ci) => {
            if (!key) return <View key={ci} style={{ flex: 1, height: 30 }} />;
            const off = key < min;
            const on = key === selected;
            return (
              <Pressable
                key={key}
                disabled={off}
                onPress={() => onPick(key)}
                style={{ flex: 1, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: on ? Colors.accent : undefined }}
                accessibilityRole="button"
                accessibilityState={{ selected: on, disabled: off }}
                accessibilityLabel={a11y(key)}
                {...({ dataSet: { monthDay: key } } as object)}
              >
                <Text style={{ fontSize: 13, fontWeight: on || key === todayKey ? '700' : '500', color: on ? Colors.onAccent : off ? Colors.textTertiary : key === todayKey ? Colors.accentText : Colors.textPrimary }}>
                  {parseDateKey(key).getDate()}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// A heading with a thin line icon in front (a page title, a section title, a column title): the
// icon is chrome, the text is the heading (accessibility role "header").
export type IconName = React.ComponentProps<typeof Ionicons>['name'];
export function IconHeading({ icon, style, size = 17, color = Colors.textSecondary, children, a11y }: { icon: IconName; style: object | object[]; size?: number; color?: string; children: React.ReactNode; a11y?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0, flexShrink: 1 }}>
      <Ionicons name={icon} size={size} color={color} />
      <Text style={style} accessibilityRole="header" accessibilityLabel={a11y}>
        {children}
      </Text>
    </View>
  );
}
