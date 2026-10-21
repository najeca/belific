import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors } from '../../lib/theme';
import { RESET_WARNING } from '../../lib/resetCache';
import { resetLocalCache } from '../../lib/resetActions';

// "Reset local cache and resync" (build plan phase 7), in Settings, Data. Asks
// first; the rules (upload everything, refuse if anything cannot be uploaded)
// are in lib/resetCache.ts. The result is always said in words.
export default function ResetCacheRow({ onChanged }: { onChanged: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      const r = await resetLocalCache();
      setResult({ ok: r.kind === 'done', text: r.message });
      setConfirming(false);
      onChanged();
    } catch {
      setResult({ ok: false, text: 'Something went wrong, so nothing was reset.' });
      setConfirming(false);
    }
    setBusy(false);
  }

  return (
    <View>
      <View style={styles.row}>
        <Pressable
          onPress={() => {
            setResult(null);
            setConfirming(true);
          }}
          disabled={busy || confirming}
          accessibilityRole="button"
          accessibilityLabel="Reset local cache and resync"
          style={[styles.btn, (busy || confirming) && styles.disabled]}
        >
          <Text style={styles.btnText}>Reset local cache and resync</Text>
        </Pressable>
      </View>
      {confirming && (
        <View style={styles.confirm} accessibilityLabel="Reset local cache confirmation">
          <Text style={styles.body}>{RESET_WARNING}</Text>
          <View style={styles.row}>
            <Pressable onPress={run} disabled={busy} accessibilityRole="button" accessibilityLabel="Confirm reset local cache" style={[styles.btn, busy && styles.disabled]}>
              <Text style={styles.dangerText}>{busy ? 'Syncing first…' : 'Reset'}</Text>
            </Pressable>
            <Pressable onPress={() => setConfirming(false)} disabled={busy} accessibilityRole="button" accessibilityLabel="Cancel reset" style={styles.btn}>
              <Text style={styles.btnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}
      {result && (
        <Text style={[styles.hint, !result.ok && { color: Colors.danger }]} accessibilityLabel="Reset result">
          {result.text}
        </Text>
      )}
      <Text style={styles.hint}>Fixes a copy that has gone wrong. Anything not uploaded yet is uploaded first; if something cannot be uploaded, nothing is deleted.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  confirm: { marginTop: 10, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background },
  body: { fontSize: 14, color: Colors.textPrimary },
  hint: { marginTop: 6, fontSize: 12, color: Colors.textSecondary },
  btn: { paddingHorizontal: 14, height: 36, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background, justifyContent: 'center' },
  btnText: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  dangerText: { fontSize: 13, fontWeight: '600', color: Colors.danger },
  disabled: { opacity: 0.5 },
});
