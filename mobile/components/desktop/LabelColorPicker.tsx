import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { LABEL_COLORS, colorClash, isCustomColor, isNewColor, labelColor } from '../../lib/labelColors';
import type { Project } from '../../lib/types';
import ColorWheel from './ColorWheel';
import { setNewColorsOk, useNewColorsOk } from './uiStore';

export const NEW_COLORS_TICK = 'Every computer runs Belific 2.27 or later';

// The label colours (2.27.0): the original eight, the twelve vibrant ones and a
// colour wheel for any other colour. The new ones (and any wheel colour) stay
// locked until "Every computer runs Belific 2.27 or later" is ticked: a desktop
// before 2.26 changes such a label back to one of the eight on every device, and
// 2.26 draws it neutral (see labelColors.ts).
// No two labels share a colour (item 3): a colour another label has is dimmed
// with a small marker and cannot be chosen; the wheel refuses one that is too
// close and says which label has it.
export function LabelColorPicker({
  value,
  onPick,
  forName,
  labels = [],
  exceptKey,
}: {
  value?: string;
  onPick: (key: string) => void;
  forName: string;
  // Every live label, to show the colours already taken.
  labels?: Pick<Project, 'key' | 'name' | 'colorKey' | 'deletedAt'>[];
  // The label being edited, whose own colour is not "taken".
  exceptKey?: string;
}) {
  const ok = useNewColorsOk();
  const [wheel, setWheel] = useState(false);
  const current = labelColor(value);
  const custom = isCustomColor(value);
  return (
    <View style={styles.wrap} {...({ dataSet: { colorPicker: '1' } } as object)}>
      <View style={styles.grid}>
        {LABEL_COLORS.map((c) => {
          const on = value === c.key;
          const locked = isNewColor(c.key) && !ok;
          const takenBy = on ? undefined : colorClash(labels, c.key, exceptKey);
          const off = locked || !!takenBy;
          return (
            <Pressable
              key={c.key}
              onPress={() => !off && onPick(c.key)}
              disabled={off}
              style={[styles.swatch, on && styles.swatchOn, locked && styles.locked, takenBy && styles.taken]}
              accessibilityRole="button"
              accessibilityState={{ selected: on, disabled: off }}
              accessibilityLabel={`${c.name} colour for ${forName}${takenBy ? `, used by ${takenBy.name}` : ''}`}
              {...({ dataSet: { swatch: c.key, ...(locked ? { locked: '1' } : {}), ...(takenBy ? { taken: takenBy.name } : {}) }, title: takenBy ? `Used by ${takenBy.name}` : c.name } as object)}
            >
              <View style={[styles.fill, { backgroundColor: c.edge }]}>{takenBy && <View style={styles.mark} />}</View>
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => ok && setWheel((w) => !w)}
          disabled={!ok}
          style={[styles.swatch, (custom || wheel) && styles.swatchOn, !ok && styles.locked]}
          accessibilityRole="button"
          accessibilityState={{ expanded: wheel, disabled: !ok, selected: custom }}
          accessibilityLabel={`Any colour for ${forName}`}
          {...({ dataSet: { swatch: 'wheel', ...(!ok ? { locked: '1' } : {}) } } as object)}
        >
          <View style={[styles.fill, custom && current ? { backgroundColor: current.edge } : styles.rainbow]} />
        </Pressable>
      </View>
      {current && !LABEL_COLORS.some((c) => c.key === value) && !custom ? <Text style={styles.note}>Now: {current.name} (a 2.26 colour, kept as it is).</Text> : null}
      {wheel && ok && (
        <ColorWheel
          value={custom ? value : undefined}
          labels={labels}
          exceptKey={exceptKey}
          forName={forName}
          onPick={(hex) => {
            setWheel(false);
            onPick(hex);
          }}
        />
      )}
      <Pressable
        onPress={() => setNewColorsOk(!ok)}
        style={styles.tickRow}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: ok }}
        accessibilityLabel={NEW_COLORS_TICK}
      >
        <View style={[styles.tick, ok && styles.tickOn]}>{ok && <Ionicons name="checkmark" size={11} color="#FFFFFF" />}</View>
        <Text style={styles.tickText}>{NEW_COLORS_TICK}</Text>
      </Pressable>
      {!ok && <Text style={styles.note}>The last 12 colours and the colour wheel need it: an older Belific changes them back to one of the first 8.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, maxWidth: 240 },
  swatch: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'transparent' },
  swatchOn: { borderColor: Colors.textPrimary },
  locked: { opacity: 0.3 },
  taken: { opacity: 0.35 },
  fill: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  mark: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: Colors.textPrimary },
  rainbow: { backgroundImage: 'conic-gradient(#E23B3B, #F07A1A, #BF9100, #1F9E4E, #0B97CF, #4F46C8, #CC36B4, #E23B3B)' } as object,
  tickRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  tick: { width: 16, height: 16, borderRadius: 4, borderWidth: 1.5, borderColor: Colors.textSecondary, alignItems: 'center', justifyContent: 'center' },
  tickOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  tickText: { fontSize: 12, color: Colors.textPrimary },
  note: { fontSize: 11, color: Colors.textSecondary, lineHeight: 15 },
});
