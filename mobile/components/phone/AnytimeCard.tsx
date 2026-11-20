// One Anytime card on the phone's Today (PLAN_phone_stepflow section 2, 3.60.0): a slab card whose body a finger can
// tap (opens the task's card), press and hold (the HoldCard, when the finger does not move) or press, hold and drag up or
// down (reorders the cards: lib/anytimeOrder.ts). The same split as the Calendar's block drag (DraggableBlock): gesture
// handler's pan after a long press, React Native's Animated. Screen readers get "Move up" and "Move down".
import React, { useMemo, useRef, useState } from 'react';
import { Animated, Platform, View, type AccessibilityActionEvent, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { HOLD_MAX_MOVE, HOLD_MS, TAP_MAX_MOVE, TAP_MAX_MS } from '../../lib/touchRules';
import { haptic, useReducedMotion } from './touch';
import { Slab } from './Slab';

export function AnytimeCard({
  a11y,
  onTap,
  onHold,
  onDrop,
  onMoveBy,
  onDragging,
  onLayout,
  tick,
  below,
  children,
  data,
}: {
  a11y: string;
  onTap: () => void;
  onHold?: () => void;
  // The card was dragged `dy` pixels and let go.
  onDrop: (dy: number) => void;
  // A screen reader's Move up (-1) or Move down (+1).
  onMoveBy: (step: number) => void;
  onDragging?: (on: boolean) => void;
  onLayout?: (e: LayoutChangeEvent) => void;
  tick: React.ReactNode;
  // Under the card's row, outside the drag (the smaller tasks with their own ticks).
  below?: React.ReactNode;
  children: React.ReactNode;
  data?: Record<string, string>;
}) {
  const reduced = useReducedMotion();
  const dy = useRef(new Animated.Value(0)).current;
  const [lifted, setLifted] = useState(false);
  const latest = useRef({ onTap, onHold, onDrop, onDragging });
  latest.current = { onTap, onHold, onDrop, onDragging };

  const gesture = useMemo(() => {
    const tap = Gesture.Tap()
      .maxDistance(TAP_MAX_MOVE)
      .maxDuration(TAP_MAX_MS)
      .runOnJS(true)
      .onEnd((_e, ok) => {
        if (ok) latest.current.onTap();
      });
    const pan = Gesture.Pan()
      .activateAfterLongPress(HOLD_MS)
      .runOnJS(true)
      .onStart(() => {
        haptic('select');
        setLifted(true);
        latest.current.onDragging?.(true);
      })
      .onUpdate((e) => dy.setValue(e.translationY))
      .onEnd((e) => {
        // Held still: the HoldCard, as before. Moved: a reorder.
        if (Math.abs(e.translationY) <= HOLD_MAX_MOVE && Math.abs(e.translationX) <= HOLD_MAX_MOVE * 2) latest.current.onHold?.();
        else latest.current.onDrop(e.translationY);
      })
      .onFinalize(() => {
        dy.setValue(0);
        setLifted(false);
        latest.current.onDragging?.(false);
      });
    return Gesture.Exclusive(pan, tap);
  }, [dy]);

  const onAction = (e: AccessibilityActionEvent) => {
    const name = e.nativeEvent.actionName;
    if (name === 'activate') onTap();
    else if (name === 'longpress') onHold?.();
    else if (name === 'up') onMoveBy(-1);
    else if (name === 'down') onMoveBy(1);
  };

  return (
    <Animated.View
      onLayout={onLayout}
      style={{ opacity: lifted ? 0.9 : 1, transform: [{ translateY: dy }, { scale: lifted && !reduced ? 1.02 : 1 }], zIndex: lifted ? 10 : 0 }}
      {...({ dataSet: { ...data, lifted: lifted ? '1' : '0' } } as object)}
    >
      <Slab>
        <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
          {/* Web only: the body takes the touch itself (the browser would otherwise scroll and cancel the drag). */}
          <GestureDetector gesture={gesture} touchAction={Platform.OS === 'web' ? 'none' : undefined}>
            <View
              style={{ flex: 1 }}
              accessible
              accessibilityRole="button"
              accessibilityLabel={a11y}
              accessibilityHint="Tap to open. Press and hold for more, or hold and drag to reorder."
              accessibilityActions={[{ name: 'activate' }, { name: 'longpress' }, { name: 'up', label: 'Move up' }, { name: 'down', label: 'Move down' }]}
              onAccessibilityAction={onAction}
              {...({ dataSet: { anytimeBody: data?.anytimeCard ?? '' } } as object)}
            >
              {children}
            </View>
          </GestureDetector>
          {tick}
        </View>
        {below}
      </Slab>
    </Animated.View>
  );
}
