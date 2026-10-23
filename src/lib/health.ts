// YO · Salud: historial médico (consultas, laboratorios, estudios, con sus archivos: informes, órdenes,
// resultados, recetas) y contactos de salud (doctores, clínicas, laboratorios).
// - Con sesión: viven en Supabase (privados por usuario) y los archivos en Storage, en
//   documentos/<usuario>/salud/<registro>/. DESJ los ve en su contexto y puede leerlos, crearlos y adjuntar.
// - Sin nube: registros y contactos viven en el teléfono, sin archivos.
// El historial se ordena por la fecha en que pasó cada cosa, no por cuándo se cargó.
// (En código y en la base se siguen llamando "exams" / health_exams.)
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useState } from 'react';

import { useAuth } from '@/lib/auth';
import type { Attachment } from '@/lib/attachments';
import { supabase } from '@/lib/supabase';

export { formatDate, parseDate, since, toDmy } from '@/lib/dates';

export type ExamKind = 'consulta' | 'laboratorio' | 'imagen' | 'procedimiento' | 'otro';
export type DocType = 'informe' | 'orden' | 'resultado' | 'receta' | 'imagen' | 'otro';
export type ContactKind = 'doctor' | 'clinica' | 'laboratorio' | 'otro';

/** `title`: nombre que toma el registro si no le pones uno ("Consulta médica"). */
export const EXAM_KINDS: { id: ExamKind; label: string; title: string }[] = [
  { id: 'consulta', label: 'Consulta', title: 'Consulta médica' },
  { id: 'laboratorio', label: 'Laboratorio', title: 'Examen de laboratorio' },
  { id: 'imagen', label: 'Imagen', title: 'Estudio de imagen' },
  { id: 'procedimiento', label: 'Procedimiento', title: 'Procedimiento' },
  { id: 'otro', label: 'Otro', title: 'Registro médico' },
];
export const DOC_TYPES: { id: DocType; label: string }[] = [
  { id: 'informe', label: 'Informe' },
  { id: 'orden', label: 'Orden' },
  { id: 'resultado', label: 'Resultado' },
  { id: 'receta', label: 'Receta' },
  { id: 'imagen', label: 'Imagen' },
  { id: 'otro', label: 'Otro' },
];
export const CONTACT_KINDS: { id: ContactKind; label: string }[] = [
  { id: 'doctor', label: 'Doctor' },
  { id: 'clinica', label: 'Clínica' },
  { id: 'laboratorio', label: 'Laboratorio' },
  { id: 'otro', label: 'Otro' },
];

export type ExamFile = { id: string; examId: string; name: string; mime: string; size: number | null; path: string; docType: DocType };
export type Exam = {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  kind: ExamKind;
  place: string;
  doctor: string;
  results: string;
  notes: string;
  createdAt: string;
  files: ExamFile[];
};
export type ExamInput = Omit<Exam, 'id' | 'createdAt' | 'files'>;

export type Contact = {
  id: string;
  kind: ContactKind;
  name: string;
  specialty: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
};
export type ContactInput = Omit<Contact, 'id'>;

const LOCAL_KEY = 'desj:health:v1';
type LocalState = { exams: Exam[]; contacts: Contact[] };

const EXAM_COLS = 'id, title, exam_date, kind, place, doctor, results, notes, created_at';
const FILE_COLS = 'id, exam_id, name, mime, size, storage_path, doc_type';
const CONTACT_COLS = 'id, kind, name, specialty, phone, email, address, notes';

type ExamRow = { id: string; title: string; exam_date: string; kind: ExamKind; place: string; doctor: string; results: string; notes: string; created_at: string };
type FileRow = { id: string; exam_id: string; name: string; mime: string; size: number | null; storage_path: string; doc_type: DocType };

const fileFromRow = (r: FileRow): ExamFile => ({ id: r.id, examId: r.exam_id, name: r.name, mime: r.mime, size: r.size, path: r.storage_path, docType: r.doc_type });
const examFromRow = (r: ExamRow, files: ExamFile[]): Exam => ({
  id: r.id,
  title: r.title,
  date: r.exam_date,
  kind: r.kind,
  place: r.place,
  doctor: r.doctor,
  results: r.results,
  notes: r.notes,
  createdAt: r.created_at,
  files: files.filter((f) => f.examId === r.id),
});
const examToRow = (e: ExamInput) => ({
  title: (e.title.trim() || EXAM_KINDS.find((k) => k.id === e.kind)!.title).slice(0, 200),
  exam_date: e.date,
  kind: e.kind,
  place: e.place.trim(),
  doctor: e.doctor.trim(),
  results: e.results.trim(),
  notes: e.notes.trim(),
});
const clean = (c: ContactInput): ContactInput => ({
  kind: c.kind,
  name: c.name.trim().slice(0, 200),
  specialty: c.specialty.trim(),
  phone: c.phone.trim(),
  email: c.email.trim(),
  address: c.address.trim(),
  notes: c.notes.trim(),
});

/** Más reciente primero; a igual fecha, el último cargado primero. */
export const byDate = (a: Exam, b: Exam) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);

async function readLocal(): Promise<LocalState> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_KEY);
    return raw ? { exams: [], contacts: [], ...JSON.parse(raw) } : { exams: [], contacts: [] };
  } catch {
    return { exams: [], contacts: [] };
  }
}

export function useHealth() {
  const { session } = useAuth();
  const cloud = Boolean(session);
  const userId = session?.user.id ?? null;
  const [exams, setExams] = useState<Exam[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    if (cloud) {
      const [e, f, c] = await Promise.all([
        supabase.from('health_exams').select(EXAM_COLS).order('exam_date', { ascending: false }).limit(500),
        supabase.from('health_exam_files').select(FILE_COLS).order('created_at').limit(2000),
        supabase.from('health_contacts').select(CONTACT_COLS).order('name').limit(300),
      ]);
      const files = (f.data ?? []).map(fileFromRow);
      if (e.data) setExams(e.data.map((r) => examFromRow(r, files)).sort(byDate));
      if (c.data) setContacts(c.data);
    } else {
      const local = await readLocal();
      setExams([...local.exams].sort(byDate));
      setContacts(local.contacts);
    }
    setReady(true);
  }, [cloud]);

  const saveLocal = async (patch: Partial<LocalState>) => {
    const next = { ...(await readLocal()), ...patch };
    await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(next));
    setExams([...next.exams].sort(byDate));
    setContacts(next.contacts);
  };

  /** Crea o edita un examen. Devuelve su id, o null si no se pudo guardar. */
  const saveExam = async (input: ExamInput, id?: string): Promise<string | null> => {
    if (cloud) {
      const row = examToRow(input);
      const res = id
        ? await supabase.from('health_exams').update(row).eq('id', id).select(EXAM_COLS).single()
        : await supabase.from('health_exams').insert(row).select(EXAM_COLS).single();
      if (res.error || !res.data) return null;
      const saved = res.data;
      setExams((list) => {
        const files = list.find((x) => x.id === saved.id)?.files ?? [];
        return [...list.filter((x) => x.id !== saved.id), { ...examFromRow(saved, []), files }].sort(byDate);
      });
      return saved.id;
    }
    const local = await readLocal();
    const row = examToRow(input);
    const base = { title: row.title, date: row.exam_date, kind: row.kind, place: row.place, doctor: row.doctor, results: row.results, notes: row.notes };
    if (id) {
      await saveLocal({ exams: local.exams.map((x) => (x.id === id ? { ...x, ...base } : x)) });
      return id;
    }
    const exam: Exam = { ...base, id: `e${Date.now()}`, createdAt: new Date().toISOString(), files: [] };
    await saveLocal({ exams: [exam, ...local.exams] });
    return exam.id;
  };

  /** Borra el examen y sus archivos de Storage. */
  const removeExam = async (id: string) => {
    const exam = exams.find((x) => x.id === id);
    setExams((list) => list.filter((x) => x.id !== id));
    if (cloud) {
      if (exam?.files.length) await supabase.storage.from('documentos').remove(exam.files.map((f) => f.path));
      await supabase.from('health_exams').delete().eq('id', id);
    } else {
      const local = await readLocal();
      await saveLocal({ exams: local.exams.filter((x) => x.id !== id) });
    }
  };

  /** Sube un archivo al registro. Lanza Error con un mensaje para la persona. */
  const addFile = async (examId: string, a: Attachment, docType: DocType = 'otro') => {
    if (!cloud || !userId) throw new Error('Para guardar archivos necesitas iniciar sesión (nube).');
    const safe = a.name.normalize('NFKD').replace(/[^\w.-]+/g, '_').slice(-80);
    const path = `${userId}/salud/${examId}/${Date.now()}-${safe}`;
    const body = await (await fetch(a.uri)).arrayBuffer();
    const up = await supabase.storage.from('documentos').upload(path, body, { contentType: a.mimeType });
    if (up.error) throw new Error('No pude subir el archivo. Revisa tu conexión.');
    const { data, error } = await supabase
      .from('health_exam_files')
      .insert({ exam_id: examId, name: a.name.slice(0, 200), mime: a.mimeType, size: a.size ?? body.byteLength, storage_path: path, doc_type: docType })
      .select(FILE_COLS)
      .single();
    if (error || !data) {
      await supabase.storage.from('documentos').remove([path]);
      throw new Error('No pude guardar el archivo.');
    }
    const file = fileFromRow(data);
    setExams((list) => list.map((x) => (x.id === examId ? { ...x, files: [...x.files, file] } : x)));
  };

  const removeFile = async (file: ExamFile) => {
    setExams((list) => list.map((x) => (x.id === file.examId ? { ...x, files: x.files.filter((f) => f.id !== file.id) } : x)));
    await supabase.storage.from('documentos').remove([file.path]);
    await supabase.from('health_exam_files').delete().eq('id', file.id);
  };

  /** Enlace temporal (10 min) para ver el archivo; con `download`, el navegador lo descarga con su nombre. */
  const fileUrl = useCallback(async (file: ExamFile, download = false) => {
    const { data } = await supabase.storage.from('documentos').createSignedUrl(file.path, 600, download ? { download: file.name } : undefined);
    return data?.signedUrl ?? null;
  }, []);

  const saveContact = async (input: ContactInput, id?: string) => {
    const row = clean(input);
    if (!row.name) return false;
    if (cloud) {
      const res = id
        ? await supabase.from('health_contacts').update(row).eq('id', id).select(CONTACT_COLS).single()
        : await supabase.from('health_contacts').insert(row).select(CONTACT_COLS).single();
      if (res.error || !res.data) return false;
      const saved = res.data;
      setContacts((list) => [...list.filter((x) => x.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)));
      return true;
    }
    const local = await readLocal();
    const next = id ? local.contacts.map((x) => (x.id === id ? { ...x, ...row } : x)) : [...local.contacts, { ...row, id: `c${Date.now()}` }];
    await saveLocal({ contacts: next.sort((a, b) => a.name.localeCompare(b.name)) });
    return true;
  };

  const removeContact = async (id: string) => {
    setContacts((list) => list.filter((x) => x.id !== id));
    if (cloud) await supabase.from('health_contacts').delete().eq('id', id);
    else await saveLocal({ contacts: (await readLocal()).contacts.filter((x) => x.id !== id) });
  };

  return { cloud, ready, exams, contacts, reload, saveExam, removeExam, addFile, removeFile, fileUrl, saveContact, removeContact };
}
