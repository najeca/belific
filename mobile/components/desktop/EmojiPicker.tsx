import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { firstEmoji } from '../../lib/emoji';
import { EMOJI_DATA, EMOJI_GROUPS } from '../../lib/emojiData';
import { parseEmojiData, parseRecent, searchEmoji, type EmojiEntry } from '../../lib/emojiSearch';
import { PICKER_TABS } from '../../lib/emojiCategories';
import { emojiTakenNote } from '../../lib/lists';
import { bumpUse, frequentRow, parseUse, useFromRecent, type EmojiUse } from '../../lib/emojiUse';
import { kv } from '../../lib/kv';
import { DESKTOP_FONT_FAMILY } from './desktopFont';

// The one emoji picker (2.27.1), for every emoji in the app: tasks, labels and
// lists. Offline: the bundled emojibase-data set (lib/emojiData.ts, MIT), drawn
// by the system's emoji font. A search box that matches names and keywords
// ("game" finds the controller; a pasted or Win+. emoji is taken as it is), the
// chosen emoji shown large (3.13.0), a "Frequently used" row and a tab with an
// icon per category. Keyboard: Down from the search box goes into the grid; the
// arrows move, Home and End jump, Enter or Space chooses, Escape closes the
// picker (data-own-keys tells the popover, the details and the Labels overlay
// to leave those keys to it).
// The use counts behind "Frequently used" are kept on this computer (kv), never synced.

const ENTRIES = parseEmojiData(EMOJI_DATA);
const RECENT_KEY = 'belific_desktop_recent_emoji';
const USE_KEY = 'belific_desktop_emoji_use';
const NAME_OF = new Map(ENTRIES.map((e) => [e.emoji, e.name]));
const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
const CELL = 36;
// The display's tabs with the data's own group numbers (EMOJI_GROUPS' order is the data's, the tabs' the display's).
const TABS = PICKER_TABS.flatMap((t) => {
  const group = EMOJI_GROUPS.findIndex((g) => g.key === t.key);
  return group < 0 ? [] : [{ ...t, group }];
});

let useCache: EmojiUse | null = null;
async function loadUse(): Promise<EmojiUse> {
  if (useCache) return useCache;
  try {
    const raw = await kv.getItem(USE_KEY);
    // Before 3.13.0 the desktop kept a recent row: its emoji count once each.
    useCache = raw === null ? useFromRecent(parseRecent(await kv.getItem(RECENT_KEY)), Date.now()) : parseUse(raw);
  } catch {
    useCache = {};
  }
  return useCache;
}
function saveUse(next: EmojiUse): void {
  useCache = next;
  kv.setItem(USE_KEY, JSON.stringify(next)).catch(() => {});
}

export default function EmojiPicker({
  label,
  value,
  onPick,
  onClose,
  keepOpen,
  taken,
}: {
  // What the emoji is for ("Task emoji"), for the screen reader.
  label: string;
  value: string | undefined;
  onPick: (emoji: string) => void;
  onClose: () => void;
  // A pick does not close the picker (the caller keeps it open and the panel has a Done button): the lists' fields.
  keepOpen?: boolean;
  // 3.14.0: emojis that may not be chosen, from the emoji (without U+FE0F) to the name of the list that has it: greyed out
  // with a caption saying which (one emoji per list, lib/lists.ts takenEmojis).
  taken?: ReadonlyMap<string, string>;
}) {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState(0);
  const [use, setUse] = useState<EmojiUse>(useCache ?? {});
  const [note, setNote] = useState<string | null>(null);
  const ownerOf = (emoji: string): string | undefined => taken?.get(emoji.replace(/️/g, ''));
  const grid = useRef<HTMLDivElement | null>(null);
  const search = useRef<HTMLInputElement | null>(null);

  // The search box has the keyboard as soon as the picker shows, so typing (or
  // pasting an emoji) straight after opening goes there.
  useLayoutEffect(() => {
    search.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    loadUse().then(setUse);
  }, []);

  const shown: Array<Pick<EmojiEntry, 'emoji' | 'name'>> = useMemo(
    () => (query.trim() ? searchEmoji(ENTRIES, query) : ENTRIES.filter((e) => e.group === TABS[tab].group)),
    [query, tab],
  );
  const frequent = useMemo(() => frequentRow(use), [use]);

  const choose = (emoji: string) => {
    const owner = ownerOf(emoji);
    if (owner) {
      setNote(emojiTakenNote(emoji, owner));
      return;
    }
    const next = bumpUse(use, emoji, Date.now());
    setUse(next);
    saveUse(next);
    onPick(emoji);
  };

  const cells = () => Array.from(grid.current?.querySelectorAll<HTMLButtonElement>('button[data-emoji-cell]') ?? []);
  const columns = () => Math.max(1, Math.floor((grid.current?.clientWidth ?? CELL * 8) / CELL));
  const focusCell = (i: number) => {
    const all = cells();
    if (all.length === 0) return;
    const at = Math.max(0, Math.min(all.length - 1, i));
    all.forEach((c, j) => (c.tabIndex = j === at ? 0 : -1));
    all[at].focus();
    all[at].scrollIntoView({ block: 'nearest' });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (target === search.current) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        focusCell(0);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const typed = firstEmoji(query);
        if (typed) choose(typed);
        else if (shown[0]) choose(shown[0].emoji);
      }
      return;
    }
    if (!target.hasAttribute('data-emoji-cell')) return;
    const all = cells();
    const i = all.indexOf(target as HTMLButtonElement);
    const cols = columns();
    const move: Record<string, number> = { ArrowRight: i + 1, ArrowLeft: i - 1, ArrowDown: i + cols, ArrowUp: i - cols, Home: 0, End: all.length - 1 };
    if (e.key in move) {
      e.preventDefault();
      // Up from the first row goes back to the search box.
      if (e.key === 'ArrowUp' && i < cols) search.current?.focus();
      else focusCell(move[e.key]);
    }
  };

  return (
    <div
      role="dialog"
      aria-label={`Choose an emoji: ${label}`}
      data-own-keys="1"
      data-emoji-picker="1"
      onKeyDown={onKeyDown}
      style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, borderRadius: 10, background: Colors.background, width: '100%', boxSizing: 'border-box' }}
    >
      <div data-emoji-preview="1" style={previewStyle}>
        <span data-emoji-large="1" aria-hidden="true" style={{ ...largeStyle, border: value ? 'none' : `1.5px dashed ${Colors.borderStrong}` }}>
          {value ?? ''}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: Colors.textPrimary, fontFamily: DESKTOP_FONT_FAMILY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {value ? (NAME_OF.get(value) ?? 'Chosen emoji') : 'No emoji chosen'}
          </div>
          <div style={{ fontSize: 12, color: Colors.textSecondary, fontFamily: DESKTOP_FONT_FAMILY }}>{label}</div>
        </div>
        {keepOpen && (
          <button type="button" data-emoji-done="1" aria-label="Done choosing an emoji" onClick={onClose} style={doneStyle}>
            Done
          </button>
        )}
      </div>
      {taken && (
        <div data-emoji-caption="1" role="status" style={{ minHeight: 16, fontSize: 12, color: note ? Colors.danger : Colors.textSecondary, fontFamily: DESKTOP_FONT_FAMILY, padding: '0 2px' }}>
          {note ?? 'Greyed out emoji belong to another list.'}
        </div>
      )}
      <input
        ref={search}
        type="search"
        value={query}
        placeholder="Search emoji (game, dog, cake…)"
        aria-label={`Search emoji for ${label}`}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => {
          const v = e.target.value;
          // An emoji typed or pasted (Win+.) is taken as it is.
          const typed = firstEmoji(v);
          if (typed) choose(typed);
          else setQuery(v);
        }}
        style={searchStyle}
      />
      {!query.trim() && (
        <div data-emoji-frequent-box="1">
          <div style={captionStyle}>Frequently used</div>
          {frequent.length > 0 ? (
            <div role="group" aria-label="Frequently used" style={{ display: 'flex', flexWrap: 'wrap', gap: 0 }} data-emoji-recent="1" data-emoji-frequent="1">
              {frequent.map((e) => (
                <EmojiCell key={`r${e}`} emoji={e} name={NAME_OF.get(e) ?? e} on={e === value} onPick={choose} recent owner={ownerOf(e)} onNote={setNote} />
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: Colors.textSecondary, padding: '2px 2px 4px', fontFamily: DESKTOP_FONT_FAMILY }}>Emoji you choose often will show here.</div>
          )}
        </div>
      )}
      {!query.trim() && (
        <div role="tablist" aria-label="Emoji categories" style={{ display: 'flex', gap: 2 }}>
          {TABS.map((g, i) => (
            <button
              key={g.key}
              type="button"
              role="tab"
              aria-selected={tab === i}
              aria-label={g.label}
              title={g.label}
              data-emoji-tab={g.key}
              onClick={() => {
                setTab(i);
                if (grid.current) grid.current.scrollTop = 0;
              }}
              style={{ ...tabStyle, background: tab === i ? Colors.pickerTabOn : 'transparent', boxShadow: tab === i ? `inset 0 -2px 0 ${Colors.accent}` : 'none' }}
            >
              <Ionicons name={g.icon as never} size={19} color={tab === i ? Colors.accentText : Colors.textSecondary} />
            </button>
          ))}
        </div>
      )}
      {!query.trim() && <div style={captionStyle}>{TABS[tab].title}</div>}
      <div
        ref={grid}
        role="group"
        aria-label={query.trim() ? `Emoji matching ${query.trim()}` : TABS[tab].title}
        style={{ display: 'flex', flexWrap: 'wrap', maxHeight: CELL * 4, overflowY: 'auto', alignContent: 'flex-start' }}
      >
        {shown.length === 0 ? (
          <span style={{ fontSize: 12, color: Colors.textSecondary, padding: 6, fontFamily: DESKTOP_FONT_FAMILY }}>No emoji match “{query.trim()}”.</span>
        ) : (
          shown.map((e, i) => <EmojiCell key={e.emoji} emoji={e.emoji} name={e.name} on={e.emoji === value} onPick={choose} first={i === 0} owner={ownerOf(e.emoji)} onNote={setNote} />)
        )}
      </div>
    </div>
  );
}

function EmojiCell({ emoji, name, on, onPick, first, recent, owner, onNote }: { emoji: string; name: string; on: boolean; onPick: (e: string) => void; first?: boolean; recent?: boolean; owner?: string; onNote?: (n: string | null) => void }) {
  const say = () => owner && onNote?.(emojiTakenNote(emoji, owner));
  const hush = () => owner && onNote?.(null);
  return (
    <button
      type="button"
      // The grid is one tab stop (roving): the arrows move inside it.
      tabIndex={first || recent ? 0 : -1}
      {...(recent ? { 'data-emoji-recent-cell': '1' } : { 'data-emoji-cell': '1' })}
      aria-label={owner ? `${name}, used by ${owner}` : name}
      aria-pressed={on}
      aria-disabled={owner ? true : undefined}
      {...(owner ? { 'data-emoji-taken': owner } : {})}
      title={owner ? emojiTakenNote(emoji, owner) : name}
      onClick={() => onPick(emoji)}
      onMouseEnter={say}
      onMouseLeave={hush}
      onFocus={say}
      onBlur={hush}
      style={{
        width: CELL,
        height: CELL,
        flex: 'none',
        padding: 0,
        border: 'none',
        borderRadius: 8,
        cursor: owner ? 'not-allowed' : 'pointer',
        opacity: owner ? 0.35 : 1,
        filter: owner ? 'grayscale(1)' : 'none',
        background: on ? Colors.pickerCellOn : 'transparent',
        boxShadow: on ? `inset 0 0 0 1.5px ${Colors.accent}` : 'none',
        fontSize: 21,
        lineHeight: `${CELL}px`,
        fontFamily: EMOJI_FONT,
        outlineColor: Colors.accent,
      }}
    >
      {emoji}
    </button>
  );
}

const searchStyle: React.CSSProperties = {
  height: 32,
  padding: '0 8px',
  borderRadius: 8,
  border: `1px solid ${Colors.border}`,
  background: Colors.surface,
  color: Colors.textPrimary,
  fontSize: 13,
  fontFamily: DESKTOP_FONT_FAMILY,
  outlineColor: Colors.accent,
  boxSizing: 'border-box',
  width: '100%',
};

const previewStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', borderRadius: 10, background: Colors.pickerPreview };
const largeStyle: React.CSSProperties = { width: 56, height: 56, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, fontSize: 38, lineHeight: '56px', fontFamily: EMOJI_FONT, boxSizing: 'border-box' };
const doneStyle: React.CSSProperties = { height: 36, padding: '0 14px', borderRadius: 8, border: 'none', background: Colors.accent, color: Colors.onAccent, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: DESKTOP_FONT_FAMILY, outlineColor: Colors.accent };
const captionStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: Colors.textSecondary, fontFamily: DESKTOP_FONT_FAMILY, padding: '2px 2px 3px' };

const tabStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  height: 36,
  padding: 0,
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  outlineColor: Colors.accent,
};
