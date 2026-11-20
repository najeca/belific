// A slab card (PLAN_phone_stepflow section 2, 3.60.0): a card with a solid offset shape behind it. RN boxShadow needs the
// New Architecture (newArchEnabled is false), so the shape is a plain View drawn behind the card, 6 px right and 6 px
// down, in the border colour, never touchable. Off in dark mode (a darker shape on a dark page reads as a smudge).
// Used by Today's Anytime cards (and the Tasks rows of the next phase).
import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { radius } from '../../lib/tokens';
import { useTheme } from './theme';

export const SLAB_OFFSET = 6;

export function Slab({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c, name } = useTheme();
  return (
    <View style={{ marginRight: SLAB_OFFSET, marginBottom: SLAB_OFFSET }}>
      {name !== 'dark' ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: SLAB_OFFSET, top: SLAB_OFFSET, right: -SLAB_OFFSET, bottom: -SLAB_OFFSET, borderRadius: radius.card, backgroundColor: c.borderStrong }} {...({ dataSet: { slabShape: '1' } } as object)} />
      ) : null}
      <View style={[{ backgroundColor: c.surface, borderRadius: radius.card, borderWidth: 1, borderColor: c.borderStrong, overflow: 'hidden' }, style]}>{children}</View>
    </View>
  );
}
