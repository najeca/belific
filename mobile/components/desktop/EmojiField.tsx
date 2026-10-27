import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors } from '../../lib/theme';
import { firstEmoji } from '../../lib/emoji';
import EmojiPicker from './EmojiPicker';

// One emoji for a task, label or list (build plan section 0, item 9). 2.27.1: a
// small button with the emoji (or "Choose") that opens the shared emoji picker
// in place (search, recent row, categories; EmojiPicker.tsx), and Clear. In
// place rather than as a popover, because it often sits inside one (the label
// form, the ⋮ menu) and only one popover is open at a time. The field keeps one
// emoji; the system draws it.
export default function EmojiField({
  value,
  onChange,
  label,
  keepOpen,
  taken,
}: {
  value: string | undefined;
  onChange: (emoji: string | undefined) => void;
  label: string;
  // A pick keeps the picker open, with the chosen emoji shown large and a Done button (the lists, 3.13.0).
  keepOpen?: boolean;
  // Emojis another list has (greyed out in the picker, lib/lists.ts takenEmojis).
  taken?: ReadonlyMap<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [button, setButton] = useState<HTMLElement | null>(null);
  const close = () => {
    setOpen(false);
    button?.focus();
  };

  return (
    <View style={styles.wrap} {...({ dataSet: { emojiField: label } } as object)}>
      <View style={styles.row}>
        <Pressable
          ref={(n) => setButton(n as unknown as HTMLElement | null)}
          onPress={() => setOpen((o) => !o)}
          style={(state) => {
            const s = state as typeof state & { hovered?: boolean };
            return [styles.btn, (open || s.hovered) && styles.btnOn];
          }}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={label}
          {...({ 'aria-haspopup': 'dialog' } as object)}
        >
          {value ? <Text style={styles.emoji}>{value}</Text> : <Text style={styles.choose}>🙂 Choose</Text>}
        </Pressable>
        {value ? (
          <Pressable onPress={() => onChange(undefined)} style={styles.clear} accessibilityRole="button" accessibilityLabel={`Clear ${label}`}>
            <Text style={styles.clearText}>Clear</Text>
          </Pressable>
        ) : null}
      </View>
      {open && (
        <EmojiPicker
          label={label}
          value={value}
          keepOpen={keepOpen}
          taken={taken}
          onPick={(e) => {
            onChange(firstEmoji(e) ?? e);
            if (!keepOpen) close();
          }}
          onClose={close}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  btn: { minWidth: 44, height: 30, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  btnOn: { borderColor: Colors.accent },
  emoji: { fontSize: 17, fontFamily: '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif' } as object,
  choose: { fontSize: 12, color: Colors.textSecondary },
  clear: { paddingHorizontal: 8, height: 30, borderRadius: 8, justifyContent: 'center' },
  clearText: { fontSize: 12, color: Colors.textSecondary },
});
