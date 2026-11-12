import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Colors } from '../../lib/theme';
import { addDays, dateKey } from '../../lib/kanban';
import { listTitle, resolveSelectedList } from '../../lib/lists';
import { createTaskIn } from '../../lib/taskCommands';
import { loadLists } from '../../lib/storage';
import { reminderDay, reminderWhen } from '../../lib/quickReminder';
import { KEEP_AS_TEXT, parseQuick, previewText, quickFields, understoodText } from '../../lib/quickParse';
import { toMinutes, toTime } from '../../lib/timebox';
import type { TaskList } from '../../lib/types';
import { closeOverlay, getSelectedList, notifyChanged } from './uiStore';
import { IconHeading } from './ui';
import PaletteSwitch from './PaletteSwitch';
import { DESKTOP_FONT_FAMILY } from './desktopFont';
import { pressStyle } from './pressStyle';
import { outlinedBtn, outlinedBtnHover, compactBtnText } from './ui';

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
  // F7: the person chose to keep the words as they are (until the box is emptied or something is added).
  const [plain, setPlain] = useState(false);
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
  // F7: simple phrases at the end of the text (lib/quickParse.ts). Not while "Remind me" is on (that has its own time).
  const read = remind || plain ? null : parseQuick(text, now);
  const understood = read && read.found ? read : null;

  async function submit(keepOpen: boolean) {
    const title = understood ? understood.title : text.trim();
    if (!title) return;
    if (remind) {
      if (!timeOk) return;
      await createTaskIn(title, { dueDate: remindDay, startTime: time, durationMinutes: 0 });
    } else {
      // F7: what was understood fills the Day, time, length and repeat; a Day typed in Q keeps the list too.
      const fields = understood ? quickFields(understood, now) : {};
      await createTaskIn(title, { ...(mode === 'today' ? { dueDate: todayKey } : { listKey: selected }), ...fields });
    }
    notifyChanged();
    if (keepOpen) {
      setText('');
      setPlain(false);
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
          onChangeText={(v) => {
            setText(v);
            if (!v.trim()) setPlain(false);
          }}
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
        {understood && (
          <View style={styles.understood} {...({ dataSet: { quickPreview: '1' } } as object)}>
            <Text style={styles.understoodText} numberOfLines={2} {...({ dataSet: { quickPreviewText: '1' } } as object)}>
              {understoodText(previewText(understood, now))}
            </Text>
            <Pressable
              onPress={() => setPlain(true)}
              style={pressStyle(({ hovered }) => [styles.keepBtn, hovered && outlinedBtnHover])}
              accessibilityRole="button"
              accessibilityLabel={KEEP_AS_TEXT}
              {...({ dataSet: { quickKeep: '1' } } as object)}
            >
              <Text style={compactBtnText}>{KEEP_AS_TEXT}</Text>
            </Pressable>
          </View>
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
  understood: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  understoodText: { flexShrink: 1, fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  keepBtn: { ...outlinedBtn, height: 32, paddingHorizontal: 12 } as object,
  hint: { fontSize: 12, color: Colors.textSecondary },
});
