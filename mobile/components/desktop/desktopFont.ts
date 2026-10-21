// Desktop typography fix (checkpoint 4.2). react-native-web gives every
// <Text> and <TextInput> this system stack (Segoe UI on Windows), but the page
// body has no font of its own, so a raw DOM <input> or <select> with
// `font-family: inherit` fell back to Times New Roman: thin serif figures in
// the Day, "Jump to week", "Move to date" and duration fields. Every DOM
// control on the desktop uses this constant instead. Web only; the iPhone
// never imports it.
// 2.26.0: Inter first (components/desktop/desktopFonts.ts ships it).
// Newsreader (a warm serif) is for the Belific name and the big page titles only; everything else is Inter.
export const DISPLAY_FONT_FAMILY = 'Newsreader, Georgia, "Times New Roman", serif';
export const DESKTOP_FONT_FAMILY =
  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
