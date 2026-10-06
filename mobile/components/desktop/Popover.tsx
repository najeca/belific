import React, { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { placePopover, MAX_POPOVER_HEIGHT, type Placement } from '../../lib/popover';

// The one popover every task control uses (checkpoint 8.2, decision 021).
// Anchored to its trigger: opens below, flips above or sideways, and stays
// inside the window; at most about 320px high with its own scroll. It never
// covers the page and never dims it: there is no backdrop, a press outside
// simply closes it and goes through to whatever was pressed. Only one is open
// at a time. Closes on Escape, a press outside, or choosing an option; focus
// moves inside on open and returns to the trigger after Escape or a choice.
// Web only (portal into document.body, fixed position).

// ---- the single open popover ----
interface OpenState {
  id: string;
  restore: () => HTMLElement | null;
}
let current: OpenState | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function openPopover(id: string, restore: () => HTMLElement | null): void {
  current = { id, restore };
  emit();
}

// restoreFocus: return focus to the trigger (Escape and choosing, not an
// outside press or a drag start, which have somewhere else to be).
export function closePopover(restoreFocus = false): void {
  const was = current;
  if (!was) return;
  current = null;
  emit();
  if (restoreFocus) {
    const el = was.restore();
    if (el && el.isConnected) el.focus();
  }
}

export function togglePopover(id: string, restore: () => HTMLElement | null): void {
  if (current?.id === id) closePopover(true);
  else openPopover(id, restore);
}

export function useIsOpen(id: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => current?.id === id,
    () => false,
  );
}

// The DOM node behind a react-native-web ref, kept for anchoring.
export function usePopoverAnchor() {
  const node = useRef<HTMLElement | null>(null);
  const ref = useCallback((instance: unknown) => {
    node.current = instance && typeof (instance as HTMLElement).getBoundingClientRect === 'function' ? (instance as HTMLElement) : null;
  }, []);
  const get = useCallback(() => node.current, []);
  return { ref, get };
}

const FOCUSABLE = '[role="button"]:not([aria-disabled="true"]), input, textarea, select';

export default function Popover({
  id,
  anchor,
  width = 264,
  children,
}: {
  id: string;
  anchor: () => HTMLElement | null;
  width?: number;
  children: React.ReactNode;
}) {
  const open = useIsOpen(id);
  const box = useRef<HTMLDivElement | null>(null);
  const [place, setPlace] = useState<Placement | null>(null);

  const measure = useCallback(() => {
    const a = anchor();
    const b = box.current;
    if (!a || !b || !a.isConnected) {
      closePopover();
      return;
    }
    const r = a.getBoundingClientRect();
    const natural = b.scrollHeight + 2;
    setPlace(
      placePopover(
        { x: r.left, y: r.top, width: r.width, height: r.height },
        { width, height: natural },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, [anchor, width]);

  useLayoutEffect(() => {
    if (!open) {
      setPlace(null);
      return;
    }
    measure();
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    const b = box.current;
    const ro = typeof ResizeObserver !== 'undefined' && b ? new ResizeObserver(() => measure()) : null;
    if (ro && b) ro.observe(b);
    const onScroll = (e: Event) => {
      // Scrolling inside the popover itself must not move it.
      if (box.current && e.target instanceof Node && box.current.contains(e.target)) return;
      measure();
    };
    const onKey = (e: KeyboardEvent) => {
      const el = box.current;
      if (!el) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closePopover(true);
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const active = document.activeElement;
      if (!active || !el.contains(active)) return;
      // A multi line field keeps its own arrows.
      if (active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement) return;
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const i = items.indexOf(active as HTMLElement);
      const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
      e.preventDefault();
      items[next].focus();
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (box.current && box.current.contains(t)) return;
      // The trigger toggles itself.
      const a = anchor();
      if (a && a.contains(t)) return;
      closePopover();
    };
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onDown, true);
    };
  }, [open, measure, anchor]);

  // Focus moves inside: the search or first field, else the first option.
  useEffect(() => {
    if (!open || !place) return;
    const el = box.current;
    if (!el || el.contains(document.activeElement)) return;
    const first = el.querySelector<HTMLElement>('input, textarea') ?? el.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus({ preventScroll: true });
    // Once per opening, when it has been placed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, place === null]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={box}
      role="dialog"
      aria-label="Task options"
      data-popover={id}
      // Presses inside must never reach the card this popover belongs to.
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        left: place?.left ?? 0,
        top: place?.top ?? 0,
        width,
        maxHeight: place?.maxHeight ?? MAX_POPOVER_HEIGHT,
        overflowY: 'auto',
        visibility: place ? 'visible' : 'hidden',
        zIndex: 500,
        background: Colors.surface,
        border: `1px solid ${Colors.border}`,
        borderRadius: 12,
        boxShadow: '0 6px 18px rgba(38, 37, 31, 0.14)',
        boxSizing: 'border-box',
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

// ---- small shared pieces for the contents ----

export function PopoverHeading({ children }: { children: string }) {
  return <Text style={styles.heading}>{children}</Text>;
}

export function Row({
  label,
  sub,
  selected,
  onPress,
  leading,
  trailing,
  disabled,
  danger,
  a11y,
}: {
  label: string;
  sub?: string;
  selected?: boolean;
  onPress: () => void;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
  a11y?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={(state) => {
        const s = state as typeof state & { hovered?: boolean; focused?: boolean };
        return [styles.row, (s.hovered || s.focused) && styles.rowHover, disabled && styles.disabled];
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      accessibilityLabel={a11y ?? label}
    >
      {leading}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.rowText, selected && styles.rowTextOn, danger && styles.rowDanger]} numberOfLines={1}>
          {label}
        </Text>
        {sub ? <Text style={styles.rowSub} numberOfLines={1}>{sub}</Text> : null}
      </View>
      {trailing}
      {selected ? <Ionicons name="checkmark" size={16} color={Colors.accentText} /> : null}
    </Pressable>
  );
}

export const popoverStyles = StyleSheet.create({
  pad: { padding: 10, gap: 6 },
  note: { fontSize: 12, color: Colors.textSecondary, paddingHorizontal: 12, paddingVertical: 6 },
  noteWarn: { color: Colors.danger },
});

const styles = StyleSheet.create({
  heading: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, minHeight: 34, paddingVertical: 4 },
  rowHover: { backgroundColor: Colors.background },
  rowText: { fontSize: 14, color: Colors.textPrimary },
  rowTextOn: { fontWeight: '700', color: Colors.accentText },
  rowSub: { fontSize: 12, color: Colors.textSecondary },
  rowDanger: { color: Colors.danger },
  disabled: { opacity: 0.4 },
});
