import { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Alert, Share, StyleSheet, AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Colors } from '../../lib/theme';
import { FEED_TEXT } from '../../lib/calendarFeed';
import { feedChangePending, feedLinkFor, loadFeedToken, newFeedLink, turnOffFeed } from '../../lib/calendarFeedActions';
import { askCalendarAccess, calendarAccess, openPhoneSettings, DEVICE_CALENDAR_TEXT, type CalendarAccess } from '../../lib/deviceCalendar';

// iPhone Settings, Calendars (build plan phase 8): whether Belific may read the
// phone's calendars (and the way to change it), and the outbound feed link
// (share, make a new one, turn off). Imported ICS subscriptions are a Windows
// feature; the phone already has its own calendars.
export default function CalendarsSection({ signedIn }: { signedIn: boolean }) {
  const [access, setAccess] = useState<CalendarAccess | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      calendarAccess().then(setAccess);
      Promise.all([loadFeedToken(), feedChangePending()])
        .then(([t, p]) => {
          setToken(t);
          setPending(p);
        })
        .catch(() => {});
    }, [signedIn]),
  );

  // Coming back from the Settings app, where calendar access may have changed.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') calendarAccess().then(setAccess);
    });
    return () => sub.remove();
  }, []);

  const link = feedLinkFor(token);

  async function onNew() {
    setBusy(true);
    try {
      const r = await newFeedLink();
      setToken(r.token);
      setPending(!r.synced);
    } catch {
      Alert.alert('Feed link', 'A new link could not be made. Nothing changed.');
    } finally {
      setBusy(false);
    }
  }

  function confirmNew() {
    Alert.alert(FEED_TEXT.regenerate, FEED_TEXT.regenerateConfirm, [
      { text: 'Cancel', style: 'cancel' },
      { text: FEED_TEXT.regenerate, style: 'destructive', onPress: onNew },
    ]);
  }

  function confirmOff() {
    Alert.alert(FEED_TEXT.turnOff, FEED_TEXT.turnOffConfirm, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: FEED_TEXT.turnOff,
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            const r = await turnOffFeed();
            setToken(null);
            setPending(!r.synced);
          } catch {
            Alert.alert('Feed link', 'The feed could not be turned off. Nothing changed.');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  // The share sheet has Copy, and AirDrop to a Mac to subscribe there.
  function onShare() {
    if (link) Share.share({ message: link }).catch(() => {});
  }

  const accessLine =
    access === 'granted'
      ? DEVICE_CALENDAR_TEXT.granted
      : access === 'denied'
        ? DEVICE_CALENDAR_TEXT.deniedBody
        : access === 'unavailable'
          ? DEVICE_CALENDAR_TEXT.unavailable
          : DEVICE_CALENDAR_TEXT.askBody;

  return (
    <>
      <Text style={styles.sectionHeader}>Calendars</Text>
      <View style={styles.card}>
        <View style={styles.block} accessibilityLabel="iPhone calendars">
          <View style={styles.titleRow}>
            <Text style={styles.label}>📅 iPhone calendars</Text>
            <Text style={styles.state}>{access === 'granted' ? 'Allowed' : access === 'denied' ? 'Off' : access === 'unavailable' ? 'Not available' : 'Not asked yet'}</Text>
          </View>
          <Text style={styles.hint}>{accessLine}</Text>
          {access === 'undetermined' && (
            <TouchableOpacity onPress={() => askCalendarAccess().then(setAccess)} style={styles.primary} accessibilityRole="button">
              <Text style={styles.primaryText}>{DEVICE_CALENDAR_TEXT.askButton}</Text>
            </TouchableOpacity>
          )}
          {(access === 'denied' || access === 'granted') && (
            <TouchableOpacity onPress={openPhoneSettings} style={styles.btn} accessibilityRole="button">
              <Text style={styles.btnText}>{access === 'denied' ? DEVICE_CALENDAR_TEXT.openSettings : 'Change in Settings'}</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.divider} />
        <View style={styles.block} accessibilityLabel="Calendar feed">
          <Text style={styles.label}>🔗 {FEED_TEXT.title}</Text>
          <Text style={styles.hint}>{FEED_TEXT.explain}</Text>
          {!signedIn ? (
            <Text style={styles.body}>{FEED_TEXT.signedOut}</Text>
          ) : !link ? (
            <TouchableOpacity onPress={onNew} disabled={busy} style={[styles.primary, busy && styles.disabled]} accessibilityRole="button">
              <Text style={styles.primaryText}>{busy ? 'Working…' : FEED_TEXT.create}</Text>
            </TouchableOpacity>
          ) : (
            <>
              <Text style={styles.link} selectable numberOfLines={2}>
                {link}
              </Text>
              <Text style={[styles.hint, pending && { color: Colors.danger }]}>{pending ? FEED_TEXT.pending : FEED_TEXT.active}</Text>
              <View style={styles.row}>
                <TouchableOpacity onPress={onShare} style={styles.btn} accessibilityRole="button" accessibilityLabel="Share or copy feed link">
                  <Text style={styles.btnText}>📋 Share or copy</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={confirmNew} disabled={busy} style={[styles.btn, busy && styles.disabled]} accessibilityRole="button">
                  <Text style={styles.btnText}>🔄 New link</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={confirmOff} disabled={busy} style={[styles.btn, busy && styles.disabled]} accessibilityRole="button">
                <Text style={styles.dangerText}>{FEED_TEXT.turnOff}</Text>
              </TouchableOpacity>
              <Text style={styles.hint}>{FEED_TEXT.secret}</Text>
            </>
          )}
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  sectionHeader: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 1, marginBottom: 8, marginTop: 8 },
  card: { backgroundColor: Colors.surface, borderRadius: 16, marginBottom: 28, overflow: 'hidden' },
  block: { paddingHorizontal: 16, paddingVertical: 14 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.border, marginHorizontal: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 16, color: Colors.textPrimary, fontWeight: '500' },
  state: { fontSize: 14, color: Colors.accentText, fontWeight: '600' },
  body: { marginTop: 8, fontSize: 14, color: Colors.textPrimary },
  hint: { marginTop: 6, fontSize: 13, lineHeight: 18, color: Colors.textSecondary },
  link: { marginTop: 10, fontSize: 12, color: Colors.textPrimary, fontFamily: 'Menlo', backgroundColor: Colors.background, padding: 8, borderRadius: 8 },
  row: { flexDirection: 'row', gap: 8 },
  primary: { marginTop: 12, minHeight: 44, paddingHorizontal: 16, borderRadius: 14, backgroundColor: Colors.accent, justifyContent: 'center', alignSelf: 'flex-start' },
  primaryText: { fontSize: 15, fontWeight: '600', color: Colors.onAccent },
  btn: { marginTop: 12, minHeight: 44, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, justifyContent: 'center', alignSelf: 'flex-start' },
  btnText: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  dangerText: { fontSize: 15, fontWeight: '600', color: Colors.danger },
  disabled: { opacity: 0.5 },
});
