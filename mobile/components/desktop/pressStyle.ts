import type { PressableProps, StyleProp, ViewStyle } from 'react-native';

// react-native-web passes `hovered` (and `focused`) to a Pressable's style
// function as well as `pressed`; React Native's types only name `pressed`.
// This keeps the hover and press styles of the desktop typed (2.26.0).
export interface PressState {
  hovered?: boolean;
  pressed?: boolean;
  focused?: boolean;
}

export function pressStyle(fn: (s: PressState) => StyleProp<ViewStyle>): PressableProps['style'] {
  return fn as unknown as PressableProps['style'];
}
