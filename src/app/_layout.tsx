// Navegación principal: 5 pestañas abajo.
import { DarkTheme, ThemeProvider } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { IconBusiness, IconChat, IconCore, IconHealth, IconRoutines } from '@/components/icons';
import { StoreProvider } from '@/lib/store';
import { C, mono } from '@/theme';

SplashScreen.preventAutoHideAsync();

const theme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: C.bg, card: C.bg, primary: C.accent } };

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <StoreProvider>
      <ThemeProvider value={theme}>
        <StatusBar style="light" />
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: '#D8C7FF',
            tabBarInactiveTintColor: C.muted,
            tabBarStyle: { backgroundColor: C.bg, borderTopColor: C.cardBorder },
            tabBarLabelStyle: { fontFamily: mono, fontSize: 9.5, letterSpacing: 1 },
          }}>
          <Tabs.Screen name="index" options={{ title: 'NÚCLEO', tabBarIcon: ({ color }) => <IconCore color={color} /> }} />
          <Tabs.Screen name="chat" options={{ title: 'CHAT', tabBarIcon: ({ color }) => <IconChat color={color} /> }} />
          <Tabs.Screen name="salud" options={{ title: 'SALUD', tabBarIcon: ({ color }) => <IconHealth color={color} /> }} />
          <Tabs.Screen name="negocios" options={{ title: 'NEGOCIOS', tabBarIcon: ({ color }) => <IconBusiness color={color} /> }} />
          <Tabs.Screen name="rutinas" options={{ title: 'RUTINAS', tabBarIcon: ({ color }) => <IconRoutines color={color} /> }} />
        </Tabs>
      </ThemeProvider>
    </StoreProvider>
  );
}
