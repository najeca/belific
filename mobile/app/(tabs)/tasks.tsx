import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { AddButton, ScreenHeader, Segmented } from '../../components/phone/chrome';
import { QuickAdd } from '../../components/phone/QuickAdd';
import { useTheme } from '../../components/phone/theme';
import BrainDumpScreen from '../../components/legacy/BrainDumpScreen';
import TaskListScreen from '../../components/legacy/TaskListScreen';
import QuestsScreen from '../../components/legacy/QuestsScreen';

// The Tasks tab (PLAN_phone P3, interim): Brain Dump, the full list and Repeating (the old Quests
// tab), so nothing the four old tabs did is lost before P5 replaces this with the list switcher.
type Part = 'dump' | 'all' | 'repeating';

export default function TasksTab() {
  const { c } = useTheme();
  const [part, setPart] = useState<Part>('dump');
  const [adding, setAdding] = useState(false);
  // The embedded screens reload on focus; a new key after an add redraws the shown one.
  const [nonce, setNonce] = useState(0);
  useFocusEffect(useCallback(() => setNonce((n) => n + 1), []));
  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader title="Tasks" />
      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        <Segmented
          a11y="Which tasks"
          value={part}
          onChange={setPart}
          options={[
            { key: 'dump', label: 'Brain Dump' },
            { key: 'all', label: 'All' },
            { key: 'repeating', label: 'Repeating' },
          ]}
        />
      </View>
      <View style={{ flex: 1 }} key={`${part}-${nonce}`}>
        {part === 'dump' ? <BrainDumpScreen /> : part === 'all' ? <TaskListScreen /> : <QuestsScreen />}
      </View>
      <AddButton onPress={() => setAdding(true)} a11y={part === 'dump' ? 'Add to Brain Dump' : 'Add a task'} />
      <QuickAdd visible={adding} where={{ label: 'Brain Dump' }} onClose={() => setAdding(false)} onAdded={() => setNonce((n) => n + 1)} />
    </View>
  );
}
