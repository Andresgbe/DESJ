// Pestañas principales, abajo.
import { Tabs } from 'expo-router/js-tabs';

import { IconCalendar, IconCore, IconGrid, IconTasks, IconUser } from '@/components/icons';
import { C, mono } from '@/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.tabActive,
        tabBarInactiveTintColor: C.muted,
        tabBarStyle: { backgroundColor: C.bg, borderTopColor: C.cardBorder },
        tabBarLabelStyle: { fontFamily: mono, fontSize: 9, letterSpacing: 0.8 },
      }}>
      <Tabs.Screen name="index" options={{ title: 'NÚCLEO', tabBarIcon: ({ color }) => <IconCore color={color} /> }} />
      <Tabs.Screen name="calendario" options={{ title: 'CALENDARIO', tabBarIcon: ({ color }) => <IconCalendar color={color} /> }} />
      <Tabs.Screen name="yo" options={{ title: 'YO', tabBarIcon: ({ color }) => <IconUser color={color} /> }} />
      <Tabs.Screen name="modulos" options={{ title: 'MÓDULOS', tabBarIcon: ({ color }) => <IconGrid color={color} /> }} />
      <Tabs.Screen name="pendientes" options={{ title: 'PENDIENTES', tabBarIcon: ({ color }) => <IconTasks color={color} /> }} />
    </Tabs>
  );
}
