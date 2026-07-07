import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { useTimerStore } from '../../lib/store';
import type { TimerPhase } from '../../lib/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CIRCLE_SIZE = Math.min(SCREEN_WIDTH - 80, 280);

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

const PHASE_LABELS: Record<TimerPhase, string> = {
  focus: 'Focus Time',
  break: 'Short Break',
  longBreak: 'Long Break',
};

const PHASE_COLORS: Record<TimerPhase, string> = {
  focus: Colors.accent,
  break: '#6B9B76',
  longBreak: '#534AB7',
};

function phaseDuration(p: TimerPhase, s: { focusDuration: number; breakDuration: number; longBreakDuration: number }): number {
  if (p === 'focus') return s.focusDuration * 60;
  if (p === 'break') return s.breakDuration * 60;
  return s.longBreakDuration * 60;
}

export default function FocusScreen() {
  const insets = useSafeAreaInsets();
  const store = useTimerStore();
  const hydrate = useTimerStore((s) => s.hydrate);

  const [phase, setPhase] = useState<TimerPhase>('focus');
  const [timeLeft, setTimeLeft] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [sessionsDone, setSessionsDone] = useState(0);
  const [isHydrated, setIsHydrated] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const phaseRef = useRef<TimerPhase>('focus');
  const sessionsDoneRef = useRef(0);

  // Keep refs in sync with state
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { sessionsDoneRef.current = sessionsDone; }, [sessionsDone]);

  // Hydrate on focus — sets timeLeft after store is loaded
  useFocusEffect(
    useCallback(() => {
      hydrate().then(() => {
        const s = useTimerStore.getState();
        if (!isRunning) {
          setTimeLeft(phaseDuration(phaseRef.current, s));
        }
        setIsHydrated(true);
      });
    }, [hydrate]),
  );

  function resetToPhase(p: TimerPhase) {
    const s = useTimerStore.getState();
    setPhase(p);
    setTimeLeft(phaseDuration(p, s));
    setIsRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }

  // Stable callback — reads current values from refs and zustand getState()
  const handlePhaseComplete = useCallback(() => {
    setIsRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);

    const currentPhase = phaseRef.current;
    const currentSessionsDone = sessionsDoneRef.current;
    const s = useTimerStore.getState();

    if (currentPhase === 'focus') {
      const next = currentSessionsDone + 1;
      setSessionsDone(next);
      const isLong = next % s.sessionsUntilLongBreak === 0;
      const nextPhase: TimerPhase = isLong ? 'longBreak' : 'break';
      setPhase(nextPhase);
      setTimeLeft(phaseDuration(nextPhase, s));
    } else {
      setPhase('focus');
      setTimeLeft(phaseDuration('focus', s));
    }
  }, []);

  // Timer tick — only decrements, never triggers side effects
  useEffect(() => {
    if (!isRunning) return;
    intervalRef.current = setInterval(() => {
      setTimeLeft(t => (t <= 1 ? 0 : t - 1));
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning]);

  // Phase complete detection — separate from the tick
  useEffect(() => {
    if (timeLeft === 0 && isRunning) {
      handlePhaseComplete();
    }
  }, [timeLeft, isRunning, handlePhaseComplete]);

  // Update timeLeft when settings change and timer is idle
  useEffect(() => {
    if (!isRunning && isHydrated) {
      setTimeLeft(phaseDuration(phaseRef.current, store));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.focusDuration, store.breakDuration, store.longBreakDuration]);

  function toggleTimer() {
    setIsRunning(r => !r);
  }

  function handleReset() {
    resetToPhase(phase);
  }

  function handleSkip() {
    handlePhaseComplete();
  }

  const total = phaseDuration(phase, store);
  const progress = total > 0 ? (total - timeLeft) / total : 0;
  const phaseColor = PHASE_COLORS[phase];
  const circumference = Math.PI * (CIRCLE_SIZE - 16);
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <Text style={styles.title}>Focus</Text>

      {/* Phase label */}
      <Text style={[styles.phaseLabel, { color: phaseColor }]}>
        {PHASE_LABELS[phase]}
      </Text>

      {/* Timer circle */}
      <View style={styles.circleWrapper}>
        <View style={[styles.circle, { width: CIRCLE_SIZE, height: CIRCLE_SIZE, borderRadius: CIRCLE_SIZE / 2, borderColor: Colors.surface }]}>
          <View style={[styles.progressRing, { width: CIRCLE_SIZE, height: CIRCLE_SIZE, borderRadius: CIRCLE_SIZE / 2, borderColor: phaseColor, borderWidth: 6, opacity: progress > 0 ? 1 : 0.3 }]} />
          <Text style={styles.timerText}>
            {isHydrated ? formatSeconds(timeLeft) : '--:--'}
          </Text>
          <Text style={styles.timerSubtext}>
            {isHydrated
              ? (isRunning ? 'in progress' : timeLeft === total ? 'ready' : 'paused')
              : ''}
          </Text>
        </View>
      </View>

      {/* Session dots */}
      <View style={styles.sessionRow}>
        {Array.from({ length: store.sessionsUntilLongBreak }, (_, i) => (
          <View
            key={i}
            style={[
              styles.sessionDot,
              i < (sessionsDone % store.sessionsUntilLongBreak) && styles.sessionDotFilled,
            ]}
          />
        ))}
      </View>
      <Text style={styles.sessionText}>
        {sessionsDone} session{sessionsDone !== 1 ? 's' : ''} completed
      </Text>

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={handleReset}
          activeOpacity={0.7}
          accessibilityLabel="Reset timer"
          accessibilityRole="button"
        >
          <Ionicons name="refresh" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.playBtn, { backgroundColor: phaseColor }]}
          onPress={toggleTimer}
          activeOpacity={0.85}
          accessibilityLabel={isRunning ? 'Pause timer' : 'Start timer'}
          accessibilityRole="button"
        >
          <Ionicons
            name={isRunning ? 'pause' : 'play'}
            size={32}
            color="#ffffff"
            style={!isRunning ? { marginLeft: 4 } : undefined}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={handleSkip}
          activeOpacity={0.7}
          accessibilityLabel="Skip to next phase"
          accessibilityRole="button"
        >
          <Ionicons name="play-skip-forward" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Phase switcher */}
      <View style={styles.phasePicker}>
        {(['focus', 'break', 'longBreak'] as TimerPhase[]).map(p => (
          <TouchableOpacity
            key={p}
            style={[styles.phaseBtn, phase === p && { backgroundColor: phaseColor + '33' }]}
            onPress={() => resetToPhase(p)}
          >
            <Text style={[styles.phaseBtnText, phase === p && { color: phaseColor }]}>
              {PHASE_LABELS[p]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Suppress unused var warning for strokeDashoffset */}
      {strokeDashoffset != null && null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
    alignSelf: 'flex-start',
    paddingTop: 16,
    marginBottom: 4,
  },
  phaseLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 32,
    alignSelf: 'flex-start',
  },
  circleWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  circle: {
    backgroundColor: Colors.surface,
    borderWidth: 6,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  progressRing: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  timerText: {
    fontSize: 56,
    fontWeight: '200',
    color: Colors.textPrimary,
    letterSpacing: 2,
    fontVariant: ['tabular-nums'],
  },
  timerSubtext: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  sessionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  sessionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.textSecondary,
  },
  sessionDotFilled: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  sessionText: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 40,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
    marginBottom: 40,
  },
  secondaryBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  phasePicker: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  phaseBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surface,
  },
  phaseBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
});
