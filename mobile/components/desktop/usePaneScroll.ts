import { useCallback, useRef } from 'react';
import { domNode, useDrag } from './DragProvider';

// One hook for every vertically scrolling desktop pane (the Brain Dump list,
// each day column, the Timebox grid). It returns `scrollRef(id, onNode?)`,
// a ref callback for a ScrollView (cached per id, so a list of columns can use
// it in a loop):
//  - The wheel scrolls the pane vertically. react-native-web ScrollViews do
//    this natively, and during a drag the lifted card ignores pointer events,
//    so the wheel still reaches the pane under the pointer.
//  - While a drag is in progress, holding the pointer near the pane's top or
//    bottom edge scrolls it (autoScrollSpeed in lib/drag.ts).
// `onNode` also hands the DOM node to the caller, e.g. to measure it as a
// drop zone.
export default function usePaneScroll() {
  const { registerScroller } = useDrag();
  const cache = useRef(new Map<string, (instance: unknown) => void>());
  const callbacks = useRef(new Map<string, ((node: HTMLElement | null) => void) | undefined>());

  return useCallback(
    (id: string, onNode?: (node: HTMLElement | null) => void) => {
      callbacks.current.set(id, onNode);
      const cached = cache.current.get(id);
      if (cached) return cached;
      const ref = (instance: unknown) => {
        const node = domNode(instance);
        registerScroller(id, node);
        callbacks.current.get(id)?.(node);
      };
      cache.current.set(id, ref);
      return ref;
    },
    [registerScroller],
  );
}
