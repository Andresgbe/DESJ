// Raíz: sesión, datos y una pila con las pestañas (tabs) y las pantallas del menú de perfil encima.
import { DarkTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { Login } from '@/components/login';
import { AuthProvider, useAuth } from '@/lib/auth';
import { ChatsProvider } from '@/lib/chats';
import { MotionProvider } from '@/lib/motion';
import { StoreProvider } from '@/lib/store';
import { cloudEnabled } from '@/lib/supabase';
import { C, mono } from '@/theme';

SplashScreen.preventAutoHideAsync();

const theme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: C.bg, card: C.bg, primary: C.accent } };

export default function RootLayout() {
  return (
    <MotionProvider>
      <AuthProvider>
        <ThemeProvider value={theme}>
          <StatusBar style="light" />
          <Gate />
        </ThemeProvider>
      </AuthProvider>
    </MotionProvider>
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
      <ChatsProvider>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: C.bg },
            headerTintColor: C.accentSoft,
            headerTitleStyle: { color: C.text, fontFamily: mono, fontSize: 14 },
            headerShadowVisible: false,
            headerBackButtonDisplayMode: 'minimal',
            contentStyle: { backgroundColor: C.bg },
          }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="conocimiento" options={{ title: 'CONOCIMIENTO' }} />
          <Stack.Screen name="ajustes" options={{ title: 'AJUSTES' }} />
          <Stack.Screen name="google" options={{ title: 'GOOGLE' }} />
        </Stack>
      </ChatsProvider>
    </StoreProvider>
  );
}
