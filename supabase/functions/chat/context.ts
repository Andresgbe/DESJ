// Contexto privado de una persona y utilidades que comparten la Edge Function `chat` y el worker local
// (desj-worker). Toda consulta filtra por userId: con la sesión del usuario (RLS) es redundante, y con la
// clave de servidor del worker es lo que garantiza que nunca se mezclen datos entre personas.
// Sin dependencias de Deno: el worker lo importa directo con Node.
import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';

export const HISTORY = 20; // mensajes previos que se reenvían
const MAX_EXAMS = 80; // registros del historial médico más recientes (por la fecha en que pasaron)
const MAX_RESULTS = 800; // caracteres de resultados por examen en el contexto
const SERVICES_PER_VEHICLE = 8; // mantenimientos más recientes de cada vehículo
const RECENT_MOVES = 25; // movimientos de finanzas del mes que ve DESJ

export type Section = 'salud' | 'finanzas' | 'modulos';
export const SECTIONS: Section[] = ['salud', 'finanzas', 'modulos'];

// Palabras que delatan el tema de un mensaje (sin tildes, en minúsculas). Conocimiento se lee siempre; cada
// área solo cuando el mensaje (o lo último de la conversación) habla de ella: así el contexto es más corto y
// DESJ responde más rápido. Si se equivoca, Claude puede pedir el área con la herramienta abrir_seccion.
const TOPICS: Record<Section, RegExp> = {
  salud:
    /salud|medic|doctor|\bdra?\b|pastill|dosis|tom(e|o|ar|aste)\b|examen|consulta|informe|orden|receta|laborator|clinic|sintom|dolor|presion|tension|glucosa|colesterol|vacuna|alergi|hospital|\bcita|cardio|resultado|analisis|hemat|sangre|enferm|fiebre|gripe|tratamiento|operaci|cirug/,
  finanzas:
    /gast|pag(o|ue|ar|aste|ado)|compr|cobr|ingres|dolar|\$|\bbs\b|bolivar|tasa|usdt|efectivo|presupuest|deuda|plata|dinero|precio|factur|finanz|sueldo|cuanto llevo|zelle|transfer|balance|ahorr|mercado|supermerc|alquiler/,
  modulos: /carro|vehicul|moto\b|camioneta|aceite|kilometr|\bkm\b|mantenimiento|seguro|caucho|freno|bateria|placa|revision|negocio|ganad|lote|vaca|becerr|empresa/,
};

const plain = (t: string) => t.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Áreas que pide el mensaje: por palabras clave, por el nombre de un módulo ("la Hilux") o todas si trae archivos. */
export function detectSections(text: string, moduleNames: string[], hasFiles: boolean): Section[] {
  if (hasFiles) return SECTIONS;
  const t = plain(text);
  const found = SECTIONS.filter((s) => TOPICS[s].test(t));
  const names = moduleNames.flatMap((n) => plain(n).split(/\s+/)).filter((w) => w.length > 3);
  if (!found.includes('modulos') && names.some((w) => t.includes(w))) found.push('modulos');
  return found;
}

type Opts = { message?: string; hasFiles?: boolean; mode?: 'chat' | 'conocimiento' };

// `agenda` la manda el teléfono (eventos de hoy de su calendario); null = sin acceso al calendario.
export async function loadContext(db: SupabaseClient, userId: string, agenda: unknown, conversationId: string | null, opts: Opts = {}) {
  // 1) Lo de siempre: perfil, Conocimiento completo, memorias, pendientes, recordatorios, historial y los módulos.
  const [profile, knowledge, memories, reminders, tasks, modules, google, history] = await Promise.all([
    db.from('profiles').select('display_name, about, timezone').eq('id', userId).single(),
    db.from('knowledge').select('slug, title, content').eq('user_id', userId),
    db.from('memories').select('id, category, content, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(150),
    db
      .from('reminders')
      .select('title, due_at, repeat')
      .eq('user_id', userId)
      .eq('done', false)
      .or(`repeat.eq.daily,due_at.gte.${new Date().toISOString()}`)
      .order('due_at')
      .limit(20),
    db.from('tasks').select('id, title, due_date').eq('user_id', userId).eq('done', false).order('due_date', { ascending: true, nullsFirst: false }).limit(50),
    db.from('modules').select('id, kind, name').eq('user_id', userId).order('position').limit(50),
    db.from('google_accounts').select('email, last_error').eq('user_id', userId).maybeSingle(),
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

  // 2) Las áreas que pide el mensaje. Se mira también lo último que dijo la persona en esta conversación,
  //    para que "¿y el mes pasado?" siga en finanzas.
  const recent = (history.data ?? [])
    .filter((r) => r.role === 'user')
    .slice(0, 2)
    .map((r) => r.content)
    .join(' ');
  const sections = opts.mode === 'conocimiento' ? [] : detectSections(`${opts.message ?? ''} ${recent}`, (modules.data ?? []).map((m) => m.name), Boolean(opts.hasFiles));
  const loaded = await Promise.all(sections.map((s) => loadSection(db, userId, s, today)));

  const docs = [...(knowledge.data ?? [])].sort((a, b) => order(a.slug) - order(b.slug) || a.slug.localeCompare(b.slug));
  const lines = [
    '<contexto_usuario>',
    `Nombre: ${profile.data?.display_name || '[sin nombre]'}`,
    `Sobre la persona: ${profile.data?.about || '[sin datos todavía]'}`,
    `Ahora: ${nowText} (zona ${tz}, desfase ${offset}). Hoy es ${today}.`,
    '',
    '<conocimiento>',
    ...(docs.length
      ? docs.map(
          (d) => `### ${d.slug}.md${d.title ? ` (${d.title})` : ''}
${d.content.trim() || '[vacío: todavía no hay datos]'}
`,
        )
      : ['[sin archivos todavía]']),
    '</conocimiento>',
    '',
    '<memorias>',
    ...(memories.data ?? []).reverse().map((m) => `- [${m.id}] (${m.category}, ${m.created_at.slice(0, 10)}) ${m.content}`),
    '</memorias>',
    '',
    '<recordatorios_pendientes>',
    ...(reminders.data ?? []).map((r) => `- ${r.due_at} ${r.repeat === 'daily' ? '(diario) ' : ''}${r.title}`),
    '</recordatorios_pendientes>',
    '',
    '<pendientes>',
    ...(tasks.data ?? []).map((t) => `- [${t.id}] ${t.due_date ? `(${t.due_date}) ` : ''}${t.title}`),
    '</pendientes>',
    '',
    `<google>${google.data ? `conectado como ${google.data.email ?? 'cuenta de Google'}${google.data.last_error ? ' (la última vez falló: puede que tenga que reconectar)' : ''}: puedes usar Drive, Gmail (enviar) y Google Calendar` : 'no conectado: Drive, Gmail y Google Calendar no están disponibles (se conecta en Ajustes → Cuenta de Google)'}</google>`,
    `<modulos_agregados>${(modules.data ?? []).map((m) => `${m.name} (${m.kind})`).join(', ') || 'ninguno'}</modulos_agregados>`,
    `<secciones_cargadas>${sections.join(', ') || 'ninguna'} (las demás: pídelas con abrir_seccion si las necesitas)</secciones_cargadas>`,
    '',
    ...loaded.flat(),
    '<agenda_hoy>',
    ...agendaLines(agenda, tz),
    '</agenda_hoy>',
    '</contexto_usuario>',
  ];

  // El historial viene del más nuevo al más viejo; se invierte y debe empezar con un mensaje del usuario.
  const rows = (history.data ?? []).reverse();
  while (rows.length && rows[0].role !== 'user') rows.shift();
  const historyMsgs: Anthropic.MessageParam[] = rows.map((r) => ({ role: r.role as 'user' | 'assistant', content: r.content }));

  return { block: lines.join('\n'), today, history: historyMsgs, sections };
}

const CORE_ORDER = ['perfil', 'salud', 'negocios', 'preferencias'];
const order = (slug: string) => (CORE_ORDER.includes(slug) ? CORE_ORDER.indexOf(slug) : CORE_ORDER.length);

/** Un área completa, con sus etiquetas. La usan loadContext y la herramienta abrir_seccion. */
export async function loadSection(db: SupabaseClient, userId: string, section: Section, today: string): Promise<string[]> {
  if (section === 'salud') {
    const [meds, intakes, exams, examFiles, contacts] = await Promise.all([
      db.from('meds').select('id, name, dose, doses_per_day, times').eq('user_id', userId).eq('active', true).order('created_at'),
      db.from('med_intakes').select('med_id, dose').eq('user_id', userId).eq('day', today),
      db
        .from('health_exams')
        .select('id, title, exam_date, kind, place, doctor, results, notes')
        .eq('user_id', userId)
        .order('exam_date', { ascending: false })
        .limit(MAX_EXAMS),
      db.from('health_exam_files').select('exam_id, doc_type').eq('user_id', userId).limit(2000),
      db.from('health_contacts').select('id, kind, name, specialty, phone, email, address, notes').eq('user_id', userId).order('name').limit(100),
    ]);
    return [
      '<medicamentos>',
      ...((meds.data ?? []).length ? (meds.data ?? []).map((m) => medLine(m, (intakes.data ?? []).filter((i) => i.med_id === m.id).map((i) => i.dose))) : ['[ninguno]']),
      '</medicamentos>',
      '',
      '<historial_medico>',
      ...examLines(exams.data ?? [], examFiles.data ?? []),
      '</historial_medico>',
      '',
      '<contactos_salud>',
      ...(contacts.data ?? []).map((c) => `- [${c.id}] ${[c.kind, c.name, c.specialty, c.phone && `tel ${c.phone}`, c.email, c.address, c.notes].filter(Boolean).join(' · ')}`),
      '</contactos_salud>',
      '',
    ];
  }
  if (section === 'finanzas') return ['<finanzas>', ...(await loadFinance(db, userId, today)), '</finanzas>', ''];
  const [modules, vehicles] = await Promise.all([
    db.from('modules').select('id, kind, name').eq('user_id', userId).order('position').limit(50),
    loadVehicles(db, userId),
  ]);
  return ['<modulos>', ...moduleLines(modules.data ?? [], vehicles), '</modulos>', ''];
}

/** Resumen de Finanzas del mes en curso, en dólares BCV: totales, por categoría, tasas y últimos movimientos. */
async function loadFinance(db: SupabaseClient, userId: string, today: string): Promise<string[]> {
  const month = today.slice(0, 7);
  const [y, m] = month.split('-').map(Number);
  const last = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
  const [cats, rates, txs] = await Promise.all([
    db.from('finance_categories').select('id, name, kind').eq('user_id', userId).order('sort_order'),
    db.from('finance_rates').select('code, label, per_usd, updated_at').eq('user_id', userId),
    db
      .from('finance_transactions')
      .select('kind, occurred_on, description, place, category_id, amount, currency, rate_label, amount_usd')
      .eq('user_id', userId)
      .gte('occurred_on', `${month}-01`)
      .lte('occurred_on', last)
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false }),
  ]);
  if (cats.error || rates.error || txs.error) return ['[sin acceso a finanzas]'];
  const name = (id: string | null) => cats.data.find((c) => c.id === id)?.name ?? 'Sin categoría';
  let income = 0;
  let expense = 0;
  const byCat = new Map<string, number>();
  for (const t of txs.data) {
    const usd = Number(t.amount_usd);
    if (t.kind === 'income') income += usd;
    else {
      expense += usd;
      byCat.set(name(t.category_id), (byCat.get(name(t.category_id)) ?? 0) + usd);
    }
  }
  const usd = (n: number) => n.toFixed(2);
  return [
    `Mes ${month} (en $ BCV): ingresos ${usd(income)}, gastos ${usd(expense)}, balance ${usd(income - expense)}.`,
    `Gastos por categoría: ${[...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([n, v]) => `${n} ${usd(v)}`).join(', ') || 'ninguno'}.`,
    `Tasas guardadas (unidades por 1 $ BCV): ${rates.data.map((r) => `${r.code} ${r.per_usd === null ? 'sin cargar' : `${Number(r.per_usd)} (${String(r.updated_at).slice(0, 10)})`}`).join(', ') || 'ninguna'}.`,
    `Categorías: ${cats.data.map((c) => `${c.name} (${c.kind === 'income' ? 'ingreso' : c.kind === 'both' ? 'ambos' : 'gasto'})`).join(', ')}.`,
    'Últimos movimientos:',
    ...(txs.data.length
      ? txs.data.slice(0, RECENT_MOVES).map(
          (t) =>
            `- ${t.occurred_on} ${t.kind === 'income' ? '+' : '-'}${usd(Number(t.amount_usd))} $ · ${t.description || t.place || name(t.category_id)} · ${name(t.category_id)}${t.rate_label && t.rate_label !== 'BCV' ? ` · ${Number(t.amount)} ${t.currency} (${t.rate_label})` : t.currency === 'VES' ? ` · ${Number(t.amount)} Bs` : ''}`,
        )
      : ['[ninguno este mes]']),
  ];
}

type MedRow = { id: string; name: string; dose: string; doses_per_day: number; times: string[] };

/** "- [id] Losartán · 50 mg · 2 veces al día · dosis 1 08:00 (tomada hoy), dosis 2 sin hora (pendiente hoy)". */
function medLine(m: MedRow, taken: number[]): string {
  const doses = Array.from({ length: m.doses_per_day }, (_, i) => {
    const n = i + 1;
    return `${m.doses_per_day > 1 ? `dosis ${n} ` : ''}${m.times[i] ?? 'sin hora'} (${taken.includes(n) ? 'tomada hoy' : 'pendiente hoy'})`;
  });
  return `- [${m.id}] ${m.name} · ${m.dose}${m.doses_per_day > 1 ? ` · ${m.doses_per_day} veces al día` : ''} · ${doses.join(', ')}`;
}

type ExamRow = { id: string; title: string; exam_date: string; kind: string; place: string; doctor: string; results: string; notes: string };

/** Historial médico del más reciente al más antiguo (por la fecha en que pasó), con archivos y resultados. */
function examLines(exams: ExamRow[], files: { exam_id: string; doc_type: string }[]): string[] {
  if (!exams.length) return ['[historial vacío]'];
  return exams.flatMap((e) => {
    const own = files.filter((f) => f.exam_id === e.id).map((f) => f.doc_type);
    const head = `- [${e.id}] ${e.exam_date} · ${e.kind} · ${e.title}${e.place ? ` · ${e.place}` : ''}${e.doctor ? ` · ${e.doctor}` : ''} · ${own.length ? `archivos: ${own.join(', ')}` : 'sin archivos'}`;
    const results = e.results.replace(/\s+/g, ' ').trim();
    const notes = e.notes.replace(/\s+/g, ' ').trim();
    return [
      head,
      `  resultados: ${results ? results.slice(0, MAX_RESULTS) + (results.length > MAX_RESULTS ? '…' : '') : '[sin anotar]'}`,
      ...(notes ? [`  notas: ${notes.slice(0, 300)}`] : []),
    ];
  });
}

type ModuleRow = { id: string; kind: string; name: string };
type Vehicles = Awaited<ReturnType<typeof loadVehicles>>;

async function loadVehicles(db: SupabaseClient, userId: string) {
  const [v, s, d] = await Promise.all([
    db.from('vehicles').select('module_id, brand, model, year, plate, color, odometer_km, odometer_on').eq('user_id', userId),
    db
      .from('vehicle_services')
      .select('module_id, service_date, km, kind, title, cost, shop, next_km, next_date')
      .eq('user_id', userId)
      .order('service_date', { ascending: false })
      .limit(200),
    db.from('vehicle_documents').select('module_id, kind, name, number, expires_on, storage_path').eq('user_id', userId),
  ]);
  return { cards: v.data ?? [], services: s.data ?? [], docs: d.data ?? [] };
}

/** Módulos de la pestaña MÓDULOS; cada vehículo con su ficha, mantenimientos recientes y papeles. */
function moduleLines(modules: ModuleRow[], vehicles: Vehicles): string[] {
  if (!modules.length) return ['[sin módulos]'];
  return modules.flatMap((m) => {
    if (m.kind !== 'vehiculo') return [`- [${m.id}] ${m.kind} · ${m.name}`];
    const card = vehicles.cards.find((c) => c.module_id === m.id);
    const ficha = card
      ? [[card.brand, card.model, card.year].filter(Boolean).join(' '), card.plate && `placa ${card.plate}`, card.color, card.odometer_km != null && `${card.odometer_km} km (al ${card.odometer_on ?? '?'})`]
          .filter(Boolean)
          .join(' · ')
      : '[ficha sin llenar]';
    const services = vehicles.services.filter((s) => s.module_id === m.id).slice(0, SERVICES_PER_VEHICLE);
    const docs = vehicles.docs.filter((d) => d.module_id === m.id);
    return [
      `- [${m.id}] vehiculo · ${m.name} · ${ficha}`,
      ...services.map(
        (s) =>
          `  · mantenimiento ${s.service_date} ${s.kind}${s.title ? ` (${s.title})` : ''}${s.km != null ? ` a ${s.km} km` : ''}${s.cost != null ? ` · $${Number(s.cost)}` : ''}${s.shop ? ` · ${s.shop}` : ''}${s.next_km != null || s.next_date ? ` · próximo ${[s.next_km != null && `${s.next_km} km`, s.next_date].filter(Boolean).join(' o ')}` : ''}`,
      ),
      ...docs.map((d) => `  · papel ${d.kind}: ${d.name}${d.number ? ` N.º ${d.number}` : ''} · vence ${d.expires_on ?? 'sin fecha'}${d.storage_path ? ' · con archivo' : ''}`),
    ];
  });
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
