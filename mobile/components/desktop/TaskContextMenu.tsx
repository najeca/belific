// D5 of PLAN_desktop_parity (3.71.0): the right click menu of a task, the desktop's version of the phone's press and hold
// card. Which actions there are, in which order and with which words is lib/cardActions.ts (shared with the phone):
// Done (Not done when ticked), Edit, Skip today (repeating only), Move, Delete, More. Delete on a repeating task asks
// "Only today, or every day?" first and is never red. Opened by a right click, Shift+F10 or the Menu key on a card, an
// Anytime card or a bubble (cardMenuStore.ts). Up and Down move between the items, Enter does one, Esc closes (or goes
// back from Move and More), a click outside closes.
import React, { useEffect, useRef, useState } from 'react';
import { Colors } from '../../lib/theme';
import { addDays, dateKey, parseDateKey } from '../../lib/kanban';
import { DELETE_ASK, DELETE_CHOICES, SKIP_TODAY_NOTE, cardActions, deleteAsks } from '../../lib/cardActions';
import { deleteAllText, deleteOnlyText, partsOf, type DeleteChoice } from '../../lib/parts';
import { deleteSeriesWithParts, deleteWithParts } from '../../lib/partActions';
import { rootTaskId } from '../../lib/recurrence';
import { insideItems, withShift } from '../../lib/shiftActions';
import { breakRefusal } from '../../lib/hostActions';
import { duplicateTaskById } from '../../lib/taskCommands';
import { liveLists } from '../../lib/lists';
import { loadListsRaw, loadTasksRaw } from '../../lib/storage';
import type { TaskList } from '../../lib/types';
import { closeCardMenu, useCardMenu, type CardMenuTarget } from './cardMenuStore';
import { notifyChanged, showNotice } from './uiStore';
import { DESKTOP_FONT_FAMILY } from './desktopFont';

type View = 'main' | 'move' | 'more' | 'delete' | 'parts' | 'shift';

const box: React.CSSProperties = { position: 'fixed', zIndex: 80, minWidth: 220, maxWidth: 300, padding: 6, borderRadius: 12, background: Colors.surface, border: `1px solid ${Colors.borderStrong}`, boxShadow: Colors.shadowMd, fontFamily: DESKTOP_FONT_FAMILY, color: Colors.textPrimary };
const item = (primary = false): React.CSSProperties => ({ display: 'flex', alignItems: 'center', width: '100%', minHeight: 34, padding: '0 12px', border: 'none', borderRadius: 8, background: primary ? Colors.accent : 'transparent', color: primary ? Colors.onAccent : Colors.textPrimary, fontSize: 14, fontWeight: primary ? 700 : 600, fontFamily: DESKTOP_FONT_FAMILY, textAlign: 'left', cursor: 'pointer' });

export default function TaskContextMenu() {
  const target = useCardMenu();
  if (!target) return null;
  return <Menu key={`${target.task.id}:${target.x}:${target.y}`} target={target} />;
}

function Menu({ target }: { target: CardMenuTarget }) {
  const { task, ops, projected } = target;
  const [view, setView] = useState<View>('main');
  const [lists, setLists] = useState<TaskList[]>([]);
  const [partCount, setPartCount] = useState(0);
  const [pendingShift, setPendingShift] = useState<{ verb: 'Delete' | 'Skip'; count: number; run: (all: boolean) => Promise<void> } | null>(null);
  const [deleteChoice, setDeleteChoice] = useState<'today' | 'all' | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const repeating = deleteAsks(task);
  const isDump = task.id.startsWith('dump:');

  useEffect(() => {
    loadListsRaw().then((l) => setLists(liveLists(l))).catch(() => {});
    const before = document.activeElement as HTMLElement | null;
    return () => {
      if (before && before.isConnected) before.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    const t = setTimeout(() => ref.current?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true }), 20);
    return () => clearTimeout(t);
  }, [view]);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) closeCardMenu();
    };
    window.addEventListener('mousedown', onDown, true);
    return () => window.removeEventListener('mousedown', onDown, true);
  }, []);

  const finish = () => {
    closeCardMenu();
    notifyChanged();
    target.onChanged();
  };
  // Runs `own` at once, or asks first when the task is a shift with blocks inside (the shift only, or the shift and them).
  const guard = async (verb: 'Delete' | 'Skip', own: () => Promise<void>, scope: 'day' | 'series') => {
    const items = !task.cutsBelow ? await insideItems(task) : [];
    if (items.length === 0) {
      await withShift(own, [], scope);
      finish();
      return;
    }
    setPendingShift({ verb, count: items.length, run: async (all) => withShift(own, all ? items : [], scope) });
    setView('shift');
  };

  const move = async (fields: Parameters<typeof ops.patch>[0], text: string) => {
    const refused = await breakRefusal(task, fields, 'details');
    if (refused) {
      closeCardMenu();
      showNotice(refused);
      return;
    }
    await ops.patch(fields);
    showNotice(`${text}: ${task.title}`);
    finish();
  };

  const act = async (id: string) => {
    if (id === 'done') {
      await ops.setCompleted(!task.completed);
      finish();
    } else if (id === 'edit') {
      closeCardMenu();
      target.open();
    } else if (id === 'skip') {
      if (ops.series) await guard('Skip', () => ops.series!.skipDay(), 'day');
      else finish();
    } else if (id === 'move') setView('move');
    else if (id === 'more') setView('more');
    else if (id === 'delete') {
      if (repeating) setView('delete');
      else await deleteOne();
    }
  };

  async function deleteOne() {
    const n = partsOf(await loadTasksRaw(), task.id).length;
    if (n > 0) {
      setPartCount(n);
      setDeleteChoice('today');
      setView('parts');
      return;
    }
    await guard('Delete', () => ops.remove(), 'day');
  }
  async function deleteChosen(id: 'delete-today' | 'delete-all') {
    if (id === 'delete-today') {
      if (ops.series) await guard('Delete', () => ops.series!.skipDay(), 'day');
      else await deleteOne();
      return;
    }
    const n = partsOf(await loadTasksRaw(), rootTaskId(task.id)).length;
    if (n > 0) {
      setPartCount(n);
      setDeleteChoice('all');
      setView('parts');
      return;
    }
    if (ops.series) await guard('Delete', () => ops.series!.deleteSeries(), 'series');
    else finish();
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (view === 'main') closeCardMenu();
      else setView('main');
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const list = Array.from(ref.current?.querySelectorAll<HTMLElement>('button') ?? []);
      const at = list.indexOf(document.activeElement as HTMLElement);
      list[(at + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]?.focus();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      closeCardMenu();
    }
  };

  const today = dateKey(new Date());
  const tomorrow = dateKey(addDays(parseDateKey(today), 1));
  const nextWeek = dateKey(addDays(parseDateKey(today), 7));
  const btn = (label: string, run: () => void, data: string, primary = false) => (
    <button key={data} type="button" role="menuitem" style={item(primary)} onClick={run} data-card-menu-item={data}>
      {label}
    </button>
  );

  const left = Math.max(8, Math.min(target.x, window.innerWidth - 310));
  const top = Math.max(8, Math.min(target.y, window.innerHeight - 340));
  let body: React.ReactNode;
  if (view === 'main') {
    body = cardActions(task, task.completed)
      .filter((a) => !(a.id === 'done' && task.cutsBelow) && !(a.id === 'skip' && !ops.series))
      .map((a) => btn(a.label, () => void act(a.id), a.id, a.primary));
    if (repeating) body = [...(body as React.ReactElement[]), <div key="note" style={{ padding: '4px 12px 2px', fontSize: 12, color: Colors.textSecondary }}>{SKIP_TODAY_NOTE}</div>];
  } else if (view === 'move') {
    body = (
      <>
        {!repeating ? btn('Tomorrow', () => void move({ dueDate: tomorrow }, 'Moved to tomorrow'), 'move-tomorrow') : null}
        {!repeating ? btn('Next week', () => void move({ dueDate: nextWeek }, 'Moved to next week'), 'move-nextweek') : null}
        {!repeating ? btn('Pick a day', () => { closeCardMenu(); target.open(); }, 'move-pick') : null}
        {btn('🧠 Brain Dump', () => void move({ listKey: undefined }, 'Moved to Brain Dump'), 'move-list-none')}
        {lists.map((l) => btn(`${l.emoji ? `${l.emoji} ` : ''}${l.name}`, () => void move({ listKey: l.key }, `Moved to ${l.name}`), `move-list-${l.key}`))}
      </>
    );
  } else if (view === 'more') {
    body = (
      <>
        {!projected && !isDump ? btn('Duplicate', () => void duplicateTaskById(task.id).then(finish), 'duplicate') : null}
        {btn('Open details', () => { closeCardMenu(); target.open(); }, 'details')}
      </>
    );
  } else if (view === 'delete') {
    body = (
      <>
        <div style={{ padding: '6px 12px', fontSize: 13, color: Colors.textSecondary }} role="note">{DELETE_ASK}</div>
        {DELETE_CHOICES.map((c) => btn(c.label, () => void deleteChosen(c.id), c.id))}
        {btn('Cancel', () => setView('main'), 'cancel')}
      </>
    );
  } else if (view === 'parts') {
    const run = async (choice: DeleteChoice) => {
      if (deleteChoice === 'all') await deleteSeriesWithParts(task, choice);
      else await deleteWithParts(task, choice);
      finish();
    };
    body = (
      <>
        <div style={{ padding: '6px 12px', fontSize: 13, color: Colors.textSecondary }} role="note">This task has {partCount === 1 ? '1 smaller task' : `${partCount} smaller tasks`}.</div>
        {btn(deleteOnlyText, () => void run('only'), 'parts-only')}
        {btn(deleteAllText(partCount), () => void run('all'), 'parts-all')}
        {btn('Cancel', () => setView('main'), 'cancel')}
      </>
    );
  } else {
    body = pendingShift ? (
      <>
        <div style={{ padding: '6px 12px', fontSize: 13, color: Colors.textSecondary }} role="note">This shift has {pendingShift.count === 1 ? '1 task' : `${pendingShift.count} tasks`} inside it.</div>
        {btn(`${pendingShift.verb} the shift only`, () => void pendingShift.run(false).then(finish), 'shift-only')}
        {btn(`${pendingShift.verb} the shift and what is inside`, () => void pendingShift.run(true).then(finish), 'shift-all')}
        {btn('Cancel', () => closeCardMenu(), 'cancel')}
      </>
    ) : null;
  }

  return (
    <div ref={ref} role="menu" aria-label={`Actions for ${task.title}`} style={{ ...box, left, top }} onKeyDown={onKeyDown} onContextMenu={(e) => e.preventDefault()} data-card-menu={view}>
      {body}
    </div>
  );
}
