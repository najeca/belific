import React, { useCallback, useRef, useState } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

// A Pressable that knows whether the pointer is over it, for rows and cards
// that reveal small action buttons on hover.
//
// Why not Pressable's own onHoverIn / onHoverOut: react-native-web ends the
// parent's hover as soon as the pointer enters a nested pressable, so hover-only
// buttons unmounted under the pointer and the click landed on the row/card
// instead (found in checkpoint 2c with real pointer input; DOM .click() tests
// never showed it). The DOM mouseenter / mouseleave events used here treat
// children as part of the element, so the row stays hovered while the pointer
// is over its buttons.
//
// Children are a function of `hovered`; `hoverStyle` is applied while hovered.
export default function HoverPressable({
  children,
  style,
  hoverStyle,
  ...rest
}: Omit<PressableProps, 'children' | 'style'> & {
  children: (hovered: boolean) => React.ReactNode;
  style?: StyleProp<ViewStyle>;
  hoverStyle?: StyleProp<ViewStyle>;
}) {
  const [hovered, setHovered] = useState(false);
  const cleanup = useRef<(() => void) | null>(null);

  const attach = useCallback((node: unknown) => {
    cleanup.current?.();
    cleanup.current = null;
    const el = node as HTMLElement | null;
    if (!el || typeof el.addEventListener !== 'function') return;
    const enter = () => setHovered(true);
    const leave = () => setHovered(false);
    el.addEventListener('mouseenter', enter);
    el.addEventListener('mouseleave', leave);
    cleanup.current = () => {
      el.removeEventListener('mouseenter', enter);
      el.removeEventListener('mouseleave', leave);
    };
  }, []);

  return (
    <Pressable ref={attach as never} style={[style, hovered && hoverStyle]} {...rest}>
      {children(hovered)}
    </Pressable>
  );
}
