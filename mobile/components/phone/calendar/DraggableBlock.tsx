import React, { useMemo, useRef, useState } from 'react';
import { Animated, Platform, Text, View, type AccessibilityActionEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { radius, type ColorTokens } from '../../../lib/tokens';
import { HOLD_MS, TAP_MAX_MOVE, TAP_MAX_MS } from '../../../lib/touchRules';
import { draggedStart } from '../../../lib/phoneDrag';
import { PX_PER_HOUR, toMinutes, toTime } from '../../../lib/timebox';
import { formatTime } from '../../../lib/data';
import type { DaySource } from '../../../lib/phoneDay';
import { useStyles } from '../theme';
import { haptic, useReducedMotion } from '../touch';
import { inter } from '../type';

// A task block that can be held and dragged in time (PLAN_phone P10). Press and hold about 400 ms (a
// haptic says it is lifted), then drag up or down: it follows the finger and shows the time it will get,
// in 15 minute steps (decision 6); letting go moves it (lib/phoneDrag.ts, the desktop's drop rules).
// A quick tap still opens it, and a finger that moves before the hold scrolls the timeline instead
// (gesture handler's pan after a long press). Screen readers get "15 minutes earlier / later".
// No Reanimated (decision 5): React Native's Animated, driven from the gesture's callbacks.

export interface DragTarget {
  source: Extract<DaySource, { kind: 'task' }>;
  startMin: number;
}

const make = (c: ColorTokens) => ({
  label: { position: 'absolute' as const, right: 4, top: -22, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.sm, backgroundColor: c.inverseBg },
  labelText: { ...inter(700), fontSize: 12, color: c.inverseText },
});

export function DraggableBlock({
  source,
  a11y,
  onTap,
  onDrop,
  onDragging,
  autoScroll,
  children,
  data,
}: {
  source: Extract<DaySource, { kind: 'task' }>;
  a11y: string;
  onTap: () => void;
  onDrop: (target: DragTarget) => void;
  onDragging?: (on: boolean) => void;
  // Scrolls the timeline when the finger nears its top or bottom edge; returns the pixels scrolled.
  autoScroll?: (absoluteY: number) => number;
  children: React.ReactNode;
  data?: Record<string, string>;
}) {
  const s = useStyles(make);
  const reduced = useReducedMotion();
  const dy = useRef(new Animated.Value(0)).current;
  const [lifted, setLifted] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);
  const scrolled = useRef(0);
  const latest = useRef({ source, onTap, onDrop, onDragging, autoScroll });
  latest.current = { source, onTap, onDrop, onDragging, autoScroll };
  const start = toMinutes(source.task.startTime) ?? 0;
  // A later piece of a split task, or yesterday's rest, moves the task by the same amount from its own start.
  const offset = source.piece ? source.piece.startMin - start : 0;

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
        scrolled.current = 0;
        setLifted(true);
        latest.current.onDragging?.(true);
      })
      .onUpdate((e) => {
        scrolled.current += latest.current.autoScroll?.(e.absoluteY) ?? 0;
        const moved = e.translationY + scrolled.current;
        dy.setValue(moved);
        const st = toMinutes(latest.current.source.task.startTime) ?? 0;
        setPreview(draggedStart(st, moved, PX_PER_HOUR, latest.current.source.task.durationMinutes ?? 30));
      })
      .onEnd((e) => {
        const st = toMinutes(latest.current.source.task.startTime) ?? 0;
        const next = draggedStart(st, e.translationY + scrolled.current, PX_PER_HOUR, latest.current.source.task.durationMinutes ?? 30);
        latest.current.onDrop({ source: latest.current.source, startMin: next });
      })
      .onFinalize(() => {
        dy.setValue(0);
        setLifted(false);
        setPreview(null);
        latest.current.onDragging?.(false);
      });
    return Gesture.Exclusive(pan, tap);
  }, [dy]);

  const onAction = (e: AccessibilityActionEvent) => {
    const step = e.nativeEvent.actionName === 'later' ? 15 : e.nativeEvent.actionName === 'earlier' ? -15 : 0;
    if (step) onDrop({ source, startMin: Math.max(0, Math.min(1440 - 15, start + step)) });
    else if (e.nativeEvent.actionName === 'activate') onTap();
  };

  return (
    // Web only: a block takes the touch itself (the browser would otherwise start scrolling and cancel the
    // drag); the empty timeline around it still scrolls. On the iPhone the native scroll view and the
    // hold work together.
    <GestureDetector gesture={gesture} touchAction={Platform.OS === 'web' ? 'none' : undefined}>
      <Animated.View
        style={{ flex: 1, opacity: lifted ? 0.85 : 1, transform: [{ translateY: dy }, { scale: lifted && !reduced ? 1.02 : 1 }], zIndex: lifted ? 10 : 0 }}
        accessible
        accessibilityRole="button"
        accessibilityLabel={a11y}
        accessibilityHint="Tap to open. Press and hold, then drag to move it."
        accessibilityActions={[{ name: 'activate' }, { name: 'earlier', label: '15 minutes earlier' }, { name: 'later', label: '15 minutes later' }]}
        onAccessibilityAction={onAction}
        {...({ dataSet: { ...data, lifted: lifted ? '1' : '0' } } as object)}
      >
        {children}
        {preview !== null ? (
          <View style={s.label} pointerEvents="none" {...({ dataSet: { dragTime: toTime(preview + offset) } } as object)}>
            <Text style={s.labelText}>{formatTime(toTime(preview + offset))}</Text>
          </View>
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}
