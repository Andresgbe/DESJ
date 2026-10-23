// Edge Function `tasas`: tasas de hoy para Finanzas (BCV, euro, dólar efectivo y USDT), como "cuántas
// unidades equivalen a 1 dólar BCV". La app la llama al tocar "Cargar las tasas de hoy" / "Actualizar del BCV":
// el USDT sale de Binance P2P, que no deja llamarse desde el navegador. No lee ni escribe la base de datos:
// la app guarda las tasas en las filas de la persona (RLS). Pide sesión (verify_jwt) para no ser un proxy abierto.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { fetchRates } from '../_shared/dolar.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const rates = await fetchRates();
    return new Response(JSON.stringify(rates), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ error: 'No pude traer las tasas de hoy.' }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
