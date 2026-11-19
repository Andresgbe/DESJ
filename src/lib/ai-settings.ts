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
const DEFAULTS: AiSettings = { model: 'gemini-3.8-flash', effort: 'MEDIUM' };

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
