# Decision 019 — Desktop drag and drop uses pointer events

**Date:** 2026-10-06
**Status:** Proposed — awaiting Jethro's confirmation

Source: checkpoint 4 spike (`docs/sessions/2026-10-06-cp4.md`).

---

**Decision.** Drag and drop on the desktop workspace is hand written on DOM pointer events (`pointerdown` on the source, then `pointermove`, `pointerup`, `pointercancel` and `keydown` on `window` in the capture phase). It does not use the HTML5 drag and drop API, `react-native-gesture-handler` or a library such as dnd-kit. All of the maths (30 minute snapping, clamping to the grid, which drop zone is under the pointer, past day rejection, week stepping, auto scroll speed) is pure code in `mobile/lib/drag.ts` with `node --test` coverage. The DOM side is `mobile/components/desktop/DragProvider.tsx` plus the `usePaneScroll` hook.

**Why not HTML5 drag and drop.** Measured in the packaged app (`app://belific/`, Electron 44) with real pointer input:
- Once `dragstart` fires, `pointermove` stops and no `wheel` event arrives for the rest of the drag. Wheel scrolling and edge auto scroll while dragging (a requirement) would not work.
- It cannot resize a Timebox block at all; resize would need pointer events anyway, so there would be two drag systems.
- The drag image is a browser snapshot: no styled lifted card, no live "10:30" label next to the pointer.
- Escape cancels the native drag, but the app gets no clean hook to restore state or swallow the click that follows.
- react-native-web Views do not pass `draggable` or `onDragStart` through, so every source would need DOM refs anyway.

**Why pointer events.** One mechanism covers move, drop and resize. A 5px movement threshold keeps a click as a click (the row or card still opens the editor). The lifted card ignores pointer events, so the wheel reaches the pane under it. Escape and an invalid drop are trivial: nothing is written until a valid drop.

**Trade offs accepted.**
- Drop zones are measured with `getBoundingClientRect()` on every move (a few dozen rectangles, cheap at this scale).
- Mouse only. Touch is ignored on the desktop path (`pointerType === 'touch'`); the iPhone app has no drag code at all.
- Keyboard users do not drag; they use the editor (Day) and the card's "Move to day" and "Schedule at" actions, which are unchanged.

**iOS isolation.** All drag code lives under `mobile/components/desktop/`, reached only through `DesktopEntry.web.tsx`. On iOS Metro resolves `DesktopEntry.tsx`, which renders nothing, so no desktop pane or drag code is in the iOS bundle. The desktop components moved out of `mobile/app/` for this (they were expo-router routes, gap N8). A pre-commit check searches the iOS export for the drag marker string.

## Related Notes
- [[docs/OPUS_PLAN_REVIEW]]
- [[docs/decisions/015-task-timebox-link]]
- [[docs/decisions/010-desktop-shell-electron]]
