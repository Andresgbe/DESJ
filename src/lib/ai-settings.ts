// Modelo de IA y nivel de esfuerzo con que responde DESJ. Se guardan en este dispositivo y van con cada
// mensaje a la Edge Function `chat`, que solo acepta los valores de esta lista (los mismos están allá).
import '@/lib/local-storage';

import { useSyncExternalStore } from 'react';

export const AI_MODELS = [
  { id: 'gemini-3.5-flash-lite', label: 'Rápido', sub: 'Flash-Lite · el más barato' },
  { id: 'gemini-3.8-flash', label: 'Equilibrado', sub: 'Flash · el de siempre' },
  { id: 'gemini-3.1-pro-preview', label: 'Avanzado', sub: 'Pro · el más capaz y caro' },
] as const;

export const AI_EFFORTS = [
  { id: 'LOW', label: 'Bajo', sub: 'Responde más rápido' },
  { id: 'MEDIUM', label: 'Medio', sub: 'Equilibrado' },
  { id: 'HIGH', label: 'Alto', sub: 'Piensa más; tarda y cuesta más' },
] as const;

export type AiSettings = { model: (typeof AI_MODELS)[number]['id']; effort: (typeof AI_EFFORTS)[number]['id'] };

const KEY = 'desj.ia';
const DEFAULTS: AiSettings = { model: 'gemini-3.8-flash', effort: 'LOW' };

function read(): AiSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<AiSettings>;
    return {
      model: AI_MODELS.find((m) => m.id === raw.model)?.id ?? DEFAULTS.model,
      effort: AI_EFFORTS.find((e) => e.id === raw.effort)?.id ?? DEFAULTS.effort,
    };
  } catch {
    return DEFAULTS;
  }
}

let current = read();
const listeners = new Set<() => void>();

export const getAiSettings = () => current;

export function setAiSettings(next: Partial<AiSettings>) {
  current = { ...current, ...next };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // sin almacenamiento: vale solo para esta sesión
  }
  listeners.forEach((l) => l());
}

export function useAiSettings() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getAiSettings,
    getAiSettings,
  );
}

/** Tope mensual cuando la persona no tiene fila en `ai_limits` (el mismo que usa la Edge Function). */
const DEFAULT_LIMIT_USD = 10;

/** Gasto estimado de IA del mes en curso (UTC) y el límite de la persona. `null` sin nube o sin sesión. */
export async function loadMonthSpend(): Promise<{ used: number; limit: number } | null> {
  const { cloudEnabled, supabase } = await import('@/lib/supabase');
  if (!cloudEnabled) return null;
  const { data: auth } = await supabase.auth.getSession();
  const userId = auth.session?.user.id;
  if (!userId) return null;
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const [rows, lim] = await Promise.all([
    supabase.from('ai_usage').select('cost_usd').eq('user_id', userId).gte('created_at', start),
    supabase.from('ai_limits').select('monthly_usd').eq('user_id', userId).maybeSingle(),
  ]);
  if (rows.error) return null;
  const used = (rows.data ?? []).reduce((sum, r) => sum + Number(r.cost_usd), 0);
  return { used, limit: lim.data ? Number(lim.data.monthly_usd) : DEFAULT_LIMIT_USD };
}
