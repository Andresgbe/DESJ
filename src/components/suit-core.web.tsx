// Armadura holográfica del módulo YO en web: el modelo de suit-graph.ts en un <canvas> 2D.
// Avanza a 30 cuadros por segundo y queda quieta con `active={false}` o con las animaciones en OFF.
import { useEffect, useMemo, useRef } from 'react';

import { buildSuit, computeSuitFrame, type Pt, type SuitFrame } from '@/components/suit-graph';
import { useMotion } from '@/lib/motion';
import { C } from '@/theme';

export type SuitCoreProps = { height: number; active?: boolean };

/** Proporción ancho / alto del lienzo de la figura. */
export const SUIT_RATIO = 0.62;
const STEP = 1 / 30 - 0.002;

function lines(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  ctx.beginPath();
  for (let i = 0; i + 1 < pts.length; i += 2) {
    ctx.moveTo(pts[i].x, pts[i].y);
    ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
  }
  ctx.stroke();
}

function draw(ctx: CanvasRenderingContext2D, w: number, h: number, f: SuitFrame) {
  ctx.clearRect(0, 0, w, h);
  const g = ctx.createRadialGradient(w / 2, h * 0.42, 0, w / 2, h * 0.42, w * 0.55);
  g.addColorStop(0, `${C.accent}33`);
  g.addColorStop(1, `${C.bg}00`);
  ctx.globalAlpha = 1;
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  ctx.lineCap = 'round';
  const stroke = (color: string, alpha: number, width: number, pts: Pt[]) => {
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = width * f.k;
    lines(ctx, pts);
  };
  stroke(C.accent, 0.5, 1, f.floor);
  stroke(C.accent, 0.16, 0.7, f.lines[0]);
  stroke(C.accentSoft, 0.55, 0.9, f.lines[1]);
  stroke(C.neuralCore, 0.95, 1.5, f.lines[2]);

  stroke(C.neuralCore, 0.85, 1.1, f.lines[3]);

  ctx.fillStyle = C.text;
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  for (const p of f.sparks) {
    ctx.moveTo(p.x + f.k, p.y);
    ctx.arc(p.x, p.y, f.k, 0, Math.PI * 2);
  }
  ctx.fill();

  if (f.reactor.alpha > 0.05) {
    ctx.shadowColor = C.neuralCore;
    ctx.shadowBlur = 14 * f.k;
    ctx.globalAlpha = f.reactor.alpha;
    ctx.fillStyle = C.neuralCore;
    ctx.beginPath();
    ctx.arc(f.reactor.x, f.reactor.y, f.reactor.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  if (f.glow.length) {
    ctx.shadowColor = C.neuralCore;
    ctx.shadowBlur = 8 * f.k;
    stroke(C.neuralCore, 0.8, 2.6, f.glow);
    ctx.shadowBlur = 0;
    stroke(C.text, 0.9, 1.1, f.glow);
  }
  if (f.eyes.length) {
    ctx.shadowColor = C.neuralCore;
    ctx.shadowBlur = 10 * f.k;
    stroke(C.text, 0.4 + 0.6 * f.facing, 2, f.eyes);
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
}

export function SuitCore({ height, active = true }: SuitCoreProps) {
  const { still } = useMotion();
  const suit = useMemo(() => buildSuit(), []);
  const width = Math.round(height * SUIT_RATIO);
  const ref = useRef<HTMLCanvasElement>(null);
  const state = useRef({ angle: 0.5, time: 0 });
  const running = active && !still;

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const paint = () => draw(ctx, width, height, computeSuitFrame(suit, width, height, state.current.angle, Math.sin(state.current.time * 0.6) * 0.95));

    if (!running) {
      paint();
      return;
    }
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = (now - last) / 1000;
      if (dt < STEP) return;
      last = now;
      const step = Math.min(0.05, dt);
      state.current.time += step;
      state.current.angle += step * 0.5;
      paint();
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [suit, width, height, running]);

  return <canvas ref={ref} style={{ width, height, display: 'block', pointerEvents: 'none' }} />;
}
