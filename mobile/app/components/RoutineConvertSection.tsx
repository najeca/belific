import { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useTheme, useThemed } from '../../components/phone/theme';
import type { ColorTokens } from '../../lib/tokens';
import { convertRoutines, loadRoutineState, undoConversion, type RoutineState } from '../../lib/routineConvertActions';
import { DRY_RUN_NOTE, dryRunLines } from '../../lib/routineConvert';

// Settings, Data on the iPhone (build plan phase 4, iOS adaptation step 2): turn
// the routines into daily repeating tasks, which then show in Quests. The same
// plan, writes and Undo as the desktop's Convert (lib/routineConvert.ts,
// lib/routineConvertActions.ts): nothing changes until Convert is pressed in
// the confirmation, which lists every routine first (the dry run). Each routine
// becomes a daily series `rt_<routineId>` dated today and its routine row is
// tombstoned; what was ticked before (routine_completions) is never touched and
// still counts. Undo ends the series and gives each routine back as a new row
// with its ticks copied.
//
// Unlike the desktop there is no "Back up first" step: the phone has no backup
// folder. Signed in, every row is also on the server; Undo is the way back.
export default function RoutineConvertSection() {
  const { c: Colors } = useTheme();
  const styles = useThemed(make);
  const [state, setState] = useState<RoutineState | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setState(await loadRoutineState());
  }, []);
  useFocusEffect(
    useCallback(() => {
      reload().catch(() => {});
    }, [reload]),
  );

  if (!state) return null;
  const { summary, plan } = state;
  if (summary.pending === 0 && summary.converted === 0 && !note) return null;

  async function convert() {
    if (busy) return;
    setBusy(true);
    try {
      const n = await convertRoutines();
      setConfirming(false);
      setNote(n === 1 ? 'Converted 1 routine. It is in Quests now. You can undo it here.' : `Converted ${n} routines. They are in Quests now. You can undo it here.`);
      await reload();
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
    } catch {
      setNote('The undo could not finish. Try it again.');
    }
    setBusy(false);
  }

  return (
    <View style={styles.wrap} accessibilityLabel="Routines">
      {summary.pending > 0 && !confirming && (
        <>
          <Text style={styles.body}>{summary.pending === 1 ? '1 routine can become a repeating task.' : `${summary.pending} routines can become repeating tasks.`}</Text>
          <TouchableOpacity
            style={styles.btn}
            onPress={() => {
              setNote(null);
              setConfirming(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Convert routines"
          >
            <Text style={styles.btnText}>Convert routines…</Text>
          </TouchableOpacity>
        </>
      )}

      {confirming && (
        <View style={styles.confirm} accessibilityLabel="Convert routines confirmation">
          <Text style={styles.heading}>{plan.items.length === 1 ? 'Convert 1 routine to a repeating task' : `Convert ${plan.items.length} routines to repeating tasks`}</Text>
          {dryRunLines(plan).map((l) => (
            <Text key={l.id} style={styles.body}>
              {l.title} · {l.timeOfDay}
            </Text>
          ))}
          <Text style={styles.hint}>{DRY_RUN_NOTE}</Text>
          <Text style={styles.hint}>
            Each becomes a daily repeating task with no set time and no reminder, starting today, and shows in Quests. What you have already ticked is kept and counts for its streak.
          </Text>
          <Text style={styles.warning}>A computer with an older Belific shows them as ordinary repeating tasks. You can undo this here.</Text>
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.btnPrimary, busy && styles.disabled]}
              onPress={convert}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Convert"
            >
              <Text style={styles.btnPrimaryText}>Convert</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btn} onPress={() => setConfirming(false)} accessibilityRole="button" accessibilityLabel="Cancel conversion">
              <Text style={styles.btnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {summary.converted > 0 && !confirming && (
        <>
          <Text style={styles.body}>
            {summary.converted === 1 ? '1 routine is now a repeating task.' : `${summary.converted} routines are now repeating tasks.`}
          </Text>
          <TouchableOpacity style={[styles.btn, busy && styles.disabled]} onPress={undo} disabled={busy} accessibilityRole="button" accessibilityLabel="Undo conversion">
            <Text style={styles.btnText}>Undo conversion</Text>
          </TouchableOpacity>
        </>
      )}

      {note && <Text style={styles.hint}>{note}</Text>}
    </View>
  );
}

// The theme's colours (PLAN_phone P11): `Colors` here is the light or dark token set.
const make = (Colors: ColorTokens) =>
  StyleSheet.create({
  wrap: { padding: 16, gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  heading: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  body: { fontSize: 15, color: Colors.textPrimary },
  hint: { fontSize: 13, color: Colors.textSecondary },
  warning: { fontSize: 13, color: Colors.textPrimary },
  confirm: { gap: 8 },
  row: { flexDirection: 'row', gap: 10 },
  btn: { minHeight: 44, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, justifyContent: 'center', alignSelf: 'flex-start', backgroundColor: Colors.background },
  btnText: { fontSize: 15, color: Colors.textPrimary },
  btnPrimary: { minHeight: 44, paddingHorizontal: 18, borderRadius: 14, backgroundColor: Colors.accent, justifyContent: 'center' },
  btnPrimaryText: { fontSize: 15, fontWeight: '600', color: Colors.onAccent },
  disabled: { opacity: 0.5 },
});
