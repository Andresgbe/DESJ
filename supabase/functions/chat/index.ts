// Edge Function `chat`: el cerebro de DESJ.
// 1. Identifica al usuario por su JWT (todas las consultas pasan por RLS: solo ve lo suyo).
// 2. Arma su contexto privado: perfil, memorias, medicamentos, recordatorios e historial reciente.
// 3. Llama a Gemini con herramientas y ejecuta las que pida.
// 4. Guarda la conversación y devuelve la respuesta + acciones para el teléfono.
//
// Secretos (Supabase → Edge Functions → Secrets):
//   GEMINI_API_KEY     obligatorio (https://aistudio.google.com/apikey)
//   GEMINI_MODEL       opcional (por defecto gemini-3.8-flash)
//   GEMINI_THINKING    opcional: MINIMAL, LOW, MEDIUM (por defecto) o HIGH
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from '@supabase/supabase-js';

import { type Content, generate, GeminiError, type Part } from './gemini.ts';
import { INTERVIEW_PROMPT, SYSTEM_PROMPT } from './prompt.ts';
import { loadAttachment, loadContext, makeTitle } from './context.ts';
import { Actions, runTool, TOOLS } from './tools.ts';

const MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.8-flash';
const THINKING = Deno.env.get('GEMINI_THINKING') ?? 'MEDIUM';
// Lo que la persona puede elegir en la app (modelo y esfuerzo); cualquier otro valor se ignora.
const MODELS = ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.1-pro-preview'];
const EFFORTS = ['LOW', 'MEDIUM', 'HIGH'];
// Modelos de respaldo, en orden, cuando el elegido responde "saturado".
const FALLBACKS = ['gemini-3.5-flash-lite', 'gemini-3.8-flash'];
const MAX_STEPS = 6; // vueltas máximas de herramientas por mensaje
const MAX_FILES = 5; // archivos por mensaje

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

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) return json({ error: 'Falta configurar GEMINI_API_KEY en los secretos de Supabase.' }, 503);

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
  let model = MODEL;
  let effort = THINKING;
  let attachments: { path: string; name: string; mime: string }[] = [];
  try {
    const body = await req.json();
    message = String(body.message ?? '').trim();
    agenda = body.agenda ?? null;
    conversationId = typeof body.conversation_id === 'string' && body.conversation_id ? body.conversation_id : null;
    if (body.mode === 'conocimiento') mode = 'conocimiento';
    if (MODELS.includes(body.model)) model = body.model;
    if (EFFORTS.includes(body.effort)) effort = body.effort;
    // `attachments` (hasta 5); `attachment` es el formato de versiones anteriores de la app.
    const raw: unknown[] = Array.isArray(body.attachments) ? body.attachments : body.attachment ? [body.attachment] : [];
    for (const a of raw) {
      const f = (a ?? {}) as Record<string, unknown>;
      if (typeof f.path === 'string' && typeof f.name === 'string' && typeof f.mime === 'string') attachments.push({ path: f.path, name: f.name.slice(0, 200), mime: f.mime });
    }
  } catch {
    // cuerpo inválido: se responde abajo
  }
  if ((!message && !attachments.length) || message.length > 4000) return json({ error: 'Mensaje vacío o demasiado largo' }, 400);
  if (attachments.length > MAX_FILES) return json({ error: `Puedes enviar hasta ${MAX_FILES} archivos por mensaje.` }, 400);

  // Adjuntos: solo de la carpeta del propio usuario (Storage también lo exige por RLS). Van numerados para
  // que DESJ pueda decir cuál guardar y qué es cada uno.
  const fileParts: Part[] = [];
  for (const [i, a] of attachments.entries()) {
    if (!a.path.startsWith(`${auth.user.id}/`)) return json({ error: 'Adjunto no válido' }, 403);
    const loaded = await loadAttachment(db, a);
    if ('error' in loaded) return json({ error: `${a.name}: ${loaded.error}` }, 400);
    fileParts.push({ text: `Archivo ${i + 1}: "${a.name}" (${a.mime})` }, loaded.part);
  }
  const savedText = [message, ...attachments.map((a) => `[Adjunto: ${a.name}]`)].filter(Boolean).join('\n');

  // Conversación existente: RLS garantiza que sea del usuario. Si no hay, se crea al guardar.
  if (conversationId) {
    const { data: conv } = await db.from('conversations').select('id').eq('id', conversationId).maybeSingle();
    if (!conv) return json({ error: 'Esa conversación ya no existe.' }, 404);
  }

  const tCtx = Date.now();
  const ctx = await loadContext(db, auth.user.id, agenda, conversationId, { message, hasFiles: attachments.length > 0, mode });
  console.log(`Contexto cargado en ${Date.now() - tCtx} ms`);
  const actions: Actions = { reminders: [], events: [], medsChanged: false, intakesChanged: false, knowledgeChanged: false, tasksChanged: false };

  const fallback = attachments.length === 1 ? `Te envío "${attachments[0].name}". Revísalo y dime lo importante.` : `Te envío ${attachments.length} archivos. Revísalos y dime lo importante.`;
  const userParts: Part[] = [...fileParts, { text: message || fallback }];
  const contents: Content[] = [...ctx.history, { role: 'user', parts: userParts }];
  const system = [SYSTEM_PROMPT, ...(mode === 'conocimiento' ? [INTERVIEW_PROMPT] : []), ctx.block].join('\n\n');

  let reply = '';
  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const t0 = Date.now();
      // Si el modelo elegido está saturado, en el primer paso se prueba con otro (después no: las firmas de pensamiento son de cada modelo).
      const candidates = step === 0 ? [model, ...FALLBACKS.filter((m) => m !== model)] : [model];
      let response: Awaited<ReturnType<typeof generate>> | null = null;
      for (const [i, m] of candidates.entries()) {
        try {
          response = await generate(apiKey, m, { system, contents, tools: TOOLS, maxOutputTokens: 4096, thinkingLevel: effort });
          model = m;
          break;
        } catch (e) {
          const busy = e instanceof GeminiError && [429, 503, 408].includes(e.status);
          if (!busy || i === candidates.length - 1) throw e;
          console.log(`Gemini ${m} saturado (${(e as GeminiError).status}); pruebo con ${candidates[i + 1]}`);
        }
      }
      if (!response) throw new GeminiError(503, 'sin respuesta');
      console.log(`Gemini ${model} ${effort} paso ${step + 1}: ${Date.now() - t0} ms, fin=${response.finishReason}, partes=${response.content.parts.length}`);

      if (response.blockReason || response.finishReason === 'SAFETY' || response.finishReason === 'PROHIBITED_CONTENT') {
        reply = 'No puedo ayudarte con eso. ¿Te ayudo con otra cosa?';
        break;
      }

      // El turno del modelo se guarda completo (con sus firmas de pensamiento): Gemini lo exige para seguir con herramientas.
      contents.push(response.content);
      const calls = response.content.parts.filter((p) => p.functionCall);

      if (calls.length === 0) {
        reply = response.content.parts
          .filter((p) => typeof p.text === 'string' && !p.thought)
          .map((p) => p.text)
          .join('')
          .trim();
        break;
      }

      const results = await Promise.all(
        calls.map(async (c) => {
          const call = c.functionCall!;
          const extra: Part[] = [];
          let response: Record<string, unknown>;
          try {
            const out = await runTool(db, call.name, (call.args ?? {}) as Record<string, unknown>, { today: ctx.today, actions, userId: auth.user!.id, attachments });
            if (typeof out === 'string') response = { output: out };
            else {
              // leer_registro_medico: los archivos van como imagen o documento junto al resultado.
              response = { output: out.text };
              for (const f of out.files) {
                const loaded = await loadAttachment(db, f);
                extra.push('error' in loaded ? { text: `${f.name}: ${loaded.error}` } : { text: `Archivo "${f.name}":` }, ...('error' in loaded ? [] : [loaded.part]));
              }
            }
          } catch (e) {
            response = { error: errorText(e) };
          }
          return { part: { functionResponse: { ...(call.id ? { id: call.id } : {}), name: call.name, response } } as Part, extra };
        }),
      );
      contents.push({ role: 'user', parts: [...results.map((r) => r.part), ...results.flatMap((r) => r.extra)] });
    }
  } catch (e) {
    console.error('Gemini', e);
    if (e instanceof GeminiError) {
      if (e.status === 408) return json({ error: 'DESJ tardó demasiado en responder. Intenta de nuevo o elige un modelo más rápido.' }, 504);
      if (e.status === 429) return json({ error: 'DESJ está ocupado, intenta en un momento.' }, 429);
      if (e.status === 403 || /API_KEY|API key/i.test(e.message)) return json({ error: 'La API key de Gemini no es válida.' }, 502);
      return json({ error: `Error de Gemini (${e.status}).` }, 502);
    }
    return json({ error: 'No pude conectar con el cerebro de DESJ.' }, 502);
  }

  if (!reply) reply = 'Listo.';

  let title: string | null = null;
  if (!conversationId) {
    title = makeTitle(message || attachments[0]?.name || 'Archivo');
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
