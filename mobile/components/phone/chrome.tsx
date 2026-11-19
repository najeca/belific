import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { radius, type ColorTokens } from '../../lib/tokens';
import { useStyles, useTheme } from './theme';
import { inter, type } from './type';
import { MIN_TOUCH } from './ui';
import { useSyncBadge } from '../useSyncBadge';
import { avatarA11y } from '../../lib/profileAvatar';
import { AvatarFace, ProfileSheet, reloadAvatar, useAvatar } from './ProfileSheet';

// The frame every phone tab shares (PLAN_phone P3): a title in Newsreader with the profile avatar
// top right, the round + button, and a segmented switch. 3.59.1: the avatar opens the Profile sheet (a preset
// picture or initials on a colour, and the way to Settings; there is no Settings tab).

const make = (c: ColorTokens) => ({
  header: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6 },
  title: { ...type.screenTitle, color: c.textPrimary, flexShrink: 1 },
  sub: { ...type.meta, color: c.textSecondary, marginTop: 2 },
  // 3.53.2: the sync line under the title, on every tab; in the danger colour while the last sync failed.
  sync: { ...type.meta, color: c.textSecondary, marginTop: 2 },
  syncWarn: { color: c.danger },
  avatar: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center' as const, justifyContent: 'center' as const },
  fab: { position: 'absolute' as const, right: 18, width: 58, height: 58, borderRadius: 29, backgroundColor: c.accent, alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 1, borderColor: c.accent },
  segTrack: { flexDirection: 'row' as const, borderRadius: radius.lg, padding: 3, gap: 2, backgroundColor: c.surfaceRaised, borderWidth: 1, borderColor: c.border },
  seg: { flex: 1, minHeight: 36, borderRadius: radius.md, alignItems: 'center' as const, justifyContent: 'center' as const, paddingHorizontal: 4 },
  segOn: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.borderStrong },
  segText: { ...inter(600), fontSize: 13, color: c.textSecondary },
  segTextOn: { color: c.textPrimary },
});

export function ScreenHeader({ title, sub, left }: { title: string; sub?: string; left?: React.ReactNode }) {
  const s = useStyles(make);
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const badge = useSyncBadge();
  const avatar = useAvatar();
  const [profile, setProfile] = useState(false);
  // The picture may have come from another phone through sync: read it again whenever a tab shows.
  useFocusEffect(
    useCallback(() => {
      void reloadAvatar();
    }, []),
  );
  return (
    <View style={[s.header, { paddingTop: insets.top + 8 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 }}>
        {left}
        <View style={{ flexShrink: 1 }}>
          <Text style={s.title} accessibilityRole="header" numberOfLines={1}>
            {title}
          </Text>
          {sub ? <Text style={s.sub}>{sub}</Text> : null}
          <Text style={[s.sync, badge.warn && s.syncWarn]} numberOfLines={1} accessibilityLabel={`Sync: ${badge.text}`} {...({ dataSet: { syncBadge: '1' } } as object)}>
            {badge.text}
          </Text>
        </View>
      </View>
      <Pressable
        onPress={() => setProfile(true)}
        style={s.avatar}
        accessibilityRole="button"
        accessibilityLabel={avatarA11y(avatar)}
        accessibilityHint="Opens your profile and Settings."
        {...({ dataSet: { profileAvatar: avatar.kind } } as object)}
      >
        <AvatarFace avatar={avatar} />
      </Pressable>
      <ProfileSheet
        visible={profile}
        onClose={() => setProfile(false)}
        onSettings={() => {
          setProfile(false);
          // The sheet slides away first, then Settings is pushed.
          setTimeout(() => router.push('/settings'), 300);
        }}
      />
    </View>
  );
}

// The round + on every screen, bottom right above the tab bar.
export function AddButton({ onPress, a11y = 'Add a task' }: { onPress: () => void; a11y?: string }) {
  const s = useStyles(make);
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.fab, { bottom: 18 }, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      {...({ dataSet: { addButton: '1' } } as object)}
    >
      <Ionicons name="add" size={30} color={c.onAccent} />
    </Pressable>
  );
}

export function Segmented<T extends string>({ options, value, onChange, a11y }: { options: Array<{ key: T; label: string }>; value: T; onChange: (key: T) => void; a11y: string }) {
  const s = useStyles(make);
  return (
    <View style={s.segTrack} accessibilityRole="tablist" accessibilityLabel={a11y}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={[s.seg, on && s.segOn]}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            {...({ dataSet: { seg: o.key } } as object)}
          >
            <Text style={[s.segText, on && s.segTextOn]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
