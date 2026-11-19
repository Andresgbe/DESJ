// Precios de Gemini (USD por millón de tokens) para estimar el gasto de cada persona. Fuente: página de precios de
// la Gemini API (leída el 19 nov 2026). Se usa el precio sin descuentos (sin caché ni búsquedas gratis): es un
// estimado algo por encima del real, para que el límite mensual nunca se quede corto.
type Price = { input: number; output: number };

const PRICES: Record<string, Price | ((now: Date) => Price)> = {
  'gemini-3.5-flash-lite': { input: 0.3, output: 2.5 },
  // Sube el 1 de enero de 2027.
  'gemini-3.8-flash': (now) => (now >= new Date('2027-01-01T00:00:00Z') ? { input: 1.5, output: 7.5 } : { input: 0.75, output: 3.75 }),
  'gemini-3.1-pro-preview': { input: 2, output: 12 },
};
const DEFAULT_PRICE: Price = { input: 2, output: 12 }; // modelo desconocido: se cobra como el más caro

/** Cada búsqueda de Google: $14 por 1.000 (las 5.000 gratis al mes no se descuentan). */
export const SEARCH_PRICE = 14 / 1000;

export type Usage = { input: number; output: number; searches: number };

export function costOf(model: string, u: Usage, now = new Date()) {
  const p = PRICES[model];
  const price = typeof p === 'function' ? p(now) : (p ?? DEFAULT_PRICE);
  return (u.input * price.input + u.output * price.output) / 1_000_000 + u.searches * SEARCH_PRICE;
}
