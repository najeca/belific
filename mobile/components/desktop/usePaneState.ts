import { useCallback, useEffect, useRef, useState } from 'react';
import { kv } from '../../lib/kv';
import { loadUserSetting, setUserSetting } from '../../lib/storage';
import {
  DEFAULT_PANE_STATE,
  loadPaneState,
  savePaneState,
  type PaneState,
  type PaneStateIo,
} from '../../lib/paneState';

// The real reads and writes behind the pane layout (lib/paneState.ts): the
// user_settings row "ui.panes" (synced when signed in) and a local copy in kv.
const io: PaneStateIo = {
  readSetting: (key) => loadUserSetting(key),
  writeSetting: (key, value) => setUserSetting(key, value),
  readLocal: (key) => kv.getItem(key),
  writeLocal: (key, value) => kv.setItem(key, value),
};

// The home screen's pane layout and a way to change it. Loaded once at start
// (the screen shows the default for a moment, then the remembered layout); every
// change is saved at once. Nothing is saved before the first load has finished,
// so the default can never overwrite what was remembered.
export function usePaneState(): [PaneState, (change: (s: PaneState) => PaneState) => void, boolean] {
  const [state, setState] = useState<PaneState>(DEFAULT_PANE_STATE);
  const [loaded, setLoaded] = useState(false);
  const latest = useRef(state);
  latest.current = state;
  const loadedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    loadPaneState(io).then((s) => {
      if (!alive) return;
      loadedRef.current = true;
      latest.current = s;
      setState(s);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const update = useCallback((change: (s: PaneState) => PaneState) => {
    const next = change(latest.current);
    if (next === latest.current) return;
    latest.current = next;
    setState(next);
    if (loadedRef.current) savePaneState(io, next).catch(() => {});
  }, []);

  return [state, update, loaded];
}
