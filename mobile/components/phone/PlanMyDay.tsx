// Plan my day on the phone (PLAN_phone_stepflow section 3, 3.62.0): a full screen flow, one task at a time, "When will
// you do this?": Today, Tomorrow, A time, Not today. The order and the answers are lib/planQueue.ts; every write is the
// desktop's (lib/wrapActions.ts through lib/planActions.ts). Each answer saves at once and the next task shows; Undo puts
// the last answer back, and the summary lists every answer with its own Undo (the phone's undo stack does not record, so
// an Undo writes back the rows the answer changed: lib/earlierUndo.ts). Closing keeps what was answered. Nothing is red.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, type ColorTokens } from '../../lib/tokens';
import { addDays, dateKey, formatDayTitle, parseDateKey } from '../../lib/kanban';
import { formatTime } from '../../lib/data';
import { formatDuration } from '../../lib/duration';
import { loadListsRaw, loadProjects, loadTasksRaw, updateTasks } from '../../lib/storage';
import { loadCutMin } from '../../lib/phoneActions';
import { plannedText } from '../../lib/planDay';
import { ANSWER_LABEL, answerText, answersFor, planQueue, progressText, readTime, type PlanAnswer, type PlanStep } from '../../lib/planQueue';
import { runPlanAnswer } from '../../lib/planActions';
import { pushUndoRows } from '../../lib/pushAfter';
import { BRAIN_DUMP_NAME, liveLists } from '../../lib/lists';
import { labelColor } from '../../lib/labelColors';
import type { Project, Task, TaskList } from '../../lib/types';
import { useStyles, useTheme } from './theme';
import { haptic, useReducedMotion } from './touch';
import { inter, type } from './type';
import { LabelDot } from './ui';
import { TimeField } from './TimeField';
import { UndoBar, type UndoMessage } from './UndoBar';

const make = (c: ColorTokens) => ({
  screen: { flex: 1, backgroundColor: c.background, borderTopWidth: 8, borderTopColor: c.accent },
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: 16, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.background },
  title: { ...type.sheetTitle, color: c.textPrimary },
  close: { minWidth: 64, minHeight: 44, alignItems: 'flex-end' as const, justifyContent: 'center' as const },
  closeText: { ...inter(700), fontSize: 17, color: c.accentText },
  hint: { ...inter(400), fontSize: 14, lineHeight: 20, color: c.textSecondary },
  progress: { ...inter(600), fontSize: 14, color: c.textSecondary },
  ask: { ...inter(700), fontSize: 22, lineHeight: 28, color: c.textPrimary },
  card: { backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: c.borderStrong, padding: 16, gap: 6 },
  name: { ...inter(600), fontSize: 20, lineHeight: 26, color: c.textPrimary },
  meta: { ...inter(400), fontSize: 14, color: c.textSecondary },
  line: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  btn: { minHeight: 52, paddingHorizontal: 16, borderRadius: radius.md, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.surface, alignItems: 'center' as const, justifyContent: 'center' as const },
  btnText: { ...inter(600), fontSize: 17, color: c.textPrimary },
  primary: { minHeight: 48, paddingHorizontal: 16, borderRadius: radius.md, backgroundColor: c.accent, alignItems: 'center' as const, justifyContent: 'center' as const },
  primaryText: { ...inter(700), fontSize: 16, color: c.onAccent },
  note: { ...inter(500), fontSize: 14, color: c.textPrimary },
  sumRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, minHeight: 52, paddingVertical: 6, borderTopWidth: 1, borderTopColor: c.border },
  sumText: { ...inter(500), fontSize: 15, color: c.textPrimary, flex: 1 },
  undoBtn: { minHeight: 44, minWidth: 64, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1, borderColor: c.borderStrong, alignItems: 'center' as const, justifyContent: 'center' as const },
  undoText: { ...inter(600), fontSize: 14, color: c.textPrimary },
});

interface Answered {
  step: PlanStep;
  answer: PlanAnswer;
  text: string;
  back: Task[];
  undone: boolean;
}

export function PlanMyDay({ visible, onClose, onChanged }: { visible: boolean; onClose: () => void; onChanged: () => void }) {
  const s = useStyles(make);
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [queue, setQueue] = useState<PlanStep[] | null>(null);
  const [answers, setAnswers] = useState<Answered[]>([]);
  const [lists, setLists] = useState<TaskList[]>([]);
  const [labels, setLabels] = useState<Project[]>([]);
  const [planned, setPlanned] = useState('');
  const [picking, setPicking] = useState(false);
  const [time, setTime] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [undo, setUndo] = useState<UndoMessage | null>(null);
  const busy = useRef(false);
  const todayKey = useRef(dateKey(new Date()));
  const cutMin = useRef(30);

  const refreshLine = useCallback(async () => {
    const raw = await loadTasksRaw();
    setPlanned(plannedText(raw, todayKey.current, cutMin.current, Date.now()));
  }, []);

  useEffect(() => {
    if (!visible) return;
    todayKey.current = dateKey(new Date());
    setAnswers([]);
    setPicking(false);
    setTime(Platform.OS === 'web' ? '' : '09:00');
    setNote(null);
    setUndo(null);
    setQueue(null);
    void (async () => {
      const [raw, ls, ps, cut] = await Promise.all([loadTasksRaw(), loadListsRaw(), loadProjects(), loadCutMin()]);
      cutMin.current = cut;
      setLists(ls);
      setLabels(ps);
      setQueue(planQueue(raw, todayKey.current, ls, cut));
      setPlanned(plannedText(raw, todayKey.current, cut, Date.now()));
    })();
  }, [visible]);

  const index = answers.length;
  const step = queue && index < queue.length ? queue[index] : null;
  const tomorrowKey = dateKey(addDays(parseDateKey(todayKey.current), 1));

  async function answer(a: PlanAnswer, at?: string) {
    if (!step || busy.current) return;
    busy.current = true;
    try {
      const before = await loadTasksRaw();
      let pushedText: string | null = null;
      const refused = await runPlanAnswer(step, a, todayKey.current, tomorrowKey, at, (t) => (pushedText = t));
      if (refused) {
        setNote(refused);
        return;
      }
      const after = await loadTasksRaw();
      // D7: a pushed day row of a series goes back to what the series shows (pushUndoRows), never a skipped day.
      const entry: Answered = { step, answer: a, text: pushedText ?? answerText(a, step.item.task.title, at), back: pushUndoRows(before, after, new Date().toISOString()), undone: false };
      setAnswers((list) => [...list, entry]);
      setPicking(false);
      setNote(null);
      haptic('light');
      onChanged();
      void refreshLine();
      setUndo({ id: Date.now(), text: entry.text, undo: () => void undoLast(entry) });
    } finally {
      busy.current = false;
    }
  }

  // Undo of the last answer: the rows go back and that task is asked again.
  async function undoLast(entry: Answered) {
    if (entry.back.length) await updateTasks(entry.back);
    setAnswers((list) => list.filter((x) => x !== entry));
    onChanged();
    void refreshLine();
  }
  // The summary's own Undo: that answer's rows go back; the row says so.
  async function undoOne(entry: Answered) {
    if (entry.back.length) await updateTasks(entry.back);
    setAnswers((list) => list.map((x) => (x === entry ? { ...x, undone: true } : x)));
    onChanged();
    void refreshLine();
  }

  const t = step?.item.task;
  const list = t?.listKey ? liveLists(lists).find((l) => l.key === t.listKey) : undefined;
  const where = list ? `${list.emoji ? `${list.emoji} ` : ''}${list.name}` : BRAIN_DUMP_NAME;
  const label = t?.projectKey ? labels.find((p) => p.key === t.projectKey && !p.deletedAt) : undefined;
  const from = step?.source === 'earlier' ? (t?.dueDate ? `From ${formatDayTitle(t.dueDate, todayKey.current)}` : 'From an earlier day') : step?.source === 'today' ? 'On today, no time yet' : `In ${where}`;
  const length = t ? formatDuration(t.durationMinutes) : undefined;
  const validTime = readTime(time);
  const done = queue !== null && index >= queue.length;

  return (
    <Modal visible={visible} animationType={reduced ? 'none' : 'slide'} onRequestClose={onClose}>
      <View style={[s.screen, { paddingTop: insets.top + 8, paddingBottom: insets.bottom }]} {...({ dataSet: { planScreen: '1' } } as object)}>
        <View style={s.head}>
          <Text style={s.title} accessibilityRole="header">
            Plan my day
          </Text>
          <Pressable onPress={onClose} style={s.close} accessibilityRole="button" accessibilityLabel="Done" {...({ dataSet: { planDone: '1' } } as object)}>
            <Text style={s.closeText}>Done</Text>
          </Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 140 }}>
          {planned ? (
            <Text style={s.hint} {...({ dataSet: { planFigure: '1' } } as object)}>
              {planned}
            </Text>
          ) : null}
          {queue === null ? <Text style={s.hint}>Loading…</Text> : null}
          {queue !== null && queue.length === 0 ? (
            <Text style={s.ask} {...({ dataSet: { planEmpty: '1' } } as object)}>
              Nothing to plan. Everything on today has a time.
            </Text>
          ) : null}
          {step && t ? (
            <>
              <Text style={s.progress} {...({ dataSet: { planProgress: progressText(index, queue?.length ?? 0) } } as object)}>
                {progressText(index, queue?.length ?? 0)}
              </Text>
              <View style={s.card} accessibilityLabel={`Plan ${t.title}`} {...({ dataSet: { planTask: t.title } } as object)}>
                <Text style={s.name}>{`${t.emoji ? `${t.emoji} ` : ''}${t.title}`}</Text>
                <View style={[s.line, { flexWrap: 'wrap' }]}>
                  <Text style={s.meta}>{where}</Text>
                  {label ? (
                    <View style={s.line}>
                      <Text style={s.meta}>·</Text>
                      <LabelDot color={labelColor(label.colorKey)?.edge ?? c.textTertiary} />
                      <Text style={s.meta}>{label.name}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={s.meta}>{[from, length, t.startTime ? formatTime(t.startTime) : '', step.item.series ? 'Repeats' : ''].filter(Boolean).join(' · ')}</Text>
              </View>
              <Text style={s.ask} accessibilityRole="header">
                When will you do this?
              </Text>
              <View style={{ gap: 10 }}>
                {answersFor(step).map((a) => (
                  <Pressable
                    key={a}
                    onPress={() => (a === 'time' ? setPicking((v) => !v) : void answer(a))}
                    style={({ pressed }) => [s.btn, pressed && { backgroundColor: c.hover }, a === 'time' && picking && { borderColor: c.accent }]}
                    accessibilityRole="button"
                    accessibilityLabel={a === 'notToday' && step.item.series ? 'Not today, skip this day' : ANSWER_LABEL[a]}
                    {...({ dataSet: { planAnswer: a } } as object)}
                  >
                    <Text style={s.btnText}>{ANSWER_LABEL[a]}</Text>
                  </Pressable>
                ))}
              </View>
              {picking ? (
                <View style={[s.line, { gap: 10 }]} {...({ dataSet: { planTime: '1' } } as object)}>
                  <TimeField value={validTime ?? undefined} onChange={setTime} a11y="Start time today" />
                  <Pressable onPress={() => validTime && void answer('time', validTime)} disabled={!validTime} style={[s.primary, !validTime && { opacity: 0.4 }]} accessibilityRole="button" accessibilityLabel="Set the time" {...({ dataSet: { planSetTime: '1' } } as object)}>
                    <Text style={s.primaryText}>Set time</Text>
                  </Pressable>
                </View>
              ) : null}
              {note ? <Text style={s.note}>{note}</Text> : null}
              <Text style={s.hint}>{step.item.series ? 'Not today skips only this day. The repeat stays.' : step.source === 'list' ? 'Not today leaves it in its list.' : 'Not today sends it back to its list.'}</Text>
            </>
          ) : null}
          {done && queue && queue.length > 0 ? <Text style={s.ask} {...({ dataSet: { planSummaryHead: '1' } } as object)}>That is the day planned.</Text> : null}
          {answers.length > 0 ? (
            <View {...({ dataSet: { planSummary: String(answers.length) } } as object)}>
              {done ? null : <Text style={[s.progress, { paddingBottom: 6 }]}>Answered</Text>}
              {answers.map((a, n) => (
                <View key={`${a.step.item.key}-${n}`} style={s.sumRow} {...({ dataSet: { planSummaryRow: a.step.item.task.title } } as object)}>
                  <Text style={[s.sumText, a.undone && { color: c.textSecondary, textDecorationLine: 'line-through' }]}>{a.undone ? `Put back: ${a.step.item.task.title}` : a.text}</Text>
                  {a.undone ? null : (
                    <Pressable onPress={() => void undoOne(a)} style={s.undoBtn} accessibilityRole="button" accessibilityLabel={`Undo ${a.text}`} {...({ dataSet: { planUndoRow: a.step.item.task.title } } as object)}>
                      <Text style={s.undoText}>Undo</Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>
        <UndoBar message={undo} onDone={() => setUndo(null)} />
      </View>
    </Modal>
  );
}
