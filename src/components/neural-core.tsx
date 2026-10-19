// Cerebro de DESJ en el teléfono: la red de brain-graph.ts dibujada con Skia (GPU).
// Cada cuadro se proyecta y se graba como una SkPicture en el hilo de UI (useDerivedValue), así
// que React no vuelve a renderizar mientras gira. Los nodos se dibujan por capas (grupo ×
// profundidad × tamaño) con drawPoints: unas 40 llamadas por cuadro aunque haya más de mil nodos.
// Para que pese poco: avanza a 30 cuadros por segundo (gira tan lento que se ve igual que a 60) y
// se detiene del todo con `active={false}` (pantalla fuera de vista) o con las animaciones en OFF.
import {
  BlurStyle,
  Canvas,
  Circle,
  createPicture,
  matchFont,
  PaintStyle,
  Picture,
  PointMode,
  RadialGradient,
  Skia,
  StrokeCap,
  vec,
  type SkCanvas,
  type SkFont,
} from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import { Easing, useDerivedValue, useFrameCallback, useSharedValue, withTiming } from 'react-native-reanimated';

import { buildGraph, CLUSTER_COUNT, CLUSTERS, computeFrame, DEPTHS, NODE_STYLE, type Frame } from '@/components/brain-graph';
import { useMotion } from '@/lib/motion';
import { C, mono, NEURAL } from '@/theme';

/** `active={false}` pausa el giro (p. ej. cuando la pantalla no está a la vista). */
export type NeuralCoreProps = { size: number; thinking?: boolean; labels?: boolean; active?: boolean };

const STEP = 1 / 30 - 0.002; // segundos entre cuadros (con margen para no saltarse uno de cada dos)

const COLORS = NEURAL.map((c) => Skia.Color(c));
const CORE = Skia.Color(C.neuralCore);
const TEXT = Skia.Color(C.text);

function draw(canvas: SkCanvas, f: Frame, energy: number, font: SkFont | null, widths: number[]) {
  'worklet';
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeCap(StrokeCap.Round);

  // Conexiones: las de atrás casi invisibles, las de adelante más claras.
  paint.setStrokeWidth(0.6 * f.k);
  for (let d = 0; d < 2; d++) {
    for (let c = 0; c < CLUSTER_COUNT; c++) {
      const pts = f.edges[c * 2 + d];
      if (!pts.length) continue;
      paint.setColor(COLORS[c]);
      paint.setAlphaf(d ? 0.2 + energy * 0.12 : 0.07);
      canvas.drawPoints(PointMode.Lines, pts, paint);
    }
  }

  // Nodos, de atrás hacia adelante. Los de adelante llevan un halo suave.
  for (let d = 0; d < DEPTHS; d++) {
    for (let c = 0; c < CLUSTER_COUNT; c++) {
      for (let b = 0; b < 2; b++) {
        const pts = f.nodes[(c * DEPTHS + d) * 2 + b];
        if (!pts.length) continue;
        const r = NODE_STYLE.radius[d][b] * f.k;
        paint.setColor(COLORS[c]);
        if (d === DEPTHS - 1) {
          paint.setStrokeWidth(r * 6);
          paint.setAlphaf(0.1);
          canvas.drawPoints(PointMode.Points, pts, paint);
        }
        paint.setStrokeWidth(r * 2);
        paint.setAlphaf(NODE_STYLE.alpha[d]);
        canvas.drawPoints(PointMode.Points, pts, paint);
      }
    }
  }

  // Señales que viajan por las conexiones.
  for (let c = 0; c < CLUSTER_COUNT; c++) {
    const pts = f.signals[c];
    if (!pts.length) continue;
    paint.setColor(COLORS[c]);
    paint.setAlphaf(0.35);
    paint.setStrokeWidth(5 * f.k);
    canvas.drawPoints(PointMode.Points, pts, paint);
    paint.setColor(TEXT);
    paint.setAlphaf(0.95);
    paint.setStrokeWidth(1.8 * f.k);
    canvas.drawPoints(PointMode.Points, pts, paint);
  }

  // Esfera de alambre del centro.
  paint.setColor(CORE);
  paint.setAlphaf(0.5 + energy * 0.4);
  paint.setStrokeWidth(0.8 * f.k);
  canvas.drawPoints(PointMode.Lines, f.core, paint);

  // Nodos principales: brillo difuso, punto sólido y su nombre.
  const fill = Skia.Paint();
  fill.setAntiAlias(true);
  const glow = Skia.Paint();
  glow.setAntiAlias(true);
  glow.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 5 * f.k, true));
  for (const h of f.hubs) {
    const a = 0.45 + h.depth * 0.55;
    glow.setColor(COLORS[h.c]);
    glow.setAlphaf(0.55 * a);
    canvas.drawCircle(h.x, h.y, h.r * 2, glow);
    fill.setColor(COLORS[h.c]);
    fill.setAlphaf(a);
    canvas.drawCircle(h.x, h.y, h.r, fill);
    if (font) {
      fill.setColor(TEXT);
      fill.setAlphaf(0.25 + h.depth * 0.7);
      canvas.drawText(h.label, h.x - widths[h.c] / 2, h.y - h.r - 5 * f.k, fill, font);
    }
  }
}

export function NeuralCore({ size, thinking = false, labels = true, active = true }: NeuralCoreProps) {
  const { still } = useMotion();
  const graph = useMemo(() => buildGraph(), []);
  const half = size / 2;

  // Los nombres solo se leen bien desde cierto tamaño.
  const { font, widths } = useMemo(() => {
    if (!labels || size < 220) return { font: null, widths: [] as number[] };
    try {
      const f = matchFont({ fontFamily: mono, fontSize: Math.round(9 * Math.max(1, size / 320)) });
      return { font: f, widths: graph.hubs.map((_, c) => f.measureText(CLUSTERS[c].label).width) };
    } catch {
      return { font: null, widths: [] as number[] };
    }
  }, [labels, size, graph]);

  const angle = useSharedValue(0.7);
  const time = useSharedValue(0);
  const energy = useSharedValue(thinking ? 1 : 0);
  const pending = useSharedValue(0);

  useEffect(() => {
    energy.set(withTiming(thinking ? 1 : 0, { duration: 700, easing: Easing.bezier(0.77, 0, 0.175, 1) }));
  }, [thinking, energy]);

  // Giro lento en reposo; al pensar acelera. Solo cambia cada 1/30 s: el cuadro se recalcula
  // únicamente cuando cambian estos valores.
  const frames = useFrameCallback((info) => {
    const dt = pending.get() + Math.min(0.05, (info.timeSincePreviousFrame ?? 16) / 1000);
    if (dt < STEP) return pending.set(dt);
    pending.set(0);
    time.set(time.get() + dt);
    angle.set(angle.get() + dt * (0.09 + energy.get() * 0.4));
  }, false);

  useEffect(() => {
    frames.setActive(active && !still);
  }, [frames, active, still]);

  const picture = useDerivedValue(() =>
    createPicture(
      (canvas) => draw(canvas, computeFrame(graph, size, angle.get(), time.get(), energy.get()), energy.get(), font, widths),
      { width: size, height: size },
    ),
  );
  const glowOpacity = useDerivedValue(() => 0.45 + energy.get() * 0.55);

  return (
    <Canvas style={{ width: size, height: size }} pointerEvents="none">
      <Circle cx={half} cy={half} r={size * 0.32} opacity={glowOpacity}>
        <RadialGradient c={vec(half, half)} r={size * 0.32} colors={[`${C.neuralCore}66`, `${C.accent}1f`, `${C.bg}00`]} />
      </Circle>
      <Picture picture={picture} />
    </Canvas>
  );
}
