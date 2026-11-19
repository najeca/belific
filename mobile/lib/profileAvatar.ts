// 3.59.1: the phone's profile picture. Presets only (an emoji on a soft colour, drawn by the app) or initials on a colour;
// no photo, no new native module. One user_settings row, so it follows the person to their other phone; the desktop does
// not read it. Pure: NO runtime imports besides siblings; see profileAvatar.test.ts.
import { LABEL_COLORS } from './labelColors.ts';

export const AVATAR_KEY = 'profile.avatar';

export interface AvatarPreset {
  id: string;
  emoji: string;
  name: string;
  // A colour key from the label palette (lib/labelColors.ts).
  color: string;
}

// Our own small set: calm, plain things.
export const AVATAR_PRESETS: readonly AvatarPreset[] = [
  { id: 'leaf', emoji: '🌿', name: 'Leaf', color: 'sage' },
  { id: 'sun', emoji: '🌻', name: 'Sunflower', color: 'sand' },
  { id: 'moon', emoji: '🌙', name: 'Moon', color: 'slate' },
  { id: 'wave', emoji: '🌊', name: 'Wave', color: 'sky' },
  { id: 'hill', emoji: '⛰️', name: 'Hill', color: 'moss' },
  { id: 'cup', emoji: '☕', name: 'Cup', color: 'clay' },
  { id: 'fox', emoji: '🦊', name: 'Fox', color: 'orange' },
  { id: 'owl', emoji: '🦉', name: 'Owl', color: 'plum' },
  { id: 'bear', emoji: '🐻', name: 'Bear', color: 'rose' },
  { id: 'turtle', emoji: '🐢', name: 'Turtle', color: 'green' },
  { id: 'cat', emoji: '🐱', name: 'Cat', color: 'yellow' },
  { id: 'star', emoji: '⭐', name: 'Star', color: 'blue' },
];

// The colours offered behind initials: the original eight (every version of Belific knows them).
export const AVATAR_COLORS: readonly string[] = LABEL_COLORS.filter((c) => !c.since).map((c) => c.key);

export type Avatar = { kind: 'none' } | { kind: 'preset'; preset: AvatarPreset } | { kind: 'initials'; text: string; color: string };

// One or two letters, upper case; spaces and symbols dropped. "jc" -> "JC", "Ann Lee" -> "AL".
export function initialsOf(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words.slice(0, 2).map((w) => [...w].find((ch) => /\p{L}|\p{N}/u.test(ch)) ?? '') : [...(words[0] ?? '')].filter((ch) => /\p{L}|\p{N}/u.test(ch)).slice(0, 2);
  return letters.join('').toLocaleUpperCase();
}

export function avatarValue(a: Avatar): string {
  if (a.kind === 'preset') return `preset:${a.preset.id}`;
  if (a.kind === 'initials') return `initials:${a.text}:${a.color}`;
  return '';
}

// A stored value back to an avatar; anything damaged or unknown is no avatar (the plain person icon).
export function parseAvatar(value: string | null | undefined): Avatar {
  if (!value) return { kind: 'none' };
  if (value.startsWith('preset:')) {
    const preset = AVATAR_PRESETS.find((p) => p.id === value.slice(7));
    return preset ? { kind: 'preset', preset } : { kind: 'none' };
  }
  if (value.startsWith('initials:')) {
    const [, text = '', color = ''] = value.split(':');
    const clean = initialsOf(text);
    if (!clean) return { kind: 'none' };
    return { kind: 'initials', text: clean, color: AVATAR_COLORS.includes(color) ? color : AVATAR_COLORS[0] };
  }
  return { kind: 'none' };
}

// What VoiceOver hears on the header button.
export function avatarA11y(a: Avatar): string {
  if (a.kind === 'preset') return `Profile, picture ${a.preset.name}`;
  if (a.kind === 'initials') return `Profile, initials ${a.text.split('').join(' ')}`;
  return 'Profile';
}
