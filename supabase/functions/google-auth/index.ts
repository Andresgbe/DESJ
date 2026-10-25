// Edge Function `google-auth`: conecta la cuenta de Google de la persona (OAuth).
// - GET  ?code&state  → Google vuelve aquí (URI registrada en Google Cloud). Reenvía a la app, a
//   APP_URL/google, que tiene la sesión de la persona y termina la conexión.
// - POST { action: 'exchange', code }  (con sesión) → cambia el código por el acceso y lo guarda en
//   google_accounts con la sesión de la persona (RLS: solo su fila).
// - POST { action: 'disconnect' }      (con sesión) → revoca el acceso en Google y borra la fila.
// Se despliega con verify_jwt desactivado porque Google no manda sesión en el GET; los POST la validan aquí.
// Secretos: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET; opcional APP_URL (por defecto https://desj.expo.app).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from '@supabase/supabase-js';

import { GOOGLE_SCOPES } from '../_shared/google.ts';

const APP_URL = Deno.env.get('APP_URL') ?? 'https://desj.expo.app';
const SELF_URL = `${Deno.env.get('SUPABASE_URL')}/functions/v1/google-auth`;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  // Vuelta desde Google: solo se reenvía a la app con los mismos parámetros.
  if (req.method === 'GET') {
    const from = new URL(req.url);
    const to = new URL('/google', APP_URL);
    for (const k of ['code', 'state', 'error']) {
      const v = from.searchParams.get(k);
      if (v) to.searchParams.set(k, v);
    }
    return Response.redirect(to.toString(), 302);
  }
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  });
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return json({ error: 'Sesión inválida' }, 401);

  const body = await req.json().catch(() => ({}));
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  if (!clientId || !clientSecret) return json({ error: 'Falta configurar GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en Supabase.' }, 503);

  if (body.action === 'exchange' && typeof body.code === 'string') {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code: body.code, client_id: clientId, client_secret: clientSecret, redirect_uri: SELF_URL, grant_type: 'authorization_code' }),
    });
    const tok = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string };
    if (!res.ok || !tok.access_token) return json({ error: `Google no aceptó la conexión (${tok.error ?? res.status}). Intenta de nuevo.` }, 400);

    const info = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tok.access_token}` } })
      .then((r) => r.json() as Promise<{ email?: string }>)
      .catch(() => ({}) as { email?: string });

    // Si Google no manda refresh_token (ya estaba conectada), se conserva el que había.
    const { data: prev } = await db.from('google_accounts').select('refresh_token').eq('user_id', auth.user.id).maybeSingle();
    const refresh = tok.refresh_token ?? prev?.refresh_token;
    if (!refresh) return json({ error: 'Google no entregó acceso permanente. Desconecta DESJ en myaccount.google.com/permissions y vuelve a conectar.' }, 400);

    const { error } = await db.from('google_accounts').upsert(
      {
        user_id: auth.user.id,
        email: info.email ?? null,
        refresh_token: refresh,
        access_token: tok.access_token,
        expires_at: new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString(),
        scopes: tok.scope ?? GOOGLE_SCOPES.join(' '),
        connected_at: new Date().toISOString(),
        last_error: null,
      },
      { onConflict: 'user_id' },
    );
    if (error) return json({ error: 'No pude guardar la conexión.' }, 500);
    return json({ email: info.email ?? null, scopes: tok.scope ?? '' });
  }

  if (body.action === 'disconnect') {
    const { data: acc } = await db.from('google_accounts').select('refresh_token').eq('user_id', auth.user.id).maybeSingle();
    if (acc?.refresh_token) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(acc.refresh_token)}`, { method: 'POST' }).catch(() => null);
    await db.from('google_accounts').delete().eq('user_id', auth.user.id);
    return json({ ok: true });
  }

  return json({ error: 'Acción desconocida' }, 400);
});
