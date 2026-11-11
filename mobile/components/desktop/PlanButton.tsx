import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import { radius } from '../../lib/tokens';
import { PLAN_LABEL, analyticsInMenu, otherFlow, planFlowFor, type PlanFlow } from '../../lib/planEntry';
import Popover, { Row, closePopover, togglePopover, useIsOpen, usePopoverAnchor } from './Popover';
import { useFeature } from './featureStore';
import { useTick } from './timerUi';
import { pressStyle } from './pressStyle';

// F1 of PLAN_daily_flow: one Plan button in the top bar, next to the avatar. A press opens the flow that fits the time
// of day (Plan my day in the morning, Wrap up from the afternoon); the small button beside it (the chevron) always lists
// both, so the other one is one press away. A plain "Analytics" text button sits beside it; on a narrow window (under
// 1100 px) it moves into that menu. Both parts are always visible (never hover only), 14 px, outlined, no red.
// Plan week is not built yet, so it is not listed. Off when the Daily planning feature is off (Settings, Power features).
const MENU_ID = 'plan-menu';

export default function PlanButton({ windowWidth, rowWidth = 0, onOpen, onAnalytics }: { windowWidth: number; rowWidth?: number; onOpen: (flow: PlanFlow) => void; onAnalytics: () => void }) {
  const planning = useFeature('planning');
  const analytics = useFeature('analytics');
  // The button changes its words at 14:00 and at 04:00 by itself.
  useTick(60000);
  const flow = planFlowFor(new Date().getHours());
  const open = useIsOpen(MENU_ID);
  const { ref, get } = usePopoverAnchor();
  const narrow = analyticsInMenu(windowWidth, rowWidth);
  // With planning off there is no menu, so Analytics always shows as its own button.
  const analyticsBeside = analytics && (!narrow || !planning);
  const analyticsInside = analytics && narrow && planning;
  if (!planning && !analytics) return null;
  const run = (fn: () => void) => () => {
    closePopover();
    fn();
  };
  return (
    <View style={styles.wrap} {...({ dataSet: { planEntry: flow } } as object)}>
      {analyticsBeside && (
        <Pressable onPress={onAnalytics} style={pressStyle(({ hovered }) => [styles.textBtn, hovered && styles.hover])} accessibilityRole="button" accessibilityLabel="Analytics" {...({ dataSet: { analyticsButton: '1' } } as object)}>
          <Text style={styles.textBtnText}>Analytics</Text>
        </Pressable>
      )}
      {planning && (
        <View style={styles.split}>
          <Pressable
            onPress={() => onOpen(flow)}
            style={pressStyle(({ hovered }) => [styles.main, hovered && styles.hover])}
            accessibilityRole="button"
            accessibilityLabel={PLAN_LABEL[flow]}
            {...({ dataSet: { planButton: flow } } as object)}
          >
            <Ionicons name={flow === 'planning' ? 'sunny-outline' : 'moon-outline'} size={17} color={Colors.textPrimary} />
            <Text style={styles.mainText}>{PLAN_LABEL[flow]}</Text>
          </Pressable>
          <Pressable
            ref={ref as never}
            onPress={() => togglePopover(MENU_ID, get)}
            style={pressStyle(({ hovered }) => [styles.chevron, (open || hovered) && styles.hover])}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            accessibilityLabel="Choose what to open"
            {...({ dataSet: { planMenu: '1' } } as object)}
          >
            <Ionicons name="chevron-down" size={16} color={Colors.textPrimary} />
          </Pressable>
        </View>
      )}
      {planning && (
        <Popover id={MENU_ID} anchor={get} width={240} label="Plan menu">
          <View style={styles.menu}>
            {[flow, otherFlow(flow)].map((f) => (
              <Row key={f} icon={f === 'planning' ? 'sunny-outline' : 'moon-outline'} label={PLAN_LABEL[f]} onPress={run(() => onOpen(f))} a11y={`${PLAN_LABEL[f]} from the menu`} />
            ))}
            {analyticsInside && <Row icon="bar-chart-outline" label="Analytics" onPress={run(onAnalytics)} a11y="Analytics from the menu" />}
          </View>
        </Popover>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  textBtn: { height: 36, paddingHorizontal: 8, justifyContent: 'center', borderRadius: radius.square },
  textBtnText: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, textDecorationLine: 'underline' },
  split: { flexDirection: 'row', alignItems: 'center' },
  main: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 12, borderWidth: 2, borderColor: Colors.borderStrong, borderRightWidth: 1, borderRadius: radius.square },
  mainText: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  chevron: { width: 32, height: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderLeftWidth: 1, borderColor: Colors.borderStrong, borderRadius: radius.square },
  hover: { backgroundColor: Colors.hover },
  menu: { paddingVertical: 4 },
});
