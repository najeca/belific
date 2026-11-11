import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { GRID_START_HOUR, PX_PER_HOUR, toTime } from '../../lib/timebox';
import { yToMinutes } from '../../lib/drag';
import { BLADE_HINT, BLADE_LABEL, FREE_TIME, allDaysOf, bladeCheck, bladeSpan, bladeTask, hostAt, snap5, type BladeHost, type BladeScope, type BladeState } from '../../lib/blade';
import type { CutEntry } from '../../lib/cuts';
import { generateId } from '../../lib/data';
import { addTask } from '../../lib/storage';
import { stack } from '../../lib/undoStack';
import type { Task } from '../../lib/types';
import { domNode } from './DragProvider';
import { getBlade, notifyChanged, setBlade, toggleBlade, useBlade } from './uiStore';
import { tipRef } from './tip';

// The scissors (PLAN_breaks_as_gaps P4, 3.35.0; lib/blade.ts). The button in the Calendar and Timebox headers and C
// (D2) turn them on. While on, every time column (the Calendar's Day and Week columns, the Timebox) has this layer
// on top: blocks do not open, drag or resize under it; the wheel and the middle button still scroll. Hover: a line
// across the column at the pointer, snapped to 5 minutes, with the time. Click the start, move, click the end (or
// press, drag, release): the preview gap follows, kept in the column it started in and inside the task under the
// first click; a cut that would leave a piece under the smallest piece setting is muted with the reason and cannot
// be made (D3). On a task that repeats, a small popover asks "This day only" or "All days of <task>" (All days
// focused, Enter picks it). Each cut is one Break row in one gesture, so one Ctrl+Z removes it. Esc drops a cut in
// progress or the popover; Esc again turns the scissors off. They stay on after each cut.

const topOf = (min: number) => ((min - GRID_START_HOUR * 60) / 60) * PX_PER_HOUR;

// What each drawn column knows for judging a cut (its breaks and the smallest piece), by day: a cut started in one
// Week column is judged there wherever the second click lands.
const columns = new Map<string, { breaks: CutEntry[]; cutMin: number }>();

// The cut itself: one Break, one gesture (one undo entry, "created Break").
export async function bladeCut(dayKey: string, span: [number, number], host: BladeHost | null, scope: BladeScope): Promise<void> {
  setBlade({ mode: 'armed' });
  stack.markGesture();
  const now = new Date().toISOString();
  await addTask({ id: generateId(), completed: false, createdAt: now, updatedAt: now, ...bladeTask(span, dayKey, scope, host?.task) } as Task);
  notifyChanged();
}

function finish(b: Extract<BladeState, { mode: 'cutting' }>, endMin: number, x: number, y: number): void {
  const span = bladeSpan(b.startMin, endMin, b.host);
  if (!span) return;
  const col = columns.get(b.dayKey);
  if (bladeCheck(span, b.host, col?.breaks ?? [], col?.cutMin ?? 30)) return;
  if (b.host?.repeats) setBlade({ mode: 'asking', dayKey: b.dayKey, span, host: b.host, x, y });
  else void bladeCut(b.dayKey, span, b.host, 'day');
}

export default function BladeLayer({ dayKey, hosts, breaks, cutMin, gridNode }: { dayKey: string; hosts: BladeHost[]; breaks: CutEntry[]; cutMin: number; gridNode: () => HTMLElement | null }) {
  const blade = useBlade();
  const [hover, setHover] = useState<number | null>(null);
  const [cur, setCur] = useState<number | null>(null);
  const live = useRef({ hosts, dayKey });
  live.current = { hosts, dayKey };
  columns.set(dayKey, { breaks, cutMin });
  const minAt = useCallback(
    (clientY: number): number | null => {
      const g = gridNode();
      return g ? snap5(yToMinutes(clientY, g.getBoundingClientRect().top)) : null;
    },
    [gridNode],
  );
  const cutting = blade.mode === 'cutting' && blade.dayKey === dayKey;
  // While a cut started here is open, the pointer anywhere (another Week column too) moves its end.
  useEffect(() => {
    if (!cutting) return;
    const move = (e: PointerEvent) => {
      const m = minAt(e.clientY);
      if (m !== null) setCur(m);
    };
    window.addEventListener('pointermove', move, true);
    return () => window.removeEventListener('pointermove', move, true);
  }, [cutting, minAt]);
  const cleanup = useRef<(() => void) | null>(null);
  const layerRef = useCallback(
    (instance: unknown) => {
      cleanup.current?.();
      cleanup.current = null;
      const el = domNode(instance);
      if (!el) return;
      el.style.cursor = 'crosshair';
      const move = (e: PointerEvent) => setHover(minAt(e.clientY));
      const leave = () => setHover(null);
      const down = (e: PointerEvent) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const m = minAt(e.clientY);
        if (m === null) return;
        const b = getBlade();
        if (b.mode === 'armed') {
          setBlade({ mode: 'cutting', dayKey: live.current.dayKey, startMin: m, host: hostAt(live.current.hosts, m) });
          setCur(m);
          // A press, a drag of more than 4 px and a release make the cut in one movement.
          const y0 = e.clientY;
          const up = (u: PointerEvent) => {
            window.removeEventListener('pointerup', up, true);
            const now = getBlade();
            const end = minAt(u.clientY);
            if (Math.abs(u.clientY - y0) > 4 && now.mode === 'cutting' && end !== null) finish(now, end, u.clientX, u.clientY);
          };
          window.addEventListener('pointerup', up, true);
        } else if (b.mode === 'cutting') finish(b, m, e.clientX, e.clientY);
      };
      // The click that follows a press must not reach anything under the layer.
      const click = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerleave', leave);
      el.addEventListener('pointerdown', down);
      el.addEventListener('click', click);
      cleanup.current = () => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerleave', leave);
        el.removeEventListener('pointerdown', down);
        el.removeEventListener('click', click);
      };
    },
    [minAt],
  );
  if (blade.mode === 'off') return null;
  const span = cutting && cur !== null ? bladeSpan(blade.startMin, cur, blade.host) : null;
  const reason = cutting && span ? bladeCheck(span, blade.host, breaks, cutMin) : null;
  const asking = blade.mode === 'asking' && blade.dayKey === dayKey ? blade : null;
  return (
    <>
      <View ref={layerRef as never} style={styles.layer} accessibilityLabel={BLADE_HINT} {...({ dataSet: { bladeLayer: dayKey } } as object)} />
      {hover !== null && !asking && (
        <View pointerEvents="none" style={[styles.line, { top: topOf(hover) }]} {...({ dataSet: { bladeLine: toTime(hover) } } as object)}>
          <Text style={styles.tag} {...({ dataSet: { mono: '1' } } as object)}>
            {toTime(hover)}
          </Text>
        </View>
      )}
      {span && (
        <View pointerEvents="none" style={[styles.preview, { top: topOf(span[0]), height: Math.max(4, topOf(span[1]) - topOf(span[0])) }, reason ? styles.previewOff : null]} {...({ dataSet: { bladePreview: `${toTime(span[0])}-${toTime(span[1])}`, ...(reason ? { bladeRefused: reason } : {}) } } as object)}>
          {reason ? <Text style={styles.reason}>{reason}</Text> : null}
        </View>
      )}
      {asking && <Ask state={asking} />}
    </>
  );
}

function Ask({ state }: { state: Extract<BladeState, { mode: 'asking' }> }) {
  const allRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    allRef.current?.focus();
  }, []);
  const pick = (scope: BladeScope) => void bladeCut(state.dayKey, state.span, state.host, scope);
  return (
    <View style={[styles.ask, { left: state.x + 8, top: state.y + 8 }]} accessibilityRole="menu" accessibilityLabel="Mark free time" {...({ dataSet: { bladeAsk: state.host.title } } as object)}>
      <Pressable onPress={() => pick('day')} style={styles.choice} accessibilityRole="button" accessibilityLabel="This day only" {...({ dataSet: { bladeChoice: 'day' } } as object)}>
        <Text style={styles.choiceText}>This day only</Text>
      </Pressable>
      <Pressable
        ref={((n: unknown) => { allRef.current = domNode(n); }) as never}
        onPress={() => pick('all')}
        style={[styles.choice, styles.choiceOn]}
        accessibilityRole="button"
        accessibilityLabel={allDaysOf(state.host.title)}
        {...({ dataSet: { bladeChoice: 'all' } } as object)}
      >
        <Text style={[styles.choiceText, styles.choiceTextOn]}>{allDaysOf(state.host.title)}</Text>
      </Pressable>
    </View>
  );
}

// Esc and Enter for the scissors, wherever the keyboard is (the home screen mounts it once). Esc: a cut in progress or
// the popover is dropped; with nothing in progress the scissors go off. Enter in the popover picks the focused choice
// (All days unless This day only has the keyboard).
export function useBladeKeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const b = getBlade();
      if (b.mode === 'off' || e.repeat) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setBlade(b.mode === 'armed' ? { mode: 'off' } : { mode: 'armed' });
      } else if (e.key === 'Enter' && b.mode === 'asking') {
        e.preventDefault();
        e.stopPropagation();
        const onDay = (document.activeElement as HTMLElement | null)?.getAttribute('data-blade-choice') === 'day';
        void bladeCut(b.dayKey, b.span, b.host, onDay ? 'day' : 'all');
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
}

// The toolbar button (Calendar and Timebox headers), pressed while the scissors are on. Shifts S2: it says what it does,
// "✂ Free time", not an icon on its own.
export function BladeButton({ size = 40 }: { size?: number }) {
  const on = useBlade().mode !== 'off';
  return (
    <Pressable
      ref={tipRef(BLADE_LABEL) as never}
      onPress={toggleBlade}
      style={[styles.btn, { height: size }, on && styles.btnOn]}
      accessibilityRole="button"
      accessibilityLabel={BLADE_LABEL}
      accessibilityState={{ selected: on }}
      {...({ 'aria-pressed': on, dataSet: { bladeButton: on ? 'on' : 'off' } } as object)}
    >
      <Ionicons name="cut-outline" size={18} color={on ? Colors.onAccent : Colors.textPrimary} />
      <Text style={[styles.btnText, on && styles.btnTextOn]}>{FREE_TIME}</Text>
    </Pressable>
  );
}

// The quiet hint while the scissors are on.
export function BladeHint() {
  const on = useBlade().mode !== 'off';
  if (!on) return null;
  return (
    <Text style={styles.hint} {...({ dataSet: { bladeHint: '1' } } as object)}>
      ✂ {BLADE_HINT}
    </Text>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 8 },
  line: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: Colors.accent, zIndex: 9 },
  tag: { position: 'absolute', left: 2, top: -10, paddingHorizontal: 4, height: 20, lineHeight: 20, fontSize: 14, fontWeight: '700', color: Colors.onAccent, backgroundColor: Colors.accent, overflow: 'hidden' },
  preview: {
    position: 'absolute',
    left: 0,
    right: 2,
    zIndex: 9,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: Colors.accent,
    backgroundImage: `repeating-linear-gradient(45deg, ${Colors.gapHatch} 0px, ${Colors.gapHatch} 1px, transparent 1px, transparent 6px)`,
    paddingHorizontal: 6,
    justifyContent: 'center',
  } as object,
  previewOff: { borderColor: Colors.textTertiary, opacity: 0.75 },
  reason: { fontSize: 14, fontWeight: '700', color: Colors.textSecondary, backgroundColor: Colors.surface, alignSelf: 'flex-start', paddingHorizontal: 4 },
  ask: { position: 'fixed' as 'absolute', zIndex: 1000, padding: 6, gap: 6, backgroundColor: Colors.surface, borderWidth: 2, borderColor: Colors.textPrimary, borderRadius: 0 },
  choice: { paddingHorizontal: 12, height: 34, justifyContent: 'center', borderRadius: 0, borderWidth: 2, borderColor: Colors.borderStrong },
  choiceOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  choiceText: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  choiceTextOn: { color: Colors.onAccent },
  btn: { flexDirection: 'row', gap: 6, paddingHorizontal: 10, borderRadius: 0, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.borderStrong },
  btnText: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  btnTextOn: { color: Colors.onAccent },
  btnOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  hint: { fontSize: 14, color: Colors.textSecondary, marginBottom: 6 },
});
