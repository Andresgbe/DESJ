// Contexto privado de una persona y utilidades que comparten la Edge Function `chat` y el worker local
// (desj-worker). Toda consulta filtra por userId: con la sesión del usuario (RLS) es redundante, y con la
// clave de servidor del worker es lo que garantiza que nunca se mezclen datos entre personas.
// Sin dependencias de Deno: el worker lo importa directo con Node.
import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';

import { KNOWLEDGE_FILES } from './tools.ts';

export const HISTORY = 20; // mensajes previos que se reenvían

// `agenda` la manda el teléfono (eventos de hoy de su calendario); null = sin acceso al calendario.
export async function loadContext(db: SupabaseClient, userId: string, agenda: unknown, conversationId: string | null) {
  const [profile, knowledge, memories, meds, reminders, tasks, history] = await Promise.all([
    db.from('profiles').select('display_name, about, timezone').eq('id', userId).single(),
    db.from('knowledge').select('slug, content, updated_at').eq('user_id', userId),
    db.from('memories').select('id, category, content, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(150),
    db.from('meds').select('id, name, dose, hour, minute').eq('user_id', userId).eq('active', true).order('hour').order('minute'),
    db
      .from('reminders')
      .select('title, due_at, repeat')
      .eq('user_id', userId)
      .eq('done', false)
      .or(`repeat.eq.daily,due_at.gte.${new Date().toISOString()}`)
      .order('due_at')
      .limit(20),
    db.from('tasks').select('id, title, due_date').eq('user_id', userId).eq('done', false).order('due_date', { ascending: true, nullsFirst: false }).limit(50),
    conversationId
      ? db.from('messages').select('role, content').eq('user_id', userId).eq('conversation_id', conversationId).eq('status', 'done').order('created_at', { ascending: false }).limit(HISTORY)
      : Promise.resolve({ data: [] as { role: string; content: string }[] }),
  ]);

  const tz = profile.data?.timezone || 'America/Caracas';
  const now = new Date();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now); // YYYY-MM-DD
  const nowText = new Intl.DateTimeFormat('es-VE', { timeZone: tz, dateStyle: 'full', timeStyle: 'short' }).format(now);
  const offset = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
    .formatToParts(now)
    .find((p) => p.type === 'timeZoneName')?.value.replace('GMT', '') || '+00:00';

  const { data: intakes } = await db.from('med_intakes').select('med_id').eq('user_id', userId).eq('day', today);
  const takenIds = new Set((intakes ?? []).map((i) => i.med_id));
  const pad = (n: number) => String(n).padStart(2, '0');

  const lines = [
    '<contexto_usuario>',
    `Nombre: ${profile.data?.display_name || '[sin nombre]'}`,
    `Sobre la persona: ${profile.data?.about || '[sin datos todavía]'}`,
    `Ahora: ${nowText} (zona ${tz}, desfase ${offset}). Hoy es ${today}.`,
    '',
    '<conocimiento>',
    ...KNOWLEDGE_FILES.map((slug) => {
      const doc = (knowledge.data ?? []).find((k) => k.slug === slug);
      return `### ${slug}.md
${doc?.content.trim() || '[vacío: todavía no hay datos]'}
`;
    }),
    '</conocimiento>',
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
    '<pendientes>',
    ...(tasks.data ?? []).map((t) => `- [${t.id}] ${t.due_date ? `(${t.due_date}) ` : ''}${t.title}`),
    '</pendientes>',
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

export const MAX_FILE = 10 * 1024 * 1024;
const MAX_IMAGE = 5 * 1024 * 1024; // límite de Claude por imagen
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;

/** Descarga el adjunto de Storage y lo convierte en un bloque que Claude entiende (imagen, PDF o texto). */
export async function loadAttachment(
  db: SupabaseClient,
  a: { path: string; name: string; mime: string },
): Promise<{ block: Anthropic.ContentBlockParam } | { error: string }> {
  const { data, error } = await db.storage.from('documentos').download(a.path);
  if (error || !data) return { error: 'No encontré el archivo adjunto.' };
  if (data.size > MAX_FILE) return { error: 'El archivo pesa más de 10 MB.' };
  const bytes = new Uint8Array(await data.arrayBuffer());

  const image = IMAGE_TYPES.find((t) => t === a.mime);
  if (image) {
    if (bytes.length > MAX_IMAGE) return { error: 'La imagen pesa más de 5 MB.' };
    return { block: { type: 'image', source: { type: 'base64', media_type: image, data: toBase64(bytes) } } };
  }
  if (a.mime === 'application/pdf') {
    return { block: { type: 'document', title: a.name, source: { type: 'base64', media_type: 'application/pdf', data: toBase64(bytes) } } };
  }
  if (a.mime.startsWith('text/')) {
    return { block: { type: 'document', title: a.name, source: { type: 'text', media_type: 'text/plain', data: new TextDecoder().decode(bytes) } } };
  }
  return { error: 'Por ahora DESJ lee fotos, PDF y archivos de texto.' };
}

export function toBase64(bytes: Uint8Array) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Título de la conversación: el primer mensaje, recortado. */
export function makeTitle(message: string) {
  const clean = message.replace(/\s+/g, ' ').trim();
  return clean.length > 60 ? `${clean.slice(0, 57).trimEnd()}…` : clean;
}

export function agendaLines(agenda: unknown, tz: string): string[] {
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
