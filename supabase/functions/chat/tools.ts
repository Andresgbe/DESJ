// Herramientas que Claude puede usar. Todas escriben con el cliente del usuario (RLS),
// así que nunca pueden tocar datos de otra persona.
import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';

export type Actions = {
  reminders: { id: string; title: string; body: string; due_at: string; repeat: 'none' | 'daily' }[];
  events: { title: string; start: string; end: string; notes: string }[];
  medsChanged: boolean;
  intakesChanged: boolean;
};

const CATEGORIES = ['personal', 'salud', 'negocios', 'preferencia', 'otro'];

export const TOOLS: Anthropic.Tool[] = [
  {
    name: 'guardar_memoria',
    description:
      'Guarda un dato duradero sobre la persona para recordarlo en futuras conversaciones (salud, negocios, personas, preferencias, decisiones). Una frase clara y autocontenida.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: CATEGORIES },
        content: { type: 'string', description: 'El dato, en una frase. Incluye la fecha si importa.' },
      },
      required: ['category', 'content'],
      additionalProperties: false,
    },
  },
  {
    name: 'borrar_memoria',
    description: 'Borra una memoria que ya no es cierta o que la persona pidió olvidar. Usa el id que aparece en <memorias>.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'crear_recordatorio',
    description:
      'Crea un recordatorio que el teléfono mostrará como notificación. due_at en ISO 8601 con el desfase horario de la persona (ej. 2026-10-05T16:00:00-04:00). Para algo diario usa repeat "daily" con la primera fecha y hora.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Texto corto del aviso, ej. "Llamar al notario".' },
        body: { type: 'string', description: 'Detalle opcional; cadena vacía si no hay.' },
        due_at: { type: 'string' },
        repeat: { type: 'string', enum: ['none', 'daily'] },
      },
      required: ['title', 'body', 'due_at', 'repeat'],
      additionalProperties: false,
    },
  },
  {
    name: 'crear_evento',
    description:
      'Agenda un evento en el calendario del teléfono de la persona (citas, reuniones, viajes). Para avisos sueltos usa crear_recordatorio. Fechas en ISO 8601 con el desfase horario de la persona. Si no dice duración, usa 1 hora.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        start: { type: 'string' },
        end: { type: 'string' },
        notes: { type: 'string', description: 'Detalle opcional; cadena vacía si no hay.' },
      },
      required: ['title', 'start', 'end', 'notes'],
      additionalProperties: false,
    },
  },
  {
    name: 'registrar_toma',
    description: 'Marca como tomado hoy un medicamento de la lista. Usa el id que aparece en <medicamentos>.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { med_id: { type: 'string' } },
      required: ['med_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'agregar_medicamento',
    description: 'Agrega un medicamento al plan diario de la persona. Solo si la persona lo pide explícitamente; nunca sugieras dosis.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        dose: { type: 'string', description: 'Tal como la dijo la persona, ej. "50 mg con desayuno".' },
        hour: { type: 'integer', description: 'Hora 0-23' },
        minute: { type: 'integer', description: 'Minuto 0-59' },
      },
      required: ['name', 'dose', 'hour', 'minute'],
      additionalProperties: false,
    },
  },
];

type Input = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export async function runTool(
  db: SupabaseClient,
  name: string,
  input: Input,
  ctx: { today: string; actions: Actions },
): Promise<string> {
  switch (name) {
    case 'guardar_memoria': {
      const content = str(input.content);
      const category = CATEGORIES.includes(str(input.category)) ? str(input.category) : 'otro';
      if (!content) throw new Error('content vacío');
      const { data, error } = await db.from('memories').insert({ category, content, source: 'chat' }).select('id').single();
      if (error) throw error;
      return `Memoria guardada (id ${data.id}).`;
    }
    case 'borrar_memoria': {
      const { error, count } = await db.from('memories').delete({ count: 'exact' }).eq('id', str(input.id));
      if (error) throw error;
      return count ? 'Memoria borrada.' : 'No encontré esa memoria.';
    }
    case 'crear_recordatorio': {
      const due = new Date(str(input.due_at));
      if (Number.isNaN(due.getTime())) throw new Error('due_at no es una fecha válida');
      const repeat = input.repeat === 'daily' ? 'daily' : 'none';
      if (repeat === 'none' && due.getTime() < Date.now() - 60_000) throw new Error('esa hora ya pasó');
      const { data, error } = await db
        .from('reminders')
        .insert({ title: str(input.title), body: str(input.body), due_at: due.toISOString(), repeat })
        .select('id, title, body, due_at, repeat')
        .single();
      if (error) throw error;
      ctx.actions.reminders.push(data);
      return `Recordatorio creado para ${data.due_at} (${repeat === 'daily' ? 'diario' : 'una vez'}).`;
    }
    case 'crear_evento': {
      const start = new Date(str(input.start));
      const end = new Date(str(input.end));
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) throw new Error('fechas inválidas');
      // El evento lo crea el teléfono (el calendario vive ahí), así que aquí solo se encola.
      ctx.actions.events.push({ title: str(input.title), start: start.toISOString(), end: end.toISOString(), notes: str(input.notes) });
      return 'Evento enviado al calendario del teléfono.';
    }
    case 'registrar_toma': {
      const { error } = await db
        .from('med_intakes')
        .upsert({ med_id: str(input.med_id), day: ctx.today }, { onConflict: 'med_id,day', ignoreDuplicates: true });
      if (error) throw error;
      ctx.actions.intakesChanged = true;
      return 'Toma registrada para hoy.';
    }
    case 'agregar_medicamento': {
      const hour = Number(input.hour);
      const minute = Number(input.minute);
      if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
        throw new Error('hora inválida');
      }
      const { error } = await db.from('meds').insert({ name: str(input.name), dose: str(input.dose), hour, minute });
      if (error) throw error;
      ctx.actions.medsChanged = true;
      return 'Medicamento agregado.';
    }
    default:
      throw new Error(`herramienta desconocida: ${name}`);
  }
}
