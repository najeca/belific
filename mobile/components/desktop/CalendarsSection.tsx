import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors } from '../../lib/theme';
import { DESKTOP_FONT_FAMILY } from './desktopFont';
import { FEED_TEXT } from '../../lib/calendarFeed';
import { feedChangePending, feedLinkFor, loadFeedToken, newFeedLink, turnOffFeed } from '../../lib/calendarFeedActions';
import { fetchErrorText, linkHost, refreshedText, MAX_SUBSCRIPTIONS } from '../../lib/icsSubscriptions';
import { addSubscription, loadIcs, refreshAll, refreshSubscription, removeSubscription, useIcs } from './icsStore';

// Settings, Calendars (build plan phase 8): the outbound feed link (copy, make
// a new one, turn off), the imported subscriptions (add, refresh, remove, last
// refreshed, errors) and where the iPhone's own calendars are. Web only: inline
// confirmations, no Alert.
export default function CalendarsSection({ signedIn, refreshKey }: { signedIn: boolean; refreshKey: number }) {
  return (
    <View>
      <FeedBlock signedIn={signedIn} refreshKey={refreshKey} />
      <ImportsBlock />
      <Text style={styles.subTitle}>📱 iPhone calendars</Text>
      <Text style={styles.hint}>
        The iPhone shows its own calendars (iCloud, Google, Outlook accounts on the phone) in Belific's Calendar tab, read only, once you allow it there. Settings, Calendars on the iPhone shows whether it is allowed. Nothing from them comes to this computer.
      </Text>
    </View>
  );
}

function FeedBlock({ signedIn, refreshKey }: { signedIn: boolean; refreshKey: number }) {
  const [token, setToken] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'regenerate' | 'off' | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // Read again when data changes (a sync can bring the link from the other device).
  useEffect(() => {
    let live = true;
    Promise.all([loadFeedToken(), feedChangePending()])
      .then(([t, p]) => {
        if (!live) return;
        setToken(t);
        setPending(p);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [refreshKey, signedIn]);

  const link = feedLinkFor(token);

  async function onNew() {
    setConfirm(null);
    setNote(null);
    setBusy(true);
    try {
      const r = await newFeedLink();
      setToken(r.token);
      setPending(!r.synced);
    } catch {
      setNote('A new link could not be made. Nothing changed.');
    }
    setBusy(false);
  }

  async function onOff() {
    setConfirm(null);
    setNote(null);
    setBusy(true);
    try {
      const r = await turnOffFeed();
      setToken(null);
      setPending(!r.synced);
      setNote(r.synced ? 'The feed is off. The link no longer works.' : 'The feed is off on this device. The link stops working once this has synced.');
    } catch {
      setNote('The feed could not be turned off. Nothing changed.');
    }
    setBusy(false);
  }

  async function onCopy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setNote(FEED_TEXT.copied);
    } catch {
      setNote('Could not copy. Select the link above and press Ctrl+C.');
    }
  }

  return (
    <View accessibilityLabel="Calendar feed">
      <Text style={styles.subTitle}>🔗 {FEED_TEXT.title}</Text>
      <Text style={styles.hint}>{FEED_TEXT.explain}</Text>
      {!signedIn ? (
        <Text style={styles.body}>{FEED_TEXT.signedOut}</Text>
      ) : !link ? (
        <>
          <Text style={styles.body}>{FEED_TEXT.none}</Text>
          <View style={styles.row}>
            <Pressable onPress={onNew} disabled={busy} accessibilityRole="button" accessibilityLabel={FEED_TEXT.create} style={[styles.btnPrimary, busy && styles.disabled]}>
              <Text style={styles.btnPrimaryText}>{busy ? 'Working…' : FEED_TEXT.create}</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          <input readOnly value={link} aria-label="Feed link" onFocus={(e) => e.currentTarget.select()} style={linkStyle} />
          <Text style={[styles.hint, pending && { color: Colors.danger }]} accessibilityLabel="Feed status">
            {pending ? FEED_TEXT.pending : FEED_TEXT.active}
          </Text>
          <View style={styles.row}>
            <Pressable onPress={onCopy} accessibilityRole="button" accessibilityLabel={FEED_TEXT.copy} style={styles.btn}>
              <Text style={styles.btnText}>📋 {FEED_TEXT.copy}</Text>
            </Pressable>
            <Pressable onPress={() => setConfirm('regenerate')} disabled={busy} accessibilityRole="button" accessibilityLabel={FEED_TEXT.regenerate} style={[styles.btn, busy && styles.disabled]}>
              <Text style={styles.btnText}>🔄 {FEED_TEXT.regenerate}</Text>
            </Pressable>
            <Pressable onPress={() => setConfirm('off')} disabled={busy} accessibilityRole="button" accessibilityLabel={FEED_TEXT.turnOff} style={[styles.btn, busy && styles.disabled]}>
              <Text style={styles.dangerText}>{FEED_TEXT.turnOff}</Text>
            </Pressable>
          </View>
          {confirm && (
            <View style={styles.confirm}>
              <Text style={styles.body}>{confirm === 'regenerate' ? FEED_TEXT.regenerateConfirm : FEED_TEXT.turnOffConfirm}</Text>
              <View style={styles.row}>
                <Pressable onPress={confirm === 'regenerate' ? onNew : onOff} accessibilityRole="button" accessibilityLabel={confirm === 'regenerate' ? 'Confirm make a new link' : 'Confirm turn off feed'} style={styles.btn}>
                  <Text style={styles.dangerText}>{confirm === 'regenerate' ? FEED_TEXT.regenerate : FEED_TEXT.turnOff}</Text>
                </Pressable>
                <Pressable onPress={() => setConfirm(null)} accessibilityRole="button" style={styles.btn}>
                  <Text style={styles.btnText}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          )}
          <Text style={styles.hint}>{FEED_TEXT.secret}</Text>
          <Text style={styles.hint}>
            Google Calendar: Other calendars, +, From URL. Apple Calendar: File, New Calendar Subscription. Outlook: Add calendar, Subscribe from web.
          </Text>
        </>
      )}
      {note && (
        <Text style={styles.hint} accessibilityLabel="Feed note">
          {note}
        </Text>
      )}
    </View>
  );
}

function ImportsBlock() {
  const ics = useIcs();
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    loadIcs();
    const id = setInterval(() => setNow(Date.now()), 30 * 1000);
    return () => clearInterval(id);
  }, []);

  async function onAdd() {
    setMessage(null);
    setAdding(true);
    const r = await addSubscription(url, name);
    setAdding(false);
    if (r.ok) {
      setUrl('');
      setName('');
      setMessage('Calendar added.');
    } else setMessage(r.message);
  }

  return (
    <View accessibilityLabel="Imported calendars">
      <Text style={styles.subTitle}>📥 Calendars shown in Belific</Text>
      <Text style={styles.hint}>
        Paste a calendar's ICS or webcal link (Google: Settings, the calendar, Secret address in iCal format; Outlook: Publish a calendar, ICS). Its events show in the Calendar beside your tasks, read only. They stay on this computer and are never synced. Refreshed every 30 minutes while Belific is open.
      </Text>
      {ics.subs.length === 0 ? (
        <Text style={styles.body}>No calendars added.</Text>
      ) : (
        ics.subs.map((s) => {
          const err = fetchErrorText(s.lastError);
          const refreshing = ics.refreshing.includes(s.id);
          return (
            <View key={s.id} style={styles.sub} accessibilityLabel={`Imported calendar ${s.name}`} {...({ dataSet: { icsSub: s.id } } as object)}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.body} numberOfLines={1}>
                  📅 {s.name}
                </Text>
                <Text style={styles.hint} numberOfLines={1}>
                  {linkHost(s.url)} · {s.eventCount ?? 0} {s.eventCount === 1 ? 'event' : 'events'} · {refreshing ? 'Refreshing…' : refreshedText(s.lastRefreshedAt, now)}
                </Text>
                {err && (
                  <Text style={[styles.hint, { color: Colors.danger }]} accessibilityLabel={`Error for ${s.name}`}>
                    Last try failed: {err}
                  </Text>
                )}
              </View>
              {confirmRemove === s.id ? (
                <View style={styles.rowTight}>
                  <Pressable
                    onPress={() => {
                      setConfirmRemove(null);
                      removeSubscription(s.id);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Confirm remove ${s.name}`}
                    style={styles.btn}
                  >
                    <Text style={styles.dangerText}>Remove</Text>
                  </Pressable>
                  <Pressable onPress={() => setConfirmRemove(null)} accessibilityRole="button" style={styles.btn}>
                    <Text style={styles.btnText}>Cancel</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.rowTight}>
                  <Pressable onPress={() => refreshSubscription(s.id)} disabled={refreshing} accessibilityRole="button" accessibilityLabel={`Refresh ${s.name}`} style={[styles.btn, refreshing && styles.disabled]}>
                    <Text style={styles.btnText}>Refresh</Text>
                  </Pressable>
                  <Pressable onPress={() => setConfirmRemove(s.id)} accessibilityRole="button" accessibilityLabel={`Remove ${s.name}`} style={styles.btn}>
                    <Text style={styles.btnText}>Remove</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        })
      )}
      {ics.subs.length > 1 && (
        <View style={styles.row}>
          <Pressable onPress={() => refreshAll(false)} accessibilityRole="button" accessibilityLabel="Refresh all calendars" style={styles.btn}>
            <Text style={styles.btnText}>Refresh all</Text>
          </Pressable>
        </View>
      )}
      {ics.subs.length < MAX_SUBSCRIPTIONS && (
        <View style={styles.addRow}>
          <input
            type="url"
            value={url}
            placeholder="https:// or webcal:// link"
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && url.trim() && !adding) onAdd();
            }}
            aria-label="Calendar link"
            spellCheck={false}
            autoComplete="off"
            style={{ ...inputStyle, flex: 2 }}
          />
          <input type="text" value={name} placeholder="Name (optional)" onChange={(e) => setName(e.target.value)} aria-label="Calendar name" maxLength={60} style={{ ...inputStyle, flex: 1 }} />
          <Pressable onPress={onAdd} disabled={adding || !url.trim()} accessibilityRole="button" accessibilityLabel="Add calendar" style={[styles.btnPrimary, (adding || !url.trim()) && styles.disabled]}>
            <Text style={styles.btnPrimaryText}>{adding ? 'Checking…' : 'Add'}</Text>
          </Pressable>
        </View>
      )}
      {message && (
        <Text style={styles.hint} accessibilityLabel="Import note">
          {message}
        </Text>
      )}
    </View>
  );
}

const inputStyle: React.CSSProperties = {
  height: 36,
  minWidth: 0,
  padding: '0 10px',
  borderRadius: 10,
  border: `1px solid ${Colors.border}`,
  background: Colors.background,
  color: Colors.textPrimary,
  fontSize: 14,
  fontFamily: DESKTOP_FONT_FAMILY,
  outlineColor: Colors.accent,
};

const linkStyle: React.CSSProperties = {
  ...inputStyle,
  width: '100%',
  boxSizing: 'border-box',
  marginTop: 8,
  fontSize: 12,
  fontFamily: 'Consolas, "Cascadia Mono", monospace',
};

const styles = StyleSheet.create({
  subTitle: { marginTop: 12, fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  body: { marginTop: 6, fontSize: 14, color: Colors.textPrimary },
  hint: { marginTop: 6, fontSize: 12, color: Colors.textSecondary },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  rowTight: { flexDirection: 'row', gap: 6 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  sub: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background },
  confirm: { marginTop: 10, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background },
  btn: { paddingHorizontal: 14, height: 36, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, justifyContent: 'center' },
  btnText: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  btnPrimary: { paddingHorizontal: 16, height: 36, borderRadius: 10, backgroundColor: Colors.accent, justifyContent: 'center' },
  btnPrimaryText: { fontSize: 13, fontWeight: '600', color: Colors.onAccent },
  dangerText: { fontSize: 13, fontWeight: '600', color: Colors.danger },
  disabled: { opacity: 0.5 },
});
