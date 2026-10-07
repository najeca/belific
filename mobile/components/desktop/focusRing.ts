import { Colors } from '../../lib/theme';

// A visible keyboard focus ring for task cards (checkpoint 9), in the existing
// accent colour. :focus-visible so a mouse click on a card shows no ring but
// Tab and Escape do. react-native-web styles cannot express pseudo classes, so
// one small rule is added to the page, once.
const STYLE_ID = 'belific-card-focus';

export function ensureFocusRingStyle(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = `[data-card-focus="1"]:focus-visible { outline: 2px solid ${Colors.accent}; outline-offset: 2px; }`;
  document.head.appendChild(el);
}
