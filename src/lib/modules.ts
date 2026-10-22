// Módulos (pestaña MÓDULOS): la lista que cada persona arma (Negocios, Vehículo, Hogar…) y los registros
// de cada uno. Negocios abre su vista propia; los demás son una bitácora (título, fecha opcional, detalle).
// - Con sesión: viven en Supabase (privados por usuario). DESJ los ve y puede anotar registros.
// - Sin nube: viven en el teléfono; la primera vez se arranca con Negocios.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useState } from 'react';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export type ModuleKind = 'negocios' | 'vehiculo' | 'hogar' | 'mascotas' | 'viajes' | 'documentos' | 'otro';

export const MODULE_KINDS: { id: ModuleKind; label: string; hint: string }[] = [
  { id: 'negocios', label: 'Negocios', hint: 'Ganadería, legal y mercado' },
  { id: 'vehiculo', label: 'Vehículo', hint: 'Mantenimientos, papeles, seguros' },
  { id: 'hogar', label: 'Hogar', hint: 'Servicios, reparaciones, pagos' },
  { id: 'mascotas', label: 'Mascotas', hint: 'Vacunas, veterinario, comida' },
  { id: 'viajes', label: 'Viajes', hint: 'Reservas, vuelos, itinerarios' },
  { id: 'documentos', label: 'Documentos', hint: 'Pasaporte, cédula, vencimientos' },
  { id: 'otro', label: 'Otro', hint: 'Lo que quieras llevar' },
];

export type Module = { id: string; kind: ModuleKind; name: string; description: string; position: number };
export type ModuleInput = { kind: ModuleKind; name: string; description: string };
export type Entry = { id: string; moduleId: string; title: string; date: string | null; details: string; createdAt: string };
export type EntryInput = { title: string; date: string | null; details: string };

const LOCAL_KEY = 'desj:modules:v1';
type LocalState = { modules: Module[]; entries: Entry[] };
const START: LocalState = { modules: [{ id: 'm-negocios', kind: 'negocios', name: 'Negocios', description: '', position: 0 }], entries: [] };

const MODULE_COLS = 'id, kind, name, description, position';
const ENTRY_COLS = 'id, module_id, title, entry_date, details, created_at';
type EntryRow = { id: string; module_id: string; title: string; entry_date: string | null; details: string; created_at: string };
const entryFromRow = (r: EntryRow): Entry => ({ id: r.id, moduleId: r.module_id, title: r.title, date: r.entry_date, details: r.details, createdAt: r.created_at });

/** Con fecha primero (la más reciente arriba); sin fecha, por cuándo se anotó. */
export const byEntryDate = (a: Entry, b: Entry) =>
  (b.date ?? b.createdAt.slice(0, 10)).localeCompare(a.date ?? a.createdAt.slice(0, 10)) || b.createdAt.localeCompare(a.createdAt);

async function readLocal(): Promise<LocalState> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_KEY);
    return raw ? { ...START, ...JSON.parse(raw) } : START;
  } catch {
    return START;
  }
}

export function useModules() {
  const { session } = useAuth();
  const cloud = Boolean(session);
  const [modules, setModules] = useState<Module[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    if (cloud) {
      const [m, e] = await Promise.all([
        supabase.from('modules').select(MODULE_COLS).order('position').order('created_at'),
        supabase.from('module_entries').select(ENTRY_COLS).order('created_at', { ascending: false }).limit(2000),
      ]);
      if (m.data) setModules(m.data);
      if (e.data) setEntries(e.data.map(entryFromRow).sort(byEntryDate));
    } else {
      const local = await readLocal();
      setModules([...local.modules].sort((a, b) => a.position - b.position));
      setEntries([...local.entries].sort(byEntryDate));
    }
    setReady(true);
  }, [cloud]);

  const saveLocal = async (patch: Partial<LocalState>) => {
    const next = { ...(await readLocal()), ...patch };
    await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(next));
    setModules([...next.modules].sort((a, b) => a.position - b.position));
    setEntries([...next.entries].sort(byEntryDate));
  };

  /** Crea o edita un módulo. Devuelve su id, o null si no se pudo. */
  const saveModule = async (input: ModuleInput, id?: string): Promise<string | null> => {
    const row = { kind: input.kind, name: input.name.trim().slice(0, 80), description: input.description.trim() };
    if (!row.name) return null;
    const position = id ? undefined : modules.reduce((max, m) => Math.max(max, m.position + 1), 0);
    if (cloud) {
      const res = id
        ? await supabase.from('modules').update(row).eq('id', id).select(MODULE_COLS).single()
        : await supabase.from('modules').insert({ ...row, position }).select(MODULE_COLS).single();
      if (res.error || !res.data) return null;
      const saved = res.data;
      setModules((list) => [...list.filter((m) => m.id !== saved.id), saved].sort((a, b) => a.position - b.position));
      return saved.id;
    }
    const local = await readLocal();
    if (id) {
      await saveLocal({ modules: local.modules.map((m) => (m.id === id ? { ...m, ...row } : m)) });
      return id;
    }
    const mod: Module = { ...row, id: `m${Date.now()}`, position: position ?? 0 };
    await saveLocal({ modules: [...local.modules, mod] });
    return mod.id;
  };

  /** Quita el módulo y todos sus registros. */
  const removeModule = async (id: string) => {
    setModules((list) => list.filter((m) => m.id !== id));
    setEntries((list) => list.filter((e) => e.moduleId !== id));
    if (cloud) await supabase.from('modules').delete().eq('id', id);
    else {
      const local = await readLocal();
      await saveLocal({ modules: local.modules.filter((m) => m.id !== id), entries: local.entries.filter((e) => e.moduleId !== id) });
    }
  };

  /** Sube o baja un módulo un lugar en la lista. */
  const move = async (id: string, delta: -1 | 1) => {
    const list = [...modules];
    const i = list.findIndex((m) => m.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    const next = list.map((m, position) => ({ ...m, position }));
    setModules(next);
    if (cloud) {
      const changed = next.filter((m) => modules.find((x) => x.id === m.id)?.position !== m.position);
      await Promise.all(changed.map((m) => supabase.from('modules').update({ position: m.position }).eq('id', m.id)));
    } else {
      await saveLocal({ modules: next });
    }
  };

  const saveEntry = async (moduleId: string, input: EntryInput, id?: string) => {
    const row = { title: input.title.trim().slice(0, 200), entry_date: input.date, details: input.details.trim() };
    if (!row.title) return false;
    if (cloud) {
      const res = id
        ? await supabase.from('module_entries').update(row).eq('id', id).select(ENTRY_COLS).single()
        : await supabase.from('module_entries').insert({ ...row, module_id: moduleId }).select(ENTRY_COLS).single();
      if (res.error || !res.data) return false;
      const saved = entryFromRow(res.data);
      setEntries((list) => [...list.filter((e) => e.id !== saved.id), saved].sort(byEntryDate));
      return true;
    }
    const local = await readLocal();
    const base = { title: row.title, date: row.entry_date, details: row.details };
    const next = id
      ? local.entries.map((e) => (e.id === id ? { ...e, ...base } : e))
      : [...local.entries, { ...base, id: `r${Date.now()}`, moduleId, createdAt: new Date().toISOString() }];
    await saveLocal({ entries: next });
    return true;
  };

  const removeEntry = async (id: string) => {
    setEntries((list) => list.filter((e) => e.id !== id));
    if (cloud) await supabase.from('module_entries').delete().eq('id', id);
    else await saveLocal({ entries: (await readLocal()).entries.filter((e) => e.id !== id) });
  };

  return { cloud, ready, modules, entries, reload, saveModule, removeModule, move, saveEntry, removeEntry };
}
