// Tasas de cambio de Venezuela, del lado del servidor (Edge Functions `tasas` y `chat`, y el worker local).
// - DolarAPI (https://ve.dolarapi.com): BCV, paralelo y euro oficial, en bolívares por unidad.
// - Binance P2P: USDT/VES, promedio de los 5 primeros anuncios de venta (mismo método que cc-sacramento).
//   Binance no permite llamadas desde el navegador (sin CORS), por eso esto vive en el servidor.
// Todo se devuelve como "cuántas unidades equivalen a 1 dólar BCV", que es como se guardan las tasas.
// Sin dependencias de Deno: el worker lo importa directo con Node. La app tiene su respaldo en src/lib/dolar-api.ts.
const DOLAR_API = 'https://ve.dolarapi.com/v1';
const BINANCE_P2P = 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search';

type Quote = { fuente?: string; promedio?: number };

export type FetchedRates = { bcv: number | null; eur: number | null; cash: number | null; usdt: number | null };

/** Código de tasa guardada → valor traído. */
export const RATE_CODE_MAP: Record<string, keyof FetchedRates> = { BCV: 'bcv', EUR: 'eur', CASH: 'cash', USDT: 'usdt' };

const positive = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null);

/** Bolívares por USDT en Binance P2P; null si no responde. */
async function usdtBs(): Promise<number | null> {
  try {
    const res = await fetch(BINANCE_P2P, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asset: 'USDT', fiat: 'VES', tradeType: 'SELL', page: 1, rows: 5, payTypes: [] }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { adv?: { price?: string } }[] };
    const prices = (json.data ?? []).map((d) => Number(d.adv?.price)).filter((p) => Number.isFinite(p) && p > 0);
    return prices.length ? prices.reduce((s, p) => s + p, 0) / prices.length : null;
  } catch {
    return null;
  }
}

export async function fetchRates(): Promise<FetchedRates> {
  const [dolares, euro, usdt] = await Promise.all([
    fetch(`${DOLAR_API}/dolares`).then((r) => (r.ok ? (r.json() as Promise<Quote[]>) : [])),
    // Si el euro falla no se pierden las demás.
    fetch(`${DOLAR_API}/euros/oficial`)
      .then((r) => (r.ok ? (r.json() as Promise<Quote>) : null))
      .catch(() => null),
    usdtBs(),
  ]);
  const list = Array.isArray(dolares) ? dolares : [];
  const bcv = positive(list.find((q) => q.fuente === 'oficial')?.promedio);
  const paralelo = positive(list.find((q) => q.fuente === 'paralelo')?.promedio);
  const bsPorEuro = positive(euro?.promedio);
  const cash = bcv && paralelo ? bcv / paralelo : null; // < 1: el efectivo vale más que el dólar BCV
  return {
    bcv,
    eur: bcv && bsPorEuro ? bcv / bsPorEuro : null, // € por $ BCV (no al revés)
    cash,
    // Si Binance no responde, el USDT se cambia como el efectivo (al paralelo), como antes.
    usdt: bcv && usdt ? bcv / usdt : cash,
  };
}
