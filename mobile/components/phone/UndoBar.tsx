import React, { useEffect, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import { radius, type ColorTokens } from '../../lib/tokens';
import { useStyles } from './theme';
import { inter } from './type';

// The message after a tick (PLAN_phone P4): "Done: Call the bank" with Undo, for a few seconds.
// A new message replaces the old one (its Undo is gone with it, as on the desktop's undo bar).
export const UNDO_MS = 5000;

export interface UndoMessage {
  id: number;
  text: string;
  // Absent: a note only (a refused drag), with no Undo.
  undo?: () => void;
}

const make = (c: ColorTokens) => ({
  bar: { position: 'absolute' as const, left: 16, right: 92, bottom: 22, minHeight: 50, borderRadius: radius.lg, backgroundColor: c.inverseBg, flexDirection: 'row' as const, alignItems: 'center' as const, paddingLeft: 14, gap: 8 },
  text: { ...inter(500), fontSize: 15, color: c.inverseText, flex: 1 },
  undo: { minWidth: 64, minHeight: 44, alignItems: 'center' as const, justifyContent: 'center' as const, paddingHorizontal: 12 },
  undoText: { ...inter(700), fontSize: 15, color: c.inverseText, textDecorationLine: 'underline' as const },
});

export function UndoBar({ message, onDone }: { message: UndoMessage | null; onDone: () => void }) {
  const s = useStyles(make);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!message) return;
    timer.current = setTimeout(onDone, UNDO_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [message, onDone]);
  if (!message) return null;
  return (
    <View style={s.bar} accessibilityLiveRegion="polite" {...({ dataSet: { undoBar: '1' } } as object)}>
      <Text style={s.text} numberOfLines={1}>
        {message.text}
      </Text>
      {message.undo ? (
        <Pressable
          onPress={() => {
            message.undo?.();
            onDone();
          }}
          style={s.undo}
          accessibilityRole="button"
          accessibilityLabel="Undo"
        >
          <Text style={s.undoText}>Undo</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
