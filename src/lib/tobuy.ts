// Módulo TO BUY: lista de compras con categorías. Cada cosa: título, categoría opcional y check. Las compradas
// pasan a "Completado".
// - Con sesión: tablas tobuy_categories / tobuy_items (RLS, solo lo propio).
// - Sin nube: viven en el teléfono (desj:tobuy:<módulo>).
// La primera vez se siembran unas categorías de base que se pueden renombrar o borrar.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useState } from 'react';

import { useAuth } from '@/lib/auth';
import { CATEGORY_PALETTE } from '@/lib/finance';
import { supabase } from '@/lib/supabase';

export type BuyCategory = { id: string; name: string; color: string; position: number };
export type BuyItem = { id: string; title: string; category_id: string | null; done: boolean; done_at: string | null; created_at: string };
type LocalState = { categories: BuyCategory[]; items: BuyItem[] };

const CAT_COLS = 'id, name, color, position';
const ITEM_COLS = 'id, title, category_id, done, done_at, created_at';
const SEED = ['Supermercado', 'Farmacia', 'Hogar'];
export const PALETTE = CATEGORY_PALETTE;
const localKey = (moduleId: string) => `desj:tobuy:${moduleId}`;
const uid = () => `l${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
const byNewest = (a: BuyItem, b: BuyItem) => b.created_at.localeCompare(a.created_at);

async function readLocal(moduleId: string): Promise<LocalState | null> {
  try {
    const raw = await AsyncStorage.getItem(localKey(moduleId));
    if (raw) return { categories: [], items: [], ...JSON.parse(raw) };
  } catch {
    // sin copia local
  }
  return null;
}
const writeLocal = (moduleId: string, s: LocalState) => AsyncStorage.setItem(localKey(moduleId), JSON.stringify(s));

export function useToBuy(moduleId: string | undefined) {
  const { session } = useAuth();
  const cloud = Boolean(session);
  const [categories, setCategories] = useState<BuyCategory[]>([]);
  const [items, setItems] = useState<BuyItem[]>([]);
  const [ready, setReady] = useState(false);

  /** Guarda en el teléfono (modo local) con el estado nuevo. */
  const persist = async (next: Partial<LocalState>) => {
    if (cloud || !moduleId) return;
    const s = (await readLocal(moduleId)) ?? { categories: [], items: [] };
    await writeLocal(moduleId, { ...s, ...next });
  };

  const reload = useCallback(async () => {
    if (!moduleId) return;
    if (cloud) {
      let c = await supabase.from('tobuy_categories').select(CAT_COLS).eq('module_id', moduleId).order('position').order('created_at');
      if (!c.error && !c.data.length) {
        const { count } = await supabase.from('tobuy_items').select('id', { count: 'exact', head: true }).eq('module_id', moduleId);
        // Solo la primera vez (sin categorías ni cosas): si la persona borró todas, no vuelven.
        if (!count) {
          await supabase.from('tobuy_categories').insert(SEED.map((name, i) => ({ module_id: moduleId, name, color: PALETTE[i], position: i })));
          c = await supabase.from('tobuy_categories').select(CAT_COLS).eq('module_id', moduleId).order('position').order('created_at');
        }
      }
      const i = await supabase.from('tobuy_items').select(ITEM_COLS).eq('module_id', moduleId).order('created_at', { ascending: false }).limit(1000);
      if (c.error || i.error) throw new Error('No pude cargar tu lista. Revisa tu conexión.');
      setCategories(c.data as BuyCategory[]);
      setItems(i.data as BuyItem[]);
    } else {
      let s = await readLocal(moduleId);
      if (!s) {
        s = { categories: SEED.map((name, i) => ({ id: uid() + i, name, color: PALETTE[i], position: i })), items: [] };
        await writeLocal(moduleId, s);
      }
      setCategories([...s.categories].sort((a, b) => a.position - b.position));
      setItems([...s.items].sort(byNewest));
    }
    setReady(true);
  }, [cloud, moduleId]);

  // ---------------------------------------------------------------- cosas

  const addItem = async (title: string, categoryId: string | null) => {
    if (!moduleId || !title.trim()) return false;
    const row = { title: title.trim().slice(0, 200), category_id: categoryId };
    if (cloud) {
      const { data, error } = await supabase.from('tobuy_items').insert({ ...row, module_id: moduleId }).select(ITEM_COLS).single();
      if (error || !data) return false;
      setItems((list) => [data as BuyItem, ...list]);
      return true;
    }
    const next = [{ ...row, id: uid(), done: false, done_at: null, created_at: new Date().toISOString() }, ...items];
    setItems(next);
    await persist({ items: next });
    return true;
  };

  /** Cambia una cosa (título, categoría o check). Optimista: si falla, vuelve atrás. */
  const updateItem = async (id: string, patch: Partial<Pick<BuyItem, 'title' | 'category_id' | 'done'>>) => {
    const before = items;
    const full = { ...patch, ...(patch.done !== undefined ? { done_at: patch.done ? new Date().toISOString() : null } : {}) };
    const next = items.map((x) => (x.id === id ? { ...x, ...full } : x));
    setItems(next);
    if (cloud) {
      const { error } = await supabase.from('tobuy_items').update(full).eq('id', id);
      if (error) {
        setItems(before);
        return false;
      }
    } else await persist({ items: next });
    return true;
  };

  const removeItems = async (ids: string[]) => {
    const next = items.filter((x) => !ids.includes(x.id));
    setItems(next);
    if (cloud) await supabase.from('tobuy_items').delete().in('id', ids);
    else await persist({ items: next });
  };

  // ---------------------------------------------------------------- categorías

  const addCategory = async (name: string) => {
    if (!moduleId || !name.trim()) return false;
    const row = { name: name.trim().slice(0, 60), color: PALETTE[categories.length % PALETTE.length], position: categories.reduce((m, c) => Math.max(m, c.position + 1), 0) };
    if (cloud) {
      const { data, error } = await supabase.from('tobuy_categories').insert({ ...row, module_id: moduleId }).select(CAT_COLS).single();
      if (error || !data) return false;
      setCategories((list) => [...list, data as BuyCategory]);
      return true;
    }
    const next = [...categories, { ...row, id: uid() }];
    setCategories(next);
    await persist({ categories: next });
    return true;
  };

  const updateCategory = async (id: string, patch: Partial<Pick<BuyCategory, 'name' | 'color'>>) => {
    const before = categories;
    const next = categories.map((c) => (c.id === id ? { ...c, ...patch } : c));
    setCategories(next);
    if (cloud) {
      const { error } = await supabase.from('tobuy_categories').update(patch).eq('id', id);
      if (error) {
        setCategories(before);
        return false;
      }
    } else await persist({ categories: next });
    return true;
  };

  /** Borra la categoría; sus cosas quedan "Sin categoría". */
  const removeCategory = async (id: string) => {
    const nextCats = categories.filter((c) => c.id !== id);
    const nextItems = items.map((x) => (x.category_id === id ? { ...x, category_id: null } : x));
    setCategories(nextCats);
    setItems(nextItems);
    if (cloud) await supabase.from('tobuy_categories').delete().eq('id', id);
    else await persist({ categories: nextCats, items: nextItems });
  };

  return { cloud, ready, categories, items, reload, addItem, updateItem, removeItems, addCategory, updateCategory, removeCategory };
}
