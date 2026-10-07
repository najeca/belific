// Whether the three pane home view is the one showing (checkpoint 9). While
// the Settings or Labels page is showing, the panes are hidden and inert, and
// anything on them that listens on the window (the Timebox event editor's
// Escape key) must do nothing. DesktopHome sets this; listeners ask.
let active = true;

export function setHomeActive(next: boolean): void {
  active = next;
}

export function isHomeActive(): boolean {
  return active;
}
