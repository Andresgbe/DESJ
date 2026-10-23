// Cerebro de DESJ. Con sesión hay dos motores, según `profiles.brain` de cada persona:
// - 'worker': la app deja el mensaje en una cola de Supabase y el worker del computador de Andrés
//   (desj-worker/) lo responde con Claude Code y su suscripción. Solo responde con ese computador prendido.
// - 'api': la Edge Function `chat` responde con la API de Claude (API key en Supabase, nunca en la app), 24/7.
// Sin nube: `think()` responde con reglas simples en el teléfono (modo demo).
import { FunctionsHttpError } from '@supabase/supabase-js';

import type { Uploaded } from '@/lib/attachments';
import { createCalendarEvent, getTodayAgenda } from '@/lib/calendar';
import { askPermission } from '@/lib/notifications';
import { addReminder } from '@/lib/reminders';
import { doseKey, hhmm, Med } from '@/lib/store';
import { supabase } from '@/lib/supabase';

type Actions = {
  reminders: { id: string; title: string; body: string; due_at: string; repeat: 'none' | 'daily' }[];
  events: { title: string; start: string; end: string; notes: string }[];
  medsChanged: boolean;
  intakesChanged: boolean;
  knowledgeChanged: boolean;
};

type ChatReply = { reply: string; conversation_id: string | null; title: string | null; actions: Actions };

type AskResult = { reply: string; dataChanged: boolean; knowledgeChanged: boolean; conversationId: string | null; failed: boolean };
type Mode = 'chat' | 'conocimiento';

const QUEUE_POLL_MS = 1500;
const QUEUE_OFFLINE_MS = 25_000; // si nadie toma el mensaje en este tiempo, el worker está apagado
const QUEUE_TIMEOUT_MS = 200_000;

/** Envía el mensaje a DESJ (con la agenda de hoy) y ejecuta en el teléfono lo que haya decidido. */
export async function askDesj(text: string, conversationId: string | null, mode: Mode = 'chat', attachments: Uploaded[] = []): Promise<AskResult> {
  const agenda = await getTodayAgenda().catch(() => null);
  const { data: auth } = await supabase.auth.getSession();
  const userId = auth.session?.user.id;
  if (!userId) return failure('Tu sesión expiró. Vuelve a entrar.', conversationId);
  const { data: profile } = await supabase.from('profiles').select('brain').eq('id', userId).single();
  return profile?.brain === 'api'
    ? askApi(text, conversationId, mode, agenda, attachments)
    : askQueue(text, conversationId, mode, agenda, attachments);
}

const failure = (reply: string, conversationId: string | null): AskResult => ({
  reply,
  dataChanged: false,
  knowledgeChanged: false,
  conversationId,
  failed: true,
});

async function askApi(text: string, conversationId: string | null, mode: Mode, agenda: unknown, attachments: Uploaded[]): Promise<AskResult> {
  const { data, error } = await supabase.functions.invoke<ChatReply>('chat', {
    body: { message: text, agenda, conversation_id: conversationId, mode, attachments },
  });
  if (error || !data) {
    let msg = 'No pude conectarme. Revisa tu internet e intenta de nuevo.';
    if (error instanceof FunctionsHttpError) {
      const body = await error.context.json().catch(() => null);
      if (body?.error) msg = body.error;
    }
    return failure(msg, conversationId);
  }
  const done = await runActions(data.reply, data.actions);
  return { ...done, conversationId: data.conversation_id, failed: false };
}

/** Motor 'worker': deja el mensaje en la cola y espera la respuesta del computador de Andrés. */
async function askQueue(text: string, conversationId: string | null, mode: Mode, agenda: unknown, attachments: Uploaded[]): Promise<AskResult> {
  let convId = conversationId;
  if (!convId) {
    const clean = (text || attachments[0]?.name || 'Archivo').replace(/\s+/g, ' ').trim();
    const title = clean.length > 60 ? `${clean.slice(0, 57).trimEnd()}…` : clean;
    const { data, error } = await supabase.from('conversations').insert({ title, kind: mode }).select('id').single();
    if (error || !data) return failure('No pude conectarme. Revisa tu internet e intenta de nuevo.', null);
    convId = data.id;
  }

  const { data: mine, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: convId,
      role: 'user',
      content: [text, ...attachments.map((a) => `[Adjunto: ${a.name}]`)].filter(Boolean).join('\n'),
      status: 'pending',
      context: { agenda },
      attachments: attachments.length ? attachments : null,
      // El primero también va en las columnas viejas, por compatibilidad.
      attachment_path: attachments[0]?.path ?? null,
      attachment_name: attachments[0]?.name ?? null,
      attachment_mime: attachments[0]?.mime ?? null,
    })
    .select('id, created_at')
    .single();
  if (error || !mine) return failure('No pude enviar tu mensaje. Revisa tu internet e intenta de nuevo.', convId);

  const started = Date.now();
  while (Date.now() - started < QUEUE_TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, QUEUE_POLL_MS));
    const { data: row } = await supabase.from('messages').select('status, error').eq('id', mine.id).single();
    if (!row) continue;
    if (row.status === 'error') return failure(row.error ?? 'DESJ no pudo responder.', convId);
    if (row.status === 'done') {
      const { data: answer } = await supabase
        .from('messages')
        .select('content, actions')
        .eq('conversation_id', convId)
        .eq('role', 'assistant')
        .gt('created_at', mine.created_at)
        .order('created_at')
        .limit(1)
        .single();
      if (!answer) return failure('DESJ respondió pero no pude leer la respuesta. Abre la conversación de nuevo.', convId);
      const done = await runActions(answer.content, (answer.actions as Actions | null) ?? null);
      return { ...done, conversationId: convId, failed: false };
    }
    if (row.status === 'pending' && Date.now() - started > QUEUE_OFFLINE_MS) {
      return {
        reply: 'DESJ está desconectado en este momento (el computador que lo atiende está apagado). Tu mensaje quedó en cola y te respondo apenas vuelva.',
        dataChanged: false,
        knowledgeChanged: false,
        conversationId: convId,
        failed: false,
      };
    }
  }
  return { reply: 'DESJ está tardando más de lo normal. La respuesta aparecerá en esta conversación cuando esté lista.', dataChanged: false, knowledgeChanged: false, conversationId: convId, failed: false };
}

/** Ejecuta en el teléfono lo que DESJ decidió: avisos locales y eventos del calendario. */
async function runActions(reply: string, actions: Actions | null) {
  let text = reply;
  for (const r of actions?.reminders ?? []) {
    await addReminder({ id: r.id, title: r.title, body: r.body, at: new Date(r.due_at), repeat: r.repeat });
  }
  for (const e of actions?.events ?? []) {
    const ok = await createCalendarEvent({ title: e.title, start: new Date(e.start), end: new Date(e.end), notes: e.notes }).catch(() => false);
    if (!ok) text += `\n\n(No pude guardar "${e.title}" en tu calendario: necesito el permiso de Calendario, y en Expo Go no está disponible.)`;
  }
  return {
    reply: text,
    dataChanged: Boolean(actions?.medsChanged || actions?.intakesChanged),
    knowledgeChanged: Boolean(actions?.knowledgeChanged),
  };
}

type Ctx = { meds: Med[]; takenKeys: string[] };

function parseTime(text: string): Date | null {
  const m = text.match(/(?:a las|a la)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm|de la tarde|de la noche|de la mañana)?/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const suf = (m[3] ?? '').toLowerCase();
  if ((suf === 'pm' || suf.includes('tarde') || suf.includes('noche')) && h < 12) h += 12;
  if ((suf === 'am' || suf.includes('mañana')) && h === 12) h = 0;
  const d = new Date();
  d.setHours(h, min, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d;
}

export async function think(text: string, ctx: Ctx): Promise<string> {
  const t = text.toLowerCase();

  if (t.includes('recuérdame') || t.includes('recuerdame')) {
    const when = parseTime(text);
    if (!when) return 'Dime a qué hora. Por ejemplo: "recuérdame llamar al notario a las 4 de la tarde".';
    if (!(await askPermission())) return 'Necesito permiso de notificaciones para avisarte. Actívalo en Ajustes.';
    const what = text.replace(/recu[eé]rdame/i, '').replace(/(a las|a la).*$/i, '').trim() || 'tu recordatorio';
    await addReminder({ title: what, at: when });
    const dia = when.getDate() === new Date().getDate() ? 'hoy' : 'mañana';
    return `Listo. Te aviso ${dia} a las ${hhmm(when.getHours(), when.getMinutes())}: "${what}".`;
  }

  if (/(pastilla|medicamento|medicina|tomar)/.test(t)) {
    const pending = ctx.meds.flatMap((m) =>
      Array.from({ length: m.perDay }, (_, i) => i + 1)
        .filter((n) => !ctx.takenKeys.includes(doseKey(m.id, n)))
        .map((n) => (m.times[n - 1] ? `${m.name} a las ${m.times[n - 1]}` : m.perDay > 1 ? `${m.name} (dosis ${n})` : m.name)),
    );
    if (pending.length === 0) return 'Hoy ya te tomaste todo. Bien ahí.';
    return `Te faltan ${pending.length}: ${pending.join(', ')}.`;
  }

  if (/(hola|buenas|buenos)/.test(t)) return 'Hola. ¿Qué necesitas?';

  return 'Estoy en modo demo. Por ahora sé de recordatorios ("recuérdame … a las 5") y de tus pastillas. Pronto me conectan al cerebro completo.';
}
