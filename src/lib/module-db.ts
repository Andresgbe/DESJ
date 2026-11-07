// Tablas de un módulo con los dos modos de la app, para módulos sencillos (Universidad, Horarios):
// - Con sesión: Supabase (RLS, solo lo propio). Las tablas que cuelgan del módulo se filtran por module_id; las
//   hijas (notas, clases, bloques) solo por RLS, porque hay un módulo de cada tipo por persona.
// - Sin nube: un objeto { tabla: filas[] } en el teléfono (desj:<key>:<módulo>).
// Al borrar algo con hijas, la nube las borra en cascada; en el teléfono hay que pasarlas a `remove` también.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useState } from 'react';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export type Row = { id: string };
export type TableSpec = { cols: string; byModule: boolean; order: string; normalize?: (r: Record<string, unknown>) => Record<string, unknown> };

const uid = () => `l${Date.now()}${Math.random().toString(36).slice(2, 7)}`;

export function useModuleDb<S extends Record<string, Row[]>>(moduleId: string | undefined, key: string, specs: { [K in keyof S]: TableSpec }) {
  const { session } = useAuth();
  const cloud = Boolean(session);
  const empty = () => Object.fromEntries(Object.keys(specs).map((t) => [t, []])) as unknown as S;
  const [data, setData] = useState<S>(empty);
  const [ready, setReady] = useState(false);
  const localKey = `desj:${key}:${moduleId}`;

  const readLocal = useCallback(async (): Promise<S> => {
    try {
      const raw = await AsyncStorage.getItem(localKey);
      if (raw) return { ...empty(), ...JSON.parse(raw) };
    } catch {
      // sin copia local
    }
    return empty();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- specs es fijo por módulo
  }, [localKey]);

  /** Recarga todo. Devuelve los datos cargados (para sembrar lo inicial si hace falta), o null si aún no se sabe el módulo. */
  const reload = useCallback(async (): Promise<S | null> => {
    if (!moduleId) return null;
    let next: S;
    if (cloud) {
      const entries = await Promise.all(
        Object.entries(specs).map(async ([table, spec]) => {
          let q = supabase.from(table).select(spec.cols);
          if (spec.byModule) q = q.eq('module_id', moduleId);
          const { data: rows, error } = await q.order(spec.order).order('created_at').limit(2000);
          if (error) throw new Error('No pude cargar el módulo. Revisa tu conexión.');
          const list = (rows ?? []) as unknown as Record<string, unknown>[];
          return [table, spec.normalize ? list.map(spec.normalize) : list] as const;
        }),
      );
      next = Object.fromEntries(entries) as unknown as S;
    } else next = await readLocal();
    setData(next);
    setReady(true);
    return next;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- specs es fijo por módulo
  }, [cloud, moduleId, readLocal]);

  const saveLocal = async (fn: (s: S) => S) => {
    const next = fn(await readLocal());
    await AsyncStorage.setItem(localKey, JSON.stringify(next));
    setData(next);
  };

  /** Crea una fila. Las que cuelgan del módulo reciben module_id solas. Devuelve la fila guardada o null. */
  const insert = async <K extends keyof S & string>(table: K, row: Omit<S[K][number], 'id'>): Promise<S[K][number] | null> => {
    if (!moduleId) return null;
    const spec = specs[table];
    if (cloud) {
      const { data: saved, error } = await supabase
        .from(table)
        .insert({ ...row, ...(spec.byModule ? { module_id: moduleId } : {}) })
        .select(spec.cols)
        .single();
      if (error || !saved) return null;
      const clean = (spec.normalize ? spec.normalize(saved as unknown as Record<string, unknown>) : saved) as unknown as S[K][number];
      setData((d) => ({ ...d, [table]: [...d[table], clean] }));
      return clean;
    }
    const saved = { ...row, id: uid(), created_at: new Date().toISOString() } as unknown as S[K][number];
    await saveLocal((s) => ({ ...s, [table]: [...s[table], saved] }));
    return saved;
  };

  /** Cambia una fila. Optimista: si la nube falla, vuelve atrás y devuelve false. */
  const update = async <K extends keyof S & string>(table: K, id: string, patch: Partial<S[K][number]>) => {
    const before = data;
    const apply = (s: S) => ({ ...s, [table]: s[table].map((r) => (r.id === id ? { ...r, ...patch } : r)) });
    if (cloud) {
      setData(apply);
      const { error } = await supabase.from(table).update(patch as never).eq('id', id);
      if (error) {
        setData(before);
        return false;
      }
      return true;
    }
    await saveLocal(apply);
    return true;
  };

  /** Cambia varias filas de una tabla de una vez (p. ej. el orden). En el teléfono se guarda una sola vez. */
  const updateMany = async <K extends keyof S & string>(table: K, changes: { id: string; patch: Partial<S[K][number]> }[]) => {
    if (!changes.length) return;
    const apply = (s: S) => ({ ...s, [table]: s[table].map((r) => ({ ...r, ...changes.find((c) => c.id === r.id)?.patch })) });
    if (cloud) {
      setData(apply);
      await Promise.all(changes.map((c) => supabase.from(table).update(c.patch as never).eq('id', c.id)));
    } else await saveLocal(apply);
  };

  /** Borra filas de una o varias tablas: { tabla: [ids] }. */
  const remove = async (ids: { [K in keyof S]?: string[] }) => {
    const apply = (s: S) => {
      const next = { ...s };
      for (const [t, list] of Object.entries(ids) as [keyof S, string[]][]) next[t] = s[t].filter((r) => !list.includes(r.id)) as S[keyof S];
      return next;
    };
    if (cloud) {
      setData(apply);
      for (const [t, list] of Object.entries(ids) as [string, string[]][]) if (list.length) await supabase.from(t).delete().in('id', list);
    } else await saveLocal(apply);
  };

  return { cloud, ready, data, reload, insert, update, updateMany, remove };
}
