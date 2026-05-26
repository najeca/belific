# Decision 001 — WebView Not Rewrite

**Date:** May 2026  
**Status:** Decided — do not change

---

## Decision
Wrap the existing web app in a WebView.
Do not rewrite the UI in React Native.

## Reason
The web app is complete, tested, and live at `https://najeca.github.io/belific/`.
A React Native rewrite would take weeks for zero user-visible benefit.
WebView delivers the identical experience with a single-line URL.

## Consequences
- Web app remains the single source of UI truth
- Any UI changes go into the web app only — the iOS app picks them up automatically
- No React Native component library needed
- iOS app is thin: WebView + notifications + tab shell only

## Do Not Change Unless
The web app needs features that WebView cannot support (camera access, offline-first local storage, native gestures that WebView can't replicate).

---

## Related Notes
- [[architecture]]
- [[002-local-notifications-only]]
