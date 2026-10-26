import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { View, Text, StyleSheet } from 'react-native';
import HoverPressable from './HoverPressable';
import { Colors } from '../../lib/theme';
import { ALL_DAYS, THIS_DAY_ONLY, answerScope, onScopeQuestion, type Scope, type ScopeQuestion } from '../../lib/scopeAsk';
import { DESKTOP_FONT_FAMILY } from './desktopFont';

// "This day only / All days" on the desktop (3.4.0, lib/scopeAsk.ts): a small popover where the
// pointer last let go (a drop, a resize, a pick in the details), or by the focused block for a key.
// Escape or a click outside dismisses it, and the change then does what it did before the question
// (the default button, marked "Default", says which). Web only: reached through DesktopHome.
export default function ScopePrompt() {
  const [q, setQ] = useState<ScopeQuestion | null>(null);
  const at = useRef({ x: 0, y: 0, ms: 0 });
  const box = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onUp = (e: PointerEvent) => {
      at.current = { x: e.clientX, y: e.clientY, ms: Date.now() };
    };
    window.addEventListener('pointerup', onUp, true);
    const off = onScopeQuestion((next) => {
      // No pointer just now (a key on a block, a typed time): by the focused element instead.
      const el = document.activeElement;
      if (next && Date.now() - at.current.ms > 3000 && el instanceof HTMLElement && el !== document.body) {
        const r = el.getBoundingClientRect();
        at.current = { x: r.left + r.width / 2, y: r.bottom, ms: at.current.ms };
      }
      setQ(next);
    });
    return () => {
      window.removeEventListener('pointerup', onUp, true);
      off();
    };
  }, []);

  useEffect(() => {
    if (!q) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      answerScope(null);
    };
    // A press outside the popover dismisses it (after the press that opened it has finished).
    const onDown = (e: PointerEvent) => {
      if (box.current && e.target instanceof Node && box.current.contains(e.target)) return;
      answerScope(null);
    };
    window.addEventListener('keydown', onKey, true);
    const t = setTimeout(() => window.addEventListener('pointerdown', onDown, true), 0);
    // The default answer has the keyboard, so Enter takes it.
    const f = setTimeout(() => box.current?.querySelector<HTMLElement>('[data-scope-default="1"]')?.focus(), 30);
    return () => {
      clearTimeout(t);
      clearTimeout(f);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onDown, true);
    };
  }, [q]);

  if (!q) return null;
  const W = 260;
  const left = Math.max(8, Math.min(at.current.x - W / 2, window.innerWidth - W - 8));
  const top = Math.max(8, Math.min(at.current.y + 12, window.innerHeight - 150));
  const choice = (scope: Scope, label: string, sub: string) => {
    const isDefault = q.fallback === scope;
    return (
      <HoverPressable
        onPress={() => answerScope(scope)}
        style={styles.choice}
        hoverStyle={styles.choiceOn}
        accessibilityRole="button"
        accessibilityLabel={label}
        {...({ dataSet: { scopeChoice: scope, ...(isDefault ? { scopeDefault: '1' } : {}) } } as object)}
      >
        {() => (
          <>
            <Text style={styles.label}>
              {label}
              {isDefault ? <Text style={styles.def}>  Default</Text> : null}
            </Text>
            <Text style={styles.sub}>{sub}</Text>
          </>
        )}
      </HoverPressable>
    );
  };
  // In document.body like Popover.tsx, so it sits above an open drop-down (a length picked in the
  // details stays open until the answer) and the details panel.
  return createPortal(
    <View
      ref={((n: unknown) => { box.current = n as HTMLElement | null; }) as never}
      style={[styles.box, { left, top, width: W }]}
      accessibilityLabel={q.title}
      {...({ role: 'dialog', dataSet: { scopePrompt: '1' } } as object)}
    >
      <Text style={styles.title}>{q.title}</Text>
      {choice('day', THIS_DAY_ONLY, 'The other days stay as they are')}
      {choice('all', ALL_DAYS, 'Every day from today')}
    </View>,
    document.body,
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'fixed' as 'absolute',
    zIndex: 1200,
    padding: 6,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    boxShadow: Colors.shadowMd,
    fontFamily: DESKTOP_FONT_FAMILY,
  } as object,
  title: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, paddingHorizontal: 8, paddingTop: 4, paddingBottom: 6 },
  choice: { paddingHorizontal: 8, paddingVertical: 7, borderRadius: 6 },
  choiceOn: { backgroundColor: Colors.hover },
  label: { fontSize: 13.5, fontWeight: '600', color: Colors.textPrimary },
  def: { fontSize: 11, fontWeight: '500', color: Colors.textSecondary },
  sub: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
});
