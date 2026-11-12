import React, { useEffect, useState } from 'react';
import { THIS_AND_FOLLOWING } from '../../lib/series';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { radius } from '../../lib/tokens';
import { dateKey } from '../../lib/kanban';
import { loadTasksRaw } from '../../lib/storage';
import { clearButton, clearExplain, clearQuestion, clearedText, defaultMode, labelTrashButton, planClear, repeatNote, shiftNote, weekOf, type ClearMode, type ClearPlan, type ClearScope, type ClearTarget } from '../../lib/clear';
import { runClear } from '../../lib/clearActions';
import Popover, { Row, closePopover, togglePopover, useIsOpen, usePopoverAnchor } from './Popover';
import { notifyChanged, offerUndo } from './uiStore';
import { runUndo } from './useUndoRedo';

// F2 of PLAN_daily_flow: the confirmation of a Clear (day, week, list, label). It counts first ("Clear 14 tasks from
// Wednesday 18 Nov?"), says in plain words what will happen, asks "This day only" or "All days" when a repeating task is
// among them (All days chosen), and has ONE main button. Clear label also has a smaller second button, "Move the N
// tasks to Trash" (D3). Everything is one gesture: one Ctrl+Z, or the Undo of the note that follows, restores it all.
// 14 px or more, visible buttons, no red.
export function ClearBody({ target, onDone }: { target: ClearTarget; onDone: () => void }) {
  const todayKey = dateKey(new Date());
  const mode = defaultMode(target);
  const [plans, setPlans] = useState<{ main: ClearPlan; trash: ClearPlan | null } | null>(null);
  const [scope, setScope] = useState<ClearScope>('all');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    loadTasksRaw().then((tasks) => {
      if (live) setPlans({ main: planClear(tasks, target, todayKey, mode), trash: target.kind === 'label' ? planClear(tasks, target, todayKey, 'trash') : null });
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!plans) return <View style={styles.box} />;
  const plan = plans.main;
  const go = async (m: ClearMode) => {
    if (busy) return;
    setBusy(true);
    const n = await runClear(target, m, scope, todayKey);
    notifyChanged();
    onDone();
    if (n > 0) offerUndo(clearedText(m, n), runUndo, 10000);
  };
  const repeating = mode === 'off' ? 0 : plan.repeating;
  const dayWord = target.kind === 'day' || target.kind === 'week' ? 'This day only' : 'Their next day only';
  return (
    <View style={styles.box} {...({ dataSet: { clearBox: target.kind } } as object)}>
      <Text style={styles.question} accessibilityRole="header">
        {clearQuestion(target, plan, todayKey)}
      </Text>
      {plan.count > 0 && <Text style={styles.text}>{clearExplain(target, mode)}</Text>}
      {plan.count > 0 && shiftNote(plan) ? <Text style={styles.text}>{shiftNote(plan)}</Text> : null}
      {repeating > 0 && (
        <View style={styles.repeat} {...({ dataSet: { clearRepeat: scope } } as object)}>
          <Text style={styles.text}>{repeatNote(repeating)}</Text>
          {(target.kind === 'day' || target.kind === 'week' ? (['day', 'following', 'all'] as const) : (['day', 'all'] as const)).map((s) => (
            <Pressable
              key={s}
              onPress={() => setScope(s)}
              style={styles.choice}
              accessibilityRole="radio"
              accessibilityState={{ checked: scope === s }}
              accessibilityLabel={s === 'day' ? dayWord : s === 'following' ? THIS_AND_FOLLOWING : 'All days'}
              {...({ 'aria-checked': scope === s, dataSet: { clearScope: s } } as object)}
            >
              <View style={[styles.radio, scope === s && styles.radioOn]}>{scope === s ? <View style={styles.radioDot} /> : null}</View>
              <Text style={styles.text}>{s === 'day' ? dayWord : s === 'following' ? THIS_AND_FOLLOWING : 'All days'}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <View style={styles.actions}>
        {plans.trash && plans.trash.count > 0 && (
          <Pressable onPress={() => void go('trash')} style={styles.second} accessibilityRole="button" accessibilityLabel={labelTrashButton(plans.trash.count)} {...({ dataSet: { clearTrash: '1' } } as object)}>
            <Text style={styles.secondText}>{labelTrashButton(plans.trash.count)}</Text>
          </Pressable>
        )}
        <View style={{ flex: 1 }} />
        <Pressable onPress={onDone} style={styles.cancel} accessibilityRole="button" accessibilityLabel="Cancel" {...({ dataSet: { clearCancel: '1' } } as object)}>
          <Text style={styles.cancelText}>{plan.count > 0 ? 'Cancel' : 'Close'}</Text>
        </Pressable>
        {plan.count > 0 && (
          <Pressable onPress={() => void go(mode)} style={styles.main} accessibilityRole="button" accessibilityLabel={clearButton(mode, plan.count)} {...({ dataSet: { clearGo: '1' } } as object)}>
            <Text style={styles.mainText}>{clearButton(mode, plan.count)}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// The week header's ⋯ (the Tasks board's title row, the Calendar's Week view): Clear week. `dayKey` is any day of it.
export function WeekMenu({ dayKey, id }: { dayKey: string; id: string }) {
  const { ref, get } = usePopoverAnchor();
  const open = useIsOpen(id);
  const [clearing, setClearing] = useState(false);
  useEffect(() => {
    if (!open) setClearing(false);
  }, [open]);
  const days = weekOf(dayKey);
  return (
    <>
      <Pressable ref={ref as never} onPress={() => togglePopover(id, get)} style={[styles.dots, open && styles.dotsOn]} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel="Week menu" {...({ dataSet: { weekMenu: days[0] } } as object)}>
        <Ionicons name="ellipsis-horizontal" size={18} color={Colors.textSecondary} />
      </Pressable>
      <Popover id={id} anchor={get} width={clearing ? 360 : 240} maxHeight={560} label="Week menu">
        {clearing ? (
          <ClearBody target={{ kind: 'week', days }} onDone={() => closePopover(true)} />
        ) : (
          <View style={styles.menu}>
            <Row icon="close-circle-outline" label="Clear week" onPress={() => setClearing(true)} a11y="Clear week" />
          </View>
        )}
      </Popover>
    </>
  );
}

const styles = StyleSheet.create({
  box: { padding: 14, gap: 8, minWidth: 280 },
  question: { fontSize: 16, lineHeight: 21, fontWeight: '700', color: Colors.textPrimary },
  text: { fontSize: 14, lineHeight: 19, color: Colors.textPrimary },
  repeat: { gap: 4, marginTop: 2 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: Colors.textPrimary, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: Colors.accent },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.accent },
  actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 6 },
  main: { height: 38, paddingHorizontal: 16, justifyContent: 'center', borderRadius: radius.square, backgroundColor: Colors.accent },
  mainText: { fontSize: 14, fontWeight: '700', color: Colors.onAccent },
  second: { height: 32, paddingHorizontal: 10, justifyContent: 'center', borderRadius: radius.square, borderWidth: 2, borderColor: Colors.borderStrong },
  secondText: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  cancel: { height: 38, paddingHorizontal: 8, justifyContent: 'center' },
  cancelText: { fontSize: 14, fontWeight: '700', color: Colors.accentText, textDecorationLine: 'underline' },
  dots: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: radius.square },
  dotsOn: { backgroundColor: Colors.surface },
  menu: { paddingVertical: 4 },
});
