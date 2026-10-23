// Tasas de cambio de hoy para Finanzas, como "cuántas unidades equivalen a 1 dólar BCV".
// - Con sesión: la Edge Function `tasas` (supabase/functions/_shared/dolar.ts), que también trae el USDT de
//   Binance P2P (Binance no deja llamarse desde el navegador).
// - Sin sesión, o si la función falla: DolarAPI directo (pública, sin llave, con CORS); el USDT se cambia
//   como el efectivo, al paralelo.
import { supabase } from '@/lib/supabase';

const BASE = 'https://ve.dolarapi.com/v1';

type Quote = { fuente?: string; promedio?: number };

export type FetchedRates = { bcv: number | null; eur: number | null; cash: number | null; usdt: number | null };

/** Código de tasa guardada → valor traído. */
export const RATE_CODE_MAP: Record<string, keyof FetchedRates> = { BCV: 'bcv', EUR: 'eur', CASH: 'cash', USDT: 'usdt' };

const positive = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null);

async function fromDolarApi(): Promise<FetchedRates> {
  const [dolares, euro] = await Promise.all([
    fetch(`${BASE}/dolares`).then((r) => (r.ok ? (r.json() as Promise<Quote[]>) : [])),
    // Si el euro falla no se pierden las demás.
    fetch(`${BASE}/euros/oficial`)
      .then((r) => (r.ok ? (r.json() as Promise<Quote>) : null))
      .catch(() => null),
  ]);
  const list = Array.isArray(dolares) ? dolares : [];
  const bcv = positive(list.find((q) => q.fuente === 'oficial')?.promedio);
  const paralelo = positive(list.find((q) => q.fuente === 'paralelo')?.promedio);
  const bsPorEuro = positive(euro?.promedio);
  const cash = bcv && paralelo ? bcv / paralelo : null; // < 1: el efectivo vale más que el dólar BCV
  return { bcv, eur: bcv && bsPorEuro ? bcv / bsPorEuro : null, cash, usdt: cash };
}

export async function fetchRates(cloud: boolean): Promise<FetchedRates> {
  if (cloud) {
    const { data, error } = await supabase.functions.invoke<FetchedRates>('tasas');
    if (!error && data && positive(data.bcv)) return data;
  }
  return fromDolarApi();
}
