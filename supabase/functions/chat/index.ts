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
import { createClient } from '@supabase/supabase-js';

import { INTERVIEW_PROMPT, SYSTEM_PROMPT } from './prompt.ts';
import { loadAttachment, loadContext, makeTitle } from './context.ts';
import { Actions, runTool, TOOLS } from './tools.ts';

const MODEL = Deno.env.get('CLAUDE_MODEL') ?? 'claude-sonnet-5';
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
  let conversationId: string | null = null;
  let mode: 'chat' | 'conocimiento' = 'chat';
  let attachment: { path: string; name: string; mime: string } | null = null;
  try {
    const body = await req.json();
    message = String(body.message ?? '').trim();
    agenda = body.agenda ?? null;
    conversationId = typeof body.conversation_id === 'string' && body.conversation_id ? body.conversation_id : null;
    if (body.mode === 'conocimiento') mode = 'conocimiento';
    const a = body.attachment;
    if (a && typeof a.path === 'string' && typeof a.name === 'string' && typeof a.mime === 'string') {
      attachment = { path: a.path, name: a.name.slice(0, 200), mime: a.mime };
    }
  } catch {
    // cuerpo inválido: se responde abajo
  }
  if ((!message && !attachment) || message.length > 4000) return json({ error: 'Mensaje vacío o demasiado largo' }, 400);

  // Adjunto: solo de la carpeta del propio usuario (Storage también lo exige por RLS).
  let fileBlock: Anthropic.ContentBlockParam | null = null;
  if (attachment) {
    if (!attachment.path.startsWith(`${auth.user.id}/`)) return json({ error: 'Adjunto no válido' }, 403);
    const loaded = await loadAttachment(db, attachment);
    if ('error' in loaded) return json({ error: loaded.error }, 400);
    fileBlock = loaded.block;
  }
  const savedText = attachment ? [message, `[Adjunto: ${attachment.name}]`].filter(Boolean).join('\n') : message;

  // Conversación existente: RLS garantiza que sea del usuario. Si no hay, se crea al guardar.
  if (conversationId) {
    const { data: conv } = await db.from('conversations').select('id').eq('id', conversationId).maybeSingle();
    if (!conv) return json({ error: 'Esa conversación ya no existe.' }, 404);
  }

  const ctx = await loadContext(db, auth.user.id, agenda, conversationId);
  const actions: Actions = { reminders: [], events: [], medsChanged: false, intakesChanged: false, knowledgeChanged: false, tasksChanged: false };
  const client = new Anthropic({ apiKey });

  const userContent: Anthropic.ContentBlockParam[] | string = fileBlock
    ? [fileBlock, { type: 'text', text: message || `Te envío "${attachment!.name}". Revísalo y dime lo importante.` }]
    : message;
  const messages: Anthropic.MessageParam[] = [...ctx.history, { role: 'user', content: userContent }];
  const system: Anthropic.TextBlockParam[] = [
    { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ...(mode === 'conocimiento' ? [{ type: 'text' as const, text: INTERVIEW_PROMPT, cache_control: { type: 'ephemeral' as const } }] : []),
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
            const out = await runTool(db, t.name, t.input as Record<string, unknown>, { today: ctx.today, actions, userId: auth.user!.id });
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

  let title: string | null = null;
  if (!conversationId) {
    title = makeTitle(message || attachment?.name || 'Archivo');
    const { data: conv, error } = await db.from('conversations').insert({ title, kind: mode }).select('id').single();
    if (error) console.error('crear conversación', error);
    conversationId = conv?.id ?? null;
  }
  if (conversationId) {
    const [saved, touched] = await Promise.all([
      db.from('messages').insert([
        { conversation_id: conversationId, role: 'user', content: savedText },
        { conversation_id: conversationId, role: 'assistant', content: reply },
      ]),
      db.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId),
    ]);
    if (saved.error || touched.error) console.error('guardar historial', saved.error ?? touched.error);
  }

  return json({ reply, actions, conversation_id: conversationId, title });
});

function errorText(e: unknown) {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}
