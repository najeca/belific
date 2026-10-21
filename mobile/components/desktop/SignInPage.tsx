import React, { useEffect } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { SIGN_IN_TEXT } from '../../lib/authCore';
import { cancelSignIn, startAppleSignIn, startGoogleSignIn } from '../../lib/desktopAuth';
import { useAccount } from './useAccount';
import { DISPLAY_FONT_FAMILY } from './desktopFont';

// The Sign in page (checkpoint 12, decision 026): a page inside the app like
// Settings and Progress, with the Back button in the top strip, Escape to
// leave and focus returning to what opened it. Two methods for now, Apple and
// Google, both through the system browser. Signing in stays optional: "Not now"
// is as easy to reach as either method. Web only, no Alert.alert.
// (Email and password arrives with 2.19.0; there is no button for it yet.)
export default function SignInPage({ onDone }: { onDone: () => void }) {
  const { account, ui } = useAccount();

  // A finished sign in leaves the page: back to Settings or home.
  useEffect(() => {
    if (account !== null) onDone();
  }, [account, onDone]);

  async function notNow() {
    await cancelSignIn();
    onDone();
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} accessibilityLabel="Sign in page">
      <View style={styles.column}>
        <Text style={styles.heading} accessibilityRole="header">
          {SIGN_IN_TEXT.heading}
        </Text>
        <Text style={styles.body}>{SIGN_IN_TEXT.intro}</Text>
        <View style={styles.methods}>
          <Pressable onPress={() => startAppleSignIn()} accessibilityRole="button" accessibilityLabel={SIGN_IN_TEXT.apple} style={styles.method}>
            <Ionicons name="logo-apple" size={18} color={Colors.textPrimary} />
            <Text style={styles.methodText}>{SIGN_IN_TEXT.apple}</Text>
          </Pressable>
          <Pressable onPress={() => startGoogleSignIn()} accessibilityRole="button" accessibilityLabel={SIGN_IN_TEXT.google} style={styles.method}>
            <Ionicons name="logo-google" size={18} color={Colors.textPrimary} />
            <Text style={styles.methodText}>{SIGN_IN_TEXT.google}</Text>
          </Pressable>
        </View>
        {(ui.busy || ui.message) && (
          <Text style={styles.hint} accessibilityLiveRegion="polite">
            {ui.message ?? SIGN_IN_TEXT.waiting}
          </Text>
        )}
        <Pressable onPress={notNow} accessibilityRole="button" accessibilityLabel={SIGN_IN_TEXT.notNow} style={styles.notNow}>
          <Text style={styles.notNowText}>{SIGN_IN_TEXT.notNow}</Text>
        </Pressable>
        <Text style={styles.hint}>{SIGN_IN_TEXT.optional}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 16, paddingTop: 24, alignItems: 'center' },
  column: { width: '100%', maxWidth: 420, gap: 12 },
  heading: { fontSize: 18, fontFamily: DISPLAY_FONT_FAMILY, fontWeight: '700', color: Colors.textPrimary },
  body: { fontSize: 14, color: Colors.textPrimary },
  hint: { fontSize: 12, color: Colors.textSecondary },
  methods: { gap: 10, marginTop: 4 },
  method: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 44, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  methodText: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  notNow: { alignSelf: 'flex-start', paddingHorizontal: 14, height: 36, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background, justifyContent: 'center' },
  notNowText: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
});
