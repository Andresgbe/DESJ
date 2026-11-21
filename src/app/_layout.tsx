// Raíz: sesión, datos y una pila con las pestañas (tabs) y las pantallas del menú de perfil encima.
// Solo los pesos que usa la app, cada uno desde su carpeta (el índice del paquete pide también las cursivas).
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono/400Regular';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono/500Medium';
import { JetBrainsMono_600SemiBold } from '@expo-google-fonts/jetbrains-mono/600SemiBold';
import { JetBrainsMono_700Bold } from '@expo-google-fonts/jetbrains-mono/700Bold';
import { PlusJakartaSans_400Regular } from '@expo-google-fonts/plus-jakarta-sans/400Regular';
import { PlusJakartaSans_500Medium } from '@expo-google-fonts/plus-jakarta-sans/500Medium';
import { PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans/600SemiBold';
import { PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans/700Bold';
import { PlusJakartaSans_800ExtraBold } from '@expo-google-fonts/plus-jakarta-sans/800ExtraBold';
import { Sora_600SemiBold } from '@expo-google-fonts/sora/600SemiBold';
import { Sora_700Bold } from '@expo-google-fonts/sora/700Bold';
import { Sora_800ExtraBold } from '@expo-google-fonts/sora/800ExtraBold';
import { useFonts } from 'expo-font';
import { DarkTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

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
    // Raíz de gestos: arrastrar para ordenar (links de Universidad).
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.bg }}>
      <MotionProvider>
        <AuthProvider>
          <ThemeProvider value={theme}>
            <StatusBar style="light" />
            <Gate />
          </ThemeProvider>
        </AuthProvider>
      </MotionProvider>
    </GestureHandlerRootView>
  );
}

// Con la nube configurada, nadie entra sin sesión. Sin ella, la app corre en modo local (demo).
function Gate() {
  const { ready: authReady, session } = useAuth();
  // Tipografía DESJ Aether (ver FONTS en theme.ts). Si una fuente falla, la app sigue con la del sistema.
  const [fontsLoaded, fontsError] = useFonts({
    Sora_600SemiBold,
    Sora_700Bold,
    Sora_800ExtraBold,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    JetBrainsMono_600SemiBold,
    JetBrainsMono_700Bold,
  });
  const ready = authReady && (fontsLoaded || Boolean(fontsError));

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
