// Módulo HORARIOS: el horario semanal de la persona ("Yo") y de sus amigos, para ver quién le puede dar la cola.
// Datos con lib/module-db (Supabase o el teléfono). Las horas se guardan "HH:MM".
import { useModuleDb } from '@/lib/module-db';

export type Person = { id: string; name: string; color: string; phone: string; is_me: boolean; position: number };
export type Block = { id: string; person_id: string; weekday: number; starts: string; ends: string; label: string };

type Sched = { sched_people: Person[]; sched_blocks: Block[] };

const hm = (v: unknown) => String(v ?? '').slice(0, 5); // Postgres devuelve "07:30:00"

export function useSchedules(moduleId: string | undefined) {
  return useModuleDb<Sched>(moduleId, 'horarios', {
    sched_people: { cols: 'id, name, color, phone, is_me, position', byModule: true, order: 'position' },
    sched_blocks: { cols: 'id, person_id, weekday, starts, ends, label', byModule: false, order: 'starts', normalize: (r) => ({ ...r, starts: hm(r.starts), ends: hm(r.ends) }) },
  });
}

export const DAY_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export const DAY_LONG = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

/** Día de hoy en 1 (lunes) … 7 (domingo). */
export const todayWeekday = () => ((new Date().getDay() + 6) % 7) + 1;

export const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
};

/** "7:30", "730" o "07:30" → "07:30". null si no es una hora válida. */
export function parseHour(text: string) {
  const m = text.trim().match(/^(\d{1,2}):?(\d{2})?$/);
  if (!m || Number(m[1]) > 23 || Number(m[2] ?? 0) > 59) return null;
  return `${m[1].padStart(2, '0')}:${(m[2] ?? '00').padStart(2, '0')}`;
}

/** Primera entrada y última salida de alguien ese día. null si no va. */
export function daySpan(blocks: Block[], personId: string, weekday: number) {
  const mine = blocks.filter((b) => b.person_id === personId && b.weekday === weekday);
  if (!mine.length) return null;
  return { first: mine.reduce((a, b) => (b.starts < a ? b.starts : a), '23:59'), last: mine.reduce((a, b) => (b.ends > a ? b.ends : a), '00:00') };
}

const RIDE_BEFORE = 90; // minutos: un amigo que llega hasta hora y media antes que tú sirve para ir
const RIDE_AFTER = 90; // y uno que sale hasta hora y media después, para volver
const SLACK = 15; // y con 15 minutos de margen para el otro lado

/**
 * Quién te puede llevar ese día: para ir, amigos que llegan poco antes que tú (o hasta 15 min después); para
 * volver, amigos que salen poco después que tú (o hasta 15 min antes). Ordenados por cercanía.
 */
export function rides(people: Person[], blocks: Block[], weekday: number) {
  const me = people.find((p) => p.is_me);
  const mine = me ? daySpan(blocks, me.id, weekday) : null;
  if (!mine) return null;
  const friends = people
    .filter((p) => !p.is_me)
    .map((p) => ({ p, span: daySpan(blocks, p.id, weekday) }))
    .filter((x): x is { p: Person; span: { first: string; last: string } } => Boolean(x.span));
  const go = friends
    .map((x) => ({ ...x, diff: toMin(mine.first) - toMin(x.span.first) }))
    .filter((x) => x.diff >= -SLACK && x.diff <= RIDE_BEFORE)
    .sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff));
  const back = friends
    .map((x) => ({ ...x, diff: toMin(x.span.last) - toMin(mine.last) }))
    .filter((x) => x.diff >= -SLACK && x.diff <= RIDE_AFTER)
    .sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff));
  return { mine, go, back };
}

/** "llega 20 min antes", "sale a la misma hora"… */
export function gap(min: number, verb: 'llega' | 'sale') {
  if (min === 0) return `${verb} a la misma hora`;
  const abs = Math.abs(min);
  const t = abs >= 60 ? `${Math.floor(abs / 60)} h${abs % 60 ? ` ${abs % 60} min` : ''}` : `${abs} min`;
  if (verb === 'llega') return `llega ${t} ${min > 0 ? 'antes' : 'después'}`;
  return `sale ${t} ${min > 0 ? 'después' : 'antes'}`;
}

/** Link de WhatsApp para escribirle (solo dígitos; si no tiene código de país, se asume Venezuela). */
export function whatsapp(phone: string) {
  const d = phone.replace(/\D/g, '');
  if (d.length < 7) return null;
  const full = d.startsWith('58') ? d : d.startsWith('0') ? `58${d.slice(1)}` : d.length === 10 && d.startsWith('4') ? `58${d}` : d;
  return `https://wa.me/${full}`;
}
