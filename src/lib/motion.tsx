// Interruptor de animaciones de DESJ. Con las animaciones en OFF el cerebro y la red de fondo quedan
// estáticos: se dibujan una vez y no hay bucle por cuadro (menos CPU, batería y memoria).
// Se guarda en este dispositivo y se suma a "Reducir movimiento" del sistema.
import '@/lib/local-storage';

import { createContext, ReactNode, useContext, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

const KEY = 'desj.animaciones';

function readSaved() {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

type Ctx = { animations: boolean; setAnimations: (on: boolean) => void };
const MotionCtx = createContext<Ctx>({ animations: true, setAnimations: () => {} });

export function MotionProvider({ children }: { children: ReactNode }) {
  const [animations, set] = useState(readSaved);
  const setAnimations = (on: boolean) => {
    set(on);
    try {
      localStorage.setItem(KEY, on ? 'on' : 'off');
    } catch {
      // sin almacenamiento: vale solo para esta sesión
    }
  };
  return <MotionCtx.Provider value={{ animations, setAnimations }}>{children}</MotionCtx.Provider>;
}

/** `still`: no animar nada (interruptor en OFF o "Reducir movimiento" activado). */
export function useMotion() {
  const ctx = useContext(MotionCtx);
  const reduced = useReducedMotion();
  return { ...ctx, still: !ctx.animations || reduced };
}
