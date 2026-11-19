// Cerebro de DESJ. Con sesión, la Edge Function `chat` responde con Gemini (API key en los secretos de
// Supabase, nunca en la app), 24/7. Ya no hay worker ni suscripción de Claude: `retryQueue` solo queda para
// mensajes viejos que hayan quedado en cola.
// Sin nube: `think()` responde con reglas simples en el teléfono (modo demo).
import { FunctionsHttpError } from '@supabase/supabase-js';

import { getAiSettings } from '@/lib/ai-settings';
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

/** `queued`: el worker no lo tomó a tiempo y el mensaje quedó esperando en la cola. */
type AskResult = { reply: string; dataChanged: boolean; knowledgeChanged: boolean; conversationId: string | null; failed: boolean; queued?: boolean };
type Mode = 'chat' | 'conocimiento';

const QUEUE_POLL_MS = 1500;
const QUEUE_OFFLINE_MS = 25_000; // si nadie toma el mensaje en este tiempo, el worker está apagado
const RETRY_PER_MESSAGE_MS = 200_000; // tiempo máximo que se espera cada mensaje al reintentar
const RETRY_LIMIT = 50; // por toque de "Reintentar"; si hay más, el botón sigue a la vista para el resto

/** Envía el mensaje a DESJ (con la agenda de hoy) y ejecuta en el teléfono lo que haya decidido. */
export async function askDesj(text: string, conversationId: string | null, mode: Mode = 'chat', attachments: Uploaded[] = []): Promise<AskResult> {
  const agenda = await getTodayAgenda().catch(() => null);
  const { data: auth } = await supabase.auth.getSession();
  if (!auth.session?.user.id) return failure('Tu sesión expiró. Vuelve a entrar.', conversationId);
  return askApi(text, conversationId, mode, agenda, attachments);
}

/** Lo que ve la persona cuando DESJ falla por algo técnico (nunca el error en inglés ni códigos). */
export const BUSY_MESSAGE = 'DESJ está ocupado y no puede responderte ahora. Intenta en un rato, cuando vuelva.';

/**
 * Error guardado por el worker → texto para la persona. Los errores técnicos (de la API, en inglés,
 * con códigos) se cambian por BUSY_MESSAGE; los mensajes en español que ya son claros se dejan.
 */
export function friendlyError(error: string | null | undefined) {
  if (!error) return BUSY_MESSAGE;
  return /api error|failed|request|authenticat|timeout|error:|\b[45]\d\d\b/i.test(error) ? BUSY_MESSAGE : error;
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
    body: { message: text, agenda, conversation_id: conversationId, mode, attachments, ...getAiSettings() },
    timeout: 70_000, // si la función no responde en este tiempo, se avisa en vez de esperar sin fin
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

/** La respuesta del worker a un mensaje: la que lo cita en `context.reply_to` o, si es de un worker viejo, la siguiente de la conversación. */
async function findAnswer(messageId: string, convId: string, after: string) {
  const { data: linked } = await supabase
    .from('messages')
    .select('content, actions')
    .eq('conversation_id', convId)
    .eq('role', 'assistant')
    .eq('context->>reply_to', messageId)
    .limit(1)
    .maybeSingle();
  if (linked) return linked;
  const { data } = await supabase
    .from('messages')
    .select('content, actions')
    .eq('conversation_id', convId)
    .eq('role', 'assistant')
    .gt('created_at', after)
    .order('created_at')
    .limit(1)
    .maybeSingle();
  return data;
}

/** Filtro de los mensajes tuyos que el worker no respondió: siguen en cola o fallaron (los mismos que la app marca "En cola" / "Sin respuesta"). */
const unansweredFilter = () => 'status.in.(pending,error)';

/** Cuántos mensajes tuyos esperan respuesta del worker (null sin sesión o sin conexión). */
export async function countUnanswered(): Promise<number | null> {
  const { count, error } = await supabase.from('messages').select('id', { count: 'exact', head: true }).eq('role', 'user').or(unansweredFilter());
  return error ? null : (count ?? 0);
}

/** `reason`: por qué falló el último mensaje que no se pudo responder (lo escribe el worker). */
export type RetryProgress = { total: number; answered: number; failed: number; conversationIds: string[]; reason?: string };
/** `online`: el worker tomó al menos un mensaje. `dataChanged`: alguna respuesta cambió pastillas o tomas. */
export type RetryResult = RetryProgress & { online: boolean; dataChanged?: boolean; error?: string };

/**
 * "Reintentar conexión": vuelve a poner en la cola los mensajes que quedaron sin respuesta (con la agenda de hoy),
 * espera a que el worker los tome y ejecuta en el teléfono lo que decida en cada respuesta.
 * Si nadie los toma en ~25 s, el computador sigue apagado y los mensajes se quedan en la cola.
 */
export async function retryQueue(onProgress?: (p: RetryProgress) => void): Promise<RetryResult> {
  const empty = { total: 0, answered: 0, failed: 0, conversationIds: [] };
  const { data: rows, error } = await supabase
    .from('messages')
    .select('id, conversation_id, created_at, context')
    .eq('role', 'user')
    .or(unansweredFilter())
    .order('created_at')
    .limit(RETRY_LIMIT);
  if (error) return { ...empty, online: false, error: 'No pude conectarme. Revisa tu internet e intenta de nuevo.' };
  if (!rows?.length) return { ...empty, online: true };

  const agenda = await getTodayAgenda().catch(() => null);
  const retriedAt = new Date().toISOString();
  for (const r of rows) {
    const context = r.context && typeof r.context === 'object' ? (r.context as Record<string, unknown>) : {};
    // `retried_at` le dice al worker que el mensaje no está vencido aunque se haya escrito hace horas.
    await supabase
      .from('messages')
      .update({ status: 'pending', error: null, context: { ...context, agenda: agenda ?? context.agenda ?? null, retried_at: retriedAt } })
      .eq('id', r.id)
      .in('status', ['pending', 'error']);
  }

  const progress: RetryProgress = { total: rows.length, answered: 0, failed: 0, conversationIds: [] };
  const open = new Map(rows.map((r) => [r.id, r]));
  const started = Date.now();
  let lastMove = started;
  let online = false;
  let dataChanged = false;

  while (open.size && Date.now() - lastMove < (online ? RETRY_PER_MESSAGE_MS : QUEUE_OFFLINE_MS)) {
    await new Promise((r) => setTimeout(r, QUEUE_POLL_MS));
    const { data: states } = await supabase.from('messages').select('id, status, error').in('id', [...open.keys()]);
    for (const s of states ?? []) {
      if (s.status === 'pending') continue;
      if (!online) lastMove = Date.now();
      online = true;
      if (s.status === 'running') continue;
      const row = open.get(s.id);
      if (!row) continue;
      open.delete(s.id);
      lastMove = Date.now();
      if (s.status === 'done') {
        progress.answered += 1;
        const answer = await findAnswer(row.id, row.conversation_id, row.created_at);
        if (answer) dataChanged = (await runActions(answer.content, (answer.actions as Actions | null) ?? null)).dataChanged || dataChanged;
      } else {
        progress.failed += 1;
        if (s.error) progress.reason = friendlyError(s.error);
      }
      if (!progress.conversationIds.includes(row.conversation_id)) progress.conversationIds.push(row.conversation_id);
      onProgress?.({ ...progress, conversationIds: [...progress.conversationIds] });
    }
  }
  return { ...progress, online, dataChanged };
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
