import { useEffect, useRef } from 'react';
import { isEditableTarget } from '../../lib/editable';
import { shortcutFor, type ShortcutId } from '../../lib/shortcuts';
import { isPopoverOpen } from './Popover';
import { isOverlayOpen } from './uiStore';

// The home screen's keyboard shortcuts (lib/shortcuts.ts, scope 'home'). One
// listener on the window, in the bubbling phase, so a task card's own keys
// (which stop what they handle) are seen first. The registry decides whether a
// key counts: never while typing in an input, textarea, select or
// contenteditable, never while a popover or an overlay is open, never a held
// key. `handlers` may return false for "not mine" so the key is left alone.
//
// `enabled` is false while a page other than the home screen is showing.
export function useHomeShortcuts(enabled: boolean, handlers: Partial<Record<ShortcutId, () => boolean | void>>): void {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat) return;
      const id = shortcutFor(e, {
        typing: isEditableTarget(e.target),
        // The help overlay is the one thing allowed to open over an overlay: it
        // is toggled by its own key, below.
        blocked: isPopoverOpen() || isOverlayOpen(),
        scope: 'home',
      });
      if (!id) return;
      const handled = ref.current[id]?.();
      if (handled === false) return;
      if (ref.current[id]) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
