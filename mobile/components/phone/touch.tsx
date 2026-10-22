import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, Text, View, type AccessibilityActionEvent, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector, Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { HOLD_MAX_MOVE, HOLD_MS, SWIPE_ACTION_WIDTH, SWIPE_COMMIT, TAP_MAX_MOVE, TAP_MAX_MS } from '../../lib/touchRules';
import { useTheme } from './theme';
import { inter } from './type';
import type { IconName } from './ui';

// The phone's touch kit (PLAN_phone P2), built only on gesture handler primitives so the native scroll
// views keep working: a tap counts only when the finger barely moves and lifts quickly (a scroll moves
// it past TAP_MAX_MOVE, so the tap fails and the scroll wins); press and hold starts after HOLD_MS
// with a small haptic. Every gesture also has a screen reader action, so nothing needs a gesture.

export function haptic(kind: 'select' | 'light' | 'success' = 'select'): void {
  if (Platform.OS === 'web') return;
  const run =
    kind === 'success'
      ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      : kind === 'light'
        ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        : Haptics.selectionAsync();
  run.catch(() => {});
}

// "Reduce motion" (iOS Settings, Accessibility): slides become fades, nothing overshoots.
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => live && setReduced(v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

// A sheet or menu opened by a press and hold sits under the finger that is still down: the lift must
// not count as a choice (on the web it lands as a click on the new dim area). Presses on the new sheet
// within SETTLE_MS of opening are ignored.
export const SETTLE_MS = 350;
export function useSettled(visible: boolean): () => boolean {
  const openedAt = useRef(0);
  useEffect(() => {
    if (visible) openedAt.current = Date.now();
  }, [visible]);
  return () => Date.now() - openedAt.current > SETTLE_MS;
}

export interface RowAction {
  name: string; // the screen reader action's label ("Done", "Delete")
  run: () => void;
}

// A row (or block) that a finger can tap or press and hold. A tap needs a still, quick touch; a hold
// needs a still touch of HOLD_MS. Inside a scroll view, moving the finger fails both, so scrolling
// never selects. `actions` are extra screen reader actions (the swipes, the menu's items).
export function PressRow({
  onTap,
  onHold,
  children,
  style,
  a11y,
  hint,
  actions,
  data,
  touchAction = 'pan-y',
}: {
  onTap?: () => void;
  onHold?: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  a11y: string;
  hint?: string;
  actions?: RowAction[];
  // data-* attributes on the web export (the real touch checks find rows by them).
  data?: Record<string, string>;
  // Web only: which browser panning a touch on this row still allows (default: vertical scrolling).
  touchAction?: 'pan-y' | 'pan-x' | 'none' | 'auto';
}) {
  const latest = useRef({ onTap, onHold });
  latest.current = { onTap, onHold };
  const hasHold = !!onHold;
  const gesture = useMemo(() => {
    const tap = Gesture.Tap()
      .maxDistance(TAP_MAX_MOVE)
      .maxDuration(TAP_MAX_MS)
      .runOnJS(true)
      .onEnd((_e, success) => {
        if (success) latest.current.onTap?.();
      });
    if (!hasHold) return tap;
    const hold = Gesture.LongPress()
      .minDuration(HOLD_MS)
      .maxDistance(HOLD_MAX_MOVE)
      .runOnJS(true)
      .onStart(() => {
        haptic('select');
        latest.current.onHold?.();
      });
    return Gesture.Exclusive(hold, tap);
  }, [hasHold]);

  const srActions = [
    ...(onTap ? [{ name: 'activate' }] : []),
    ...(onHold ? [{ name: 'longpress' }] : []),
    ...(actions ?? []).map((a) => ({ name: a.name, label: a.name })),
  ];
  const onAction = (e: AccessibilityActionEvent) => {
    const n = e.nativeEvent.actionName;
    if (n === 'activate') latest.current.onTap?.();
    else if (n === 'longpress') latest.current.onHold?.();
    else actions?.find((a) => a.name === n)?.run();
  };

  // Web only: let the browser scroll the list when a finger moves on a row (the iPhone's own scroll
  // view does this natively); a row's gestures still see the touch.
  return (
    // Remounted when the hold comes or goes (gesture handler does not take a change of shape on a
    // mounted detector: a row drawn before its data loaded would otherwise never get its hold).
    <GestureDetector key={hasHold ? 'hold' : 'tap'} gesture={gesture} touchAction={touchAction}>
      <View
        style={style}
        accessible
        accessibilityRole="button"
        accessibilityLabel={a11y}
        accessibilityHint={hint}
        accessibilityActions={srActions}
        onAccessibilityAction={onAction}
        {...({ dataSet: data } as object)}
      >
        {children}
      </View>
    </GestureDetector>
  );
}

export interface SwipeAction {
  label: string;
  icon: IconName;
  tone: 'accent' | 'danger' | 'quiet';
  run: () => void;
}

// A list row that can be swiped (gesture handler's Swipeable, React Native's own Animated: no
// Reanimated, decision 5). Swiping right far enough runs `right` (Done) on release; swiping left
// reveals the `left` buttons. A vertical scroll never opens it (Swipeable waits for a sideways move).
export function SwipeRow({
  children,
  right,
  left,
  data,
}: {
  children: React.ReactNode;
  right?: SwipeAction;
  left?: SwipeAction[];
  data?: Record<string, string>;
}) {
  const ref = useRef<Swipeable>(null);
  const [width, setWidth] = useState(360);
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const fill = (tone: SwipeAction['tone']) => (tone === 'accent' ? c.accent : tone === 'danger' ? c.danger : c.surfaceRaised);
  const ink = (tone: SwipeAction['tone']) => (tone === 'quiet' ? c.textPrimary : c.onAccent);

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} {...({ dataSet: data } as object)}>
      <Swipeable
        ref={ref}
        friction={reduced ? 1 : 1.6}
        overshootLeft={false}
        overshootRight={false}
        leftThreshold={width * SWIPE_COMMIT}
        rightThreshold={SWIPE_ACTION_WIDTH / 2}
        onSwipeableWillOpen={() => haptic('light')}
        onSwipeableOpen={(direction) => {
          // Swiped right (the left panel is open): commit at once and spring back.
          if (direction === 'left' && right) {
            ref.current?.close();
            right.run();
          }
        }}
        renderLeftActions={
          right
            ? () => (
                <View style={{ flex: 1, backgroundColor: fill(right.tone), justifyContent: 'center', paddingLeft: 20 }} {...({ dataSet: { swipeRight: right.label } } as object)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name={right.icon} size={20} color={ink(right.tone)} />
                    <Text style={{ ...inter(600), fontSize: 15, color: ink(right.tone) }}>{right.label}</Text>
                  </View>
                </View>
              )
            : undefined
        }
        renderRightActions={
          left && left.length
            ? () => (
                <View style={{ flexDirection: 'row' }}>
                  {left.map((a) => (
                    <PressRow
                      key={a.label}
                      onTap={() => {
                        ref.current?.close();
                        a.run();
                      }}
                      a11y={a.label}
                      style={{ width: SWIPE_ACTION_WIDTH, backgroundColor: fill(a.tone), alignItems: 'center', justifyContent: 'center', gap: 4 }}
                      data={{ swipeAction: a.label }}
                    >
                      <Ionicons name={a.icon} size={20} color={ink(a.tone)} />
                      <Text style={{ ...inter(600), fontSize: 12, color: ink(a.tone) }}>{a.label}</Text>
                    </PressRow>
                  ))}
                </View>
              )
            : undefined
        }
      >
        {children}
      </Swipeable>
    </View>
  );
}
