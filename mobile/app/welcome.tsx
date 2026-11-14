import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { ColorTokens } from '../lib/tokens';
import { useStyles, useTheme } from '../components/phone/theme';
import { inter, newsreader, type } from '../components/phone/type';
import { MIN_TOUCH } from '../components/phone/ui';
import { EMPTY_ACCOUNT_TEXT, FIRST_LAUNCH_TEXT, emptyAccountBody } from '../lib/firstLaunch';
import { FAILURE_TEXT } from '../lib/authCore';
import { signInWithApple } from '../lib/auth';
import { phoneGoogle } from '../lib/phoneGoogleAuth';
import {
  chooseNoAccount,
  chooseSignOutAndRetry,
  chooseStartFresh,
  getPhoneGate,
  loadPhoneGate,
  retryPhoneCheck,
  subscribePhoneGate,
} from '../lib/phoneAccount';

// The phone's Sign in screen (PLAN_phone_parity item A, 3.58.0): first launch and after any sign out. Google and
// Apple only (email sign in is dropped for now, decision 4). After a sign in it checks the account before anything
// syncs; an account with no tasks gets the "This account has no tasks yet" sheet. Text 14 px or more, every button
// 44 pt or more, nothing in red.

const make = (c: ColorTokens) => ({
  screen: { flex: 1, backgroundColor: c.background },
  body: { flexGrow: 1, paddingHorizontal: 24, justifyContent: 'center' as const, gap: 14 },
  heading: { ...newsreader(600), fontSize: 32, lineHeight: 38, color: c.textPrimary },
  status: { ...inter(400), fontSize: 14, lineHeight: 20, color: c.textSecondary },
  intro: { ...type.body, color: c.textPrimary },
  primary: { minHeight: 52, borderRadius: 14, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 10, paddingHorizontal: 16, borderWidth: 1 },
  google: { backgroundColor: c.surface, borderColor: c.borderStrong },
  apple: { backgroundColor: c.textPrimary, borderColor: c.textPrimary },
  primaryText: { ...inter(600), fontSize: 17, lineHeight: 22, color: c.textPrimary },
  appleText: { color: c.background },
  message: { ...inter(500), fontSize: 15, lineHeight: 21, color: c.textPrimary },
  quiet: { minHeight: MIN_TOUCH, alignSelf: 'center' as const, justifyContent: 'center' as const, paddingHorizontal: 12 },
  quietText: { ...inter(600), fontSize: 15, lineHeight: 20, color: c.accentText, textDecorationLine: 'underline' as const },
  note: { ...inter(400), fontSize: 14, lineHeight: 20, color: c.textSecondary, textAlign: 'center' as const },
  dim: { position: 'absolute' as const, left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(20, 24, 22, 0.45)', justifyContent: 'flex-end' as const },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 22, gap: 12, borderWidth: 1, borderColor: c.border },
  sheetTitle: { ...type.sheetTitle, color: c.textPrimary },
  sheetText: { ...inter(400), fontSize: 15, lineHeight: 22, color: c.textPrimary },
  sheetQuiet: { ...inter(500), fontSize: 14, lineHeight: 20, color: c.textSecondary },
  choice: { minHeight: 52, borderRadius: 14, alignItems: 'center' as const, justifyContent: 'center' as const, paddingHorizontal: 16, borderWidth: 1 },
  choiceMain: { backgroundColor: c.accent, borderColor: c.accent },
  choiceMainText: { ...inter(600), fontSize: 16, lineHeight: 21, color: c.onAccent },
  choiceOther: { backgroundColor: c.surface, borderColor: c.borderStrong },
  choiceOtherText: { ...inter(600), fontSize: 16, lineHeight: 21, color: c.textPrimary },
  choiceNote: { ...inter(400), fontSize: 14, lineHeight: 20, color: c.textSecondary, marginTop: -4 },
});

const data = (o: Record<string, string>) => ({ dataSet: o }) as object;

export default function Welcome() {
  const s = useStyles(make);
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [gate, setGate] = useState(getPhoneGate);
  const [google, setGoogle] = useState(phoneGoogle.getState());
  const [appleBusy, setAppleBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);

  useEffect(() => subscribePhoneGate(setGate), []);
  useEffect(() => phoneGoogle.subscribe(setGoogle), []);
  useEffect(() => {
    if (!getPhoneGate().loaded) loadPhoneGate().catch(() => {});
  }, []);
  // Opened from Settings, Account, Sign in (?from=settings): the screen shows even on a phone that chose "Use without
  // an account" before.
  const { from } = useLocalSearchParams<{ from?: string }>();
  const forced = from === 'settings' && !gate.signedIn;
  const view = forced && gate.screen === 'app' ? 'sign-in' : gate.screen;
  useEffect(() => {
    if (gate.loaded && view === 'app') router.replace('/(tabs)/today');
  }, [gate.loaded, view, router]);

  async function apple() {
    setMessage(null);
    setAppleBusy(true);
    try {
      await signInWithApple();
    } catch (e) {
      // Apple's own sheet already says when the person cancelled; only a real failure gets a line.
      const code = (e as { code?: string })?.code;
      if (code !== 'ERR_REQUEST_CANCELED') setMessage(FAILURE_TEXT.notCompleted);
    } finally {
      setAppleBusy(false);
    }
  }

  function googleTap() {
    setMessage(null);
    if (google.busy) phoneGoogle.cancel();
    else phoneGoogle.start().catch(() => {});
  }

  async function choose(fn: () => Promise<void>) {
    if (choosing) return;
    setChoosing(true);
    try {
      await fn();
    } finally {
      setChoosing(false);
    }
  }

  const screen = gate.loaded ? view : 'loading';
  const shownMessage = message ?? google.message;

  return (
    <View style={s.screen} {...data({ welcome: screen })}>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <ScrollView contentContainerStyle={[s.body, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        {screen === 'loading' ? null : screen === 'checking' ? (
          <View style={{ alignItems: 'center', gap: 14 }} {...data({ welcomeChecking: '1' })}>
            <ActivityIndicator color={c.textSecondary} />
            <Text style={s.intro} accessibilityLiveRegion="polite">{FIRST_LAUNCH_TEXT.checking}</Text>
          </View>
        ) : screen === 'check-failed' ? (
          <>
            <Text style={s.intro} {...data({ welcomeFailed: '1' })}>{FIRST_LAUNCH_TEXT.checkFailed}</Text>
            <Pressable style={[s.choice, s.choiceMain]} onPress={() => choose(retryPhoneCheck)} accessibilityRole="button" accessibilityLabel={FIRST_LAUNCH_TEXT.tryAgain} {...data({ welcomeBtn: 'retry' })}>
              <Text style={s.choiceMainText}>{FIRST_LAUNCH_TEXT.tryAgain}</Text>
            </Pressable>
            <Pressable style={[s.choice, s.choiceOther]} onPress={() => choose(chooseSignOutAndRetry)} accessibilityRole="button" accessibilityLabel={EMPTY_ACCOUNT_TEXT.signOut} {...data({ welcomeBtn: 'sign-out' })}>
              <Text style={s.choiceOtherText}>{EMPTY_ACCOUNT_TEXT.signOut}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <View>
              <Text style={s.heading} accessibilityRole="header">{FIRST_LAUNCH_TEXT.heading}</Text>
              {/* The same "Not signed in" line the tabs show under their title (3.53.2). */}
              <Text style={s.status} {...data({ syncBadge: '1' })}>{gate.signedIn ? 'Signed in' : 'Not signed in'}</Text>
            </View>
            <Text style={s.intro}>{FIRST_LAUNCH_TEXT.intro}</Text>
            <View style={{ gap: 12, marginTop: 8 }}>
              <Pressable
                style={({ pressed }) => [s.primary, s.google, pressed && { opacity: 0.8 }]}
                onPress={googleTap}
                disabled={appleBusy}
                accessibilityRole="button"
                accessibilityLabel={google.busy ? `${FIRST_LAUNCH_TEXT.cancelGoogle} Google sign in` : FIRST_LAUNCH_TEXT.google}
                {...data({ welcomeBtn: 'google' })}
              >
                {google.busy ? <ActivityIndicator color={c.textSecondary} /> : <Ionicons name="logo-google" size={20} color={c.textPrimary} />}
                <Text style={s.primaryText}>{google.busy ? FIRST_LAUNCH_TEXT.cancelGoogle : FIRST_LAUNCH_TEXT.google}</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [s.primary, s.apple, (pressed || appleBusy) && { opacity: 0.8 }]}
                onPress={apple}
                disabled={appleBusy || google.busy}
                accessibilityRole="button"
                accessibilityLabel={FIRST_LAUNCH_TEXT.apple}
                {...data({ welcomeBtn: 'apple' })}
              >
                {appleBusy ? <ActivityIndicator color={c.background} /> : <Ionicons name="logo-apple" size={21} color={c.background} />}
                <Text style={[s.primaryText, s.appleText]}>{FIRST_LAUNCH_TEXT.apple}</Text>
              </Pressable>
            </View>
            {shownMessage ? (
              <Text style={s.message} accessibilityLiveRegion="polite" {...data({ welcomeMessage: '1' })}>
                {shownMessage}
              </Text>
            ) : null}
            <View style={{ marginTop: 18, gap: 2 }}>
              <Pressable style={s.quiet} onPress={() => choose(async () => {
                  await chooseNoAccount();
                  router.replace('/(tabs)/today');
                })} accessibilityRole="button" accessibilityLabel={FIRST_LAUNCH_TEXT.noAccount} {...data({ welcomeBtn: 'no-account' })}>
                <Text style={s.quietText}>{FIRST_LAUNCH_TEXT.noAccount}</Text>
              </Pressable>
              <Text style={s.note}>{FIRST_LAUNCH_TEXT.noAccountNote}</Text>
            </View>
          </>
        )}
      </ScrollView>

      {screen === 'empty-account' ? (
        <View style={s.dim} {...data({ emptySheet: '1' })} accessibilityViewIsModal>
          <View style={[s.sheet, { paddingBottom: insets.bottom + 20 }]}>
            <Text style={s.sheetTitle} accessibilityRole="header">{EMPTY_ACCOUNT_TEXT.heading}</Text>
            <Text style={s.sheetText} {...data({ emptyBody: '1' })}>{emptyAccountBody(gate.method)}</Text>
            <Text style={s.sheetQuiet}>{EMPTY_ACCOUNT_TEXT.nothingUploaded}</Text>
            <Pressable
              style={({ pressed }) => [s.choice, s.choiceMain, (pressed || choosing) && { opacity: 0.8 }]}
              onPress={() => choose(chooseSignOutAndRetry)}
              accessibilityRole="button"
              accessibilityLabel={EMPTY_ACCOUNT_TEXT.signOut}
              {...data({ welcomeBtn: 'sign-out' })}
            >
              <Text style={s.choiceMainText}>{EMPTY_ACCOUNT_TEXT.signOut}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [s.choice, s.choiceOther, (pressed || choosing) && { opacity: 0.8 }]}
              onPress={() => choose(chooseStartFresh)}
              accessibilityRole="button"
              accessibilityLabel={EMPTY_ACCOUNT_TEXT.startFresh}
              {...data({ welcomeBtn: 'start-fresh' })}
            >
              <Text style={s.choiceOtherText}>{EMPTY_ACCOUNT_TEXT.startFresh}</Text>
            </Pressable>
            <Text style={s.choiceNote}>{EMPTY_ACCOUNT_TEXT.startFreshNote}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}
