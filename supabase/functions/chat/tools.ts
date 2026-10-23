// Herramientas que Claude puede usar. Las usan la Edge Function `chat` (cliente con la sesión del
// usuario, RLS) y el worker local (desj-worker, clave de servidor). Por eso cada consulta lleva
// además user_id explícito: así ninguna herramienta puede tocar datos de otra persona en ningún caso.
import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';

import { fetchRates, RATE_CODE_MAP } from '../_shared/dolar.ts';

export type Actions = {
  reminders: { id: string; title: string; body: string; due_at: string; repeat: 'none' | 'daily' }[];
  events: { title: string; start: string; end: string; notes: string }[];
  medsChanged: boolean;
  intakesChanged: boolean;
  knowledgeChanged: boolean;
  tasksChanged: boolean;
  financeChanged?: boolean;
};

export const KNOWLEDGE_FILES = ['perfil', 'salud', 'negocios', 'preferencias'];

/** Un archivo de Storage que Claude debe ver (adjunto del chat o archivo de un examen). */
export type FileRef = { path: string; name: string; mime: string };
/** Lo que devuelve una herramienta: texto, o texto más archivos para que Claude los lea. */
export type ToolOutput = string | { text: string; files: FileRef[] };

const EXAM_KINDS = ['consulta', 'laboratorio', 'imagen', 'procedimiento', 'otro'];
const EXAM_TITLES: Record<string, string> = { consulta: 'Consulta médica', laboratorio: 'Examen de laboratorio', imagen: 'Estudio de imagen', procedimiento: 'Procedimiento', otro: 'Registro médico' };
const DOC_TYPES = ['informe', 'orden', 'resultado', 'receta', 'imagen', 'otro'];
const CONTACT_KINDS = ['doctor', 'clinica', 'laboratorio', 'otro'];
const MAX_READ_FILES = 3; // archivos de un registro que se le pasan a Claude de una vez

const CATEGORIES = ['personal', 'salud', 'negocios', 'preferencia', 'otro'];

export const TOOLS: Anthropic.Tool[] = [
  {
    name: 'actualizar_conocimiento',
    description:
      'Reescribe completo uno de los archivos Markdown de conocimiento de la persona (perfil, salud, negocios, preferencias). Conserva lo que ya tenía y agrega o corrige lo nuevo.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        archivo: { type: 'string', enum: KNOWLEDGE_FILES },
        contenido: { type: 'string', description: 'El archivo completo en Markdown.' },
      },
      required: ['archivo', 'contenido'],
      additionalProperties: false,
    },
  },
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
    name: 'crear_pendiente',
    description:
      'Agrega una tarea a la lista de Pendientes de la persona ("anótame…", "tengo que…"). due_date en formato YYYY-MM-DD o cadena vacía si no tiene fecha. Para un aviso a una hora concreta usa crear_recordatorio.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        due_date: { type: 'string', description: 'YYYY-MM-DD o cadena vacía.' },
      },
      required: ['title', 'due_date'],
      additionalProperties: false,
    },
  },
  {
    name: 'completar_pendiente',
    description: 'Marca como hecha una tarea de <pendientes>. Usa el id que aparece ahí.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'registrar_toma',
    description:
      'Marca como tomada hoy una dosis de un medicamento de <medicamentos> (usa su id). dosis es el número de la dosis (1, 2, 3…); usa 0 para la siguiente que siga pendiente.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { med_id: { type: 'string' }, dosis: { type: 'integer', description: '1…N, o 0 = la siguiente pendiente' } },
      required: ['med_id', 'dosis'],
      additionalProperties: false,
    },
  },
  {
    name: 'agregar_medicamento',
    description:
      'Agrega un medicamento al plan diario de la persona. Solo si la persona lo pide explícitamente; nunca sugieras dosis ni horarios. horas es opcional: lista vacía si no tiene horario fijo, o una hora "HH:MM" (24 h) por dosis que la persona haya dicho.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        dose: { type: 'string', description: 'Tal como la dijo la persona, ej. "50 mg con desayuno".' },
        veces_al_dia: { type: 'integer', description: '1 a 12' },
        horas: { type: 'array', items: { type: 'string' }, description: 'Horas "HH:MM", a lo más una por dosis; vacía si no tiene horario.' },
      },
      required: ['name', 'dose', 'veces_al_dia', 'horas'],
      additionalProperties: false,
    },
  },
  {
    name: 'guardar_registro_medico',
    description:
      'Crea un registro en el historial médico de la persona (módulo Salud): una consulta, un examen de laboratorio, un estudio de imagen o un procedimiento. fecha es cuándo PASÓ (YYYY-MM-DD), no la de hoy salvo que haya sido hoy: tómala del documento o pregúntala. Si ya existe en <historial_medico> un registro de ese día y tipo, no crees otro: usa adjuntar_a_registro_medico. Si la persona mandó archivos en este mensaje, ponlos en archivos con su número y qué es cada uno (informe, orden, receta…). En resultados anota los valores principales con sus unidades y rangos, o las indicaciones del médico, tal como aparecen; sin interpretar.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string', description: 'Ej. "Consulta de cardiología", "Hematología completa". Cadena vacía para el nombre por defecto ("Consulta médica").' },
        fecha: { type: 'string', description: 'YYYY-MM-DD' },
        tipo: { type: 'string', enum: EXAM_KINDS },
        lugar: { type: 'string', description: 'Clínica o laboratorio; cadena vacía si no se sabe.' },
        doctor: { type: 'string', description: 'Cadena vacía si no se sabe.' },
        resultados: { type: 'string', description: 'Valores principales; cadena vacía si no hay.' },
        notas: { type: 'string', description: 'Cadena vacía si no hay.' },
        archivos: {
          type: 'array',
          description: 'Archivos de este mensaje a guardar: su número (1, 2, 3… en el orden en que llegaron) y qué es cada uno. Vacía si no hay que guardar archivos.',
          items: {
            type: 'object',
            properties: { numero: { type: 'integer' }, tipo_documento: { type: 'string', enum: DOC_TYPES } },
            required: ['numero', 'tipo_documento'],
            additionalProperties: false,
          },
        },
      },
      required: ['titulo', 'fecha', 'tipo', 'lugar', 'doctor', 'resultados', 'notas', 'archivos'],
      additionalProperties: false,
    },
  },
  {
    name: 'adjuntar_a_registro_medico',
    description:
      'Guarda archivos que la persona mandó en ESTE mensaje dentro de un registro que ya existe en <historial_medico> (p. ej. "guárdalos en la consulta de hoy"), diciendo qué es cada uno.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'El id del registro en <historial_medico>.' },
        archivos: {
          type: 'array',
          description: 'Archivos de este mensaje a guardar: su número (1, 2, 3… en el orden en que llegaron) y qué es cada uno. Vacía si no hay que guardar archivos.',
          items: {
            type: 'object',
            properties: { numero: { type: 'integer' }, tipo_documento: { type: 'string', enum: DOC_TYPES } },
            required: ['numero', 'tipo_documento'],
            additionalProperties: false,
          },
        },
      },
      required: ['id', 'archivos'],
      additionalProperties: false,
    },
  },
  {
    name: 'leer_registro_medico',
    description:
      'Abre los archivos (fotos o PDF) de un registro de <historial_medico> para leerlos. Úsalo cuando la persona pregunte por el contenido de un informe, orden o examen y sus resultados estén "[sin anotar]" o no alcancen. Después de leerlo, si no estaban anotados, guárdalos con anotar_registro_medico.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'El id que aparece en <historial_medico>.' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'anotar_registro_medico',
    description:
      'Reemplaza los resultados o indicaciones anotados de un registro de <historial_medico> (valores con unidades y rangos de referencia, o indicaciones del médico, tal como aparecen en el documento). Conserva lo que ya estaba si sigue siendo correcto.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string' }, resultados: { type: 'string' } },
      required: ['id', 'resultados'],
      additionalProperties: false,
    },
  },
  {
    name: 'agregar_registro_modulo',
    description:
      'Anota un registro en uno de los módulos de <modulos> (bitácora de Vehículo, Hogar, Mascotas, etc.), p. ej. "Cambio de aceite" con fecha y "45.000 km" de detalle. fecha en YYYY-MM-DD o cadena vacía si no aplica. No sirve para el módulo de negocios.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        modulo_id: { type: 'string', description: 'El id que aparece en <modulos>.' },
        titulo: { type: 'string' },
        fecha: { type: 'string', description: 'YYYY-MM-DD o cadena vacía.' },
        detalle: { type: 'string', description: 'Cadena vacía si no hay.' },
      },
      required: ['modulo_id', 'titulo', 'fecha', 'detalle'],
      additionalProperties: false,
    },
  },
  {
    name: 'registrar_movimiento',
    description:
      'Registra un ingreso o un gasto en Finanzas ("gasté 5$ en el Gama en supermercado", "me pagaron 200$ de la agencia"). Todo se convierte a dólar BCV con la tasa de la forma de pago. moneda: USD, VES (bolívares) o EUR. forma_pago: "BCV" para dólar BCV o bolívares a tasa BCV; "CASH" si fue en dólares en EFECTIVO; "USDT" si fue en USDT; "EUR" si fue en euros. OJO: efectivo, cash o USDT valen distinto que el dólar BCV aunque la moneda sea USD. tasa: cadena vacía para usar la guardada (si falta, se trae de DolarAPI); solo pon un número si la persona dijo la tasa. categoria: nombre de una de <finanzas> (si no existe, se crea). fecha YYYY-MM-DD o cadena vacía para hoy.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: ['gasto', 'ingreso'] },
        monto: { type: 'number' },
        moneda: { type: 'string', enum: ['USD', 'VES', 'EUR'] },
        forma_pago: { type: 'string', enum: ['BCV', 'CASH', 'USDT', 'EUR'] },
        tasa: { type: 'string', description: 'Cuántas unidades equivalen a 1 $ BCV; cadena vacía para la guardada.' },
        categoria: { type: 'string', description: 'Cadena vacía si no aplica.' },
        lugar: { type: 'string' },
        descripcion: { type: 'string' },
        fecha: { type: 'string' },
        nota: { type: 'string' },
      },
      required: ['tipo', 'monto', 'moneda', 'forma_pago', 'tasa', 'categoria', 'lugar', 'descripcion', 'fecha', 'nota'],
      additionalProperties: false,
    },
  },
  {
    name: 'actualizar_tasas',
    description: 'Trae de DolarAPI las tasas de hoy (BCV, euro, dólar efectivo, USDT) y las guarda en Finanzas.',
    strict: true,
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    name: 'fijar_tasa',
    description: 'Guarda a mano la tasa de una forma de pago (cuántas unidades equivalen a 1 dólar BCV), si la persona la dice. No cambia los movimientos ya registrados.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { codigo: { type: 'string', enum: ['BCV', 'EUR', 'CASH', 'USDT'] }, por_dolar: { type: 'number' } },
      required: ['codigo', 'por_dolar'],
      additionalProperties: false,
    },
  },
  {
    name: 'guardar_contacto_salud',
    description: 'Guarda un doctor, clínica o laboratorio en los contactos de salud de la persona. Usa cadena vacía en lo que no se sepa.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: CONTACT_KINDS },
        nombre: { type: 'string' },
        especialidad: { type: 'string' },
        telefono: { type: 'string' },
        correo: { type: 'string' },
        direccion: { type: 'string' },
        notas: { type: 'string' },
      },
      required: ['tipo', 'nombre', 'especialidad', 'telefono', 'correo', 'direccion', 'notas'],
      additionalProperties: false,
    },
  },
];

type Input = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

const RATE_LABELS: Record<string, { label: string; currency: string }> = {
  BCV: { label: 'Bolívares (Bs)', currency: 'VES' },
  EUR: { label: 'Euro', currency: 'EUR' },
  CASH: { label: 'Dólar efectivo', currency: 'USD' },
  USDT: { label: 'USDT', currency: 'USD' },
};

/** Trae las tasas de DolarAPI y guarda (upsert por código) las que vengan. Devuelve código → tasa. */
async function refreshRates(db: SupabaseClient, userId: string) {
  const fetched = await fetchRates();
  const now = new Date().toISOString();
  const rows = Object.entries(RATE_CODE_MAP)
    .map(([code, key]) => ({ code, value: fetched[key] }))
    .filter((x): x is { code: string; value: number } => typeof x.value === 'number' && x.value > 0)
    .map(({ code, value }) => ({ user_id: userId, code, label: RATE_LABELS[code].label, currency: RATE_LABELS[code].currency, per_usd: value, updated_at: now }));
  if (!rows.length) throw new Error('DolarAPI respondió, pero sin tasas que pueda usar.');
  const { error } = await db.from('finance_rates').upsert(rows, { onConflict: 'user_id,code' });
  if (error) throw error;
  return Object.fromEntries(rows.map((r) => [r.code, r.per_usd]));
}

/** Archivos elegidos por número (1…N) entre los adjuntos de este mensaje. Lanza Error si un número no existe. */
function pickFiles(raw: unknown, attachments: FileRef[]): { file: FileRef; docType: string }[] {
  const list = Array.isArray(raw) ? raw : [];
  return list.map((x) => {
    const item = (x ?? {}) as Record<string, unknown>;
    const n = Number(item.numero);
    const file = attachments[n - 1];
    if (!Number.isInteger(n) || !file) {
      throw new Error(attachments.length ? `el archivo ${item.numero} no existe; este mensaje trae ${attachments.length}` : 'este mensaje no trae archivos');
    }
    return { file, docType: str(item.tipo_documento) };
  });
}

/** Guarda los archivos elegidos en el registro y resume qué pasó (" Archivos: informe, orden."). */
async function attachAll(db: SupabaseClient, userId: string, examId: string, picks: { file: FileRef; docType: string }[]) {
  if (!picks.length) return '';
  const ok: string[] = [];
  const failed: string[] = [];
  for (const p of picks) {
    const fail = await attachTo(db, userId, examId, p.file, p.docType);
    if (fail) failed.push(`${p.file.name} (${fail})`);
    else ok.push(DOC_TYPES.includes(p.docType) ? p.docType : 'otro');
  }
  return `${ok.length ? ` Archivos guardados: ${ok.join(', ')}.` : ''}${failed.length ? ` No pude guardar: ${failed.join('; ')}.` : ''}`;
}

/** Copia el adjunto del chat a la carpeta del registro y lo anota. Devuelve el error, o null si salió bien. */
async function attachTo(db: SupabaseClient, userId: string, examId: string, a: FileRef, docType: string): Promise<string | null> {
  // Se copia (no se mueve): el adjunto sigue existiendo en el chat.
  if (!a.path.startsWith(`${userId}/`)) return 'adjunto no válido';
  const to = `${userId}/salud/${examId}/${Date.now()}-${a.path.split('/').pop()}`;
  const copied = await db.storage.from('documentos').copy(a.path, to);
  if (copied.error) return copied.error.message;
  const { error } = await db.from('health_exam_files').insert({
    user_id: userId,
    exam_id: examId,
    name: a.name.slice(0, 200),
    mime: a.mime,
    storage_path: to,
    doc_type: DOC_TYPES.includes(docType) ? docType : 'otro',
  });
  return error ? error.message : null;
}

export async function runTool(
  db: SupabaseClient,
  name: string,
  input: Input,
  ctx: { today: string; actions: Actions; userId: string; attachments?: FileRef[] },
): Promise<ToolOutput> {
  switch (name) {
    case 'actualizar_conocimiento': {
      const slug = str(input.archivo);
      const content = str(input.contenido);
      if (!KNOWLEDGE_FILES.includes(slug)) throw new Error('archivo desconocido');
      if (!content || content.length > 20000) throw new Error('contenido vacío o demasiado largo');
      const { error } = await db
        .from('knowledge')
        .upsert({ user_id: ctx.userId, slug, content, updated_at: new Date().toISOString() }, { onConflict: 'user_id,slug' });
      if (error) throw error;
      ctx.actions.knowledgeChanged = true;
      return `${slug}.md actualizado.`;
    }
    case 'guardar_memoria': {
      const content = str(input.content);
      const category = CATEGORIES.includes(str(input.category)) ? str(input.category) : 'otro';
      if (!content) throw new Error('content vacío');
      const { data, error } = await db.from('memories').insert({ user_id: ctx.userId, category, content, source: 'chat' }).select('id').single();
      if (error) throw error;
      return `Memoria guardada (id ${data.id}).`;
    }
    case 'borrar_memoria': {
      const { error, count } = await db.from('memories').delete({ count: 'exact' }).eq('id', str(input.id)).eq('user_id', ctx.userId);
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
        .insert({ user_id: ctx.userId, title: str(input.title), body: str(input.body), due_at: due.toISOString(), repeat })
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
    case 'crear_pendiente': {
      const title = str(input.title);
      const due = str(input.due_date);
      if (!title) throw new Error('title vacío');
      if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) throw new Error('due_date debe ser YYYY-MM-DD');
      const { error } = await db.from('tasks').insert({ user_id: ctx.userId, title: title.slice(0, 300), due_date: due || null });
      if (error) throw error;
      ctx.actions.tasksChanged = true;
      return `Pendiente agregado${due ? ` para ${due}` : ''}.`;
    }
    case 'completar_pendiente': {
      const { error, count } = await db
        .from('tasks')
        .update({ done: true, done_at: new Date().toISOString() }, { count: 'exact' })
        .eq('id', str(input.id))
        .eq('user_id', ctx.userId);
      if (error) throw error;
      ctx.actions.tasksChanged = true;
      return count ? 'Pendiente marcado como hecho.' : 'No encontré ese pendiente.';
    }
    case 'registrar_toma': {
      const { data: med } = await db.from('meds').select('id, name, doses_per_day').eq('id', str(input.med_id)).eq('user_id', ctx.userId).maybeSingle();
      if (!med) return 'No encontré ese medicamento.';
      let dose = Number(input.dosis);
      if (!dose) {
        const { data: taken } = await db.from('med_intakes').select('dose').eq('med_id', med.id).eq('day', ctx.today);
        const done = new Set((taken ?? []).map((t) => t.dose));
        dose = Array.from({ length: med.doses_per_day }, (_, i) => i + 1).find((n) => !done.has(n)) ?? 0;
        if (!dose) return `Hoy ya están todas las dosis de ${med.name}.`;
      }
      if (!Number.isInteger(dose) || dose < 1 || dose > med.doses_per_day) throw new Error(`dosis debe ser de 1 a ${med.doses_per_day}`);
      const { error } = await db
        .from('med_intakes')
        .upsert({ user_id: ctx.userId, med_id: med.id, day: ctx.today, dose }, { onConflict: 'med_id,day,dose', ignoreDuplicates: true });
      if (error) throw error;
      ctx.actions.intakesChanged = true;
      return `Dosis ${dose} de ${med.doses_per_day} de ${med.name} registrada para hoy.`;
    }
    case 'agregar_medicamento': {
      const perDay = Number(input.veces_al_dia);
      if (!Number.isInteger(perDay) || perDay < 1 || perDay > 12) throw new Error('veces_al_dia debe ser de 1 a 12');
      const times = (Array.isArray(input.horas) ? input.horas : []).map((t) => str(t)).filter(Boolean);
      if (times.length > perDay) throw new Error('hay más horas que dosis');
      if (times.some((t) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(t))) throw new Error('las horas van como HH:MM en 24 h');
      const { error } = await db
        .from('meds')
        .insert({ user_id: ctx.userId, name: str(input.name), dose: str(input.dose), doses_per_day: perDay, times: [...times].sort() });
      if (error) throw error;
      ctx.actions.medsChanged = true;
      return 'Medicamento agregado.';
    }
    case 'guardar_registro_medico': {
      const kind = EXAM_KINDS.includes(str(input.tipo)) ? str(input.tipo) : 'otro';
      const title = (str(input.titulo) || EXAM_TITLES[kind]).slice(0, 200);
      const date = str(input.fecha);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(date).getTime())) throw new Error('fecha debe ser YYYY-MM-DD');
      if (date > ctx.today) throw new Error('la fecha no puede ser futura');
      const picks = pickFiles(input.archivos, ctx.attachments ?? []);
      const { data: exam, error } = await db
        .from('health_exams')
        .insert({
          user_id: ctx.userId,
          title,
          exam_date: date,
          kind,
          place: str(input.lugar),
          doctor: str(input.doctor),
          results: str(input.resultados).slice(0, 8000),
          notes: str(input.notas).slice(0, 2000),
        })
        .select('id')
        .single();
      if (error) throw error;
      const saved = await attachAll(db, ctx.userId, exam.id, picks);
      return `"${title}" guardado en el historial (id ${exam.id}) con fecha ${date}.${saved}`;
    }
    case 'adjuntar_a_registro_medico': {
      const picks = pickFiles(input.archivos, ctx.attachments ?? []);
      if (!picks.length) throw new Error('indica qué archivos de este mensaje guardar (archivos: número y tipo)');
      const { data: exam } = await db.from('health_exams').select('id, title, exam_date').eq('id', str(input.id)).eq('user_id', ctx.userId).maybeSingle();
      if (!exam) return 'No encontré ese registro.';
      const saved = await attachAll(db, ctx.userId, exam.id, picks);
      return `En "${exam.title}" (${exam.exam_date}).${saved}`;
    }
    case 'leer_registro_medico': {
      const id = str(input.id);
      const { data: exam } = await db.from('health_exams').select('id, title, exam_date').eq('id', id).eq('user_id', ctx.userId).maybeSingle();
      if (!exam) return 'No encontré ese registro.';
      const { data: files, error } = await db
        .from('health_exam_files')
        .select('name, mime, storage_path, doc_type')
        .eq('exam_id', id)
        .eq('user_id', ctx.userId)
        .order('created_at')
        .limit(MAX_READ_FILES);
      if (error) throw error;
      if (!files?.length) return `"${exam.title}" (${exam.exam_date}) no tiene archivos. Pídele a la persona la foto o el PDF.`;
      return {
        text: `Archivos de "${exam.title}" (${exam.exam_date}): ${files.map((f) => `${f.doc_type} "${f.name}"`).join(', ')}`,
        files: files.map((f) => ({ path: f.storage_path, name: f.name, mime: f.mime })),
      };
    }
    case 'anotar_registro_medico': {
      const { error, count } = await db
        .from('health_exams')
        .update({ results: str(input.resultados).slice(0, 8000) }, { count: 'exact' })
        .eq('id', str(input.id))
        .eq('user_id', ctx.userId);
      if (error) throw error;
      return count ? 'Anotado en el registro.' : 'No encontré ese registro.';
    }
    case 'agregar_registro_modulo': {
      const title = str(input.titulo).slice(0, 200);
      const date = str(input.fecha);
      if (!title) throw new Error('titulo vacío');
      if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(date).getTime()))) throw new Error('fecha debe ser YYYY-MM-DD');
      const { data: mod } = await db.from('modules').select('id, kind, name').eq('id', str(input.modulo_id)).eq('user_id', ctx.userId).maybeSingle();
      if (!mod) return 'No encontré ese módulo.';
      if (mod.kind === 'negocios') return 'El módulo de negocios no lleva registros; guárdalo como memoria o en negocios.md.';
      const { error } = await db
        .from('module_entries')
        .insert({ user_id: ctx.userId, module_id: mod.id, title, entry_date: date || null, details: str(input.detalle).slice(0, 4000) });
      if (error) throw error;
      return `Registro anotado en ${mod.name}${date ? ` con fecha ${date}` : ''}.`;
    }
    case 'registrar_movimiento': {
      const kind = input.tipo === 'ingreso' ? 'income' : 'expense';
      const amount = Number(input.monto);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('monto debe ser mayor que cero');
      const currency = ['USD', 'VES', 'EUR'].includes(str(input.moneda)) ? str(input.moneda) : 'USD';
      let code = str(input.forma_pago).toUpperCase();
      if (currency === 'VES') code = 'BCV';
      if (currency === 'EUR') code = 'EUR';
      const date = str(input.fecha) || ctx.today;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('fecha debe ser YYYY-MM-DD');
      // Dólar BCV es la referencia (tasa 1). Lo demás necesita tasa: la dicha, la guardada o la de hoy en DolarAPI.
      const reference = currency === 'USD' && code === 'BCV';
      let rate = 1;
      if (!reference) {
        const given = str(input.tasa) ? Number(str(input.tasa).replace(',', '.')) : NaN;
        if (Number.isFinite(given) && given > 0) rate = given;
        else {
          // La de hoy: si la guardada falta o es de otro día, se traen las del día; si eso falla, sirve la guardada.
          const { data: saved } = await db.from('finance_rates').select('per_usd, updated_at').eq('user_id', ctx.userId).eq('code', code).maybeSingle();
          const stored = saved?.per_usd === null || saved?.per_usd === undefined ? NaN : Number(saved.per_usd);
          const fromToday = String(saved?.updated_at ?? '').slice(0, 10) === ctx.today;
          if (Number.isFinite(stored) && stored > 0 && fromToday) rate = stored;
          else {
            const fresh = await refreshRates(db, ctx.userId).catch(() => ({}) as Record<string, number>);
            if (fresh[code]) rate = fresh[code];
            else if (Number.isFinite(stored) && stored > 0) rate = stored;
            else throw new Error(`no hay tasa ${code} guardada y DolarAPI no respondió; pídele la tasa a la persona`);
          }
        }
      }
      // Categoría por nombre, sin distinguir mayúsculas; si no existe, se crea con el tipo del movimiento.
      let categoryId: string | null = null;
      const catName = str(input.categoria).slice(0, 60);
      if (catName) {
        const { data: cats } = await db.from('finance_categories').select('id, name').eq('user_id', ctx.userId);
        const found = (cats ?? []).find((c) => c.name.toLowerCase() === catName.toLowerCase());
        if (found) categoryId = found.id;
        else {
          const { data: created, error } = await db
            .from('finance_categories')
            .insert({ user_id: ctx.userId, name: catName, kind, sort_order: (cats ?? []).length })
            .select('id')
            .single();
          if (error) throw error;
          categoryId = created.id;
        }
      }
      const amountUsd = amount / rate;
      const { error } = await db.from('finance_transactions').insert({
        user_id: ctx.userId,
        kind,
        occurred_on: date,
        description: str(input.descripcion),
        place: str(input.lugar),
        category_id: categoryId,
        amount,
        currency,
        rate_per_usd: rate,
        rate_label: code,
        amount_usd: amountUsd,
        note: str(input.nota),
      });
      if (error) throw error;
      ctx.actions.financeChanged = true;
      return `${kind === 'income' ? 'Ingreso' : 'Gasto'} registrado: ${amount} ${currency}${reference ? '' : ` (${code}, tasa ${rate})`} = ${amountUsd.toFixed(2)} $ BCV, el ${date}${catName ? `, categoría ${catName}` : ''}.`;
    }
    case 'actualizar_tasas': {
      const saved = await refreshRates(db, ctx.userId);
      ctx.actions.financeChanged = true;
      return `Tasas guardadas (unidades por 1 $ BCV): ${Object.entries(saved).map(([c, v]) => `${c} ${v.toFixed(4)}`).join(', ')}.`;
    }
    case 'fijar_tasa': {
      const code = str(input.codigo).toUpperCase();
      const value = Number(input.por_dolar);
      if (!RATE_LABELS[code]) throw new Error('código de tasa desconocido');
      if (!Number.isFinite(value) || value <= 0) throw new Error('la tasa tiene que ser mayor que cero');
      const { error } = await db
        .from('finance_rates')
        .upsert(
          { user_id: ctx.userId, code, label: RATE_LABELS[code].label, currency: RATE_LABELS[code].currency, per_usd: value, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,code' },
        );
      if (error) throw error;
      ctx.actions.financeChanged = true;
      return `Tasa ${code} guardada: ${value} por 1 $ BCV. Lo ya registrado no cambia.`;
    }
    case 'guardar_contacto_salud': {
      const name = str(input.nombre).slice(0, 200);
      if (!name) throw new Error('nombre vacío');
      const { error } = await db.from('health_contacts').insert({
        user_id: ctx.userId,
        kind: CONTACT_KINDS.includes(str(input.tipo)) ? str(input.tipo) : 'otro',
        name,
        specialty: str(input.especialidad),
        phone: str(input.telefono),
        email: str(input.correo),
        address: str(input.direccion),
        notes: str(input.notas).slice(0, 2000),
      });
      if (error) throw error;
      return `Contacto guardado: ${name}.`;
    }
    default:
      throw new Error(`herramienta desconocida: ${name}`);
  }
}
