import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors } from '../../lib/theme';
import { answerAccountChoice, getAuthUi, subscribeAuthUi } from '../../lib/desktopAuth';

// Shown when the account that signed in is not the one this computer last
// used and local data exists (checkpoint 6.1, M2). Nothing is uploaded until
// one of the two buttons is pressed; there is no default and no close button.
// Web only, no Alert.alert.
export default function AccountChoiceModal() {
  const [ui, setUi] = useState(getAuthUi);
  const [working, setWorking] = useState(false);
  useEffect(() => subscribeAuthUi(setUi), []);
  if (!ui.choice) return null;

  async function choose(upload: boolean) {
    setWorking(true);
    await answerAccountChoice(upload);
    setWorking(false);
  }

  return (
    <View style={styles.overlay}>
      <View style={styles.backdrop} />
      <View style={styles.panel} accessibilityViewIsModal>
        <Text style={styles.heading}>This is a different account</Text>
        <Text style={styles.body}>
          This computer already has data that was not synced to this account. Nothing has been uploaded yet. Choose what to do
          with it. A backup of it is saved either way.
        </Text>
        <Pressable
          onPress={() => choose(true)}
          disabled={working}
          accessibilityRole="button"
          style={[styles.btnPrimary, working && styles.disabled]}
        >
          <Text style={styles.btnPrimaryText}>Upload this computer's data to this account</Text>
        </Pressable>
        <Pressable
          onPress={() => choose(false)}
          disabled={working}
          accessibilityRole="button"
          style={[styles.btn, working && styles.disabled]}
        >
          <Text style={styles.btnText}>Start empty on this account (a backup of the local data is kept)</Text>
        </Pressable>
        {ui.message && <Text style={styles.hint}>{ui.message}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 200 },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(38, 37, 31, 0.45)' },
  panel: { width: 460, maxWidth: '92%', padding: 20, gap: 10, backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border },
  heading: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  body: { fontSize: 14, color: Colors.textPrimary, marginBottom: 4 },
  hint: { fontSize: 12, color: Colors.textSecondary },
  btn: { paddingHorizontal: 14, minHeight: 44, paddingVertical: 8, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background, justifyContent: 'center' },
  btnText: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  btnPrimary: { paddingHorizontal: 16, minHeight: 44, paddingVertical: 8, borderRadius: 14, backgroundColor: Colors.accent, justifyContent: 'center' },
  btnPrimaryText: { fontSize: 13, fontWeight: '600', color: Colors.onAccent },
  disabled: { opacity: 0.5 },
});
