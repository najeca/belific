import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { LABEL_COLORS, isNewColor } from '../../lib/labelColors';
import { setNewColorsOk, useNewColorsOk } from './uiStore';

// The 20 label colours (2.26.0) as a grid of swatches: the original eight, then
// the twelve new ones. The new ones stay locked until "Every computer runs
// Belific 2.26 or later" is ticked, because an older desktop would change such
// a label back to one of the eight on every device (see labelColors.ts).
export function LabelColorPicker({ value, onPick, forName }: { value?: string; onPick: (key: string) => void; forName: string }) {
  const ok = useNewColorsOk();
  return (
    <View style={styles.wrap} {...({ dataSet: { colorPicker: '1' } } as object)}>
      <View style={styles.grid}>
        {LABEL_COLORS.map((c) => {
          const on = value === c.key;
          const locked = isNewColor(c.key) && !ok;
          return (
            <Pressable
              key={c.key}
              onPress={() => !locked && onPick(c.key)}
              disabled={locked}
              style={[styles.swatch, on && styles.swatchOn, locked && styles.locked]}
              accessibilityRole="button"
              accessibilityState={{ selected: on, disabled: locked }}
              accessibilityLabel={`${c.name} colour for ${forName}`}
              {...({ dataSet: { swatch: c.key } } as object)}
            >
              <View style={[styles.fill, { backgroundColor: c.edge }]} />
            </Pressable>
          );
        })}
      </View>
      <Pressable
        onPress={() => setNewColorsOk(!ok)}
        style={styles.tickRow}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: ok }}
        accessibilityLabel="Every computer runs Belific 2.26 or later"
      >
        <View style={[styles.tick, ok && styles.tickOn]}>{ok && <Ionicons name="checkmark" size={11} color="#FFFFFF" />}</View>
        <Text style={styles.tickText}>Every computer runs Belific 2.26 or later</Text>
      </Pressable>
      {!ok && <Text style={styles.note}>The last 12 colours need it: an older Belific changes them back to one of the first 8.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, maxWidth: 240 },
  swatch: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'transparent' },
  swatchOn: { borderColor: Colors.textPrimary },
  locked: { opacity: 0.3 },
  fill: { width: 16, height: 16, borderRadius: 8 },
  tickRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  tick: { width: 16, height: 16, borderRadius: 4, borderWidth: 1.5, borderColor: Colors.textSecondary, alignItems: 'center', justifyContent: 'center' },
  tickOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  tickText: { fontSize: 12, color: Colors.textPrimary },
  note: { fontSize: 11, color: Colors.textSecondary, lineHeight: 15 },
});
