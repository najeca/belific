import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors } from '../../lib/theme';
import { subscribeSyncStatus } from '../../lib/sync';
import { convertRoutines, loadRoutineState, undoConversion, type RoutineState } from '../../lib/routineConvertActions';
import { CONVERT_WARNING, DRY_RUN_NOTE, dryRunLines, routineLines } from '../../lib/routineConvert';

// Settings, Data (checkpoint 10, 2.16.0): the quiet "N routines from your
// iPhone" line, and the button that turns them into repeating tasks. Nothing
// here changes data until Convert is pressed in the confirmation step, and that
// button stays disabled until the safety backup of this step exists. There is no
// other routine UI on the desktop. Web only: no Alert.alert, the confirmation is
// inline. All writes are in lib/routineConvertActions.ts.
export default function RoutineConvertRow({ onChanged }: { onChanged: () => void }) {
  const [state, setState] = useState<RoutineState | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [backup, setBackup] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setState(await loadRoutineState());
  }, []);
  useEffect(() => {
    reload().catch(() => {});
    // A pull from the phone can bring routines in while this page is open.
    return subscribeSyncStatus(() => {
      reload().catch(() => {});
    });
  }, [reload]);

  if (!state) return null;
  const { summary, plan } = state;
  const lines = routineLines(summary);
  if (lines.length === 0 && !note) return null;

  function close() {
    setConfirming(false);
    setBackup(null);
  }

  async function makeBackup() {
    const bridge = globalThis.belificDesktop;
    if (!bridge || busy) return;
    setBusy(true);
    setNote(null);
    try {
      setBackup(await bridge.actions.backupNow('routine-convert'));
    } catch {
      setBackup(null);
      setNote('The backup could not be made, so nothing was changed.');
    }
    setBusy(false);
  }

  async function convert() {
    if (!backup || busy) return;
    setBusy(true);
    try {
      const n = await convertRoutines();
      close();
      setNote(n === 1 ? 'Converted 1 routine. You can undo it here.' : `Converted ${n} routines. You can undo it here.`);
      await reload();
      onChanged();
    } catch {
      setNote('The conversion could not finish. Run it again to complete it.');
    }
    setBusy(false);
  }

  async function undo() {
    if (busy) return;
    setBusy(true);
    try {
      const n = await undoConversion();
      setNote(n === 1 ? 'Undone. The routine is back.' : `Undone. ${n} routines are back.`);
      await reload();
      onChanged();
    } catch {
      setNote('The undo could not finish. Try it again.');
    }
    setBusy(false);
  }

  return (
    <View style={styles.wrap} accessibilityLabel="Routines from your iPhone">
      {lines.map((line) => (
        <Text key={line} style={styles.body}>
          {line}
        </Text>
      ))}

      {summary.pending > 0 && !confirming && (
        <View style={styles.row}>
          <Pressable
            onPress={() => {
              setNote(null);
              setConfirming(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Convert routines from your iPhone"
            style={styles.btn}
          >
            <Text style={styles.btnText}>Convert routines from your iPhone…</Text>
          </Pressable>
        </View>
      )}

      {confirming && (
        <View style={styles.confirm} accessibilityLabel="Convert routines">
          <Text style={styles.heading}>
            {plan.items.length === 1 ? 'Convert 1 routine to a repeating task' : `Convert ${plan.items.length} routines to repeating tasks`}
          </Text>
          {dryRunLines(plan).map((l) => (
            <Text key={l.id} style={styles.body}>
              {l.title} · {l.timeOfDay}
            </Text>
          ))}
          <Text style={styles.hint}>{DRY_RUN_NOTE}</Text>
          <Text style={styles.hint}>
            Each becomes a daily repeating task with no set time and no reminder, starting today. What you have already ticked on
            your iPhone is kept.
          </Text>
          <Text style={styles.warning} accessibilityLabel="Conversion warning">
            {CONVERT_WARNING}
          </Text>
          <Text style={styles.hint} accessibilityLabel="Backup status">
            {backup ? `Backup saved: ${backup}` : 'Make a backup first. Convert unlocks once it is saved.'}
          </Text>
          <View style={styles.row}>
            <Pressable
              onPress={makeBackup}
              disabled={busy || !!backup}
              accessibilityRole="button"
              accessibilityLabel="Back up first"
              style={[styles.btn, (busy || !!backup) && styles.disabled]}
            >
              <Text style={styles.btnText}>Back up first</Text>
            </Pressable>
            <Pressable
              onPress={convert}
              disabled={!backup || busy}
              accessibilityRole="button"
              accessibilityLabel="Convert"
              accessibilityState={{ disabled: !backup || busy }}
              style={[styles.btnPrimary, (!backup || busy) && styles.disabled]}
            >
              <Text style={styles.btnPrimaryText}>Convert</Text>
            </Pressable>
            <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Cancel conversion" style={styles.btn}>
              <Text style={styles.btnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}

      {summary.converted > 0 && !confirming && (
        <View style={styles.row}>
          <Pressable
            onPress={undo}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Undo conversion"
            style={[styles.btn, busy && styles.disabled]}
          >
            <Text style={styles.btnText}>Undo conversion</Text>
          </Pressable>
        </View>
      )}
      {note && (
        <Text style={styles.hint} accessibilityLabel="Conversion note">
          {note}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border },
  heading: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  body: { fontSize: 14, color: Colors.textPrimary, marginTop: 2 },
  hint: { marginTop: 6, fontSize: 12, color: Colors.textSecondary },
  warning: { marginTop: 8, fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  confirm: { marginTop: 10, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background },
  btn: { paddingHorizontal: 14, height: 36, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background, justifyContent: 'center' },
  btnText: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  btnPrimary: { paddingHorizontal: 16, height: 36, borderRadius: 10, backgroundColor: Colors.accent, justifyContent: 'center' },
  btnPrimaryText: { fontSize: 13, fontWeight: '600', color: Colors.onAccent },
  disabled: { opacity: 0.5 },
});
