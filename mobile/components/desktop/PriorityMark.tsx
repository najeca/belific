import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { MUST_DO_MARK, MUST_DO_TIP } from '../../lib/mustDo';
import { tipRef } from './tip';

// The small red ! of a top priority task on a block or chip (2.28.1): the same mark,
// tooltip and aria-label as on a card. It sits beside the title (never over it).
export default function PriorityMark() {
  return (
    <Text
      ref={tipRef(MUST_DO_TIP) as never}
      style={styles.mark}
      accessibilityLabel={MUST_DO_TIP}
      {...({ 'aria-label': MUST_DO_TIP, dataSet: { priorityMark: '1' } } as object)}
    >
      {MUST_DO_MARK}
    </Text>
  );
}

const styles = StyleSheet.create({
  mark: { fontSize: 11, lineHeight: 16, flexShrink: 0 },
});
