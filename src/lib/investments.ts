// Módulo Inversiones: los aportes de cada mes (en qué, dónde y cuánto, en dólares). Solo es un registro:
// DESJ no da consejos de compra ni venta. Con sesión van en la tabla `investments` (RLS: cada quien lo suyo);
// sin nube, en el teléfono. Son de la persona, no del módulo: quitar el módulo no los borra.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useState } from 'react';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export type Investment = { id: string; month: string; asset: string; platform: string; amount_usd: number; note: string; created_at: string };
export type InvestmentInput = Pick<Investment, 'month' | 'asset' | 'platform' | 'amount_usd' | 'note'>;

const COLS = 'id, month, asset, platform, amount_usd, note, created_at';
const LOCAL_KEY = 'desj:investments:v1';

/** La base guarda el mes como fecha (YYYY-MM-01); la app lo usa como YYYY-MM. */
const norm = (r: Record<string, unknown>): Investment => ({
  id: String(r.id),
  month: String(r.month).slice(0, 7),
  asset: String(r.asset ?? ''),
  platform: String(r.platform ?? ''),
  amount_usd: Number(r.amount_usd),
  note: String(r.note ?? ''),
  created_at: String(r.created_at ?? ''),
});

const byRecent = (a: Investment, b: Investment) => b.month.localeCompare(a.month) || b.created_at.localeCompare(a.created_at);

async function readLocal(): Promise<Investment[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(LOCAL_KEY)) ?? '[]') as Investment[];
  } catch {
    return [];
  }
}

export function useInvestments() {
  const { session } = useAuth();
  const cloud = Boolean(session);
  const [items, setItems] = useState<Investment[]>([]);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    if (!cloud) {
      setItems((await readLocal()).sort(byRecent));
    } else {
      const { data, error } = await supabase.from('investments').select(COLS).order('month', { ascending: false }).order('created_at', { ascending: false });
      if (error) throw new Error('No pude cargar tus inversiones. Revisa tu conexión.');
      setItems(data.map(norm));
    }
    setReady(true);
  }, [cloud]);

  const save = async (input: InvestmentInput, id?: string) => {
    const row = { ...input, asset: input.asset.trim(), platform: input.platform.trim(), note: input.note.trim() };
    if (cloud) {
      const payload = { ...row, month: `${row.month}-01` };
      const res = id
        ? await supabase.from('investments').update(payload).eq('id', id).select(COLS).single()
        : await supabase.from('investments').insert(payload).select(COLS).single();
      if (res.error || !res.data) throw new Error('No pude guardar la inversión. Revisa tu conexión.');
      const saved = norm(res.data);
      setItems((list) => [...list.filter((x) => x.id !== saved.id), saved].sort(byRecent));
      return;
    }
    const list = await readLocal();
    const saved: Investment = id
      ? { ...list.find((x) => x.id === id)!, ...row }
      : { ...row, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, created_at: new Date().toISOString() };
    const next = [...list.filter((x) => x.id !== saved.id), saved].sort(byRecent);
    await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(next));
    setItems(next);
  };

  const remove = async (id: string) => {
    const before = items;
    setItems((list) => list.filter((x) => x.id !== id));
    if (cloud) {
      const { error } = await supabase.from('investments').delete().eq('id', id);
      if (error) {
        setItems(before);
        throw new Error('No pude borrar la inversión. Revisa tu conexión.');
      }
      return;
    }
    await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(before.filter((x) => x.id !== id)));
  };

  return { cloud, ready, items, reload, save, remove };
}

/** Total por mes (YYYY-MM) de los últimos `count` meses hasta `last`, del más viejo al más nuevo. */
export function monthlyTotals(items: Investment[], last: string, count = 12) {
  const [y, m] = last.split('-').map(Number);
  const months = Array.from({ length: count }, (_, i) => {
    const d = new Date(y, m - 1 - (count - 1 - i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  return months.map((month) => ({ month, total: items.filter((x) => x.month === month).reduce((s, x) => s + x.amount_usd, 0) }));
}

/** Total por activo, de mayor a menor, con su parte del total. */
export function byAsset(items: Investment[]) {
  const all = items.reduce((s, x) => s + x.amount_usd, 0);
  const map = new Map<string, number>();
  for (const x of items) map.set(x.asset, (map.get(x.asset) ?? 0) + x.amount_usd);
  return [...map.entries()].map(([asset, total]) => ({ asset, total, share: all ? total / all : 0 })).sort((a, b) => b.total - a.total);
}
