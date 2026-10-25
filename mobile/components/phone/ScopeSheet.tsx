import React, { useEffect, useRef, useState } from 'react';
import { ALL_DAYS, THIS_DAY_ONLY, answerScope, onScopeQuestion, type ScopeQuestion } from '../../lib/scopeAsk';
import { ActionMenu } from './menu';

// "This day only / All days" on the phone (3.4.0, lib/scopeAsk.ts): a sheet like the hold menu. It is
// drawn in the tab layout and inside the task details (a sheet over a sheet must come from the top one
// on iOS); only the most recently mounted one answers. Cancel or a tap outside dismisses it, and the
// change then does what it did before the question (the ticked row).
const hosts: number[] = [];
let nextHost = 1;

export function ScopeSheet() {
  const me = useRef(0);
  const [q, setQ] = useState<ScopeQuestion | null>(null);
  useEffect(() => {
    me.current = nextHost++;
    hosts.push(me.current);
    const off = onScopeQuestion((next) => setQ(next && hosts[hosts.length - 1] === me.current ? next : null));
    return () => {
      off();
      hosts.splice(hosts.indexOf(me.current), 1);
    };
  }, []);
  return (
    <ActionMenu
      visible={!!q}
      title={q?.title}
      items={[
        { label: THIS_DAY_ONLY, icon: 'today-outline', selected: q?.fallback === 'day', run: () => answerScope('day') },
        { label: ALL_DAYS, icon: 'repeat', selected: q?.fallback === 'all', run: () => answerScope('all') },
      ]}
      // The menu closes before it runs the choice: the dismissal waits a turn so a choice wins.
      onClose={() => setTimeout(() => answerScope(null), 0)}
    />
  );
}
