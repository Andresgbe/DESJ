// Cuenta de Google de la persona (Drive, Gmail para enviar, Calendar). Se conecta desde Ajustes:
// 1. connectGoogle() abre la pantalla de permisos de Google (con un "state" guardado en el navegador).
// 2. Google vuelve a la Edge Function google-auth, que reenvía a /google de la app.
// 3. finishGoogle() comprueba el state y le pide a google-auth que guarde el acceso (google_accounts, RLS).
// Por ahora funciona en la versión web (la app instalada abriría la vuelta en el navegador).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { useCallback, useState } from 'react';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

const CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '';
const REDIRECT = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/google-auth`;
const STATE_KEY = 'desj:google:state';
const SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar.events',
];

export const googleAvailable = Boolean(CLIENT_ID) && Platform.OS === 'web';

export type GoogleStatus = { email: string | null; connectedAt: string; lastError: string | null } | null;

/** Abre la pantalla de permisos de Google en esta misma pestaña. */
export async function connectGoogle() {
  const state = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
  await AsyncStorage.setItem(STATE_KEY, state);
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline', // acceso permanente (refresh token)
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function invoke(body: object): Promise<{ email?: string | null; error?: string }> {
  const { data, error } = await supabase.functions.invoke('google-auth', { body });
  if (error) {
    const detail = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null;
    return { error: detail?.error ?? 'No pude conectar con el servidor. Revisa tu internet.' };
  }
  return data;
}

/** Termina la conexión con el código que devolvió Google. */
export async function finishGoogle(code: string, state: string) {
  const expected = await AsyncStorage.getItem(STATE_KEY);
  await AsyncStorage.removeItem(STATE_KEY);
  if (!expected || expected !== state) return { error: 'La conexión no coincide con la que se pidió. Vuelve a intentarlo desde Ajustes.' };
  return invoke({ action: 'exchange', code });
}

export function useGoogle() {
  const [status, setStatus] = useState<GoogleStatus>(null);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    const { data } = await supabase.from('google_accounts').select('email, connected_at, last_error').maybeSingle();
    setStatus(data ? { email: data.email, connectedAt: data.connected_at, lastError: data.last_error } : null);
    setReady(true);
  }, []);

  const disconnect = async () => {
    const res = await invoke({ action: 'disconnect' });
    if (!res.error) setStatus(null);
    return res;
  };

  return { ready, status, reload, disconnect };
}
