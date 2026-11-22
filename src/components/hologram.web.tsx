// Holograma 3D del módulo YO en web: un cuerpo humano (modelo .glb en public/modelos/) con efecto holograma,
// hecho con three.js (src/lib/hologram-scene.ts, que se descarga aparte al abrir YO). Gira despacio y se puede
// girar arrastrando. Se pausa fuera de vista y queda quieto con ANIM en OFF o "Reducir movimiento".
// Si el navegador no tiene WebGL o el modelo no carga, se muestra la armadura de siempre (SuitCore).
import { useEffect, useRef, useState } from 'react';

import { SUIT_RATIO, SuitCore } from '@/components/suit-core';
import type { HologramController } from '@/lib/hologram-scene';
import { useMotion } from '@/lib/motion';
import { C } from '@/theme';

/** Proporción ancho / alto del lienzo (la misma de la armadura, así el diseño de YO no cambia). */
export const HOLOGRAM_RATIO = SUIT_RATIO;
const MODEL_URL = '/modelos/holograma-hombre.glb';

export function Hologram({ height, active = true }: { height: number; active?: boolean }) {
  const width = Math.round(height * HOLOGRAM_RATIO);
  const canvas = useRef<HTMLCanvasElement>(null);
  const ctl = useRef<HologramController | null>(null);
  const [failed, setFailed] = useState(false);
  const { still } = useMotion();
  const running = active && !still;
  // Lo que el efecto de creación necesita leer sin volver a crearse.
  const latest = useRef({ width, height, running });
  useEffect(() => {
    latest.current = { width, height, running };
  });

  useEffect(() => {
    const el = canvas.current;
    if (!el || failed) return;
    let cancelled = false;
    import('@/lib/hologram-scene')
      .then(({ createHologram }) => {
        if (cancelled) return;
        const { width: w, height: h, running: on } = latest.current;
        ctl.current = createHologram(el, {
          modelUrl: MODEL_URL,
          color: C.hologram,
          glint: C.text,
          background: C.bg,
          width: w,
          height: h,
          onError: () => setFailed(true),
        });
        ctl.current.setRunning(on);
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      ctl.current?.dispose();
      ctl.current = null;
    };
  }, [failed]);

  useEffect(() => {
    ctl.current?.setRunning(running);
  }, [running]);

  useEffect(() => {
    ctl.current?.resize(width, height);
  }, [width, height]);

  if (failed) return <SuitCore height={height} active={active} />;
  return <canvas ref={canvas} style={{ width, height, display: 'block', touchAction: 'pan-y', cursor: 'grab' }} />;
}
