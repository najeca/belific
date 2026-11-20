// 3.59.1: the Profile sheet the header avatar opens. Pick a preset picture (an emoji on a soft colour) or initials on a
// colour; each choice saves at once into one synced user_settings row (lib/profileAvatar.ts). No photo, no new native
// module. Settings is one row further down (it used to open straight from the avatar).
import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { radius, type ColorTokens } from '../../lib/tokens';
import { labelColor, tintFor } from '../../lib/labelColors';
import { loadUserSetting, setUserSetting } from '../../lib/storage';
import { AVATAR_COLORS, AVATAR_KEY, AVATAR_PRESETS, avatarValue, initialsOf, parseAvatar, type Avatar } from '../../lib/profileAvatar';
import { useStyles, useTheme } from './theme';
import { haptic, useReducedMotion } from './touch';
import { inter, newsreader, type } from './type';

// ---- the stored value, shared by every tab's header ----
let current: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
export async function reloadAvatar(): Promise<void> {
  const v = await loadUserSetting(AVATAR_KEY).catch(() => null);
  if (v !== current) {
    current = v;
    emit();
  }
}
async function saveAvatar(a: Avatar): Promise<void> {
  current = avatarValue(a);
  emit();
  await setUserSetting(AVATAR_KEY, current);
}
export function useAvatar(): Avatar {
  const value = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
  return parseAvatar(value);
}

const make = (c: ColorTokens) => ({
  screen: { flex: 1, backgroundColor: c.background, borderTopWidth: 8, borderTopColor: c.accent },
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: 16, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.pane },
  title: { ...type.sheetTitle, color: c.textPrimary },
  done: { minWidth: 64, minHeight: 44, alignItems: 'flex-end' as const, justifyContent: 'center' as const },
  doneText: { ...inter(700), fontSize: 17, color: c.accentText },
  preview: { alignItems: 'center' as const, gap: 8, paddingVertical: 12 },
  section: { ...type.section, color: c.textSecondary, marginTop: 18, marginBottom: 8 },
  grid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6 },
  cell: { width: 56, height: 56, borderRadius: 28, alignItems: 'center' as const, justifyContent: 'center' as const },
  cellOn: { borderWidth: 3, borderColor: c.textPrimary },
  input: { ...inter(600), fontSize: 20, letterSpacing: 2, color: c.textPrimary, minHeight: 48, width: 120, textAlign: 'center' as const, borderRadius: radius.md, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.surface },
  note: { ...inter(400), fontSize: 14, lineHeight: 20, color: c.textSecondary },
  quiet: { minHeight: 44, justifyContent: 'center' as const, alignSelf: 'flex-start' as const },
  quietText: { ...inter(600), fontSize: 15, color: c.textPrimary, textDecorationLine: 'underline' as const },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, minHeight: 52, paddingHorizontal: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, marginTop: 24 },
  rowText: { ...inter(500), fontSize: 16, color: c.textPrimary, flex: 1 },
});

// The round face: the person icon, a preset's emoji on its soft colour, or initials on a colour (dark text on the tint,
// with the colour as its ring, so it reads in light and dark).
export function AvatarFace({ avatar, size = 34 }: { avatar: Avatar; size?: number }) {
  const { c, name } = useTheme();
  const dark = name === 'dark';
  const base = { width: size, height: size, borderRadius: size / 2, alignItems: 'center' as const, justifyContent: 'center' as const };
  if (avatar.kind === 'none') {
    return (
      <View style={[base, { borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.surface }]}>
        <Ionicons name="person-outline" size={Math.round(size * 0.53)} color={c.textSecondary} />
      </View>
    );
  }
  const col = labelColor(avatar.kind === 'preset' ? avatar.preset.color : avatar.color);
  const bg = col ? tintFor(col, dark) : c.surface;
  const ring = col?.edge ?? c.borderStrong;
  if (avatar.kind === 'preset') {
    return (
      <View style={[base, { backgroundColor: bg, borderWidth: 1, borderColor: ring }]}>
        <Text style={{ fontSize: Math.round(size * 0.55), lineHeight: Math.round(size * 0.72) }}>{avatar.preset.emoji}</Text>
      </View>
    );
  }
  return (
    <View style={[base, { backgroundColor: bg, borderWidth: 2, borderColor: ring }]}>
      <Text style={{ ...inter(800), fontSize: Math.round(size * 0.38), color: c.textPrimary }} numberOfLines={1}>
        {avatar.text}
      </Text>
    </View>
  );
}

export function ProfileSheet({ visible, onClose, onSettings }: { visible: boolean; onClose: () => void; onSettings: () => void }) {
  const s = useStyles(make);
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const avatar = useAvatar();
  const [letters, setLetters] = useState('');
  const [color, setColor] = useState(AVATAR_COLORS[0]);
  useEffect(() => {
    if (!visible) return;
    void reloadAvatar();
  }, [visible]);
  useEffect(() => {
    if (!visible) return;
    setLetters(avatar.kind === 'initials' ? avatar.text : '');
    setColor(avatar.kind === 'initials' ? avatar.color : AVATAR_COLORS[0]);
    // Only when the sheet opens: typing must not be overwritten by the store echoing it back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  if (!visible) return null;

  const pickPreset = (id: string) => {
    const preset = AVATAR_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    haptic('select');
    void saveAvatar({ kind: 'preset', preset });
  };
  const typeLetters = (v: string) => {
    const text = initialsOf(v);
    setLetters(text);
    if (text) void saveAvatar({ kind: 'initials', text, color });
  };
  const pickColor = (key: string) => {
    setColor(key);
    haptic('select');
    const text = letters || (avatar.kind === 'initials' ? avatar.text : '');
    if (text) void saveAvatar({ kind: 'initials', text, color: key });
  };

  return (
    <Modal visible animationType={reduced ? 'none' : 'slide'} presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={s.screen} {...({ dataSet: { profileSheet: avatarValue(avatar) || 'none' } } as object)}>
        <View style={[s.head, { paddingTop: Platform.OS === 'ios' ? 12 : insets.top + 12 }]}>
          <Text style={s.title} accessibilityRole="header">Profile</Text>
          <Pressable onPress={onClose} style={s.done} accessibilityRole="button" accessibilityLabel="Done" {...({ dataSet: { profileDone: '1' } } as object)}>
            <Text style={s.doneText}>Done</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
          <View style={s.preview}>
            <AvatarFace avatar={avatar} size={88} />
            <Text style={[s.note, { ...newsreader(600), fontSize: 15 }]}>Shown at the top of every tab</Text>
          </View>

          <Text style={s.section}>Picture</Text>
          <View style={s.grid}>
            {AVATAR_PRESETS.map((p) => {
              const on = avatar.kind === 'preset' && avatar.preset.id === p.id;
              return (
                <Pressable key={p.id} onPress={() => pickPreset(p.id)} style={[s.cell, on && s.cellOn]} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`Picture ${p.name}`} {...({ dataSet: { avatarPreset: p.id } } as object)}>
                  <AvatarFace avatar={{ kind: 'preset', preset: p }} size={48} />
                </Pressable>
              );
            })}
          </View>

          <Text style={s.section}>Initials</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <TextInput
              style={s.input}
              value={letters}
              onChangeText={typeLetters}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={4}
              placeholder="AB"
              placeholderTextColor={c.textTertiary}
              accessibilityLabel="Your initials, one or two letters"
              {...({ dataSet: { avatarInitials: '1' } } as object)}
            />
            <Text style={[s.note, { flex: 1 }]}>One or two letters, on the colour below.</Text>
          </View>
          <View style={[s.grid, { marginTop: 10 }]} accessibilityLabel="Colour behind the initials">
            {AVATAR_COLORS.map((key) => {
              const col = labelColor(key);
              const on = color === key;
              return (
                <Pressable key={key} onPress={() => pickColor(key)} style={[s.cell, { width: 48, height: 48, borderRadius: 24 }, on && s.cellOn]} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={col?.name ?? key} {...({ dataSet: { avatarColor: key } } as object)}>
                  <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: col?.edge }} />
                </Pressable>
              );
            })}
          </View>

          {avatar.kind !== 'none' ? (
            <Pressable onPress={() => void saveAvatar({ kind: 'none' }).then(() => setLetters(''))} style={[s.quiet, { marginTop: 14 }]} accessibilityRole="button" accessibilityLabel="No picture" {...({ dataSet: { avatarNone: '1' } } as object)}>
              <Text style={s.quietText}>No picture</Text>
            </Pressable>
          ) : null}

          <Pressable onPress={onSettings} style={({ pressed }) => [s.row, pressed && { backgroundColor: c.hover }]} accessibilityRole="button" accessibilityLabel="Settings" {...({ dataSet: { profileSettings: '1' } } as object)}>
            <Ionicons name="settings-outline" size={20} color={c.textSecondary} />
            <Text style={s.rowText}>Settings</Text>
            <Ionicons name="chevron-forward" size={18} color={c.textSecondary} />
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}
