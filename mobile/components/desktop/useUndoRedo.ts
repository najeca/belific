import { useEffect } from 'react';
import { redoLast, undoLast } from '../../lib/undoActions';
import { stack } from '../../lib/undoStack';
import { notifyChanged, offerUndo, showNotice } from './uiStore';

// Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z for task changes (3.21.0, lib/undoStack.ts). The registry (lib/shortcuts.ts)
// keeps these keys out of every text field, so a field undoes its own typing. Each press says what it did in the
// bottom bar: "Undone: moved Zone 2" with Redo, "Redone: moved Zone 2" with Undo.
const SHOW_MS = 8000;

export async function runUndo(): Promise<void> {
  const r = await undoLast();
  notifyChanged();
  if (!r.ok) {
    showNotice(r.text);
    return;
  }
  offerUndo(`Undone: ${r.label}`, runRedo, SHOW_MS, 'Redo');
}

export async function runRedo(): Promise<void> {
  const r = await redoLast();
  notifyChanged();
  if (!r.ok) {
    showNotice(r.text);
    return;
  }
  offerUndo(`Redone: ${r.label}`, runUndo, SHOW_MS);
}

// Turns recording on while the home screen is mounted, and starts a new entry at every press or key (so the
// writes of one drag or one tick are one entry, and the next gesture is another).
export function useUndoRecording(): void {
  useEffect(() => {
    stack.enabled = true;
    const mark = () => stack.markGesture();
    window.addEventListener('pointerdown', mark, true);
    window.addEventListener('keydown', mark, true);
    return () => {
      window.removeEventListener('pointerdown', mark, true);
      window.removeEventListener('keydown', mark, true);
      stack.enabled = false;
    };
  }, []);
}
