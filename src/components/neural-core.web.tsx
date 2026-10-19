// Cerebro de DESJ en web: la misma red de brain-graph.ts dibujada en un <canvas> 2D con
// requestAnimationFrame. Así la web no tiene que descargar CanvasKit (el Skia de web, ~7 MB).
// Avanza a 30 cuadros por segundo y se queda quieto con `active={false}` o con las animaciones en OFF.
import { useEffect, useMemo, useRef } from 'react';

import { buildGraph, CLUSTER_COUNT, computeFrame, DEPTHS, NODE_STYLE, type Frame, type Pt } from '@/components/brain-graph';
import { useMotion } from '@/lib/motion';
import { C, NEURAL } from '@/theme';

export type NeuralCoreProps = { size: number; thinking?: boolean; labels?: boolean; active?: boolean };

const STEP = 1 / 30 - 0.002; // segundos entre cuadros (con margen para no saltarse uno de cada dos)

const MONO = 'Menlo, "SF Mono", ui-monospace, monospace';

function dots(ctx: CanvasRenderingContext2D, pts: Pt[], r: number) {
  ctx.beginPath();
  for (const p of pts) {
    ctx.moveTo(p.x + r, p.y);
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  }
  ctx.fill();
}

function lines(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  ctx.beginPath();
  for (let i = 0; i + 1 < pts.length; i += 2) {
    ctx.moveTo(pts[i].x, pts[i].y);
    ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
  }
  ctx.stroke();
}

function draw(ctx: CanvasRenderingContext2D, size: number, f: Frame, energy: number, labels: boolean) {
  ctx.clearRect(0, 0, size, size);
  const half = size / 2;

  const g = ctx.createRadialGradient(half, half, 0, half, half, size * 0.32);
  g.addColorStop(0, `${C.neuralCore}66`);
  g.addColorStop(0.5, `${C.accent}1f`);
  g.addColorStop(1, `${C.bg}00`);
  ctx.globalAlpha = 0.45 + energy * 0.55;
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  ctx.lineCap = 'round';
  ctx.lineWidth = 0.6 * f.k;
  for (let d = 0; d < 2; d++) {
    for (let c = 0; c < CLUSTER_COUNT; c++) {
      ctx.strokeStyle = NEURAL[c];
      ctx.globalAlpha = d ? 0.2 + energy * 0.12 : 0.07;
      lines(ctx, f.edges[c * 2 + d]);
    }
  }

  for (let d = 0; d < DEPTHS; d++) {
    for (let c = 0; c < CLUSTER_COUNT; c++) {
      ctx.fillStyle = NEURAL[c];
      for (let b = 0; b < 2; b++) {
        const pts = f.nodes[(c * DEPTHS + d) * 2 + b];
        const r = NODE_STYLE.radius[d][b] * f.k;
        if (d === DEPTHS - 1) {
          ctx.globalAlpha = 0.1;
          dots(ctx, pts, r * 3);
        }
        ctx.globalAlpha = NODE_STYLE.alpha[d];
        dots(ctx, pts, r);
      }
    }
  }

  for (let c = 0; c < CLUSTER_COUNT; c++) {
    ctx.fillStyle = NEURAL[c];
    ctx.globalAlpha = 0.35;
    dots(ctx, f.signals[c], 2.5 * f.k);
    ctx.fillStyle = C.text;
    ctx.globalAlpha = 0.95;
    dots(ctx, f.signals[c], 0.9 * f.k);
  }

  ctx.strokeStyle = C.neuralCore;
  ctx.globalAlpha = 0.5 + energy * 0.4;
  ctx.lineWidth = 0.8 * f.k;
  lines(ctx, f.core);

  ctx.font = `${Math.round(9 * Math.max(1, size / 320))}px ${MONO}`;
  ctx.textAlign = 'center';
  for (const h of f.hubs) {
    const a = 0.45 + h.depth * 0.55;
    ctx.fillStyle = NEURAL[h.c];
    ctx.shadowColor = NEURAL[h.c];
    ctx.shadowBlur = 12 * f.k;
    ctx.globalAlpha = a;
    dots(ctx, [h], h.r);
    ctx.shadowBlur = 0;
    if (labels) {
      ctx.fillStyle = C.text;
      ctx.globalAlpha = 0.25 + h.depth * 0.7;
      ctx.fillText(h.label, h.x, h.y - h.r - 5 * f.k);
    }
  }
  ctx.globalAlpha = 1;
}

export function NeuralCore({ size, thinking = false, labels = true, active = true }: NeuralCoreProps) {
  const { still } = useMotion();
  const graph = useMemo(() => buildGraph(), []);
  const ref = useRef<HTMLCanvasElement>(null);
  const target = useRef(thinking ? 1 : 0);
  const state = useRef({ angle: 0.7, time: 0, energy: thinking ? 1 : 0 });
  const running = active && !still;
  // Quieto, se vuelve a dibujar si DESJ empieza o termina de pensar (cambia el brillo del núcleo).
  const stillThinking = running ? null : thinking;

  useEffect(() => {
    target.current = thinking ? 1 : 0;
  }, [thinking]);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const showLabels = labels && size >= 220;
    const paint = () => {
      const s = state.current;
      draw(ctx, size, computeFrame(graph, size, s.angle, s.time, s.energy), s.energy, showLabels);
    };

    // Estático (animaciones en OFF o fuera de vista): un solo dibujo, sin bucle.
    if (!running) {
      state.current.energy = target.current;
      paint();
      return;
    }

    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = (now - last) / 1000;
      if (dt < STEP) return; // 30 cuadros por segundo bastan para un giro tan lento
      last = now;
      const s = state.current;
      const step = Math.min(0.05, dt);
      // La energía se acerca a su objetivo en ~0.7 s (pensando = 1, en reposo = 0).
      s.energy += (target.current - s.energy) * Math.min(1, step * 4);
      s.time += step;
      s.angle += step * (0.09 + s.energy * 0.4);
      paint();
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [graph, size, labels, running, stillThinking]);

  return <canvas ref={ref} style={{ width: size, height: size, display: 'block', pointerEvents: 'none' }} />;
}
