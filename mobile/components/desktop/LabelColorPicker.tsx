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
// colour wheel for any other colour. 2.27.1: always shown, a lock and a reason on
// each locked one, and a note when every colour that can be picked is taken. The new ones (and any wheel colour) stay
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
  // 2.27.1: say so when every colour that can be picked is taken (nine or more
  // labels before the tick), instead of leaving every swatch dimmed in silence.
  const noneFree = !ok && LABEL_COLORS.filter((c) => !c.since).every((c) => value !== c.key && !!colorClash(labels, c.key, exceptKey));
  return (
    <View style={styles.wrap} {...({ dataSet: { colorPicker: '1' } } as object)}>
      <View style={styles.grid}>
        {LABEL_COLORS.map((c) => {
          const on = value === c.key;
          const locked = isNewColor(c.key) && !ok;
          const takenBy = on ? undefined : colorClash(labels, c.key, exceptKey);
          const off = locked || !!takenBy;
          // The tooltip sits on a plain element: react-native-web drops `title` on a Pressable.
          const tip = takenBy ? `Used by ${takenBy.name}` : locked ? `${c.name}: locked until every computer runs Belific 2.27` : c.name;
          return (
            <div key={c.key} title={tip} data-swatch-tip={c.key} style={{ display: 'flex' }}>
            <Pressable
              onPress={() => !off && onPick(c.key)}
              disabled={off}
              style={[styles.swatch, on && styles.swatchOn, locked && styles.locked, takenBy && styles.taken]}
              accessibilityRole="button"
              accessibilityState={{ selected: on, disabled: off }}
              accessibilityLabel={`${c.name} colour for ${forName}${takenBy ? `, used by ${takenBy.name}` : ''}`}
              // aria-selected is not written on a button: aria-pressed says which one is on.
              {...({ 'aria-pressed': on, dataSet: { swatch: c.key, ...(locked ? { locked: '1' } : {}), ...(takenBy ? { taken: takenBy.name } : {}) } } as object)}
            >
              <View style={[styles.fill, { backgroundColor: c.edge }]}>
                {takenBy && <View style={styles.mark} />}
                {locked && !takenBy && <Ionicons name="lock-closed" size={9} color="#FFFFFF" />}
              </View>
            </Pressable>
            </div>
          );
        })}
        <div title={ok ? 'Any colour' : 'Any colour: locked until every computer runs Belific 2.27'} data-swatch-tip="wheel" style={{ display: 'flex' }}>
        <Pressable
          onPress={() => ok && setWheel((w) => !w)}
          disabled={!ok}
          style={[styles.swatch, (custom || wheel) && styles.swatchOn, !ok && styles.locked]}
          accessibilityRole="button"
          accessibilityState={{ expanded: wheel, disabled: !ok, selected: custom }}
          accessibilityLabel={`Any colour for ${forName}`}
          {...({ 'aria-pressed': custom, dataSet: { swatch: 'wheel', ...(!ok ? { locked: '1' } : {}) } } as object)}
        >
          <View style={[styles.fill, custom && current ? { backgroundColor: current.edge } : styles.rainbow]}>{!ok && <Ionicons name="lock-closed" size={9} color="#FFFFFF" />}</View>
        </Pressable>
        </div>
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
      {/* 2.28.0: the tick and its lock note only while the extra colours are not yet confirmed;
          afterwards one short line. The text wraps inside the picker, never cut at the edge. */}
      {ok ? (
        <Text style={styles.note} {...({ dataSet: { extraColoursOn: '1' } } as object)}>
          Extra colours on
        </Text>
      ) : (
        <>
          <Pressable
            onPress={() => setNewColorsOk(true)}
            style={styles.tickRow}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: false }}
            accessibilityLabel={NEW_COLORS_TICK}
          >
            <View style={styles.tick} />
            <Text style={styles.tickText}>{NEW_COLORS_TICK}</Text>
          </Pressable>
          <Text style={styles.note}>🔒 The last 12 colours and the colour wheel need it: an older Belific changes them back to one of the first 8.</Text>
        </>
      )}
      {noneFree && (
        <Text style={[styles.note, styles.noteStrong]} {...({ dataSet: { noFreeColour: '1' } } as object)}>
          All 8 original colours are in use by other labels. Tick the box above once every computer runs 2.27 to use the other 12, or change another label's colour first.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, alignSelf: 'stretch', minWidth: 0 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, maxWidth: 240 },
  swatch: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'transparent' },
  swatchOn: { borderColor: Colors.textPrimary },
  locked: { opacity: 0.45 },
  taken: { opacity: 0.35 },
  fill: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  mark: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: Colors.textPrimary },
  rainbow: { backgroundImage: 'conic-gradient(#E23B3B, #F07A1A, #BF9100, #1F9E4E, #0B97CF, #4F46C8, #CC36B4, #E23B3B)' } as object,
  tickRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 2, alignSelf: 'stretch' },
  tick: { width: 16, height: 16, borderRadius: 4, borderWidth: 1.5, borderColor: Colors.textSecondary, flexShrink: 0 },
  tickText: { fontSize: 12, lineHeight: 16, color: Colors.textPrimary, flexShrink: 1, minWidth: 0, overflowWrap: 'anywhere' } as object,
  note: { fontSize: 11, color: Colors.textSecondary, lineHeight: 15, alignSelf: 'stretch', minWidth: 0, overflowWrap: 'anywhere' } as object,
  noteStrong: { color: Colors.textPrimary },
});
