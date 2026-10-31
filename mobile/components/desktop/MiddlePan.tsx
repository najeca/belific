import { useEffect } from 'react';
import { PAN_AREAS, PAN_BLOCKED, middleHeld, panPosition, startsPan, type PanStart } from '../../lib/panDrag';

// Middle mouse drag to pan the Calendar and the Timebox (3.24.0, decisions in docs/build-progress.md). Mounted once at
// the home root. Holding the wheel button over a block, a column or an empty slot and dragging pans like a hand: the
// Calendar's week strip moves sideways through the days, the hours scroll up and down. While it pans the cursor is a
// grabbing hand everywhere, no task drag starts (the left button's drag never sees the press) and Windows' own
// autoscroll circle never appears (its mousedown default is cancelled). Escape puts the view back where it was.

// The scroller that a press inside a pan area moves: the Calendar's own scroller, or the Timebox grid's scrolling parent.
function scrollerFor(target: Element): HTMLElement | null {
  const cal = target.closest<HTMLElement>('[data-cal-scroller]');
  if (cal) return cal;
  const grid = target.closest<HTMLElement>('[data-timebox-grid]');
  let p: HTMLElement | null = grid;
  while (p && p.scrollHeight <= p.clientHeight + 2 && p.scrollWidth <= p.clientWidth + 2) p = p.parentElement;
  return p;
}

const CURSOR_ID = 'belific-pan-cursor';

export default function MiddlePan() {
  useEffect(() => {
    let scroller: HTMLElement | null = null;
    let start: PanStart | null = null;

    const setCursor = (on: boolean) => {
      const old = document.getElementById(CURSOR_ID);
      if (!on) {
        old?.remove();
        return;
      }
      if (old) return;
      const style = document.createElement('style');
      style.id = CURSOR_ID;
      style.textContent = '* { cursor: grabbing !important; user-select: none !important; }';
      document.head.appendChild(style);
    };

    const end = (restore: boolean) => {
      if (scroller && start && restore) {
        scroller.scrollLeft = start.left;
        scroller.scrollTop = start.top;
      }
      scroller = null;
      start = null;
      setCursor(false);
    };

    const onDown = (e: MouseEvent | PointerEvent) => {
      if (e.button !== 1) return;
      const target = e.target as Element | null;
      if (!target || typeof target.closest !== 'function') return;
      const inArea = !!target.closest(PAN_AREAS);
      if (!startsPan(e.button, inArea, !!target.closest(PAN_BLOCKED))) return;
      // Never a task drag, never the autoscroll circle: nothing else sees this press. (Cancelling a pointerdown would
      // also cancel the mouse events that follow it, so the pointer event is only stopped; the mousedown is cancelled.)
      e.stopPropagation();
      if (e.type !== 'mousedown') return;
      e.preventDefault();
      const el = scrollerFor(target);
      if (!el) return;
      scroller = el;
      start = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
      setCursor(true);
    };

    const onMove = (e: MouseEvent) => {
      if (!scroller || !start) return;
      if (!middleHeld(e.buttons)) {
        // Released outside the window or the press was lost: stop where it is.
        end(false);
        return;
      }
      e.preventDefault();
      const next = panPosition(start, e.clientX, e.clientY, {
        maxLeft: scroller.scrollWidth - scroller.clientWidth,
        maxTop: scroller.scrollHeight - scroller.clientHeight,
      });
      scroller.scrollLeft = next.left;
      scroller.scrollTop = next.top;
    };

    const onUp = (e: MouseEvent) => {
      if (e.button !== 1 || !scroller) return;
      e.preventDefault();
      end(false);
    };

    // The middle button's click (auxclick) on a link or a block must do nothing after a pan.
    const onAux = (e: MouseEvent) => {
      if (e.button !== 1) return;
      const target = e.target as Element | null;
      if (target && typeof target.closest === 'function' && target.closest(PAN_AREAS) && !target.closest(PAN_BLOCKED)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !scroller) return;
      e.preventDefault();
      e.stopPropagation();
      end(true);
    };

    const onBlur = () => end(false);

    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('mouseup', onUp, true);
    window.addEventListener('auxclick', onAux, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('mousemove', onMove, true);
      window.removeEventListener('mouseup', onUp, true);
      window.removeEventListener('auxclick', onAux, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', onBlur);
      end(false);
    };
  }, []);
  return null;
}
