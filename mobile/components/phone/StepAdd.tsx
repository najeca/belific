// Phase 1 of PLAN_phone_stepflow (3.59.0): the step by step add flow the round + opens on the phone. One question per
// screen, with Skip, Back and small progress dots; the rules (which screen follows, what a closed flow says) are in
// lib/stepFlow.ts. Screen 1's Next stores the task at once (a title, no Day: Anytime); every later answer updates that
// stored task through the usual save path (taskOps patches with the shared detailsPatches, and the break refusal the
// details card uses), so sync, the reminders and the desktop see an ordinary edit. Closing at any point keeps the task as
// it is. No priority anywhere here. The whole card (TaskDetails) stays for Edit and for a tap on an empty Calendar slot.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { radius, type ColorTokens } from '../../lib/tokens';
import { addDays, dateKey, formatDayLabel, parseDateKey } from '../../lib/kanban';
import { DURATION_PRESETS, presetLabel } from '../../lib/duration';
import { LABEL_COLORS, colorClash, labelColor, nextColorKey } from '../../lib/labelColors';
import { createLabel, loadLabels } from '../../lib/labels';
import { LIST_PRESETS, PRESET_HINT, availableLabelPresets } from '../../lib/presets';
import { KEEP_AS_TEXT, previewText } from '../../lib/quickParse';
import { createListState, liveLists, takenEmojis } from '../../lib/lists';
import { createList } from '../../lib/taskCommands';
import { loadListsRaw, loadTasksRaw } from '../../lib/storage';
import { stepDraft, stepPatch, stepPhrase, stepStore } from '../../lib/stepAddActions';
import { ADD_PART, PARTS, PARTS_HINT, canHaveParts, partsFor } from '../../lib/parts';
import { addPart } from '../../lib/partActions';
import { datePatch, durationPatch, labelPatch, listPatch, notesPatch, timePatch, titlePatch } from '../../lib/detailsPatches';
import { STEP_QUESTION, STEPS, answeredBy, closedNote, nextStep, prevStep, stepLabel, type Step } from '../../lib/stepFlow';
import type { Project, Task, TaskList } from '../../lib/types';
import { useStyles, useTheme } from './theme';
import { useReducedMotion } from './touch';
import { MonthGrid } from './MonthGrid';
import { TimeField } from './TimeField';
import { inter, newsreader, type } from './type';
import { LabelDot, RoundCheck } from './ui';
import { EmojiPick } from './EmojiPick';

// Where the + was pressed: a list to fill in at once (the Tasks tab), and a day to suggest on screen 2 (Today: today; the
// Calendar: the day shown). Nothing is written for the suggestion until it is tapped.
export interface StepAddTarget {
  listKey?: string;
  suggestDay?: string;
}

const make = (c: ColorTokens) => ({
  screen: { flex: 1, backgroundColor: c.background, borderTopWidth: 8, borderTopColor: c.accent },
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: 8, paddingBottom: 6 },
  close: { width: 48, height: 48, alignItems: 'center' as const, justifyContent: 'center' as const },
  dots: { flexDirection: 'row' as const, gap: 8, paddingHorizontal: 12, minHeight: 44, alignItems: 'center' as const },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.borderStrong },
  dotOn: { backgroundColor: c.accent, width: 20 },
  body: { paddingHorizontal: 20, paddingTop: 8, gap: 14 },
  question: { ...newsreader(600), fontSize: 30, lineHeight: 36, letterSpacing: -0.3, color: c.textPrimary, marginBottom: 6 },
  big: { ...inter(500), fontSize: 20, lineHeight: 28, color: c.textPrimary, minHeight: 160, padding: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.surface, textAlignVertical: 'top' as const },
  notes: { ...inter(400), fontSize: 17, lineHeight: 24, color: c.textPrimary, minHeight: 120, padding: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.surface, textAlignVertical: 'top' as const },
  choice: { minHeight: 56, paddingHorizontal: 18, borderRadius: radius.lg, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.surface, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
  choiceOn: { backgroundColor: c.accent, borderColor: c.accent },
  choiceText: { ...inter(600), fontSize: 18, color: c.textPrimary },
  choiceTextOn: { color: c.onAccent },
  hint: { ...inter(500), fontSize: 14, color: c.textSecondary },
  hintOn: { color: c.onAccent },
  section: { ...type.section, color: c.textSecondary, marginTop: 8 },
  chips: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: radius.full, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.surface, flexDirection: 'row' as const, gap: 6, alignItems: 'center' as const, justifyContent: 'center' as const, maxWidth: '100%' as const },
  chipDashed: { borderStyle: 'dashed' as const },
  chipOn: { backgroundColor: c.accent, borderColor: c.accent },
  chipText: { ...inter(600), fontSize: 15, color: c.textPrimary },
  chipTextOn: { color: c.onAccent },
  note: { ...inter(400), fontSize: 14, lineHeight: 20, color: c.textSecondary },
  foot: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.background },
  quiet: { minHeight: 48, minWidth: 72, paddingHorizontal: 12, alignItems: 'center' as const, justifyContent: 'center' as const },
  quietText: { ...inter(600), fontSize: 17, color: c.textSecondary },
  primary: { minHeight: 52, minWidth: 120, paddingHorizontal: 26, borderRadius: radius.md, backgroundColor: c.accent, alignItems: 'center' as const, justifyContent: 'center' as const },
  primaryOff: { opacity: 0.4 },
  primaryText: { ...inter(700), fontSize: 18, color: c.onAccent },
  partRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, minHeight: 44 },
  partTitle: { ...inter(500), fontSize: 16, color: c.textPrimary, flex: 1 },
  partInput: { flex: 1, ...inter(400), fontSize: 16, color: c.textPrimary, minHeight: 48, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.surface },
  partBtn: { minHeight: 48, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1, borderColor: c.borderStrong, alignItems: 'center' as const, justifyContent: 'center' as const },
  warn: { ...inter(500), fontSize: 14, lineHeight: 20, color: c.textPrimary },
  // 3.59.1: the small New list / New label form under its group.
  form: { gap: 10, padding: 12, borderRadius: radius.lg, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.surface },
  formInput: { ...inter(500), fontSize: 17, color: c.textPrimary, minHeight: 48, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.pane },
  swatches: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 4 },
  swatch: { width: 44, height: 44, alignItems: 'center' as const, justifyContent: 'center' as const, borderRadius: 22 },
  swatchDot: { width: 28, height: 28, borderRadius: 14 },
  swatchOn: { borderWidth: 2, borderColor: c.textPrimary },
  formRow: { flexDirection: 'row' as const, gap: 8, justifyContent: 'flex-end' as const, alignItems: 'center' as const },
});

export function StepAdd({ target, onClose, onChanged }: { target: StepAddTarget | null; onClose: (note: string | null) => void; onChanged: () => void }) {
  const s = useStyles(make);
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
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
  // 3.59.1: the inline New list / New label form on screen 4 (a name, an emoji for a list, a colour for a label).
  const [making, setMaking] = useState<'list' | 'label' | null>(null);
  const [newName, setNewName] = useState('');
  const [newEmoji, setNewEmoji] = useState('');
  const [newColor, setNewColor] = useState('');
  const [makeNote, setMakeNote] = useState<string | null>(null);
  const taskRef = useRef<Task | null>(null);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const inputRef = useRef<TextInput>(null);
  const todayKey = dateKey(new Date());
  const tomorrowKey = dateKey(addDays(parseDateKey(todayKey), 1));

  const keep = useCallback((t: Task | null) => {
    taskRef.current = t;
    setTask(t);
  }, []);

  useEffect(() => {
    if (!target) return;
    setStep('what');
    keep(null);
    setText('');
    setPlain(false);
    setAnswered(new Set());
    setNotes('');
    setParts([]);
    setPartText('');
    setPicking(false);
    setWarn(null);
    setMaking(null);
    loadListsRaw().then(setLists).catch(() => {});
    loadLabels().then(setLabels).catch(() => {});
    // The sheet's own focus handling can win a race with autoFocus: ask once more when it has settled.
    const later = setTimeout(() => inputRef.current?.focus(), 350);
    return () => clearTimeout(later);
  }, [target, keep]);

  if (!target) return null;
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
    // A day, a time or a length that would leave the task sticking out of a break is refused, as in the details (3.11.0).
    // D1 (3.66.0): the write is lib/stepAddActions.ts, shared with the desktop.
    const res = await stepPatch(t, fields);
    if ('refused' in res) {
      setWarn(res.refused);
      return false;
    }
    setWarn(null);
    keep(res.task);
    onChanged();
    return true;
  }

  // Screen 1: the desktop's phrase reader ("Dentist tomorrow 3pm 30m") shows what it understood as chips; Next stores it.
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
    // D1 (3.66.0): what is stored is lib/stepAddActions.ts, shared with the desktop.
    const draft = stepDraft(text, phrase, target?.listKey, now);
    if (!draft) return null;
    const { fields } = draft;
    const title = draft.task.title;
    const res = await stepStore(draft.task);
    if ('refused' in res) {
      setWarn(res.refused);
      return null;
    }
    setWarn(null);
    const made = res.task;
    keep(made);
    setText(title);
    setAnswered(answeredBy(fields));
    onChanged();
    return made;
  }

  const go = (to: Step | null, t: Task | null = taskRef.current) => {
    setPicking(false);
    setMaking(null);
    setWarn(null);
    if (!to) {
      void finish(t);
      return;
    }
    if (to === 'more' && t) void loadTasksRaw().then((raw) => setParts(partsFor(raw, t)));
    setStep(to);
  };
  // `done`: the screens a phrase answered, passed straight from screen 1's store (the state is not updated yet there).
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
    if (step === 'what' && text.trim()) done = await store();
    else if (step === 'more' && done) {
      await patch(notesPatch(done, notes));
      done = taskRef.current;
    }
    const listName = done?.listKey ? live.find((l) => l.key === done.listKey)?.name : undefined;
    onClose(closedNote(done, listName));
  }

  const answer = async (fields: Partial<Task>) => {
    if (await patch(fields)) forward();
  };

  // ---- the screens ----
  const choice = (label: string, on: boolean, run: () => void, data: string, hint?: string) => (
    <Pressable key={data} onPress={run} style={({ pressed }) => [s.choice, on && s.choiceOn, pressed && !on && { backgroundColor: c.hover }]} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={hint ? `${label}, ${hint}` : label} {...({ dataSet: { stepChoice: data } } as object)}>
      <Text style={[s.choiceText, on && s.choiceTextOn]}>{label}</Text>
      {hint ? <Text style={[s.hint, on && s.hintOn]}>{hint}</Text> : null}
    </Pressable>
  );
  const chip = (label: string, on: boolean, run: () => void, data: Record<string, string>, opts: { dot?: string; dashed?: boolean; a11y?: string; disabled?: boolean } = {}) => (
    <Pressable key={Object.values(data).join('|')} onPress={run} disabled={opts.disabled} style={[s.chip, opts.dashed && s.chipDashed, on && s.chipOn, opts.disabled && { opacity: 0.4 }]} accessibilityRole="button" accessibilityState={{ selected: on, disabled: !!opts.disabled }} accessibilityLabel={opts.a11y ?? label} {...({ dataSet: data } as object)}>
      {opts.dot && !on ? <LabelDot color={opts.dot} size={12} /> : null}
      <Text style={[s.chipText, on && s.chipTextOn, { flexShrink: 1 }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );

  function whatScreen() {
    return (
      <>
        <TextInput
          ref={inputRef}
          style={s.big}
          value={text}
          onChangeText={setText}
          multiline
          blurOnSubmit
          returnKeyType="next"
          onSubmitEditing={() => void next()}
          autoFocus
          placeholder="Type anything: Call the dentist tomorrow 3pm"
          placeholderTextColor={c.textTertiary}
          accessibilityLabel="What's on your mind?"
          {...({ dataSet: { stepText: '1' } } as object)}
        />
        {understood.length > 0 ? (
          <View style={{ gap: 8 }} {...({ dataSet: { phraseChips: String(understood.length) } } as object)}>
            <View style={s.chips}>
              {understood.map((u) => (
                <View key={u} style={[s.chip, s.chipOn]}>
                  <Text style={[s.chipText, s.chipTextOn]}>{u}</Text>
                </View>
              ))}
            </View>
            <Pressable onPress={() => setPlain(true)} style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }} accessibilityRole="button" accessibilityLabel={KEEP_AS_TEXT} {...({ dataSet: { keepPlain: '1' } } as object)}>
              <Text style={[s.chipText, { textDecorationLine: 'underline' }]}>{KEEP_AS_TEXT}</Text>
            </Pressable>
          </View>
        ) : null}
        <Text style={s.note}>It is saved as soon as you tap Next. The rest is up to you.</Text>
      </>
    );
  }

  function whenScreen(t: Task) {
    const suggest = target?.suggestDay;
    const other = suggest && suggest !== todayKey && suggest !== tomorrowKey ? suggest : undefined;
    const tag = (key: string) => (suggest === key && t.dueDate !== key ? 'Suggested' : undefined);
    return (
      <>
        {other ? choice(formatDayLabel(other), t.dueDate === other, () => void answer(datePatch(other)), 'suggested', tag(other)) : null}
        {choice('Today', t.dueDate === todayKey, () => void answer(datePatch(todayKey)), 'today', tag(todayKey))}
        {choice('Tomorrow', t.dueDate === tomorrowKey, () => void answer(datePatch(tomorrowKey)), 'tomorrow', tag(tomorrowKey))}
        {choice('Pick a date', !!t.dueDate && t.dueDate !== todayKey && t.dueDate !== tomorrowKey && t.dueDate !== other, () => setPicking((v) => !v), 'pick', t.dueDate && t.dueDate !== todayKey && t.dueDate !== tomorrowKey && t.dueDate !== other ? formatDayLabel(t.dueDate) : undefined)}
        {picking ? <MonthGrid value={t.dueDate ?? suggest} todayKey={todayKey} onPick={(k) => void answer(datePatch(k))} /> : null}
        {t.dueDate ? (
          <Pressable onPress={() => void patch(datePatch(undefined))} style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }} accessibilityRole="button" accessibilityLabel="No date" {...({ dataSet: { stepNoDate: '1' } } as object)}>
            <Text style={[s.chipText, { textDecorationLine: 'underline' }]}>No date, keep it for anytime</Text>
          </Pressable>
        ) : null}
      </>
    );
  }

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
  // No time: a quick reminder without its time would be a plain task with no length, so its 0 goes too.
  async function clearTime(reminder: boolean) {
    await setTime(undefined);
    if (reminder) await patch(durationPatch(undefined));
  }

  function timeScreen(t: Task) {
    const reminder = t.durationMinutes === 0;
    return (
      <>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }} {...({ dataSet: { stepTime: t.startTime ?? '' } } as object)}>
          <TimeField value={t.startTime} onChange={(v) => void setTime(v)} a11y="Time" />
          {t.startTime ? chip('No time', false, () => void clearTime(reminder), { stepNoTime: '1' }) : null}
        </View>
        <Text style={s.section}>How long</Text>
        <View style={s.chips}>
          {DURATION_PRESETS.map((m) => chip(presetLabel(m), t.durationMinutes === m, () => void patch(durationPatch(m)), { stepLength: String(m) }, { a11y: `Length ${presetLabel(m)}` }))}
        </View>
        <Text style={s.section}>Or</Text>
        <View style={s.chips}>
          {chip('Just a reminder', reminder, () => void patch(durationPatch(reminder ? undefined : 0)), { stepReminder: '1' }, { disabled: !t.startTime, a11y: 'Just a reminder, no length' })}
        </View>
        <Text style={s.note}>{t.startTime ? 'Just a reminder has no length: it only reminds you at its time.' : 'Pick a time first to make it just a reminder.'}</Text>
      </>
    );
  }

  async function addListPreset(name: string, emoji: string) {
    const res = await createList(name, emoji);
    setLists(await loadListsRaw());
    if (!('problem' in res)) await patch(listPatch(res.list.key));
  }
  async function addLabelPreset(name: string, emoji: string, colorKey: string) {
    const res = await createLabel(name, emoji, colorKey, true);
    setLabels(await loadLabels());
    if (res) await patch(labelPatch(res.label.key));
  }

  // 3.59.1: + New list and + New label at the end of each group open a small form here, with the shared create paths
  // (createList: the name and emoji rules; createLabel: a colour no other label has); the new one is chosen at once.
  function startMaking(kind: 'list' | 'label') {
    setMaking(making === kind ? null : kind);
    setNewName('');
    setNewEmoji('');
    setNewColor(kind === 'label' ? nextColorKey(liveLabels, true) : '');
    setMakeNote(null);
  }
  async function makeNew() {
    if (making === 'list') {
      const res = await createList(newName, newEmoji || undefined);
      if ('problem' in res) {
        setMakeNote(res.problem);
        return;
      }
      setLists(await loadListsRaw());
      setMaking(null);
      await patch(listPatch(res.list.key));
      return;
    }
    if (making === 'label') {
      const res = await createLabel(newName, undefined, newColor || undefined, true);
      if (!res) {
        setMakeNote('Give the label a name.');
        return;
      }
      setLabels(await loadLabels());
      setMaking(null);
      await patch(labelPatch(res.label.key));
    }
  }
  function makeForm(kind: 'list' | 'label') {
    const listCheck = kind === 'list' ? createListState(live, newName) : null;
    const ok = kind === 'list' ? !!listCheck?.enabled : !!newName.trim();
    const why = makeNote ?? (kind === 'list' && newName.trim() ? listCheck?.why : null);
    return (
      <View style={s.form} {...({ dataSet: { stepMake: kind } } as object)}>
        <TextInput
          style={s.formInput}
          value={newName}
          onChangeText={(v) => {
            setNewName(v);
            setMakeNote(null);
          }}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={() => {
            if (ok) void makeNew();
          }}
          placeholder={kind === 'list' ? 'Name of the list' : 'Name of the label'}
          placeholderTextColor={c.textTertiary}
          accessibilityLabel={kind === 'list' ? 'New list name' : 'New label name'}
          {...({ dataSet: { stepMakeName: kind } } as object)}
        />
        {kind === 'list' ? <EmojiPick value={newEmoji} onChange={setNewEmoji} taken={takenEmojis(live)} /> : null}
        {kind === 'label' ? (
          <View style={s.swatches} accessibilityLabel="Colour" {...({ dataSet: { stepColors: newColor } } as object)}>
            {LABEL_COLORS.map((col) => {
              const on = newColor === col.key;
              const taken = !on && !!colorClash(liveLabels, col.key);
              return (
                <Pressable
                  key={col.key}
                  onPress={() => {
                    if (!taken) setNewColor(col.key);
                  }}
                  disabled={taken}
                  style={[s.swatch, on && s.swatchOn, taken && { opacity: 0.25 }]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on, disabled: taken }}
                  accessibilityLabel={taken ? `${col.name}, used by another label` : col.name}
                  {...({ dataSet: { stepColor: col.key } } as object)}
                >
                  <View style={[s.swatchDot, { backgroundColor: col.edge }]} />
                </Pressable>
              );
            })}
          </View>
        ) : null}
        {why ? <Text style={s.warn} {...({ dataSet: { stepMakeNote: '1' } } as object)}>{why}</Text> : null}
        <View style={s.formRow}>
          <Pressable onPress={() => setMaking(null)} style={s.quiet} accessibilityRole="button" accessibilityLabel="Cancel" {...({ dataSet: { stepMakeCancel: kind } } as object)}>
            <Text style={s.quietText}>Cancel</Text>
          </Pressable>
          <Pressable onPress={() => void makeNew()} disabled={!ok} style={[s.partBtn, { backgroundColor: c.accent, borderColor: c.accent }, !ok && s.primaryOff]} accessibilityRole="button" accessibilityState={{ disabled: !ok }} accessibilityLabel={kind === 'list' ? 'Add list' : 'Add label'} {...({ dataSet: { stepMakeAdd: kind } } as object)}>
            <Text style={[s.chipText, s.chipTextOn]}>{kind === 'list' ? 'Add list' : 'Add label'}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  function whereScreen(t: Task) {
    const labelPresets = availableLabelPresets(liveLabels);
    return (
      <>
        <Text style={s.section}>List</Text>
        <View style={s.chips}>
          {chip('🧠 Brain Dump', !t.listKey, () => void patch(listPatch(undefined)), { stepList: 'brain-dump' })}
          {live.map((l) => chip(`${l.emoji ? `${l.emoji} ` : ''}${l.name}`, t.listKey === l.key, () => void patch(listPatch(l.key)), { stepList: l.name }))}
          {live.length === 0 ? LIST_PRESETS.map((p) => chip(`${p.emoji} ${p.name}`, false, () => void addListPreset(p.name, p.emoji), { stepListPreset: p.name }, { dashed: true, a11y: `Add list ${p.name}` })) : null}
          {chip('+ New list', making === 'list', () => startMaking('list'), { stepNew: 'list' }, { dashed: true, a11y: 'New list' })}
        </View>
        {making === 'list' ? makeForm('list') : null}
        <Text style={s.section}>Label</Text>
        <View style={s.chips}>
          {chip('No label', !t.projectKey, () => void patch(labelPatch(undefined)), { stepLabel: 'none' })}
          {liveLabels.map((l) => chip(`${l.emoji ? `${l.emoji} ` : ''}${l.name}`, t.projectKey === l.key, () => void patch(labelPatch(t.projectKey === l.key ? undefined : l.key)), { stepLabel: l.name }, { dot: labelColor(l.colorKey)?.edge ?? c.textTertiary }))}
          {liveLabels.length === 0 ? labelPresets.map((p) => chip(`${p.emoji} ${p.name}`, false, () => void addLabelPreset(p.name, p.emoji, p.colorKey), { stepLabelPreset: p.name }, { dashed: true, dot: labelColor(p.colorKey)?.edge, a11y: `Add label ${p.name}` })) : null}
          {chip('+ New label', making === 'label', () => startMaking('label'), { stepNew: 'label' }, { dashed: true, a11y: 'New label' })}
        </View>
        {making === 'label' ? makeForm('label') : null}
        {live.length === 0 || liveLabels.length === 0 ? <Text style={s.note}>{PRESET_HINT}</Text> : null}
      </>
    );
  }

  async function addOnePart() {
    const t = taskRef.current;
    if (!t) return;
    const made = await addPart(t, partText);
    if (!made) return;
    setPartText('');
    setParts(partsFor(await loadTasksRaw(), t));
    onChanged();
  }

  function moreScreen(t: Task) {
    return (
      <>
        <Text style={s.section}>Notes</Text>
        <TextInput
          style={s.notes}
          value={notes}
          onChangeText={setNotes}
          onBlur={() => void patch(notesPatch(t, notes))}
          multiline
          placeholder="Anything to remember"
          placeholderTextColor={c.textTertiary}
          accessibilityLabel="Notes"
          {...({ dataSet: { stepNotes: '1' } } as object)}
        />
        {canHaveParts(t) ? (
          <>
            <Text style={s.section}>{PARTS}</Text>
            <Text style={s.note}>{PARTS_HINT}</Text>
            {parts.map((p) => (
              <View key={p.id} style={s.partRow} {...({ dataSet: { stepPart: p.title } } as object)}>
                <RoundCheck done={p.completed} size={22} />
                <Text style={s.partTitle} numberOfLines={2}>{p.title}</Text>
              </View>
            ))}
            {/* The button sits under the box: "Add a smaller task" beside it does not fit at 390 pt. */}
            <View style={{ gap: 8, alignItems: 'flex-start' }}>
              <TextInput
                style={[s.partInput, { alignSelf: 'stretch' }]}
                value={partText}
                onChangeText={setPartText}
                placeholder="Name of the smaller task"
                placeholderTextColor={c.textTertiary}
                returnKeyType="done"
                blurOnSubmit={false}
                onSubmitEditing={() => void addOnePart()}
                accessibilityLabel={`Add a smaller task to ${t.title}`}
                {...({ dataSet: { stepPartInput: '1' } } as object)}
              />
              <Pressable onPress={() => void addOnePart()} style={s.partBtn} accessibilityRole="button" accessibilityLabel={ADD_PART} {...({ dataSet: { stepAddPart: '1' } } as object)}>
                <Text style={s.chipText}>{ADD_PART}</Text>
              </Pressable>
            </View>
          </>
        ) : null}
      </>
    );
  }

  const t = task;
  const last = step === 'more';
  const canNext = step === 'what' ? !!text.trim() : true;
  return (
    <Modal visible animationType={reduced ? 'none' : 'slide'} presentationStyle="pageSheet" onRequestClose={() => void finish()}>
      <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} {...({ dataSet: { stepAdd: step } } as object)}>
        <View style={[s.head, { paddingTop: Platform.OS === 'ios' ? 8 : insets.top + 8 }]}>
          <Pressable onPress={() => void finish()} style={s.close} accessibilityRole="button" accessibilityLabel="Close, keep the task" {...({ dataSet: { stepClose: '1' } } as object)}>
            <Ionicons name="close" size={28} color={c.textSecondary} />
          </Pressable>
          <View style={s.dots} accessibilityRole="progressbar" accessibilityLabel={stepLabel(step)} {...({ dataSet: { stepDots: stepLabel(step) } } as object)}>
            {STEPS.map((x) => (
              <View key={x} style={[s.dot, x === step && s.dotOn]} />
            ))}
          </View>
        </View>
        <ScrollView contentContainerStyle={[s.body, { paddingBottom: 24 }]} keyboardShouldPersistTaps="handled">
          <Text style={s.question} accessibilityRole="header">{STEP_QUESTION[step]}</Text>
          {step === 'what' ? whatScreen() : null}
          {step === 'when' && t ? whenScreen(t) : null}
          {step === 'time' && t ? timeScreen(t) : null}
          {step === 'where' && t ? whereScreen(t) : null}
          {step === 'more' && t ? moreScreen(t) : null}
          {warn ? <Text style={s.warn} accessibilityRole="alert" {...({ dataSet: { stepWarn: '1' } } as object)}>{warn}</Text> : null}
        </ScrollView>
        <View style={[s.foot, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          {step === 'what' ? (
            <View style={s.quiet} />
          ) : (
            <Pressable onPress={back} style={s.quiet} accessibilityRole="button" accessibilityLabel="Back" {...({ dataSet: { stepBack: '1' } } as object)}>
              <Text style={s.quietText}>Back</Text>
            </Pressable>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {step !== 'what' && !last ? (
              <Pressable onPress={() => forward()} style={s.quiet} accessibilityRole="button" accessibilityLabel="Skip" {...({ dataSet: { stepSkip: '1' } } as object)}>
                <Text style={s.quietText}>Skip</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => void (last ? finish() : next())}
              disabled={!canNext}
              style={[s.primary, !canNext && s.primaryOff]}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canNext }}
              accessibilityLabel={last ? 'Done' : 'Next'}
              {...({ dataSet: { stepNext: last ? 'done' : 'next' } } as object)}
            >
              <Text style={s.primaryText}>{last ? 'Done' : 'Next'}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
