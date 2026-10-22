// Conocimiento: los archivos Markdown que DESJ lee antes de cada respuesta (perfil, salud, negocios, preferencias).
// - Con sesión: viven en Supabase (tabla knowledge) y Claude los reescribe en la entrevista.
// - Sin nube: viven en el teléfono y una entrevista guiada los va llenando campo por campo.
//   Al conectar la nube, lo que haya en el teléfono se sube solo la primera vez.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export type Slug = 'perfil' | 'salud' | 'negocios' | 'preferencias';
export type Doc = { content: string; updatedAt: string | null };
export type Docs = Record<Slug, Doc>;

export const FILES: { slug: Slug; title: string; hint: string }[] = [
  { slug: 'perfil', title: 'Perfil', hint: 'Quién eres: nombre, edad, ciudad, ocupación, familia' },
  { slug: 'salud', title: 'Salud', hint: 'Peso, talla, condiciones, alergias, médico, objetivos' },
  { slug: 'negocios', title: 'Negocios', hint: 'Rubros, empresas, socios, qué te quita tiempo' },
  { slug: 'preferencias', title: 'Preferencias', hint: 'Cómo quieres que DESJ te hable, horarios, rutinas' },
];

// Preguntas de la entrevista guiada (modo sin nube). Con Claude, él decide qué preguntar.
export const QUESTIONS: { id: string; slug: Slug; label: string; ask: string }[] = [
  { id: 'nombre', slug: 'perfil', label: 'Nombre completo', ask: '¿Cuál es tu nombre completo?' },
  { id: 'nacimiento', slug: 'perfil', label: 'Fecha de nacimiento', ask: '¿Cuál es tu fecha de nacimiento?' },
  { id: 'ciudad', slug: 'perfil', label: 'Ciudad', ask: '¿En qué ciudad vives?' },
  { id: 'ocupacion', slug: 'perfil', label: 'Ocupación', ask: '¿A qué te dedicas principalmente?' },
  { id: 'familia', slug: 'perfil', label: 'Familia', ask: '¿Cómo está compuesta tu familia? (pareja, hijos…)' },
  { id: 'peso', slug: 'salud', label: 'Peso', ask: '¿Cuánto pesas? (en kg)' },
  { id: 'talla', slug: 'salud', label: 'Talla', ask: '¿Cuánto mides?' },
  { id: 'sangre', slug: 'salud', label: 'Tipo de sangre', ask: '¿Sabes tu tipo de sangre?' },
  { id: 'condiciones', slug: 'salud', label: 'Condiciones médicas', ask: '¿Tienes alguna condición médica que deba tener en cuenta?' },
  { id: 'alergias', slug: 'salud', label: 'Alergias', ask: '¿Tienes alergias?' },
  { id: 'medico', slug: 'salud', label: 'Médico de cabecera', ask: '¿Quién es tu médico de cabecera?' },
  { id: 'objetivo', slug: 'salud', label: 'Objetivo de salud', ask: '¿Qué objetivo de salud tienes ahora mismo?' },
  { id: 'rubros', slug: 'negocios', label: 'Rubros', ask: '¿En qué rubros de negocio estás?' },
  { id: 'empresas', slug: 'negocios', label: 'Empresas y marcas', ask: '¿Cómo se llaman tus empresas o marcas?' },
  { id: 'socios', slug: 'negocios', label: 'Socios y personas clave', ask: '¿Con quién trabajas de cerca o quiénes son tus socios?' },
  { id: 'tiempo', slug: 'negocios', label: 'Lo que más tiempo quita', ask: '¿Qué tarea de tus negocios te quita más tiempo?' },
  { id: 'trato', slug: 'preferencias', label: 'Cómo hablarle', ask: '¿Cómo quieres que te hable DESJ? (formal, directo, con humor…)' },
  { id: 'horario', slug: 'preferencias', label: 'Horario', ask: '¿A qué hora te levantas y te acuestas normalmente?' },
  { id: 'resumen', slug: 'preferencias', label: 'Resumen del día', ask: '¿A qué hora quieres recibir tu resumen del día?' },
];

const SKIP = /^(saltar|salta|paso|omitir|siguiente|no s[eé]|prefiero no)\.?$/i;

const LOCAL_KEY = 'desj:knowledge:v1';
type LocalState = { docs: Partial<Docs>; skipped: string[] };

const EMPTY: Docs = {
  perfil: { content: '', updatedAt: null },
  salud: { content: '', updatedAt: null },
  negocios: { content: '', updatedAt: null },
  preferencias: { content: '', updatedAt: null },
};

const fieldLine = (label: string) => new RegExp(`^- \\*\\*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\*\\*.*$`, 'm');

/** Pone o reemplaza la línea "- **Campo:** valor" sin tocar el resto del archivo (respeta ediciones a mano). */
export function upsertField(content: string, slug: Slug, label: string, value: string) {
  const title = FILES.find((f) => f.slug === slug)!.title;
  const line = `- **${label}:** ${value.replace(/\s+/g, ' ').trim()}`;
  const base = content.trim() || `# ${title}`;
  return fieldLine(label).test(base) ? base.replace(fieldLine(label), line) : `${base}\n${base.includes('\n- ') ? '' : '\n'}${line}`;
}

const hasField = (docs: Docs, slug: Slug, label: string) => fieldLine(label).test(docs[slug].content);

/** Siguiente pregunta de la entrevista guiada: la primera sin responder ni saltar. */
export function nextQuestion(docs: Docs, skipped: string[]) {
  return QUESTIONS.find((q) => !skipped.includes(q.id) && !hasField(docs, q.slug, q.label)) ?? null;
}

export function isSkip(text: string) {
  return SKIP.test(text.trim());
}

export function useKnowledge() {
  const { session } = useAuth();
  const cloud = Boolean(session);
  const [docs, setDocs] = useState<Docs>(EMPTY);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  const readLocal = async (): Promise<LocalState> => {
    try {
      const raw = await AsyncStorage.getItem(LOCAL_KEY);
      return raw ? JSON.parse(raw) : { docs: {}, skipped: [] };
    } catch {
      return { docs: {}, skipped: [] };
    }
  };

  const reload = useCallback(async () => {
    const local = await readLocal();
    if (!cloud) {
      setDocs({ ...EMPTY, ...local.docs });
      setSkipped(local.skipped);
      setReady(true);
      return;
    }
    const { data } = await supabase.from('knowledge').select('slug, content, updated_at');
    const next: Docs = { ...EMPTY };
    for (const row of data ?? []) next[row.slug as Slug] = { content: row.content, updatedAt: row.updated_at };

    // Primera vez en la nube: se sube lo que se llenó en el teléfono.
    const pending = FILES.filter((f) => !next[f.slug].content && local.docs[f.slug]?.content);
    if (pending.length) {
      const rows = pending.map((f) => ({ slug: f.slug, content: local.docs[f.slug]!.content, updated_at: new Date().toISOString() }));
      const { error } = await supabase.from('knowledge').upsert(rows, { onConflict: 'user_id,slug' });
      if (!error) for (const r of rows) next[r.slug] = { content: r.content, updatedAt: r.updated_at };
    }
    setDocs(next);
    setReady(true);
  }, [cloud]);

  useEffect(() => {
    // Asíncrono: el estado cambia cuando llegan los datos, no durante el efecto.
    Promise.resolve().then(reload);
  }, [reload]);

  const persistLocal = async (nextDocs: Docs, nextSkipped: string[]) => {
    await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify({ docs: nextDocs, skipped: nextSkipped } satisfies LocalState));
  };

  /** Guarda un archivo completo (edición a mano). */
  const saveDoc = async (slug: Slug, content: string) => {
    const doc = { content: content.trim(), updatedAt: new Date().toISOString() };
    if (cloud) {
      const { error } = await supabase.from('knowledge').upsert({ slug, content: doc.content, updated_at: doc.updatedAt }, { onConflict: 'user_id,slug' });
      if (error) return false;
    }
    const next = { ...docs, [slug]: doc };
    setDocs(next);
    if (!cloud) await persistLocal(next, skipped);
    return true;
  };

  /** Guarda varios archivos a la vez (Mis datos puede tocar perfil.md y salud.md en un solo guardado). */
  const saveDocs = async (patch: Partial<Record<Slug, string>>) => {
    const updatedAt = new Date().toISOString();
    const slugs = Object.keys(patch) as Slug[];
    if (!slugs.length) return true;
    if (cloud) {
      const rows = slugs.map((slug) => ({ slug, content: patch[slug]!.trim(), updated_at: updatedAt }));
      const { error } = await supabase.from('knowledge').upsert(rows, { onConflict: 'user_id,slug' });
      if (error) return false;
    }
    const next = { ...docs };
    for (const slug of slugs) next[slug] = { content: patch[slug]!.trim(), updatedAt };
    setDocs(next);
    if (!cloud) await persistLocal(next, skipped);
    return true;
  };

  /** Entrevista guiada (sin nube): guarda la respuesta o la salta y devuelve la siguiente pregunta. */
  const answerLocal = async (questionId: string, text: string) => {
    const q = QUESTIONS.find((x) => x.id === questionId);
    if (!q) return nextQuestion(docs, skipped);
    let nextDocs = docs;
    let nextSkipped = skipped;
    if (isSkip(text)) {
      nextSkipped = [...skipped, q.id];
    } else {
      nextDocs = { ...docs, [q.slug]: { content: upsertField(docs[q.slug].content, q.slug, q.label, text), updatedAt: new Date().toISOString() } };
    }
    setDocs(nextDocs);
    setSkipped(nextSkipped);
    await persistLocal(nextDocs, nextSkipped);
    return nextQuestion(nextDocs, nextSkipped);
  };

  /** Vuelve a ofrecer las preguntas que se saltaron. */
  const resetSkipped = async () => {
    setSkipped([]);
    if (!cloud) await persistLocal(docs, []);
  };

  const answered = QUESTIONS.filter((q) => hasField(docs, q.slug, q.label)).length;

  return { cloud, ready, docs, skipped, reload, saveDoc, saveDocs, answerLocal, resetSkipped, progress: { answered, total: QUESTIONS.length } };
}

/** Primer nombre según perfil.md ("- **Nombre completo:** Steven …"), o '' si todavía no está. */
export function firstName(docs: Docs) {
  const m = docs.perfil.content.match(/\*\*Nombre(?: completo)?:\*\*\s*([^\s,]+)/i);
  return m ? m[1] : '';
}

/**
 * Valor de un campo "- **Campo:** valor" buscado en salud.md y perfil.md (el primero que aparezca).
 * Devuelve null si no está o si dice "[pendiente]".
 */
export function readField(docs: Docs, labels: string[]) {
  for (const slug of ['salud', 'perfil'] as Slug[]) {
    for (const label of labels) {
      const safe = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const m = docs[slug].content.match(new RegExp(`\\*\\*${safe}:\\*\\*\\s*(.+)$`, 'im'));
      const value = m?.[1].trim();
      if (value && !/pendiente/i.test(value)) return value;
    }
  }
  return null;
}

const labelLine = (label: string) =>
  new RegExp(`^.*\\*\\*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\*\\*.*$\\n?`, 'im');

/**
 * Escribe un campo en el archivo donde ya esté (con cualquiera de sus nombres, p. ej. "Talla" o "Altura");
 * si no está, lo agrega en `slug` con el primer nombre. Valor vacío = quitar la línea.
 * Devuelve el contenido nuevo de los archivos que cambiaron.
 */
export function writeField(docs: Docs, slug: Slug, labels: string[], value: string): Partial<Record<Slug, string>> {
  const clean = value.replace(/\s+/g, ' ').trim();
  for (const s of ['salud', 'perfil'] as Slug[]) {
    for (const label of labels) {
      const re = labelLine(label);
      if (!re.test(docs[s].content)) continue;
      const next = clean ? docs[s].content.replace(re, (line) => `- **${label}:** ${clean}${line.endsWith('\n') ? '\n' : ''}`) : docs[s].content.replace(re, '');
      return { [s]: next };
    }
  }
  if (!clean) return {};
  // Campo nuevo: va justo después del último "- **Campo:** valor" del archivo, no al final (notas, fecha).
  const content = docs[slug].content;
  const fields = [...content.matchAll(/^- \*\*[^*]+:\*\*.*$/gm)];
  const last = fields[fields.length - 1];
  if (!last || last.index === undefined) return { [slug]: upsertField(content, slug, labels[0], clean) };
  const at = last.index + last[0].length;
  return { [slug]: `${content.slice(0, at)}\n- **${labels[0]}:** ${clean}${content.slice(at)}` };
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Edad en años a partir de "12/03/1990", "1990-03-12" o "12 de marzo de 1990"; null si no se entiende. */
export function ageFrom(birth: string | null, now = new Date()) {
  if (!birth) return null;
  let d: Date | null = null;
  const iso = birth.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  const dmy = birth.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  const words = birth.toLowerCase().match(/(\d{1,2})\s+de\s+([a-záéíóú]+)\s+(?:de|del)?\s*(\d{4})/);
  if (iso) d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  else if (dmy) d = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
  else if (words && MONTHS.includes(words[2])) d = new Date(Number(words[3]), MONTHS.indexOf(words[2]), Number(words[1]));
  if (!d || Number.isNaN(d.getTime())) return null;
  let age = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

/** Primer número de un texto ("82,5 kg" → 82.5); null si no hay. */
export function numberIn(text: string | null) {
  const m = text?.match(/\d+(?:[.,]\d+)?/);
  return m ? Number(m[0].replace(',', '.')) : null;
}
