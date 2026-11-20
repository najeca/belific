import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../components/phone/theme';
import { inter } from '../../components/phone/type';
import { radius } from '../../lib/tokens';

type IconProps = { color: string; size: number };

// The phone's three tabs (PLAN_phone P3): Today, Calendar, Tasks. Settings live behind the profile
// avatar top right; Brain Dump and Repeating (the old Quests tab) are inside Tasks.
export default function TabLayout() {
  const { c } = useTheme();
  return (
    <>
    <Tabs
      screenOptions={{
        headerShown: false,
        // 3.63.0: the selected tab is filled with the accent, as on the desktop.
        tabBarActiveTintColor: c.onAccent,
        tabBarActiveBackgroundColor: c.accent,
        tabBarItemStyle: { borderRadius: radius.lg, marginHorizontal: 8, marginVertical: 4 },
        tabBarInactiveTintColor: c.textSecondary,
        tabBarStyle: {
          backgroundColor: c.pane,
          borderTopColor: c.border,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: { ...inter(600), fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="today"
        options={{
          title: 'Today',
          tabBarIcon: ({ color, size }: IconProps) => <Ionicons name="sunny-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          tabBarIcon: ({ color, size }: IconProps) => <Ionicons name="calendar-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: 'Tasks',
          tabBarIcon: ({ color, size }: IconProps) => <Ionicons name="checkbox-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
    </>
  );
}
