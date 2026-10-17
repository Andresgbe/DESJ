// Edge Function `chat`: el cerebro de DESJ.
// 1. Identifica al usuario por su JWT (todas las consultas pasan por RLS: solo ve lo suyo).
// 2. Arma su contexto privado: perfil, memorias, medicamentos, recordatorios e historial reciente.
// 3. Llama a Claude con herramientas y ejecuta las que pida.
// 4. Guarda la conversación y devuelve la respuesta + acciones para el teléfono.
//
// Secretos (Supabase → Edge Functions → Secrets):
//   ANTHROPIC_API_KEY  obligatorio
//   CLAUDE_MODEL       opcional (por defecto claude-sonnet-5)
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Anthropic from '@anthropic-ai/sdk';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { SYSTEM_PROMPT } from './prompt.ts';
import { Actions, runTool, TOOLS } from './tools.ts';

const MODEL = Deno.env.get('CLAUDE_MODEL') ?? 'claude-sonnet-5';
const HISTORY = 20; // mensajes previos que se reenvían
const MAX_STEPS = 6; // vueltas máximas de herramientas por mensaje

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ error: 'Falta configurar ANTHROPIC_API_KEY en los secretos de Supabase.' }, 503);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  });
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return json({ error: 'Sesión inválida' }, 401);

  let message = '';
  let agenda: unknown = null;
  try {
    const body = await req.json();
    message = String(body.message ?? '').trim();
    agenda = body.agenda ?? null;
  } catch {
    // cuerpo inválido: se responde abajo
  }
  if (!message || message.length > 4000) return json({ error: 'Mensaje vacío o demasiado largo' }, 400);

  const ctx = await loadContext(db, agenda);
  const actions: Actions = { reminders: [], events: [], medsChanged: false, intakesChanged: false };
  const client = new Anthropic({ apiKey });

  const messages: Anthropic.MessageParam[] = [...ctx.history, { role: 'user', content: message }];
  const system: Anthropic.TextBlockParam[] = [
    { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: ctx.block },
  ];

  let reply = '';
  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        output_config: { effort: 'medium' },
        system,
        tools: TOOLS,
        messages,
      });

      if (response.stop_reason === 'refusal') {
        reply = 'No puedo ayudarte con eso. ¿Te ayudo con otra cosa?';
        break;
      }

      messages.push({ role: 'assistant', content: response.content });
      const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');

      if (toolUses.length === 0 || response.stop_reason !== 'tool_use') {
        reply = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('\n')
          .trim();
        break;
      }

      const results: Anthropic.ToolResultBlockParam[] = await Promise.all(
        toolUses.map(async (t) => {
          try {
            const out = await runTool(db, t.name, t.input as Record<string, unknown>, { today: ctx.today, actions });
            return { type: 'tool_result' as const, tool_use_id: t.id, content: out };
          } catch (e) {
            return { type: 'tool_result' as const, tool_use_id: t.id, content: `Error: ${errorText(e)}`, is_error: true };
          }
        }),
      );
      messages.push({ role: 'user', content: results });
    }
  } catch (e) {
    console.error('Claude', e);
    if (e instanceof Anthropic.AuthenticationError) return json({ error: 'La API key de Claude no es válida.' }, 502);
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'DESJ está ocupado, intenta en un momento.' }, 429);
    if (e instanceof Anthropic.APIError) return json({ error: `Error de Claude (${e.status}).` }, 502);
    return json({ error: 'No pude conectar con el cerebro de DESJ.' }, 502);
  }

  if (!reply) reply = 'Listo.';

  const { error: saveError } = await db.from('messages').insert([
    { role: 'user', content: message },
    { role: 'assistant', content: reply },
  ]);
  if (saveError) console.error('guardar historial', saveError);

  return json({ reply, actions });
});

// `agenda` la manda el teléfono (eventos de hoy de su calendario); null = sin acceso al calendario.
async function loadContext(db: SupabaseClient, agenda: unknown) {
  const [profile, memories, meds, reminders, history] = await Promise.all([
    db.from('profiles').select('display_name, about, timezone').single(),
    db.from('memories').select('id, category, content, created_at').order('created_at', { ascending: false }).limit(150),
    db.from('meds').select('id, name, dose, hour, minute').eq('active', true).order('hour').order('minute'),
    db
      .from('reminders')
      .select('title, due_at, repeat')
      .eq('done', false)
      .or(`repeat.eq.daily,due_at.gte.${new Date().toISOString()}`)
      .order('due_at')
      .limit(20),
    db.from('messages').select('role, content').order('created_at', { ascending: false }).limit(HISTORY),
  ]);

  const tz = profile.data?.timezone || 'America/Caracas';
  const now = new Date();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now); // YYYY-MM-DD
  const nowText = new Intl.DateTimeFormat('es-VE', { timeZone: tz, dateStyle: 'full', timeStyle: 'short' }).format(now);
  const offset = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
    .formatToParts(now)
    .find((p) => p.type === 'timeZoneName')?.value.replace('GMT', '') || '+00:00';

  const { data: intakes } = await db.from('med_intakes').select('med_id').eq('day', today);
  const takenIds = new Set((intakes ?? []).map((i) => i.med_id));
  const pad = (n: number) => String(n).padStart(2, '0');

  const lines = [
    '<contexto_usuario>',
    `Nombre: ${profile.data?.display_name || '[sin nombre]'}`,
    `Sobre la persona: ${profile.data?.about || '[sin datos todavía]'}`,
    `Ahora: ${nowText} (zona ${tz}, desfase ${offset}). Hoy es ${today}.`,
    '',
    '<memorias>',
    ...(memories.data ?? []).reverse().map((m) => `- [${m.id}] (${m.category}, ${m.created_at.slice(0, 10)}) ${m.content}`),
    '</memorias>',
    '',
    '<medicamentos>',
    ...(meds.data ?? []).map(
      (m) => `- [${m.id}] ${pad(m.hour)}:${pad(m.minute)} ${m.name} · ${m.dose} · ${takenIds.has(m.id) ? 'tomado hoy' : 'pendiente hoy'}`,
    ),
    '</medicamentos>',
    '',
    '<recordatorios_pendientes>',
    ...(reminders.data ?? []).map((r) => `- ${r.due_at} ${r.repeat === 'daily' ? '(diario) ' : ''}${r.title}`),
    '</recordatorios_pendientes>',
    '',
    '<agenda_hoy>',
    ...agendaLines(agenda, tz),
    '</agenda_hoy>',
    '</contexto_usuario>',
  ];

  // El historial viene del más nuevo al más viejo; se invierte y debe empezar con un mensaje del usuario.
  const rows = (history.data ?? []).reverse();
  while (rows.length && rows[0].role !== 'user') rows.shift();
  const historyMsgs: Anthropic.MessageParam[] = rows.map((r) => ({ role: r.role as 'user' | 'assistant', content: r.content }));

  return { block: lines.join('\n'), today, history: historyMsgs };
}

function agendaLines(agenda: unknown, tz: string): string[] {
  if (!Array.isArray(agenda)) return ['[sin acceso al calendario del teléfono]'];
  if (agenda.length === 0) return ['[nada agendado hoy]'];
  const fmt = new Intl.DateTimeFormat('es-VE', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
  const time = (v: unknown) => {
    const d = new Date(String(v ?? ''));
    return Number.isNaN(d.getTime()) ? '?' : fmt.format(d);
  };
  return agenda.slice(0, 30).map((e) => {
    const ev = (e ?? {}) as Record<string, unknown>;
    const title = String(ev.title ?? '').slice(0, 200);
    const where = ev.location ? ` · ${String(ev.location).slice(0, 120)}` : '';
    return ev.allDay ? `- todo el día: ${title}${where}` : `- ${time(ev.start)} a ${time(ev.end)}: ${title}${where}`;
  });
}

function errorText(e: unknown) {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}
