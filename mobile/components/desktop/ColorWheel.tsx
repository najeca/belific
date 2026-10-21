import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../lib/theme';
import { colorClash, customTint, hexToHueShade, hueShadeToHex, normalizeHex } from '../../lib/labelColors';
import type { Project } from '../../lib/types';
import { DESKTOP_FONT_FAMILY } from './desktopFont';

// The colour wheel (2.27.0, item 2): any colour, as a hue and a shade plus a hex
// field, stored as "#RRGGBB" in the label's colour field. A colour too close to
// another label's colour is refused, with that label's name (item 3).
export default function ColorWheel({
  value,
  labels,
  exceptKey,
  forName,
  onPick,
}: {
  value?: string;
  labels: Pick<Project, 'key' | 'name' | 'colorKey' | 'deletedAt'>[];
  // The label being edited (its own colour is never a clash).
  exceptKey?: string;
  forName: string;
  onPick: (hex: string) => void;
}) {
  const start = normalizeHex(value ?? '') ?? '#2F6FEB';
  const [hue, setHue] = useState(() => hexToHueShade(start).hue);
  const [shade, setShade] = useState(() => hexToHueShade(start).shade);
  const [hex, setHex] = useState(start);
  const [text, setText] = useState(start);
  useEffect(() => setText(hex), [hex]);

  const fromSliders = (h: number, s: number) => {
    setHue(h);
    setShade(s);
    setHex(hueShadeToHex(h, s));
  };
  const typed = normalizeHex(text);
  const clash = colorClash(labels, hex, exceptKey);

  return (
    <View style={styles.wrap} {...({ dataSet: { colorWheel: '1' } } as object)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div aria-hidden="true" style={{ width: 28, height: 28, borderRadius: 14, background: hex, flex: 'none', boxShadow: `0 0 0 3px ${customTint(hex)}` }} />
        <input
          type="range"
          min={0}
          max={359}
          value={hue}
          aria-label={`Hue for ${forName}`}
          onChange={(e) => fromSliders(Number(e.target.value), shade)}
          style={{ ...rangeStyle, background: 'linear-gradient(90deg, #f00, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00)' }}
        />
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={shade}
        aria-label={`Shade for ${forName}`}
        onChange={(e) => fromSliders(hue, Number(e.target.value))}
        style={{ ...rangeStyle, background: `linear-gradient(90deg, ${hueShadeToHex(hue, 0)}, ${hueShadeToHex(hue, 50)}, ${hueShadeToHex(hue, 100)})` }}
      />
      <View style={styles.row}>
        <input
          type="text"
          value={text}
          maxLength={7}
          spellCheck={false}
          aria-label={`Hex colour for ${forName}`}
          aria-invalid={!typed}
          onChange={(e) => {
            setText(e.target.value);
            const h = normalizeHex(e.target.value);
            if (h) {
              setHex(h);
              const hs = hexToHueShade(h);
              setHue(hs.hue);
              setShade(hs.shade);
            }
          }}
          style={hexStyle}
        />
        <Pressable
          onPress={() => !clash && typed && onPick(hex)}
          disabled={!!clash || !typed}
          style={[styles.useBtn, (!!clash || !typed) && styles.off]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !!clash || !typed }}
          accessibilityLabel={`Use this colour for ${forName}`}
        >
          <Text style={styles.useText}>Use colour</Text>
        </Pressable>
      </View>
      {!typed ? <Text style={styles.note}>Type a colour like #2F6FEB.</Text> : null}
      {clash ? (
        <Text style={styles.warn} accessibilityLabel="Colour clash" {...({ dataSet: { colorClash: clash.name } } as object)}>
          Too close to the colour of “{clash.name}”. Pick another, so the two can be told apart.
        </Text>
      ) : null}
    </View>
  );
}

const rangeStyle: React.CSSProperties = { flex: 1, width: '100%', height: 10, borderRadius: 4, appearance: 'none', WebkitAppearance: 'none', outlineColor: Colors.accent, cursor: 'pointer' };
const hexStyle: React.CSSProperties = {
  width: 92,
  height: 30,
  padding: '0 8px',
  borderRadius: 8,
  border: `1px solid ${Colors.border}`,
  background: Colors.background,
  color: Colors.textPrimary,
  fontSize: 13,
  fontFamily: DESKTOP_FONT_FAMILY,
  outlineColor: Colors.accent,
};

const styles = StyleSheet.create({
  wrap: { gap: 8, paddingTop: 4, maxWidth: 240 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  useBtn: { paddingHorizontal: 12, height: 30, borderRadius: 10, backgroundColor: Colors.accent, justifyContent: 'center' },
  useText: { fontSize: 12, fontWeight: '700', color: Colors.onAccent },
  off: { opacity: 0.4 },
  note: { fontSize: 11, color: Colors.textSecondary },
  warn: { fontSize: 12, color: Colors.danger, lineHeight: 16 },
});
