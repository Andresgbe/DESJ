// Navegación principal: 5 pestañas abajo.
import { DarkTheme, ThemeProvider } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { IconBusiness, IconChat, IconCore, IconHealth, IconRoutines } from '@/components/icons';
import { Login } from '@/components/login';
import { AuthProvider, useAuth } from '@/lib/auth';
import { StoreProvider } from '@/lib/store';
import { cloudEnabled } from '@/lib/supabase';
import { C, mono } from '@/theme';

SplashScreen.preventAutoHideAsync();

const theme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: C.bg, card: C.bg, primary: C.accent } };

export default function RootLayout() {
  return (
    <AuthProvider>
      <ThemeProvider value={theme}>
        <StatusBar style="light" />
        <Gate />
      </ThemeProvider>
    </AuthProvider>
  );
}

// Con la nube configurada, nadie entra sin sesión. Sin ella, la app corre en modo local (demo).
function Gate() {
  const { ready, session } = useAuth();

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;
  if (cloudEnabled && !session) return <Login />;

  return (
    <StoreProvider>
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
    </StoreProvider>
  );
}
