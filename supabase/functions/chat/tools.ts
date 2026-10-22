// Herramientas que Claude puede usar. Las usan la Edge Function `chat` (cliente con la sesión del
// usuario, RLS) y el worker local (desj-worker, clave de servidor). Por eso cada consulta lleva
// además user_id explícito: así ninguna herramienta puede tocar datos de otra persona en ningún caso.
import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';

export type Actions = {
  reminders: { id: string; title: string; body: string; due_at: string; repeat: 'none' | 'daily' }[];
  events: { title: string; start: string; end: string; notes: string }[];
  medsChanged: boolean;
  intakesChanged: boolean;
  knowledgeChanged: boolean;
  tasksChanged: boolean;
};

export const KNOWLEDGE_FILES = ['perfil', 'salud', 'negocios', 'preferencias'];

/** Un archivo de Storage que Claude debe ver (adjunto del chat o archivo de un examen). */
export type FileRef = { path: string; name: string; mime: string };
/** Lo que devuelve una herramienta: texto, o texto más archivos para que Claude los lea. */
export type ToolOutput = string | { text: string; files: FileRef[] };

const EXAM_KINDS = ['laboratorio', 'imagen', 'consulta', 'otro'];
const CONTACT_KINDS = ['doctor', 'clinica', 'laboratorio', 'otro'];
const MAX_READ_FILES = 3; // archivos de un examen que se le pasan a Claude de una vez

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
    name: 'guardar_examen',
    description:
      'Guarda un examen médico en el módulo Salud de la persona (laboratorio, imagen, consulta). fecha es cuándo se HIZO el examen (YYYY-MM-DD), no la de hoy: tómala del documento o pregúntala. Si la persona mandó el examen como adjunto en este mensaje, usa adjuntar_archivo true para guardarlo junto al examen. En resultados anota los valores principales con sus unidades y rangos de referencia, tal como aparecen; sin interpretar.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string', description: 'Ej. "Hematología completa", "Perfil lipídico", "Rayos X de tórax".' },
        fecha: { type: 'string', description: 'YYYY-MM-DD' },
        tipo: { type: 'string', enum: EXAM_KINDS },
        lugar: { type: 'string', description: 'Clínica o laboratorio; cadena vacía si no se sabe.' },
        doctor: { type: 'string', description: 'Cadena vacía si no se sabe.' },
        resultados: { type: 'string', description: 'Valores principales; cadena vacía si no hay.' },
        notas: { type: 'string', description: 'Cadena vacía si no hay.' },
        adjuntar_archivo: { type: 'boolean', description: 'true para guardar el adjunto de este mensaje con el examen.' },
      },
      required: ['titulo', 'fecha', 'tipo', 'lugar', 'doctor', 'resultados', 'notas', 'adjuntar_archivo'],
      additionalProperties: false,
    },
  },
  {
    name: 'leer_examen',
    description:
      'Abre los archivos (fotos o PDF) de un examen de <examenes> para leerlos. Úsalo cuando la persona pregunte por el contenido de un examen y sus resultados estén "[sin anotar]" o no alcancen. Después de leerlo, si no estaban anotados, guárdalos con anotar_resultados_examen.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'El id que aparece en <examenes>.' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'anotar_resultados_examen',
    description:
      'Reemplaza los resultados anotados de un examen de <examenes> (valores principales con unidades y rangos de referencia, tal como aparecen en el documento). Conserva lo que ya estaba si sigue siendo correcto.',
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

export async function runTool(
  db: SupabaseClient,
  name: string,
  input: Input,
  ctx: { today: string; actions: Actions; userId: string; attachment?: FileRef | null },
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
    case 'guardar_examen': {
      const title = str(input.titulo).slice(0, 200);
      const date = str(input.fecha);
      if (!title) throw new Error('titulo vacío');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(date).getTime())) throw new Error('fecha debe ser YYYY-MM-DD');
      if (date > ctx.today) throw new Error('la fecha del examen no puede ser futura');
      const attach = input.adjuntar_archivo === true;
      if (attach && !ctx.attachment) throw new Error('este mensaje no trae un archivo adjunto');
      const { data: exam, error } = await db
        .from('health_exams')
        .insert({
          user_id: ctx.userId,
          title,
          exam_date: date,
          kind: EXAM_KINDS.includes(str(input.tipo)) ? str(input.tipo) : 'otro',
          place: str(input.lugar),
          doctor: str(input.doctor),
          results: str(input.resultados).slice(0, 8000),
          notes: str(input.notas).slice(0, 2000),
        })
        .select('id')
        .single();
      if (error) throw error;
      if (attach && ctx.attachment) {
        // Se copia (no se mueve): el adjunto sigue existiendo en el chat.
        const a = ctx.attachment;
        if (!a.path.startsWith(`${ctx.userId}/`)) throw new Error('adjunto no válido');
        const to = `${ctx.userId}/salud/${exam.id}/${a.path.split('/').pop()}`;
        const copied = await db.storage.from('documentos').copy(a.path, to);
        if (copied.error) return `Examen guardado (id ${exam.id}), pero no pude guardar el archivo: ${copied.error.message}`;
        const { error: fileError } = await db
          .from('health_exam_files')
          .insert({ user_id: ctx.userId, exam_id: exam.id, name: a.name.slice(0, 200), mime: a.mime, storage_path: to });
        if (fileError) throw fileError;
      }
      return `Examen guardado (id ${exam.id}) con fecha ${date}${attach ? ' y su archivo' : ''}.`;
    }
    case 'leer_examen': {
      const id = str(input.id);
      const { data: exam } = await db.from('health_exams').select('id, title, exam_date').eq('id', id).eq('user_id', ctx.userId).maybeSingle();
      if (!exam) return 'No encontré ese examen.';
      const { data: files, error } = await db
        .from('health_exam_files')
        .select('name, mime, storage_path')
        .eq('exam_id', id)
        .eq('user_id', ctx.userId)
        .order('created_at')
        .limit(MAX_READ_FILES);
      if (error) throw error;
      if (!files?.length) return `"${exam.title}" (${exam.exam_date}) no tiene archivos. Pídele a la persona la foto o el PDF.`;
      return {
        text: `Archivos de "${exam.title}" (${exam.exam_date}):`,
        files: files.map((f) => ({ path: f.storage_path, name: f.name, mime: f.mime })),
      };
    }
    case 'anotar_resultados_examen': {
      const { error, count } = await db
        .from('health_exams')
        .update({ results: str(input.resultados).slice(0, 8000) }, { count: 'exact' })
        .eq('id', str(input.id))
        .eq('user_id', ctx.userId);
      if (error) throw error;
      return count ? 'Resultados anotados en el examen.' : 'No encontré ese examen.';
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
