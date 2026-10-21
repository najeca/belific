import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Colors } from '../../lib/theme';
import { firstEmoji } from '../../lib/emoji';
import { EMOJI_DATA, EMOJI_GROUPS } from '../../lib/emojiData';
import { parseEmojiData, parseRecent, pushRecent, searchEmoji, type EmojiEntry } from '../../lib/emojiSearch';
import { kv } from '../../lib/kv';
import { DESKTOP_FONT_FAMILY } from './desktopFont';

// The one emoji picker (2.27.1), for every emoji in the app: tasks, labels and
// lists. Offline: the bundled emojibase-data set (lib/emojiData.ts, MIT), drawn
// by the system's emoji font. A search box that matches names and keywords
// ("game" finds the controller; a pasted or Win+. emoji is taken as it is), the
// recently used row, and a tab per category. Keyboard: Down from the search box
// goes into the grid; the arrows move, Home and End jump, Enter or Space
// chooses, Escape closes the picker (data-own-keys tells the popover, the
// details and the Labels overlay to leave those keys to it).
// The recent row is kept on this computer (kv), never synced.

const ENTRIES = parseEmojiData(EMOJI_DATA);
const RECENT_KEY = 'belific_desktop_recent_emoji';
const NAME_OF = new Map(ENTRIES.map((e) => [e.emoji, e.name]));
const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
const CELL = 32;

let recentCache: string[] | null = null;
async function loadRecent(): Promise<string[]> {
  if (recentCache) return recentCache;
  try {
    recentCache = parseRecent(await kv.getItem(RECENT_KEY));
  } catch {
    recentCache = [];
  }
  return recentCache;
}
function saveRecent(next: string[]): void {
  recentCache = next;
  kv.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {});
}

export default function EmojiPicker({
  label,
  value,
  onPick,
  onClose,
}: {
  // What the emoji is for ("Task emoji"), for the screen reader.
  label: string;
  value: string | undefined;
  onPick: (emoji: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState(0);
  const [recent, setRecent] = useState<string[]>(recentCache ?? []);
  const grid = useRef<HTMLDivElement | null>(null);
  const search = useRef<HTMLInputElement | null>(null);

  // The search box has the keyboard as soon as the picker shows, so typing (or
  // pasting an emoji) straight after opening goes there.
  useLayoutEffect(() => {
    search.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    loadRecent().then(setRecent);
  }, []);

  const shown: Array<Pick<EmojiEntry, 'emoji' | 'name'>> = useMemo(
    () => (query.trim() ? searchEmoji(ENTRIES, query) : ENTRIES.filter((e) => e.group === tab)),
    [query, tab],
  );

  const choose = (emoji: string) => {
    const next = pushRecent(recent, emoji);
    setRecent(next);
    saveRecent(next);
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
      {!query.trim() && recent.length > 0 && (
        <div role="group" aria-label="Recently used" style={{ display: 'flex', flexWrap: 'wrap', gap: 0 }} data-emoji-recent="1">
          {recent.map((e) => (
            <EmojiCell key={`r${e}`} emoji={e} name={NAME_OF.get(e) ?? e} on={e === value} onPick={choose} recent />
          ))}
        </div>
      )}
      {!query.trim() && (
        <div role="tablist" aria-label="Emoji categories" style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          {EMOJI_GROUPS.map((g, i) => (
            <button
              key={g.key}
              type="button"
              role="tab"
              aria-selected={tab === i}
              aria-label={g.name}
              title={g.name}
              data-emoji-tab={g.key}
              onClick={() => {
                setTab(i);
                if (grid.current) grid.current.scrollTop = 0;
              }}
              style={{ ...tabStyle, background: tab === i ? Colors.surface : 'transparent', boxShadow: tab === i ? `inset 0 -2px 0 ${Colors.accent}` : 'none' }}
            >
              {g.icon}
            </button>
          ))}
        </div>
      )}
      <div
        ref={grid}
        role="group"
        aria-label={query.trim() ? `Emoji matching ${query.trim()}` : EMOJI_GROUPS[tab].name}
        style={{ display: 'flex', flexWrap: 'wrap', maxHeight: CELL * 6, overflowY: 'auto', alignContent: 'flex-start' }}
      >
        {shown.length === 0 ? (
          <span style={{ fontSize: 12, color: Colors.textSecondary, padding: 6, fontFamily: DESKTOP_FONT_FAMILY }}>No emoji match “{query.trim()}”.</span>
        ) : (
          shown.map((e, i) => <EmojiCell key={e.emoji} emoji={e.emoji} name={e.name} on={e.emoji === value} onPick={choose} first={i === 0} />)
        )}
      </div>
    </div>
  );
}

function EmojiCell({ emoji, name, on, onPick, first, recent }: { emoji: string; name: string; on: boolean; onPick: (e: string) => void; first?: boolean; recent?: boolean }) {
  return (
    <button
      type="button"
      // The grid is one tab stop (roving): the arrows move inside it.
      tabIndex={first || recent ? 0 : -1}
      {...(recent ? { 'data-emoji-recent-cell': '1' } : { 'data-emoji-cell': '1' })}
      aria-label={name}
      aria-pressed={on}
      title={name}
      onClick={() => onPick(emoji)}
      style={{
        width: CELL,
        height: CELL,
        flex: 'none',
        padding: 0,
        border: 'none',
        borderRadius: 8,
        cursor: 'pointer',
        background: on ? Colors.surface : 'transparent',
        boxShadow: on ? `inset 0 0 0 1.5px ${Colors.accent}` : 'none',
        fontSize: 20,
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
  height: 30,
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

const tabStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  padding: 0,
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 16,
  fontFamily: EMOJI_FONT,
  outlineColor: Colors.accent,
};
