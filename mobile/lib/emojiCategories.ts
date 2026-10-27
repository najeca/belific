// The emoji picker's category tabs (3.13.0), shared by the desktop picker (all of emojibase's groups, lib/emojiData.ts)
// and the iPhone's (a small curated set, lib/emojiCurated.ts). Pure: NO runtime imports. `key` is the emojibase group
// key (lib/emojiData.ts EMOJI_GROUPS). A tab shows its icon (an Ionicons name) and carries its name as its label.
export interface PickerTab {
  key: string;
  label: string;
  // The full name shown above the grid.
  title: string;
  icon: string;
}

export const PICKER_TABS: readonly PickerTab[] = [
  { key: 'smileys', label: 'Smileys', title: 'Smileys and emotion', icon: 'happy-outline' },
  { key: 'people', label: 'People', title: 'People and body', icon: 'people-outline' },
  { key: 'animals', label: 'Animals', title: 'Animals and nature', icon: 'paw-outline' },
  { key: 'food', label: 'Food', title: 'Food and drink', icon: 'restaurant-outline' },
  { key: 'activities', label: 'Activities', title: 'Activities', icon: 'football-outline' },
  { key: 'travel', label: 'Travel', title: 'Travel and places', icon: 'airplane-outline' },
  { key: 'objects', label: 'Objects', title: 'Objects', icon: 'bulb-outline' },
  { key: 'symbols', label: 'Symbols', title: 'Symbols', icon: 'heart-outline' },
  { key: 'flags', label: 'Flags', title: 'Flags', icon: 'flag-outline' },
];

// The iPhone's picker has no flags (nothing to search them with there).
export const PHONE_TABS: readonly PickerTab[] = PICKER_TABS.filter((t) => t.key !== 'flags');
