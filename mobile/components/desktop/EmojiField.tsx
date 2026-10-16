import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors } from '../../lib/theme';
import { EMOJI_CHOICES, firstEmoji } from '../../lib/emoji';
import { DESKTOP_FONT_FAMILY } from './desktopFont';

// One emoji for a task, label or list (build plan section 0, item 9). A short
// field to type or paste into (Win+. opens the system emoji picker on Windows)
// and a row of suggestions. The field keeps only the first emoji it finds, so a
// pasted sentence cannot become one. The emoji is drawn by the system.
export default function EmojiField({
  value,
  onChange,
  label,
}: {
  value: string | undefined;
  onChange: (emoji: string | undefined) => void;
  label: string;
}) {
  const [text, setText] = useState(value ?? '');
  const [open, setOpen] = useState(false);
  React.useEffect(() => setText(value ?? ''), [value]);

  const commit = (raw: string) => {
    const e = firstEmoji(raw);
    setText(e ?? '');
    onChange(e);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <input
          type="text"
          value={text}
          placeholder="🙂"
          aria-label={label}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            const v = e.target.value;
            setText(v);
            // A typed emoji applies at once; a plain word waits for blur or Enter.
            if (firstEmoji(v)) commit(v);
          }}
          onBlur={() => commit(text)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit(text);
            }
          }}
          style={domInput}
        />
        <Pressable onPress={() => setOpen((o) => !o)} style={styles.more} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`Suggestions for ${label}`}>
          <Text style={styles.moreText}>{open ? 'Hide' : 'Suggestions'}</Text>
        </Pressable>
        {value ? (
          <Pressable onPress={() => commit('')} style={styles.more} accessibilityRole="button" accessibilityLabel={`Clear ${label}`}>
            <Text style={styles.moreText}>Clear</Text>
          </Pressable>
        ) : null}
      </View>
      {open && (
        <View style={styles.grid}>
          {EMOJI_CHOICES.map((e) => (
            <Pressable
              key={e}
              onPress={() => {
                commit(e);
                setOpen(false);
              }}
              style={[styles.choice, value === e && styles.choiceOn]}
              accessibilityRole="button"
              accessibilityLabel={`Use ${e}`}
            >
              <Text style={styles.choiceText}>{e}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const domInput: React.CSSProperties = {
  width: 56,
  height: 34,
  padding: '0 8px',
  borderRadius: 10,
  border: `1px solid ${Colors.border}`,
  background: Colors.background,
  color: Colors.textPrimary,
  fontSize: 16,
  textAlign: 'center',
  fontFamily: DESKTOP_FONT_FAMILY,
  outlineColor: Colors.accent,
};

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  more: { paddingHorizontal: 10, height: 30, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, justifyContent: 'center', backgroundColor: Colors.surface },
  moreText: { fontSize: 12, color: Colors.textPrimary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  choice: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  choiceOn: { borderColor: Colors.accent, backgroundColor: Colors.background },
  choiceText: { fontSize: 18 },
});
