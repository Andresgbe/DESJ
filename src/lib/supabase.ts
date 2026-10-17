// Cliente de Supabase. Si faltan las variables de entorno, la app sigue en modo local (demo).
import '@/lib/local-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

export const cloudEnabled = Boolean(url && key);

export const supabase = createClient(url || 'http://localhost', key || 'sin-configurar', {
  auth: {
    // Durante el render estático de la web (Node) no hay localStorage.
    storage: typeof window !== 'undefined' ? globalThis.localStorage : undefined,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Solo refresca la sesión mientras la app está abierta (ahorra batería).
if (cloudEnabled && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
