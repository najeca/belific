// Settings, Planning (PLAN_push_after P3, 3.75.0): the push after switch, the same synced user_settings row as the
// desktop (`push.after`, on unless `off`; no database change).
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useTheme } from '../../components/phone/theme';
import Toggle from '../../components/Toggle';
import { loadUserSetting, setUserSetting } from '../../lib/storage';
import { PUSH_AFTER_HINT, PUSH_AFTER_KEY, PUSH_AFTER_LABEL, parsePushAfter } from '../../lib/pushAfter';

export default function PushAfterSection({ styles }: { styles: { sectionHeader: object; card: object; row: object; rowLabel: object } }) {
  const { c: Colors } = useTheme();
  const [on, setOn] = useState(true);
  useFocusEffect(
    useCallback(() => {
      loadUserSetting(PUSH_AFTER_KEY).then((v) => setOn(parsePushAfter(v)), () => {});
    }, []),
  );
  const set = (v: boolean) => {
    setOn(v);
    void setUserSetting(PUSH_AFTER_KEY, v ? 'on' : 'off');
  };
  return (
    <>
      <Text style={styles.sectionHeader}>Planning</Text>
      <View style={styles.card} {...({ dataSet: { pushAfter: on ? '1' : '0' } } as object)}>
        <View style={styles.row}>
          <Text style={[styles.rowLabel, { flex: 1 }]}>{PUSH_AFTER_LABEL}</Text>
          <Toggle value={on} onValueChange={set} label={PUSH_AFTER_LABEL} colors={Colors} />
        </View>
        <Text style={[styles.rowLabel, { fontSize: 12, color: Colors.textSecondary, paddingHorizontal: 16, paddingBottom: 10 }]}>{PUSH_AFTER_HINT}</Text>
      </View>
    </>
  );
}
