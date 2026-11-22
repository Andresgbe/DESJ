// "Ocultar montos": cambia los montos de dinero por •••• (Finanzas, Inversiones y donde se use `money`).
// Se guarda en este dispositivo, como el interruptor de animaciones.
import '@/lib/local-storage';

import { useSyncExternalStore } from 'react';

const KEY = 'desj.ocultarMontos';
export const HIDDEN_AMOUNT = '••••';

function read() {
  try {
    return localStorage.getItem(KEY) === 'si';
  } catch {
    return false;
  }
}

let hidden = read();
const listeners = new Set<() => void>();

export const amountsHidden = () => hidden;

export function setAmountsHidden(on: boolean) {
  hidden = on;
  try {
    localStorage.setItem(KEY, on ? 'si' : 'no');
  } catch {
    // sin almacenamiento: vale solo para esta sesión
  }
  listeners.forEach((l) => l());
}

/** Estado actual; la pantalla que lo usa se vuelve a dibujar al cambiarlo (y con ella todos sus montos). */
export function useAmountsHidden() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    amountsHidden,
    amountsHidden,
  );
}
