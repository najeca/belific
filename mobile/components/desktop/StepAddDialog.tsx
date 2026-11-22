// D4 of PLAN_desktop_parity (3.70.0): the phone's step by step add flow as a centred dialog (about 560 px) over the home.
// Same screens and rules as components/phone/StepAdd.tsx, through the same shared files: which screen follows is
// lib/stepFlow.ts, what is written is lib/stepAddActions.ts (screen 1's Next stores the task once, every later answer is
// an ordinary edit with the shared detailsPatches). Closing at any point keeps the task, as on the phone.
//
// Keyboard: focus starts in the text box; Enter is Next (Shift+Enter a new line on screen 1, Ctrl+Enter is Done on the
// last screen); Esc goes Back (on screen 1 it closes and keeps what was typed); Tab goes through the answers, then Back,
// Skip, Next and Close, and wraps; 1 to 3 pick the first three answers on screens 2 and 4 (when no field has the keys).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Colors } from '../../lib/theme';
import { addDays, dateKey, formatDayLabel, parseDateKey } from '../../lib/kanban';
import { DURATION_PRESETS, presetLabel } from '../../lib/duration';
import { labelColor } from '../../lib/labelColors';
import { loadLabels } from '../../lib/labels';
import { KEEP_AS_TEXT, previewText } from '../../lib/quickParse';
import { liveLists } from '../../lib/lists';
import { loadListsRaw, loadTasksRaw } from '../../lib/storage';
import { stepDraft, stepPatch, stepPhrase, stepStore } from '../../lib/stepAddActions';
import { ADD_PART, PARTS, PARTS_HINT, canHaveParts, partsFor } from '../../lib/parts';
import { addPart } from '../../lib/partActions';
import { datePatch, durationPatch, labelPatch, listPatch, notesPatch, timePatch, titlePatch } from '../../lib/detailsPatches';
import { STEP_QUESTION, STEPS, answeredBy, closedNote, nextStep, prevStep, stepLabel, type Step } from '../../lib/stepFlow';
import type { Project, Task, TaskList } from '../../lib/types';
import { closeOverlay, notifyChanged, showNotice } from './uiStore';
import { DESKTOP_FONT_FAMILY } from './desktopFont';

export interface StepAddWhere {
  listKey?: string;
  // A day to suggest on screen 2 (nothing is written for it until it is picked).
  suggestDay?: string;
}

const font = DESKTOP_FONT_FAMILY;
const css = {
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 60, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 90, background: Colors.scrim, fontFamily: font } as React.CSSProperties,
  card: { position: 'relative', width: 560, maxWidth: '92%', maxHeight: 'calc(100% - 120px)', overflowY: 'auto', borderRadius: 16, background: Colors.surface, border: `1px solid ${Colors.border}`, borderTop: `8px solid ${Colors.accent}`, padding: '14px 24px 18px', color: Colors.textPrimary, boxSizing: 'border-box' } as React.CSSProperties,
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 36 } as React.CSSProperties,
  dots: { display: 'flex', gap: 8, alignItems: 'center' } as React.CSSProperties,
  q: { margin: '12px 0 14px', fontSize: 26, lineHeight: '32px', fontWeight: 800, color: Colors.textPrimary } as React.CSSProperties,
  box: { width: '100%', boxSizing: 'border-box', minHeight: 88, padding: 12, borderRadius: 10, border: `1px solid ${Colors.borderStrong}`, background: Colors.background, color: Colors.textPrimary, fontSize: 17, lineHeight: '24px', fontFamily: font, resize: 'vertical', outlineColor: Colors.accent } as React.CSSProperties,
  field: { height: 40, padding: '0 10px', borderRadius: 10, border: `1px solid ${Colors.borderStrong}`, background: Colors.background, color: Colors.textPrimary, fontSize: 16, fontFamily: font, outlineColor: Colors.accent } as React.CSSProperties,
  chips: { display: 'flex', flexWrap: 'wrap', gap: 8 } as React.CSSProperties,
  section: { margin: '14px 0 6px', fontSize: 12, fontWeight: 700, letterSpacing: 0.5, color: Colors.textSecondary, textTransform: 'uppercase' } as React.CSSProperties,
  note: { margin: '8px 0 0', fontSize: 13, lineHeight: '18px', color: Colors.textSecondary } as React.CSSProperties,
  warn: { margin: '10px 0 0', fontSize: 14, lineHeight: '20px', color: Colors.textPrimary, padding: '8px 10px', borderRadius: 8, background: Colors.hostPill } as React.CSSProperties,
  foot: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, gap: 8 } as React.CSSProperties,
};

function chipStyle(on: boolean, dashed = false, disabled = false): React.CSSProperties {
  return { minHeight: 36, padding: '0 14px', borderRadius: 999, border: `1px ${dashed ? 'dashed' : 'solid'} ${on ? Colors.accent : Colors.borderStrong}`, background: on ? Colors.accent : Colors.surface, color: on ? Colors.onAccent : Colors.textPrimary, fontSize: 15, fontWeight: 600, fontFamily: font, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1, display: 'inline-flex', alignItems: 'center', gap: 6 };
}
const bigChoice = (on: boolean): React.CSSProperties => ({ ...chipStyle(on), borderRadius: 10, minHeight: 48, width: '100%', justifyContent: 'space-between', fontSize: 17, marginBottom: 8 });
const quietBtn: React.CSSProperties = { minHeight: 40, padding: '0 14px', borderRadius: 8, border: 'none', background: 'transparent', color: Colors.textSecondary, fontSize: 15, fontWeight: 600, fontFamily: font, cursor: 'pointer' };
const primaryBtn = (off: boolean): React.CSSProperties => ({ minHeight: 44, minWidth: 110, padding: '0 22px', borderRadius: 8, border: 'none', background: Colors.accent, color: Colors.onAccent, fontSize: 16, fontWeight: 700, fontFamily: font, cursor: off ? 'default' : 'pointer', opacity: off ? 0.4 : 1 });

export default function StepAddDialog({ where }: { where: StepAddWhere }) {
  const [step, setStep] = useState<Step>('what');
  const [task, setTask] = useState<Task | null>(null);
  const [text, setText] = useState('');
  const [plain, setPlain] = useState(false);
  const [answered, setAnswered] = useState<Set<Step>>(new Set());
  const [lists, setLists] = useState<TaskList[]>([]);
  const [labels, setLabels] = useState<Project[]>([]);
  const [notes, setNotes] = useState('');
  const [parts, setParts] = useState<Task[]>([]);
  const [partText, setPartText] = useState('');
  const [picking, setPicking] = useState(false);
  const [warn, setWarn] = useState<string | null>(null);
  const taskRef = useRef<Task | null>(null);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const root = useRef<HTMLDivElement>(null);
  const todayKey = dateKey(new Date());
  const tomorrowKey = dateKey(addDays(parseDateKey(todayKey), 1));

  const keep = useCallback((t: Task | null) => {
    taskRef.current = t;
    setTask(t);
  }, []);

  useEffect(() => {
    loadListsRaw().then(setLists).catch(() => {});
    loadLabels().then(setLabels).catch(() => {});
    const before = document.activeElement as HTMLElement | null;
    return () => {
      if (before && before.isConnected) before.focus({ preventScroll: true });
    };
  }, []);

  // Focus the first answer of each screen.
  useEffect(() => {
    const t = setTimeout(() => {
      const el = root.current?.querySelector<HTMLElement>('[data-first]') ?? root.current?.querySelector<HTMLElement>('input,textarea,button');
      el?.focus({ preventScroll: true });
    }, 30);
    return () => clearTimeout(t);
  }, [step]);

  const live = liveLists(lists);
  const liveLabels = labels.filter((l) => !l.deletedAt);

  // Every write after screen 1 runs one after another on the task as the one before left it.
  function patch(fields: Partial<Task> | null): Promise<boolean> {
    const run = chain.current.then(() => patchNow(fields));
    chain.current = run.catch(() => {});
    return run;
  }
  async function patchNow(fields: Partial<Task> | null): Promise<boolean> {
    const t = taskRef.current;
    if (!t || !fields || Object.keys(fields).length === 0) return true;
    const res = await stepPatch(t, fields);
    if ('refused' in res) {
      setWarn(res.refused);
      return false;
    }
    setWarn(null);
    keep(res.task);
    notifyChanged();
    return true;
  }

  const now = new Date();
  const phrase = !task ? stepPhrase(text, plain, now) : null;
  const understood = phrase && phrase.found ? previewText(phrase, now).split(' · ').filter(Boolean) : [];

  // Stores the task once (screen 1's Next, or closing with words typed); back on screen 1 later, it renames it.
  async function store(): Promise<Task | null> {
    const t = taskRef.current;
    if (t) {
      await patch(titlePatch(t, text));
      return taskRef.current;
    }
    const draft = stepDraft(text, phrase, where.listKey, now);
    if (!draft) return null;
    const res = await stepStore(draft.task);
    if ('refused' in res) {
      setWarn(res.refused);
      return null;
    }
    setWarn(null);
    keep(res.task);
    setText(draft.task.title);
    setAnswered(answeredBy(draft.fields));
    notifyChanged();
    return res.task;
  }

  const go = (to: Step | null, t: Task | null = taskRef.current) => {
    setPicking(false);
    setWarn(null);
    if (!to) {
      void finish(t);
      return;
    }
    if (to === 'more' && t) void loadTasksRaw().then((raw) => setParts(partsFor(raw, t)));
    setStep(to);
  };
  const forward = (t: Task | null = taskRef.current, done: ReadonlySet<Step> = answered) => go(t ? nextStep(step, t, done) : null, t);
  const back = () => {
    const t = taskRef.current;
    if (!t) return;
    const to = prevStep(step, t);
    if (to) go(to, t);
  };
  async function next() {
    if (step !== 'what') return forward();
    const fresh = !taskRef.current;
    const t = await store();
    if (t) forward(t, fresh ? answeredBy(t) : answered);
  }

  // Closing keeps the task as it is: words typed on screen 1 are stored, notes typed on the last screen are kept.
  async function finish(t: Task | null = taskRef.current) {
    let done = t;
    await chain.current;
    if (step === 'what' && text.trim()) done = await store();
    else if (step === 'more' && done) {
      await patch(notesPatch(done, notes));
      done = taskRef.current;
    }
    const listName = done?.listKey ? live.find((l) => l.key === done.listKey)?.name : undefined;
    const note = closedNote(done, listName);
    closeOverlay();
    if (note) showNotice(note);
  }

  const answer = async (fields: Partial<Task>) => {
    if (await patch(fields)) forward();
  };

  async function setTime(time: string | undefined) {
    const t = taskRef.current;
    if (!t) return;
    const res = timePatch(t, time);
    if ('note' in res) {
      setWarn(res.note);
      return;
    }
    await patch(res.fields);
  }
  async function clearTime(reminder: boolean) {
    await setTime(undefined);
    if (reminder) await patch(durationPatch(undefined));
  }
  async function addOnePart() {
    const t = taskRef.current;
    if (!t) return;
    const made = await addPart(t, partText);
    if (!made) return;
    setPartText('');
    setParts(partsFor(await loadTasksRaw(), t));
    notifyChanged();
  }

  const chip = (label: string, on: boolean, run: () => void, data: string, extra: { first?: boolean; dot?: string; a11y?: string; disabled?: boolean; dashed?: boolean } = {}) => (
    <button
      key={data}
      type="button"
      onClick={run}
      disabled={extra.disabled}
      aria-pressed={on}
      aria-label={extra.a11y ?? label}
      style={chipStyle(on, extra.dashed, extra.disabled)}
      data-step-chip={data}
      {...(extra.first ? { 'data-first': '1' } : {})}
    >
      {extra.dot && !on ? <span style={{ width: 10, height: 10, borderRadius: 5, background: extra.dot, display: 'inline-block' }} /> : null}
      {label}
    </button>
  );
  const choice = (label: string, on: boolean, run: () => void, data: string, key: string, first = false, hint?: string) => (
    <button key={data} type="button" onClick={run} aria-pressed={on} style={bigChoice(on)} data-step-choice={data} {...(first ? { 'data-first': '1' } : {})}>
      <span>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, opacity: 0.8 }}>{hint ? `${hint}  ` : ''}{key}</span>
    </button>
  );

  // ---- the screens ----
  const suggest = where.suggestDay;
  const whenScreen = (t: Task) => {
    const other = suggest && suggest !== todayKey && suggest !== tomorrowKey ? suggest : undefined;
    const tag = (k: string) => (suggest === k && t.dueDate !== k ? 'Suggested' : undefined);
    const custom = !!t.dueDate && t.dueDate !== todayKey && t.dueDate !== tomorrowKey;
    return (
      <>
        {other ? choice(formatDayLabel(other), t.dueDate === other, () => void answer(datePatch(other)), 'suggested', '', false, 'Suggested') : null}
        {choice('Today', t.dueDate === todayKey, () => void answer(datePatch(todayKey)), 'today', '1', !other, tag(todayKey))}
        {choice('Tomorrow', t.dueDate === tomorrowKey, () => void answer(datePatch(tomorrowKey)), 'tomorrow', '2', false, tag(tomorrowKey))}
        {choice('Pick a date', custom || picking, () => setPicking((v) => !v), 'pick', '3', false, custom ? formatDayLabel(t.dueDate as string) : undefined)}
        {picking || custom ? (
          <input
            type="date"
            value={t.dueDate ?? ''}
            min={undefined}
            onChange={(e) => {
              if (e.target.value) void answer(datePatch(e.target.value));
            }}
            style={{ ...css.field, marginBottom: 8 }}
            aria-label="Pick a date"
            data-step-date="1"
            {...(picking ? { 'data-first': '1' } : {})}
          />
        ) : null}
        {t.dueDate ? (
          <div>
            <button type="button" style={{ ...quietBtn, textDecoration: 'underline', padding: 0 }} onClick={() => void patch(datePatch(undefined))} data-step-nodate="1">
              No date, keep it for anytime
            </button>
          </div>
        ) : null}
      </>
    );
  };

  const timeScreen = (t: Task) => {
    const reminder = t.durationMinutes === 0;
    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }} data-step-time={t.startTime ?? ''}>
          <input type="time" value={t.startTime ?? ''} onChange={(e) => void setTime(e.target.value || undefined)} style={css.field} aria-label="Time" data-first="1" data-step-timefield="1" />
          {t.startTime ? chip('No time', false, () => void clearTime(reminder), 'notime') : null}
        </div>
        <div style={css.section}>How long</div>
        <div style={css.chips}>
          {DURATION_PRESETS.map((m) => chip(presetLabel(m), t.durationMinutes === m, () => void patch(durationPatch(m)), `len-${m}`, { a11y: `Length ${presetLabel(m)}` }))}
        </div>
        <div style={css.section}>Or</div>
        <div style={css.chips}>
          {chip('Just a reminder', reminder, () => void patch(durationPatch(reminder ? undefined : 0)), 'reminder', { disabled: !t.startTime, a11y: 'Just a reminder, no length' })}
        </div>
        <p style={css.note}>{t.startTime ? 'Just a reminder has no length: it only reminds you at its time.' : 'Pick a time first to make it just a reminder.'}</p>
      </>
    );
  };

  const whereScreen = (t: Task) => (
    <>
      <div style={{ ...css.section, marginTop: 0 }}>List</div>
      <div style={css.chips}>
        {chip('🧠 Brain Dump', !t.listKey, () => void patch(listPatch(undefined)), 'list-brain-dump', { first: true })}
        {live.map((l) => chip(`${l.emoji ? `${l.emoji} ` : ''}${l.name}`, t.listKey === l.key, () => void patch(listPatch(l.key)), `list-${l.key}`))}
      </div>
      <div style={css.section}>Label</div>
      <div style={css.chips}>
        {chip('No label', !t.projectKey, () => void patch(labelPatch(undefined)), 'label-none')}
        {liveLabels.map((l) => chip(`${l.emoji ? `${l.emoji} ` : ''}${l.name}`, t.projectKey === l.key, () => void patch(labelPatch(t.projectKey === l.key ? undefined : l.key)), `label-${l.key}`, { dot: labelColor(l.colorKey)?.edge }))}
      </div>
      <p style={css.note}>New lists and labels are made from the left pane and the Labels page.</p>
    </>
  );

  const moreScreen = (t: Task) => (
    <>
      <div style={{ ...css.section, marginTop: 0 }}>Notes</div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => void patch(notesPatch(t, notes))}
        placeholder="Anything to remember"
        style={{ ...css.box, minHeight: 80 }}
        aria-label="Notes"
        data-first="1"
        data-step-notes="1"
      />
      {canHaveParts(t) ? (
        <>
          <div style={css.section}>{PARTS}</div>
          <p style={{ ...css.note, marginTop: 0 }}>{PARTS_HINT}</p>
          {parts.map((p) => (
            <div key={p.id} style={{ fontSize: 15, padding: '4px 0' }} data-step-part={p.title}>• {p.title}</div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input
              value={partText}
              onChange={(e) => setPartText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                  void addOnePart();
                }
              }}
              placeholder="Name of the smaller task"
              style={{ ...css.field, flex: 1 }}
              aria-label={`Add a smaller task to ${t.title}`}
              data-step-partinput="1"
            />
            <button type="button" style={chipStyle(false)} onClick={() => void addOnePart()} aria-label={ADD_PART} data-step-addpart="1">{ADD_PART}</button>
          </div>
        </>
      ) : null}
    </>
  );

  // ---- keys ----
  const onKeyDown = (e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement;
    const tag = target.tagName;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (step === 'what' || !taskRef.current) void finish();
      else back();
      return;
    }
    if (e.key === 'Tab') {
      const list = Array.from(root.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input,textarea,[tabindex="0"]') ?? []).filter((x) => x.offsetParent !== null);
      if (list.length === 0) return;
      const first = list[0];
      const lastEl = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        first.focus();
      }
      return;
    }
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      if (tag === 'BUTTON') return; // a focused button does its own thing
      if (tag === 'TEXTAREA') {
        if (step === 'what') {
          if (e.shiftKey) return;
        } else if (!(e.ctrlKey || e.metaKey)) return; // Notes: Enter is a new line, Ctrl+Enter is Done
      }
      if (target.getAttribute('data-step-partinput')) return;
      e.preventDefault();
      if (canNext) void (last ? finish() : next());
      return;
    }
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey && /^[1-3]$/.test(e.key) && task) {
      const n = Number(e.key);
      if (step === 'when') {
        e.preventDefault();
        if (n === 1) void answer(datePatch(todayKey));
        else if (n === 2) void answer(datePatch(tomorrowKey));
        else setPicking(true);
      } else if (step === 'where') {
        const keys = [undefined, ...live.map((l) => l.key)];
        if (n - 1 < keys.length) {
          e.preventDefault();
          void patch(listPatch(keys[n - 1]));
        }
      }
    }
  };

  const last = step === 'more';
  const canNext = step === 'what' ? !!text.trim() : true;
  return (
    <div style={css.scrim} onMouseDown={(e) => { if (e.target === e.currentTarget) void finish(); }} data-step-scrim="1">
      <div ref={root} role="dialog" aria-modal="true" aria-label="Add a task" style={css.card} onKeyDown={onKeyDown} data-step-add={step}>
        <div style={css.head}>
          <div style={css.dots} role="progressbar" aria-label={stepLabel(step)} data-step-dots={stepLabel(step)}>
            {STEPS.map((x) => (
              <span key={x} style={{ height: 8, width: x === step ? 20 : 8, borderRadius: 4, background: x === step ? Colors.accent : Colors.borderStrong, display: 'inline-block' }} />
            ))}
            <span style={{ marginLeft: 8, fontSize: 13, color: Colors.textSecondary }}>{stepLabel(step)}</span>
          </div>
        </div>
        <h2 style={css.q}>{STEP_QUESTION[step]}</h2>
        {step === 'what' ? (
          <>
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (!e.target.value.trim()) setPlain(false);
              }}
              placeholder="Type anything: Call the dentist tomorrow 3pm"
              style={css.box}
              aria-label="What's on your mind?"
              data-first="1"
              data-step-text="1"
            />
            {understood.length > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 10 }} data-phrase-chips={String(understood.length)}>
                {understood.map((u) => (
                  <span key={u} style={{ ...chipStyle(true), cursor: 'default' }}>{u}</span>
                ))}
                <button type="button" style={{ ...quietBtn, textDecoration: 'underline' }} onClick={() => setPlain(true)} data-step-keep="1">{KEEP_AS_TEXT}</button>
              </div>
            ) : null}
            <p style={css.note}>It is saved as soon as you press Next. The rest is up to you.</p>
          </>
        ) : null}
        {step === 'when' && task ? whenScreen(task) : null}
        {step === 'time' && task ? timeScreen(task) : null}
        {step === 'where' && task ? whereScreen(task) : null}
        {step === 'more' && task ? moreScreen(task) : null}
        {warn ? <div style={css.warn} role="alert" data-step-warn="1">{warn}</div> : null}
        <div style={css.foot}>
          {step === 'what' ? <span /> : <button type="button" style={quietBtn} onClick={back} aria-label="Back" data-step-back="1">Back</button>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {step !== 'what' && !last ? <button type="button" style={quietBtn} onClick={() => forward()} aria-label="Skip" data-step-skip="1">Skip</button> : null}
            <button type="button" style={primaryBtn(!canNext)} disabled={!canNext} onClick={() => void (last ? finish() : next())} aria-label={last ? 'Done' : 'Next'} data-step-next={last ? 'done' : 'next'}>
              {last ? 'Done' : 'Next'}
            </button>
            <button type="button" style={quietBtn} onClick={() => void finish()} aria-label="Close, keep the task" data-step-close="1">Close</button>
          </div>
        </div>
        <p style={{ ...css.note, marginTop: 10 }}>Enter is Next. Esc goes back (on the first screen it closes and keeps the task).</p>
      </div>
    </div>
  );
}
