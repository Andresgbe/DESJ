// Cerebro de DESJ.
// - Con sesión: `askDesj()` llama a la Edge Function `chat` (Claude). La API key vive en Supabase, nunca en la app.
// - Sin nube: `think()` responde con reglas simples en el teléfono (modo demo).
import { FunctionsHttpError } from '@supabase/supabase-js';

import { createCalendarEvent, getTodayAgenda } from '@/lib/calendar';
import { askPermission, scheduleDaily, scheduleOnce } from '@/lib/notifications';
import { hhmm, Med } from '@/lib/store';
import { supabase } from '@/lib/supabase';

type ChatReply = {
  reply: string;
  actions: {
    reminders: { id: string; title: string; body: string; due_at: string; repeat: 'none' | 'daily' }[];
    events: { title: string; start: string; end: string; notes: string }[];
    medsChanged: boolean;
    intakesChanged: boolean;
  };
};

/** Envía el mensaje a Claude (con la agenda de hoy) y ejecuta en el teléfono lo que haya decidido. */
export async function askDesj(text: string): Promise<{ reply: string; dataChanged: boolean }> {
  const agenda = await getTodayAgenda().catch(() => null);
  const { data, error } = await supabase.functions.invoke<ChatReply>('chat', { body: { message: text, agenda } });
  if (error || !data) {
    let msg = 'No pude conectarme. Revisa tu internet e intenta de nuevo.';
    if (error instanceof FunctionsHttpError) {
      const body = await error.context.json().catch(() => null);
      if (body?.error) msg = body.error;
    }
    return { reply: msg, dataChanged: false };
  }

  const { reminders, events, medsChanged, intakesChanged } = data.actions;
  let reply = data.reply;
  if (reminders.length && (await askPermission())) {
    for (const r of reminders) {
      const due = new Date(r.due_at);
      if (r.repeat === 'daily') await scheduleDaily(`DESJ · ${r.title}`, r.body, due.getHours(), due.getMinutes());
      else if (due.getTime() > Date.now()) await scheduleOnce('DESJ te recuerda', r.title + (r.body ? ` · ${r.body}` : ''), due);
    }
  }
  for (const e of events) {
    const ok = await createCalendarEvent({ title: e.title, start: new Date(e.start), end: new Date(e.end), notes: e.notes }).catch(() => false);
    if (!ok) reply += `\n\n(No pude guardar "${e.title}" en tu calendario: necesito el permiso de Calendario, y en Expo Go no está disponible.)`;
  }
  return { reply, dataChanged: medsChanged || intakesChanged };
}

/** Últimos mensajes guardados, del más viejo al más nuevo. */
export async function loadHistory(limit = 30) {
  const { data } = await supabase.from('messages').select('id, role, content').order('created_at', { ascending: false }).limit(limit);
  return (data ?? []).reverse();
}

type Ctx = { meds: Med[]; takenIds: string[] };

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
    await scheduleOnce('DESJ te recuerda', what, when);
    const dia = when.getDate() === new Date().getDate() ? 'hoy' : 'mañana';
    return `Listo. Te aviso ${dia} a las ${hhmm(when.getHours(), when.getMinutes())}: "${what}".`;
  }

  if (/(pastilla|medicamento|medicina|tomar)/.test(t)) {
    const pending = ctx.meds.filter((m) => !ctx.takenIds.includes(m.id));
    if (pending.length === 0) return 'Hoy ya te tomaste todo. Bien ahí.';
    return `Te faltan ${pending.length}: ${pending.map((m) => `${m.name} a las ${hhmm(m.hour, m.minute)}`).join(', ')}.`;
  }

  if (/(hola|buenas|buenos)/.test(t)) return 'Hola. ¿Qué necesitas?';

  return 'Estoy en modo demo. Por ahora sé de recordatorios ("recuérdame … a las 5") y de tus pastillas. Pronto me conectan al cerebro completo.';
}
