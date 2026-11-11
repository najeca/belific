import React, { useState, useSyncExternalStore } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors } from '../../lib/theme';
import { radius } from '../../lib/tokens';
import { formatMinutes } from '../../lib/timebox';
import { addInside, tickRow } from '../../lib/shiftActions';
import { ADD_INSIDE, DEFAULT_INSIDE_MIN, INSIDE_LENGTHS, allDaysOfShift, itemsText, shiftOnly, withItems, defaultStart, doneText, formCheck, rowMeta, shiftText, type InsideForm, type InsideScope, type ShiftInfo, type ShiftRow } from '../../lib/shifts';
import type { Task } from '../../lib/types';
import { DESKTOP_FONT_FAMILY } from './desktopFont';
import Popover, { Row, closePopover, openPopover } from './Popover';
import { RoundCheck } from './ui';
import { notifyChanged, openDetail } from './uiStore';

// Shifts S3 (PLAN_shifts): what a block with things inside it shows on its Kanban card and in its details window: the
// summary the grid's header has ("5h of 10h planned, 5h free"), a progress bar with "2 of 7 done", its rows (the blocks
// inside it and its to dos, each with a tick that works in place) and an "Add inside" button. Text is 14 px or more,
// nothing is red, and the only filled button is the form's "Add".

const SHOWN_ROWS = 6;

export function ShiftBody({ info, anchor, compact }: { info: ShiftInfo; anchor: () => HTMLElement | null; compact?: boolean }) {
  const [all, setAll] = useState(false);
  const rows = compact && !all ? info.rows.slice(0, SHOWN_ROWS) : info.rows;
  const more = info.rows.length - rows.length;
  const summary = shiftText(info);
  const pct = info.count > 0 ? Math.round((info.done / info.count) * 100) : 0;
  return (
    <View style={styles.body} {...({ dataSet: { shiftBody: info.task.id } } as object)}>
      {summary ? (
        <Text style={styles.summary} {...({ dataSet: { shiftSummaryText: summary } } as object)}>
          {summary}
        </Text>
      ) : null}
      {info.count > 0 ? (
        <View style={styles.progressRow} {...({ dataSet: { shiftProgress: `${info.done}/${info.count}` } } as object)}>
          <View style={styles.track} accessibilityRole="progressbar" accessibilityLabel={doneText(info.done, info.count)}>
            <View style={[styles.fill, { width: `${pct}%` as const }]} />
          </View>
          <Text style={styles.doneText}>{doneText(info.done, info.count)}</Text>
        </View>
      ) : null}
      {rows.map((r) => (
        <InsideRow key={r.key} info={info} row={r} />
      ))}
      {more > 0 ? (
        <Pressable onPress={() => setAll(true)} accessibilityRole="button" accessibilityLabel={`Show ${more} more`} style={styles.textBtn} {...({ dataSet: { shiftMore: String(more) } } as object)}>
          <Text style={styles.textBtnText}>Show {more} more</Text>
        </Pressable>
      ) : null}
      <AddInsideButton task={info.task} projected={info.projected} anchor={anchor} />
    </View>
  );
}

function InsideRow({ info, row }: { info: ShiftInfo; row: ShiftRow }) {
  const meta = rowMeta(row);
  const tick = () => void tickRow(info.task, info.projected, row).then(notifyChanged);
  return (
    <View style={styles.row} {...({ dataSet: { insideRow: row.key, insideDone: row.done ? '1' : '0' } } as object)}>
      <Pressable
        onPress={tick}
        style={styles.tick}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: row.done }}
        accessibilityLabel={row.done ? `Untick ${row.title}` : `Tick ${row.title}`}
        {...({ 'aria-checked': row.done, dataSet: { insideTick: row.key } } as object)}
      >
        <RoundCheck done={row.done} size={18} />
      </Pressable>
      {row.kind === 'timed' && row.full ? (
        <Pressable onPress={() => openDetail(row.full!.id)} style={styles.titleBtn} accessibilityRole="button" accessibilityLabel={`Open ${row.title}`} {...({ dataSet: { insideOpen: row.key } } as object)}>
          <Text style={[styles.rowTitle, row.done && styles.rowDone]} numberOfLines={2}>
            {row.title}
          </Text>
        </Pressable>
      ) : (
        <Text style={[styles.rowTitle, styles.titleBtn, row.done && styles.rowDone]} numberOfLines={2}>
          {row.title}
        </Text>
      )}
      {meta ? <Text style={styles.rowMeta}>{meta}</Text> : null}
    </View>
  );
}

// ---- Add inside ----

// The one open form: which shift, and where to anchor it. One form for the whole window (the card's button, the details'
// button and a block's right click menu all open it), mounted once by <AddInsideHost />.
interface Target {
  task: Task;
  projected: boolean;
  anchor: () => HTMLElement | null;
  nonce: number;
}
let target: Target | null = null;
let nonce = 0;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const FORM_ID = 'add-inside';

export function openAddInside(task: Task, projected: boolean, anchor: () => HTMLElement | null): void {
  nonce += 1;
  target = { task, projected, anchor, nonce };
  listeners.forEach((l) => l());
  openPopover(FORM_ID, anchor);
}

export function AddInsideButton({ task, projected, anchor }: { task: Task; projected: boolean; anchor: () => HTMLElement | null }) {
  const [node, setNode] = useState<HTMLElement | null>(null);
  return (
    <Pressable
      ref={((n: unknown) => setNode(n && typeof (n as HTMLElement).getBoundingClientRect === 'function' ? (n as HTMLElement) : null)) as never}
      onPress={() => openAddInside(task, projected, () => node ?? anchor())}
      style={styles.addBtn}
      accessibilityRole="button"
      accessibilityLabel={`${ADD_INSIDE} ${task.title}`}
      {...({ dataSet: { addInside: task.id } } as object)}
    >
      <Text style={styles.addBtnText}>+ {ADD_INSIDE}</Text>
    </Pressable>
  );
}

// The right click menu of a block: Open, Add inside. (A block in free time has its own menu, HostChips.tsx.)
export function ShiftMenu({ id, anchor, task, projected }: { id: string; anchor: () => HTMLElement | null; task: Task; projected: boolean }) {
  return (
    <Popover id={id} anchor={anchor} width={220} label={`${task.title} menu`}>
      <View style={styles.menu} {...({ dataSet: { shiftBlockMenu: task.id } } as object)}>
        <Row
          label="Open"
          onPress={() => {
            closePopover();
            openDetail(task.id);
          }}
          a11y={`Open ${task.title}`}
        />
        <Row
          label={ADD_INSIDE}
          onPress={() => {
            // The menu closes first; the form takes the same place.
            closePopover();
            openAddInside(task, projected, anchor);
          }}
          a11y={`${ADD_INSIDE} ${task.title}`}
        />
      </View>
    </Popover>
  );
}

export function AddInsideHost() {
  const t = useSyncExternalStore(subscribe, () => target, () => target);
  if (!t) return null;
  return (
    <Popover id={FORM_ID} anchor={t.anchor} width={360} maxHeight={560} label={`${ADD_INSIDE} ${t.task.title}`}>
      <AddInsideForm key={t.nonce} task={t.task} projected={t.projected} />
    </Popover>
  );
}

const domInput: React.CSSProperties = {
  height: 36,
  padding: '0 10px',
  borderRadius: 0,
  border: `2px solid ${Colors.borderStrong}`,
  background: Colors.background,
  color: Colors.textPrimary,
  fontSize: 14,
  fontFamily: DESKTOP_FONT_FAMILY,
  outlineColor: Colors.accent,
  boxSizing: 'border-box',
};

function AddInsideForm({ task, projected }: { task: Task; projected: boolean }) {
  const hasTime = !!task.startTime;
  const repeats = !!task.recurrence;
  const [f, setF] = useState<InsideForm>({ title: '', timed: false, start: defaultStart(task), length: DEFAULT_INSIDE_MIN, scope: repeats ? 'all' : 'day' });
  const check = formCheck(task, f);
  const set = (p: Partial<InsideForm>) => setF((cur) => ({ ...cur, ...p }));
  const submit = () => {
    if (!check.ok) return;
    closePopover(true);
    void addInside(task, projected, f).then(notifyChanged);
  };
  const lengths = INSIDE_LENGTHS.includes(f.length as (typeof INSIDE_LENGTHS)[number]) ? [...INSIDE_LENGTHS] : [...INSIDE_LENGTHS, f.length].sort((a, b) => a - b);
  return (
    <View style={styles.form} {...({ dataSet: { addInsideForm: task.id } } as object)}>
      <Text style={styles.formHead} accessibilityRole="header">
        {ADD_INSIDE} {task.title}
      </Text>
      <Text style={styles.label}>What is it?</Text>
      <input
        type="text"
        value={f.title}
        placeholder="For example: Lunch"
        aria-label="What is it?"
        data-add-inside-name="1"
        onChange={(e) => set({ title: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
        style={{ ...domInput, width: '100%' }}
      />
      <Text style={styles.label}>When?</Text>
      <Choice on={!f.timed} text="No time, just a to do" onPress={() => set({ timed: false })} id="todo" />
      <Choice on={f.timed} text="At a time" onPress={() => hasTime && set({ timed: true })} id="timed" disabled={!hasTime} />
      {!hasTime ? <Text style={styles.note}>{task.title} has no time yet, so only a to do can go inside it.</Text> : null}
      {f.timed ? (
        <View style={styles.timeRow}>
          <input
            type="time"
            step={300}
            value={f.start}
            aria-label="Time"
            data-add-inside-time="1"
            onChange={(e) => /^\d\d:\d\d$/.test(e.target.value) && set({ start: e.target.value })}
            style={{ ...domInput, width: 120 }}
          />
          <Text style={styles.label}>for</Text>
          <select value={f.length} aria-label="How long" data-add-inside-length="1" onChange={(e) => set({ length: Number(e.target.value) })} style={{ ...domInput, width: 120 }}>
            {lengths.map((m) => (
              <option key={m} value={m}>
                {formatMinutes(m)}
              </option>
            ))}
          </select>
        </View>
      ) : null}
      {f.timed && check.note ? (
        <View style={styles.noteRow} {...({ dataSet: { addInsideNote: '1' } } as object)}>
          <Text style={styles.note}>{check.note}</Text>
          {check.fit ? (
            <Pressable onPress={() => set({ start: check.fit!.start, length: check.fit!.length })} style={styles.textBtn} accessibilityRole="button" accessibilityLabel="Fit inside" {...({ dataSet: { addInsideFit: '1' } } as object)}>
              <Text style={styles.textBtnText}>Fit inside</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {repeats ? (
        <>
          <Text style={styles.label}>Repeat?</Text>
          <View style={styles.scopeRow}>
            <ScopeButton on={f.scope === 'day'} text="This day only" scope="day" onPress={() => set({ scope: 'day' })} />
            <ScopeButton on={f.scope === 'all'} text={allDaysOfShift(task.title)} scope="all" onPress={() => set({ scope: 'all' })} />
          </View>
        </>
      ) : null}
      <View style={styles.actions}>
        <Pressable onPress={() => closePopover(true)} style={styles.textBtn} accessibilityRole="button" accessibilityLabel="Cancel" {...({ dataSet: { addInsideCancel: '1' } } as object)}>
          <Text style={styles.textBtnText}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={submit}
          disabled={!check.ok}
          style={[styles.mainBtn, !check.ok && styles.mainBtnOff]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !check.ok }}
          accessibilityLabel="Add"
          {...({ dataSet: { addInsideSubmit: '1' } } as object)}
        >
          <Text style={styles.mainBtnText}>Add</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Choice({ on, text, onPress, id, disabled }: { on: boolean; text: string; onPress: () => void; id: string; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.choice, disabled && styles.off]}
      accessibilityRole="radio"
      accessibilityState={{ checked: on, disabled: !!disabled }}
      accessibilityLabel={text}
      {...({ 'aria-checked': on, dataSet: { addInsideWhen: id } } as object)}
    >
      <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
      <Text style={styles.choiceText}>{text}</Text>
    </Pressable>
  );
}

function ScopeButton({ on, text, scope, onPress }: { on: boolean; text: string; scope: InsideScope; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.scope, on && styles.scopeOn]} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={text} {...({ 'aria-checked': on, dataSet: { addInsideScope: scope } } as object)}>
      <Text style={[styles.scopeText, on && styles.scopeTextOn]} numberOfLines={2}>
        {text}
      </Text>
    </Pressable>
  );
}

// S4: deleting or skipping a shift that has things inside it asks once: the shift only, or the shift and its items.
// Plain words, both buttons visible, no red; Cancel keeps everything.
export function ShiftChoice({ verb, count, onPick, onCancel }: { verb: 'Delete' | 'Skip'; count: number; onPick: (withItems: boolean) => void; onCancel: () => void }) {
  return (
    <View style={styles.choiceBox} {...({ dataSet: { shiftChoice: verb.toLowerCase() } } as object)}>
      <Text style={styles.note}>This shift has {itemsText(count)} inside it. Its to dos always go with it.</Text>
      <Pressable onPress={() => onPick(false)} style={styles.addBtn} accessibilityRole="button" accessibilityLabel={shiftOnly(verb)} {...({ dataSet: { shiftChoicePick: 'only' } } as object)}>
        <Text style={styles.addBtnText}>{shiftOnly(verb)}</Text>
      </Pressable>
      <Pressable onPress={() => onPick(true)} style={styles.addBtn} accessibilityRole="button" accessibilityLabel={withItems(verb, count)} {...({ dataSet: { shiftChoicePick: 'all' } } as object)}>
        <Text style={styles.addBtnText}>{withItems(verb, count)}</Text>
      </Pressable>
      <Pressable onPress={onCancel} style={styles.textBtn} accessibilityRole="button" accessibilityLabel="Cancel" {...({ dataSet: { shiftChoicePick: 'cancel' } } as object)}>
        <Text style={styles.textBtnText}>Cancel</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  choiceBox: { gap: 8, padding: 12 },
  body: { gap: 6, marginTop: 8 },
  summary: { fontSize: 14, lineHeight: 19, fontWeight: '700', color: Colors.textPrimary },
  progressRow: { gap: 4 },
  track: { height: 6, borderRadius: 3, backgroundColor: Colors.border, overflow: 'hidden' },
  fill: { height: 6, backgroundColor: Colors.accent },
  doneText: { fontSize: 14, lineHeight: 18, color: Colors.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 30 },
  tick: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  titleBtn: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 14, lineHeight: 18, color: Colors.textPrimary },
  rowDone: { textDecorationLine: 'line-through', color: Colors.textSecondary },
  rowMeta: { fontSize: 14, color: Colors.textSecondary },
  textBtn: { minHeight: 30, paddingHorizontal: 8, justifyContent: 'center', alignSelf: 'flex-start' },
  textBtnText: { fontSize: 14, fontWeight: '700', color: Colors.accentText, textDecorationLine: 'underline' },
  addBtn: { alignSelf: 'flex-start', height: 34, paddingHorizontal: 12, justifyContent: 'center', borderRadius: radius.square, borderWidth: 2, borderColor: Colors.borderStrong },
  addBtnText: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  menu: { paddingVertical: 4 },
  form: { padding: 14, gap: 8 },
  formHead: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  label: { fontSize: 14, fontWeight: '700', color: Colors.textSecondary },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 },
  off: { opacity: 0.5 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: Colors.textPrimary, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: Colors.accent },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.accent },
  choiceText: { fontSize: 14, color: Colors.textPrimary },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 26 },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginLeft: 26 },
  note: { fontSize: 14, lineHeight: 19, color: Colors.textSecondary },
  scopeRow: { flexDirection: 'row', gap: 8 },
  scope: { flex: 1, minHeight: 36, paddingHorizontal: 10, paddingVertical: 4, justifyContent: 'center', borderRadius: radius.square, borderWidth: 2, borderColor: Colors.borderStrong },
  scopeOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  scopeText: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  scopeTextOn: { color: Colors.onAccent },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 4 },
  mainBtn: { height: 38, paddingHorizontal: 22, justifyContent: 'center', borderRadius: radius.square, backgroundColor: Colors.accent },
  mainBtnOff: { opacity: 0.45 },
  mainBtnText: { fontSize: 14, fontWeight: '700', color: Colors.onAccent },
});
