import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Colors } from '../../lib/theme';
import { addDays, dateKey } from '../../lib/kanban';
import { listTitle, resolveSelectedList } from '../../lib/lists';
import { createTaskIn } from '../../lib/taskCommands';
import { loadLists } from '../../lib/storage';
import { reminderDay, reminderWhen } from '../../lib/quickReminder';
import { toMinutes, toTime } from '../../lib/timebox';
import type { TaskList } from '../../lib/types';
import { closeOverlay, getSelectedList, notifyChanged } from './uiStore';
import { IconHeading } from './ui';
import PaletteSwitch from './PaletteSwitch';
import { DESKTOP_FONT_FAMILY } from './desktopFont';

// Quick capture (Q, and T for today; build plan phase 3). One box over the home
// screen, wherever the keyboard focus was, whichever panes are open: type, press
// Enter, and the task exists. Q adds it to the list the left pane shows (Brain
// Dump by default), T adds it to today. Shift+Enter adds it and keeps the box
// open for the next one. Escape closes it and returns focus to where it was. It
// is an overlay, not a screen.
// F6 of PLAN_daily_flow: the "Remind me" switch with a time makes it a quick reminder instead (text and a time, no
// length, lib/quickReminder.ts): today at that time, or tomorrow when the time has passed. Q and T work as before.

// The next half hour from now, as 'HH:mm' (the time the switch starts with).
function nextHalfHour(now: Date): string {
  const m = now.getHours() * 60 + now.getMinutes();
  return toTime(Math.min(23 * 60 + 30, Math.floor(m / 30) * 30 + 30));
}

const timeStyle: React.CSSProperties = {
  height: 40,
  padding: '0 10px',
  borderRadius: 10,
  border: `1px solid ${Colors.border}`,
  background: Colors.background,
  color: Colors.textPrimary,
  fontSize: 16,
  fontFamily: DESKTOP_FONT_FAMILY,
  outlineColor: Colors.accent,
};

export default function QuickCapture({ mode }: { mode: 'list' | 'today' }) {
  const [text, setText] = useState('');
  const [lists, setLists] = useState<TaskList[]>([]);
  const [added, setAdded] = useState(0);
  const [remind, setRemind] = useState(false);
  const [time, setTime] = useState(() => nextHalfHour(new Date()));
  const input = useRef<TextInput>(null);

  useEffect(() => {
    loadLists().then(setLists);
    const before = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => input.current?.focus(), 20);
    return () => {
      clearTimeout(t);
      if (before && before.isConnected) before.focus({ preventScroll: true });
    };
  }, []);

  const selected = resolveSelectedList(getSelectedList(), lists);
  const where = mode === 'today' ? 'Today' : listTitle(lists.find((l) => l.key === selected));
  const now = new Date();
  const todayKey = dateKey(now);
  const remindDay = reminderDay(time, now, todayKey, dateKey(addDays(now, 1)));
  const timeOk = toMinutes(time) !== null;

  async function submit(keepOpen: boolean) {
    const title = text.trim();
    if (!title) return;
    if (remind) {
      if (!timeOk) return;
      await createTaskIn(title, { dueDate: remindDay, startTime: time, durationMinutes: 0 });
    } else {
      await createTaskIn(title, mode === 'today' ? { dueDate: todayKey } : { listKey: selected });
    }
    notifyChanged();
    if (keepOpen) {
      setText('');
      setAdded((n) => n + 1);
      input.current?.focus();
    } else {
      closeOverlay();
    }
  }

  const keys = (key: string | undefined, shift: boolean, stop: () => void, prevent: () => void) => {
    if (key === 'Escape') {
      stop();
      closeOverlay();
    } else if (key === 'Enter') {
      prevent();
      submit(shift);
    }
  };

  return (
    <Pressable style={styles.scrim} onPress={closeOverlay} accessibilityLabel="Close quick capture">
      <Pressable onPress={() => {}} style={styles.card} accessibilityLabel="Quick capture" {...({ role: 'dialog', 'aria-modal': true } as object)}>
        <IconHeading icon={remind ? 'alarm-outline' : 'flash-outline'} style={styles.heading}>
          {remind ? 'Quick reminder' : `Quick capture to ${where}`}
        </IconHeading>
        <TextInput
          ref={input}
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={remind ? 'What should I remind you of?' : 'What needs doing?'}
          placeholderTextColor={Colors.textSecondary}
          onKeyPress={(e) => {
            const ev = e.nativeEvent as { key?: string; shiftKey?: boolean };
            keys(
              ev.key,
              !!ev.shiftKey,
              () => (e as { stopPropagation?: () => void }).stopPropagation?.(),
              () => (e as { preventDefault?: () => void }).preventDefault?.(),
            );
          }}
          accessibilityLabel="Quick capture task"
        />
        <View style={styles.remindRow} {...({ dataSet: { remindRow: '1' } } as object)}>
          <Text style={styles.remindLabel}>Remind me</Text>
          <PaletteSwitch value={remind} onValueChange={setRemind} label="Remind me" />
          {remind && (
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              onKeyDown={(e) => keys(e.key, e.shiftKey, () => e.stopPropagation(), () => e.preventDefault())}
              style={timeStyle}
              aria-label="Remind me at"
              data-remind-time="1"
            />
          )}
        </View>
        {remind && (
          <Text style={styles.when} {...({ dataSet: { remindWhen: '1' } } as object)}>
            {reminderWhen(time, remindDay, todayKey)}. No length: it only reminds you.
          </Text>
        )}
        <Text style={styles.hint}>
          Enter adds it. Shift+Enter adds it and keeps this open. Escape closes.
          {added > 0 ? `  ${added} added.` : ''}
        </Text>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 60, alignItems: 'center', paddingTop: 140, backgroundColor: Colors.scrim },
  card: { width: 520, maxWidth: '92%', borderRadius: 16, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, padding: 16, gap: 10, alignSelf: 'center' },
  heading: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, color: Colors.textSecondary },
  input: { height: 44, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background, color: Colors.textPrimary, fontSize: 16, outlineColor: Colors.accent },
  remindRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 },
  remindLabel: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  when: { fontSize: 14, color: Colors.textSecondary },
  hint: { fontSize: 12, color: Colors.textSecondary },
});
