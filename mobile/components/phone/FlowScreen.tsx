// Wrap up and Plan week on the phone (PLAN_phone_parity phase 9, 3.65.0): one full screen flow, one task at a time, in the
// same style as Plan my day (PlanMyDay.tsx): progress, a card for the task, big answer buttons, each answer saved at once,
// an Undo bar for the last answer, and a summary with an Undo per row. The rules and writes are the desktop's (lib/wrapUp.ts,
// lib/wrapActions.ts through lib/flowActions.ts); the phone's undo stack does not record, so an Undo writes back the rows
// the answer changed (lib/earlierUndo.ts). Closing keeps what was answered. Nothing is red.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, type ColorTokens } from '../../lib/tokens';
import { loadTasksRaw, updateTasks } from '../../lib/storage';
import { progressText } from '../../lib/planQueue';
import { undoRows } from '../../lib/earlierUndo';
import type { Task } from '../../lib/types';
import { useStyles, useTheme } from './theme';
import { haptic, useReducedMotion } from './touch';
import { inter, type } from './type';
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
  btn: { minHeight: 52, paddingHorizontal: 16, borderRadius: radius.md, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.surface, alignItems: 'center' as const, justifyContent: 'center' as const },
  btnText: { ...inter(600), fontSize: 17, color: c.textPrimary, textAlign: 'center' as const },
  note: { ...inter(500), fontSize: 14, color: c.textPrimary },
  sumRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, minHeight: 52, paddingVertical: 6, borderTopWidth: 1, borderTopColor: c.border },
  sumText: { ...inter(500), fontSize: 15, color: c.textPrimary, flex: 1 },
  undoBtn: { minHeight: 44, minWidth: 64, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1, borderColor: c.borderStrong, alignItems: 'center' as const, justifyContent: 'center' as const },
  undoText: { ...inter(600), fontSize: 14, color: c.textPrimary },
});

export interface FlowButton {
  id: string;
  label: string;
  a11y?: string;
}

// What one step shows. `data` is the caller's own (the queue entry), handed back to `run`.
export interface FlowStep<T> {
  key: string;
  title: string;
  emoji?: string;
  // Small lines under the title (the list, where it is from, its length).
  meta: string[];
  ask: string;
  hint?: string;
  buttons: FlowButton[];
  data: T;
}

interface Answered<T> {
  step: FlowStep<T>;
  text: string;
  back: Task[];
  undone: boolean;
}

export interface FlowLoad<T> {
  steps: FlowStep<T>[];
  figure: string;
}

// `run` writes the answer and returns the line it leaves (the summary and the Undo bar), or a sentence when it is refused.
export function FlowScreen<T>({
  visible,
  name,
  title,
  emptyText,
  doneText,
  load,
  figure,
  run,
  onClose,
  onChanged,
}: {
  visible: boolean;
  name: 'wrap' | 'week';
  title: string;
  emptyText: string;
  doneText: string;
  load: () => Promise<FlowLoad<T>>;
  figure: () => Promise<string>;
  run: (step: FlowStep<T>, button: string) => Promise<{ text: string } | { refused: string }>;
  onClose: () => void;
  onChanged: () => void;
}) {
  const s = useStyles(make);
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [queue, setQueue] = useState<FlowStep<T>[] | null>(null);
  const [fig, setFig] = useState('');
  const [answers, setAnswers] = useState<Answered<T>[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [undo, setUndo] = useState<UndoMessage | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    if (!visible) return;
    setAnswers([]);
    setNote(null);
    setUndo(null);
    setQueue(null);
    void load().then((l) => {
      setQueue(l.steps);
      setFig(l.figure);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const refreshFigure = useCallback(() => void figure().then(setFig), [figure]);
  const index = answers.length;
  const step = queue && index < queue.length ? queue[index] : null;
  const done = queue !== null && index >= queue.length;

  async function answer(button: string) {
    if (!step || busy.current) return;
    busy.current = true;
    try {
      const before = await loadTasksRaw();
      const res = await run(step, button);
      if ('refused' in res) {
        setNote(res.refused);
        return;
      }
      const after = await loadTasksRaw();
      const entry: Answered<T> = { step, text: res.text, back: undoRows(before, after), undone: false };
      setAnswers((list) => [...list, entry]);
      setNote(null);
      haptic('light');
      onChanged();
      refreshFigure();
      setUndo({ id: Date.now(), text: entry.text, undo: () => void undoLast(entry) });
    } finally {
      busy.current = false;
    }
  }

  // Undo of the last answer: the rows go back and that task is asked again.
  async function undoLast(entry: Answered<T>) {
    if (entry.back.length) await updateTasks(entry.back);
    setAnswers((list) => list.filter((x) => x !== entry));
    onChanged();
    refreshFigure();
  }
  // The summary's own Undo: that answer's rows go back; the row says so.
  async function undoOne(entry: Answered<T>) {
    if (entry.back.length) await updateTasks(entry.back);
    setAnswers((list) => list.map((x) => (x === entry ? { ...x, undone: true } : x)));
    onChanged();
    refreshFigure();
  }

  return (
    <Modal visible={visible} animationType={reduced ? 'none' : 'slide'} onRequestClose={onClose}>
      <View style={[s.screen, { paddingTop: insets.top + 8, paddingBottom: insets.bottom }]} {...({ dataSet: { flowScreen: name } } as object)}>
        <View style={s.head}>
          <Text style={s.title} accessibilityRole="header">
            {title}
          </Text>
          <Pressable onPress={onClose} style={s.close} accessibilityRole="button" accessibilityLabel="Done" {...({ dataSet: { flowDone: '1' } } as object)}>
            <Text style={s.closeText}>Done</Text>
          </Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 140 }}>
          {fig ? (
            <Text style={s.hint} {...({ dataSet: { flowFigure: '1' } } as object)}>
              {fig}
            </Text>
          ) : null}
          {queue === null ? <Text style={s.hint}>Loading…</Text> : null}
          {queue !== null && queue.length === 0 ? (
            <Text style={s.ask} {...({ dataSet: { flowEmpty: '1' } } as object)}>
              {emptyText}
            </Text>
          ) : null}
          {step ? (
            <>
              <Text style={s.progress} {...({ dataSet: { flowProgress: progressText(index, queue?.length ?? 0) } } as object)}>
                {progressText(index, queue?.length ?? 0)}
              </Text>
              <View style={s.card} accessibilityLabel={step.title} {...({ dataSet: { flowTask: step.title } } as object)}>
                <Text style={s.name}>{`${step.emoji ? `${step.emoji} ` : ''}${step.title}`}</Text>
                {step.meta.filter(Boolean).map((m) => (
                  <Text key={m} style={s.meta}>
                    {m}
                  </Text>
                ))}
              </View>
              <Text style={s.ask} accessibilityRole="header">
                {step.ask}
              </Text>
              <View style={{ gap: 10 }}>
                {step.buttons.map((b) => (
                  <Pressable key={b.id} onPress={() => void answer(b.id)} style={({ pressed }) => [s.btn, pressed && { backgroundColor: c.hover }]} accessibilityRole="button" accessibilityLabel={b.a11y ?? b.label} {...({ dataSet: { flowAnswer: b.id } } as object)}>
                    <Text style={s.btnText}>{b.label}</Text>
                  </Pressable>
                ))}
              </View>
              {note ? <Text style={s.note}>{note}</Text> : null}
              {step.hint ? <Text style={s.hint}>{step.hint}</Text> : null}
            </>
          ) : null}
          {done && queue && queue.length > 0 ? (
            <Text style={s.ask} {...({ dataSet: { flowSummaryHead: '1' } } as object)}>
              {doneText}
            </Text>
          ) : null}
          {answers.length > 0 ? (
            <View {...({ dataSet: { flowSummary: String(answers.length) } } as object)}>
              {done ? null : <Text style={[s.progress, { paddingBottom: 6 }]}>Answered</Text>}
              {answers.map((a, n) => (
                <View key={`${a.step.key}-${n}`} style={s.sumRow} {...({ dataSet: { flowSummaryRow: a.step.title } } as object)}>
                  <Text style={[s.sumText, a.undone && { color: c.textSecondary, textDecorationLine: 'line-through' }]}>{a.undone ? `Put back: ${a.step.title}` : a.text}</Text>
                  {a.undone ? null : (
                    <Pressable onPress={() => void undoOne(a)} style={s.undoBtn} accessibilityRole="button" accessibilityLabel={`Undo ${a.text}`} {...({ dataSet: { flowUndoRow: a.step.title } } as object)}>
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
