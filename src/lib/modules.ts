// Módulos (pestaña MÓDULOS): cada persona agrega, quita y ordena módulos de un CATÁLOGO cerrado. Cada tipo
// tiene su propia vista y sus datos: hoy Negocios (uno por persona), Vehículo (uno por carro o moto, con su
// ficha, mantenimientos y papeles en lib/vehicles.ts) NO MORE (uno por persona, con PIN; lib/nomore.ts)
// y TO BUY (lista de compras con categorías; lib/tobuy.ts).
// - Con sesión: viven en Supabase (privados por usuario). DESJ los ve desde el chat.
// - Sin nube: viven en el teléfono; la primera vez se arranca con Negocios.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useState } from 'react';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export type ModuleKind = 'negocios' | 'vehiculo' | 'nomore' | 'tobuy';

/** El catálogo: lo que se puede agregar. `multiple`: se puede tener más de uno (un vehículo por carro). */
export const CATALOG: { kind: ModuleKind; label: string; description: string; multiple: boolean }[] = [
  { kind: 'negocios', label: 'Negocios', description: 'Ganadería, legal y mercado de tus negocios.', multiple: false },
  {
    kind: 'vehiculo',
    label: 'Vehículo',
    description: 'Ficha, kilometraje, mantenimientos con aviso del próximo, y papeles (seguro, revisión, título) con su vencimiento.',
    multiple: true,
  },
  {
    kind: 'nomore',
    label: 'No more',
    description: 'Cuenta los días sin lo que estás dejando (fumar, alcohol, lujuria…), con mensajes de aliento y versículos. Protegido con PIN.',
    multiple: false,
  },
  {
    kind: 'tobuy',
    label: 'To buy',
    description: 'Lista de compras por categorías: marcas lo que compraste y queda en Completado.',
    multiple: false,
  },
];
export const catalogOf = (kind: ModuleKind) => CATALOG.find((c) => c.kind === kind)!;

export type Module = { id: string; kind: ModuleKind; name: string; description: string; position: number };

const LOCAL_KEY = 'desj:modules:v1';
const START: Module[] = [{ id: 'm-negocios', kind: 'negocios', name: 'Negocios', description: '', position: 0 }];
const MODULE_COLS = 'id, kind, name, description, position';
const known = (m: { kind: string }) => CATALOG.some((c) => c.kind === m.kind);

async function readLocal(): Promise<Module[]> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_KEY);
    // Copias viejas guardaban { modules, entries } con tipos que ya no existen: se quedan solo los del catálogo.
    if (raw) return ((JSON.parse(raw).modules ?? []) as Module[]).filter(known);
  } catch {
    // sin copia local
  }
  return START;
}

const writeLocal = (modules: Module[]) => AsyncStorage.setItem(LOCAL_KEY, JSON.stringify({ modules }));

export function useModules() {
  const { session } = useAuth();
  const cloud = Boolean(session);
  const [modules, setModules] = useState<Module[]>([]);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    if (cloud) {
      const { data } = await supabase.from('modules').select(MODULE_COLS).order('position').order('created_at');
      if (data) setModules((data as Module[]).filter(known));
    } else {
      setModules([...(await readLocal())].sort((a, b) => a.position - b.position));
    }
    setReady(true);
  }, [cloud]);

  /** Agrega un módulo del catálogo. Devuelve su id, o null si no se pudo. */
  const addModule = async (kind: ModuleKind, name: string): Promise<string | null> => {
    const entry = catalogOf(kind);
    if (!entry.multiple && modules.some((m) => m.kind === kind)) return modules.find((m) => m.kind === kind)!.id;
    const row = { kind, name: (name.trim() || entry.label).slice(0, 80), description: '', position: modules.reduce((max, m) => Math.max(max, m.position + 1), 0) };
    if (cloud) {
      const { data, error } = await supabase.from('modules').insert(row).select(MODULE_COLS).single();
      if (error || !data) return null;
      setModules((list) => [...list, data as Module]);
      return data.id;
    }
    const mod: Module = { ...row, id: `m${Date.now()}` };
    const next = [...modules, mod];
    setModules(next);
    await writeLocal(next);
    return mod.id;
  };

  const rename = async (id: string, name: string) => {
    const clean = name.trim().slice(0, 80);
    if (!clean) return false;
    const next = modules.map((m) => (m.id === id ? { ...m, name: clean } : m));
    setModules(next);
    if (cloud) {
      const { error } = await supabase.from('modules').update({ name: clean }).eq('id', id);
      if (error) {
        setModules(modules);
        return false;
      }
    } else await writeLocal(next);
    return true;
  };

  /** Quita el módulo y todo lo que tiene adentro (ficha, mantenimientos, papeles; en NO MORE, PIN y contadores). */
  const removeModule = async (id: string) => {
    const next = modules.filter((m) => m.id !== id);
    setModules(next);
    if (cloud) {
      const { data: docs } = await supabase.from('vehicle_documents').select('storage_path').eq('module_id', id).not('storage_path', 'is', null);
      const paths = (docs ?? []).map((d) => d.storage_path as string);
      if (paths.length) await supabase.storage.from('documentos').remove(paths);
      await supabase.from('modules').delete().eq('id', id);
    } else {
      await writeLocal(next);
      await AsyncStorage.multiRemove([`desj:vehicle:${id}`, `desj:nomore:${id}`, `desj:tobuy:${id}`]);
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
    } else await writeLocal(next);
  };

  return { cloud, ready, modules, reload, addModule, rename, removeModule, move };
}
