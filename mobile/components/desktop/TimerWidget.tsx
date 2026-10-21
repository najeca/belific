import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { formatClock, parseDuration } from '../../lib/duration';
import { activeTimerTask } from '../../lib/timerSession';
import { loadTasksRaw } from '../../lib/storage';
import { describe, isPhaseOver } from '../../lib/pomodoro';
import { endPomodoro, keepFocusing, reconcilePomodoro, startNextFocus, takeBreak, usePomodoro } from './pomodoroStore';
import { useFeature } from './featureStore';
import { formatTaskTime } from '../../lib/taskTotals';
import { answerTimerConfirm, stopOneTimer, useNow, useRunningTimers } from './timerUi';
import { openDetail, useTimerConfirm } from './uiStore';

// The floating timer (build plan phase 2). Mounted once at the root of the home
// screen, outside the page switch, so it stays while Settings, Labels or
// Progress is showing, and it reads the running timer from the stored tasks, so
// it is still there after the app restarts (and shows a timer started on the
// other device after the next sync).
//
// It shows the task, the time so far (stored actual plus this run) against the
// estimate, and one button to stop. A timer that has run for more than a day is
// never added without asking: the widget shows the question.
export default function TimerWidget({ refreshKey }: { refreshKey: number }) {
  const running = useRunningTimers(refreshKey);
  const confirm = useTimerConfirm();
  const active = activeTimerTask(running);
  const pomoOn = useFeature('pomodoro');
  const pomo = usePomodoro();
  const now = useNow(!!active || !!pomo);
  const [custom, setCustom] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [pomoTitle, setPomoTitle] = useState('');
  const mountedAt = useRef(Date.now());
  // A pomodoro lives only while the timer it is laid over does (pomodoro.ts), and
  // shown only while the feature is on (switching it off ends it, featureStore).
  useEffect(() => {
    // Not in the first seconds: the running timers are still being read.
    if (pomo && pomoOn && now - mountedAt.current > 4000) reconcilePomodoro(running, now);
  }, [pomo, pomoOn, running, now]);
  const pomoTaskId = pomo?.taskId;
  useEffect(() => {
    if (!pomoTaskId) return;
    loadTasksRaw()
      .then((tasks) => setPomoTitle(tasks.find((t) => t.id === pomoTaskId)?.title ?? ''))
      .catch(() => {});
  }, [pomoTaskId]);

  if (confirm) {
    const title = running.find((t) => t.id === confirm.taskId)?.title ?? 'A task';
    const submit = () => {
      const m = custom.trim() === '' ? null : parseDuration(custom);
      if (m === null) {
        setInvalid(true);
        return;
      }
      setCustom('');
      setInvalid(false);
      answerTimerConfirm(confirm, m);
    };
    return (
      <View style={[styles.widget, styles.ask]} accessibilityRole="alert" accessibilityLabel="Timer question">
        <Text style={styles.askTitle}>⏱️ “{title}” has been running for {formatClock(confirm.elapsedMinutes)}</Text>
        <Text style={styles.askText}>That is over a day. How much of it should count?</Text>
        <View style={styles.askRow}>
          <Pressable style={styles.btn} onPress={() => answerTimerConfirm(confirm, confirm.elapsedMinutes)} accessibilityRole="button" accessibilityLabel="Add all of it">
            <Text style={styles.btnText}>Add all {formatClock(confirm.elapsedMinutes)}</Text>
          </Pressable>
          <Pressable style={styles.btnQuiet} onPress={() => answerTimerConfirm(confirm, 0)} accessibilityRole="button" accessibilityLabel="Add none of it">
            <Text style={styles.btnQuietText}>Add none</Text>
          </Pressable>
        </View>
        <View style={styles.askRow}>
          <TextInput
            style={[styles.input, invalid && styles.inputBad]}
            value={custom}
            onChangeText={(t) => {
              setCustom(t);
              setInvalid(false);
            }}
            onSubmitEditing={submit}
            placeholder="Or type a time: 45m, 1h 30m"
            placeholderTextColor={Colors.textSecondary}
            accessibilityLabel="Minutes to add"
          />
          <Pressable style={styles.btnQuiet} onPress={submit} accessibilityRole="button" accessibilityLabel="Add this time">
            <Text style={styles.btnQuietText}>Add</Text>
          </Pressable>
        </View>
        {invalid && <Text style={styles.bad}>Not a time. Try 45m, 1h 30m or 90.</Text>}
      </View>
    );
  }

  const pomoLine = pomo && pomoOn ? describe(pomo, now) : null;
  const pomoOver = pomo && pomoOn ? isPhaseOver(pomo, now) : false;

  // A break: no task timer runs, so the widget is the countdown on its own.
  if (!active && pomo && pomoOn && pomo.phase === 'break') {
    return (
      <View style={[styles.widget, styles.ask]} accessibilityRole="timer" accessibilityLabel="Pomodoro break">
        <Text style={styles.askTitle} accessibilityLabel="Pomodoro status">{pomoLine}</Text>
        <Text style={styles.askText}>{pomoOver ? 'Ready for the next focus period' : 'No task timer is running during the break.'} {pomoTitle ? `Next: ${pomoTitle}` : ''}</Text>
        <View style={styles.askRow}>
          <Pressable style={styles.btn} onPress={() => startNextFocus()} accessibilityRole="button" accessibilityLabel="Start the next focus period">
            <Text style={styles.btnText}>🍅 {pomoOver ? 'Start next focus' : 'Skip the break'}</Text>
          </Pressable>
          <Pressable style={styles.btnQuiet} onPress={() => endPomodoro()} accessibilityRole="button" accessibilityLabel="End the pomodoro">
            <Text style={styles.btnQuietText}>End</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!active) return null;
  const seconds = Math.max(0, Math.floor((now - Date.parse(active.timerStartedAt as string)) / 1000));
  const others = running.length - 1;
  return (
    <View style={styles.widget} accessibilityRole="timer" accessibilityLabel={`Timer running for ${active.title}`}>
      <Pressable onPress={() => openDetail(active.id)} style={styles.info} accessibilityRole="button" accessibilityLabel={`Open details of ${active.title}`}>
        <Text style={styles.title} numberOfLines={1}>
          ⏱️ {active.emoji ? `${active.emoji} ` : ''}
          {active.title}
        </Text>
        <Text style={styles.sub}>
          <Text style={styles.clock}>{formatRun(seconds)}</Text>
          {'   '}
          {formatTaskTime(active, now)}
          {others > 0 ? `   +${others} more running` : ''}
        </Text>
        {pomoLine && pomo?.taskId === active.id && <Text style={styles.sub} accessibilityLabel="Pomodoro status">{pomoLine}</Text>}
      </Pressable>
      {pomoOver && pomo?.phase === 'focus' && pomo.taskId === active.id && (
        <View style={styles.pomoBtns}>
          <Pressable style={styles.btn} onPress={() => takeBreak()} accessibilityRole="button" accessibilityLabel="Take a break">
            <Text style={styles.btnText}>☕ Break</Text>
          </Pressable>
          <Pressable style={styles.btnQuiet} onPress={() => keepFocusing()} accessibilityRole="button" accessibilityLabel="Keep going">
            <Text style={styles.btnQuietText}>Keep going</Text>
          </Pressable>
        </View>
      )}
      <Pressable onPress={() => stopOneTimer(active.id)} style={styles.stop} accessibilityRole="button" accessibilityLabel={`Stop the timer for ${active.title}`}>
        <Ionicons name="pause" size={18} color={Colors.onAccent} />
      </Pressable>
    </View>
  );
}

// 0:07:05 style for a run of this timer; under an hour it is 7:05.
export function formatRun(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

const styles = StyleSheet.create({
  widget: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    zIndex: 40,
    maxWidth: 380,
    minWidth: 260,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    boxShadow: Colors.shadowMd,
  } as never,
  ask: { flexDirection: 'column', alignItems: 'stretch', gap: 8, maxWidth: 420 },
  pomoBtns: { gap: 6 },
  info: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  sub: { fontSize: 12, color: Colors.textSecondary },
  clock: { fontSize: 15, fontWeight: '700', color: Colors.accentText, fontVariant: ['tabular-nums'] },
  stop: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  askTitle: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  askText: { fontSize: 13, color: Colors.textSecondary },
  askRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btn: { paddingHorizontal: 12, height: 34, borderRadius: 10, backgroundColor: Colors.accent, justifyContent: 'center' },
  btnText: { fontSize: 13, fontWeight: '600', color: Colors.onAccent },
  btnQuiet: { paddingHorizontal: 12, height: 34, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, justifyContent: 'center', backgroundColor: Colors.background },
  btnQuietText: { fontSize: 13, color: Colors.textPrimary },
  input: { flex: 1, height: 34, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background, color: Colors.textPrimary, fontSize: 13, outlineColor: Colors.accent },
  inputBad: { borderColor: Colors.danger },
  bad: { fontSize: 12, color: Colors.danger },
});
