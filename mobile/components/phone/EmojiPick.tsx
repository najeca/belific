import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, type ColorTokens } from '../../lib/tokens';
import { kv } from '../../lib/kv';
import { firstEmoji } from '../../lib/emoji';
import { PHONE_TABS } from '../../lib/emojiCategories';
import { CURATED } from '../../lib/emojiCurated';
import { emojiTakenNote } from '../../lib/lists';
import { bumpUse, frequentRow, parseUse, type EmojiUse } from '../../lib/emojiUse';
import { useStyles, useTheme } from './theme';
import { inter, type } from './type';

// The emoji picker of a list's sheet (3.13.0), for a finger: the chosen emoji shown large, a "Frequently used"
// row, a tab with an icon per category and the category's emoji in 44 pt cells. A small hand-picked set
// (lib/emojiCurated.ts) and no search box: the full emoji data and its search stay on the desktop (the iOS marker
// gate), and the phone's own emoji keyboard, typed into the field here, has a search of its own. The use counts
// behind "Frequently used" are kept on this phone (kv), never synced.
const USE_KEY = 'belific_phone_emoji_use';
const CELL = 44;

const make = (c: ColorTokens) => ({
  preview: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, padding: 10, borderRadius: radius.lg, backgroundColor: c.pickerPreview },
  large: { width: 72, height: 72, borderRadius: radius.xl, alignItems: 'center' as const, justifyContent: 'center' as const },
  largeText: { fontSize: 46, lineHeight: 56 },
  field: { ...inter(500), fontSize: 17, color: c.textPrimary, minHeight: 44, width: 96, textAlign: 'center' as const, paddingHorizontal: 8, borderRadius: radius.md, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.pane },
  hint: { ...type.meta, color: c.textSecondary },
  caption: { ...type.small, color: c.textSecondary, textTransform: 'uppercase' as const, letterSpacing: 0.4, paddingTop: 4 },
  row: { flexDirection: 'row' as const, flexWrap: 'wrap' as const },
  cell: { width: CELL, height: CELL, borderRadius: radius.lg, alignItems: 'center' as const, justifyContent: 'center' as const },
  cellOn: { backgroundColor: c.pickerCellOn },
  cellText: { fontSize: 26, lineHeight: 32 },
  tabs: { flexDirection: 'row' as const, gap: 2 },
  tab: { flex: 1, minHeight: CELL, borderRadius: radius.md, alignItems: 'center' as const, justifyContent: 'center' as const },
  tabOn: { backgroundColor: c.pickerTabOn, borderBottomWidth: 2, borderBottomColor: c.accent },
  clear: { minHeight: 44, minWidth: 44, alignItems: 'center' as const, justifyContent: 'center' as const, paddingHorizontal: 8 },
  clearText: { ...inter(600), fontSize: 14, color: c.accentText },
});

// `taken`: the emojis another list has (lib/lists.ts takenEmojis), greyed out; a tap on one says which list has it.
export function EmojiPick({ value, onChange, taken }: { value: string; onChange: (emoji: string) => void; taken?: ReadonlyMap<string, string> }) {
  const s = useStyles(make);
  const { c } = useTheme();
  const [tab, setTab] = useState(0);
  const [use, setUse] = useState<EmojiUse>({});
  const [note, setNote] = useState<string | null>(null);
  const ownerOf = (emoji: string): string | undefined => taken?.get(emoji.replace(/️/g, ''));
  useEffect(() => {
    kv.getItem(USE_KEY)
      .then((raw) => setUse(parseUse(raw)))
      .catch(() => {});
  }, []);
  const frequent = useMemo(() => frequentRow(use), [use]);
  const shown = firstEmoji(value);

  const pick = (emoji: string) => {
    const owner = ownerOf(emoji);
    if (owner) {
      setNote(emojiTakenNote(emoji, owner));
      return;
    }
    setNote(null);
    const next = bumpUse(use, emoji, Date.now());
    setUse(next);
    kv.setItem(USE_KEY, JSON.stringify(next)).catch(() => {});
    onChange(emoji);
  };

  const cell = (emoji: string, key: string, frequentCell = false) => {
    const owner = ownerOf(emoji);
    return (
    <Pressable
      key={key}
      onPress={() => pick(emoji)}
      style={[s.cell, shown === emoji && s.cellOn, owner ? { opacity: 0.35 } : null]}
      accessibilityRole="button"
      accessibilityLabel={owner ? `${emoji}, used by ${owner}` : `Use ${emoji}`}
      accessibilityState={{ selected: shown === emoji, disabled: !!owner }}
      {...({ dataSet: { ...(frequentCell ? { emojiFrequentCell: emoji } : { emojiCell: emoji }), ...(owner ? { emojiTaken: owner } : {}) } } as object)}
    >
      <Text style={[s.cellText, owner ? { opacity: 0.6 } : null]}>{emoji}</Text>
    </Pressable>
    );
  };

  return (
    <View style={{ gap: 6 }} {...({ dataSet: { emojiPick: '1' } } as object)}>
      <View style={s.preview}>
        <View style={[s.large, !shown && { borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.borderStrong }]} {...({ dataSet: { emojiLarge: shown ?? '' } } as object)}>
          <Text style={s.largeText}>{shown ?? ''}</Text>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <TextInput style={s.field} value={value} onChangeText={(t) => (firstEmoji(t) && ownerOf(firstEmoji(t) as string) ? pick(firstEmoji(t) as string) : onChange(t))} placeholder="🙂" placeholderTextColor={c.textTertiary} accessibilityLabel="List emoji" />
          <Text style={s.hint}>Tap one below, or type one with the emoji keyboard.</Text>
        </View>
        {shown ? (
          <Pressable onPress={() => onChange('')} style={s.clear} accessibilityRole="button" accessibilityLabel="Clear list emoji">
            <Text style={s.clearText}>Clear</Text>
          </Pressable>
        ) : null}
      </View>
      {taken ? (
        <Text style={[s.hint, note ? { color: c.danger } : null]} {...({ dataSet: { emojiCaption: '1' } } as object)}>
          {note ?? 'Greyed out emoji belong to another list.'}
        </Text>
      ) : null}
      <Text style={s.caption}>Frequently used</Text>
      {frequent.length > 0 ? (
        <View style={s.row} {...({ dataSet: { emojiFrequent: '1' } } as object)}>
          {frequent.map((e) => cell(e, `f${e}`, true))}
        </View>
      ) : (
        <Text style={s.hint}>Emoji you choose often will show here.</Text>
      )}
      <View style={s.tabs} accessibilityRole="tablist">
        {PHONE_TABS.map((t, i) => (
          <Pressable
            key={t.key}
            onPress={() => setTab(i)}
            style={[s.tab, tab === i && s.tabOn]}
            accessibilityRole="tab"
            accessibilityLabel={t.label}
            accessibilityState={{ selected: tab === i }}
            {...({ dataSet: { emojiTab: t.key } } as object)}
          >
            <Ionicons name={t.icon as never} size={21} color={tab === i ? c.accentText : c.textSecondary} />
          </Pressable>
        ))}
      </View>
      <Text style={s.caption}>{PHONE_TABS[tab].title}</Text>
      <ScrollView style={{ maxHeight: CELL * 4 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
        <View style={s.row}>{(CURATED[PHONE_TABS[tab].key] ?? []).map((e) => cell(e, e))}</View>
      </ScrollView>
    </View>
  );
}
