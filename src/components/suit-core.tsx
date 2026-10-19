// Armadura holográfica del módulo YO en el teléfono: el modelo de suit-graph.ts dibujado con Skia.
// Gira sobre su eje con una franja de escaneo que sube y baja. Igual que el cerebro: avanza a
// 30 cuadros por segundo, se pausa con `active={false}` y queda quieta con las animaciones en OFF.
import {
  BlurStyle,
  Canvas,
  Circle,
  createPicture,
  PaintStyle,
  Picture,
  PointMode,
  RadialGradient,
  Skia,
  StrokeCap,
  vec,
  type SkCanvas,
} from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import { useDerivedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated';

import { buildSuit, computeSuitFrame, type SuitFrame } from '@/components/suit-graph';
import { useMotion } from '@/lib/motion';
import { C } from '@/theme';

export type SuitCoreProps = { height: number; active?: boolean };

/** Proporción ancho / alto del lienzo de la figura. */
export const SUIT_RATIO = 0.62;
const STEP = 1 / 30 - 0.002;

const ACCENT = Skia.Color(C.accent);
const SOFT = Skia.Color(C.accentSoft);
const CORE = Skia.Color(C.neuralCore);
const TEXT = Skia.Color(C.text);

function draw(canvas: SkCanvas, f: SuitFrame) {
  'worklet';
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setStyle(PaintStyle.Stroke);
  p.setStrokeCap(StrokeCap.Round);

  p.setColor(ACCENT);
  p.setAlphaf(0.5);
  p.setStrokeWidth(1 * f.k);
  canvas.drawPoints(PointMode.Lines, f.floor, p);

  p.setAlphaf(0.16);
  p.setStrokeWidth(0.7 * f.k);
  canvas.drawPoints(PointMode.Lines, f.lines[0], p);

  p.setColor(SOFT);
  p.setAlphaf(0.55);
  p.setStrokeWidth(0.9 * f.k);
  canvas.drawPoints(PointMode.Lines, f.lines[1], p);

  p.setColor(CORE);
  p.setAlphaf(0.95);
  p.setStrokeWidth(1.5 * f.k);
  canvas.drawPoints(PointMode.Lines, f.lines[2], p);

  // Detalles de la armadura (reactor, placas, casco) que miran a la cámara.
  p.setColor(CORE);
  p.setAlphaf(0.85);
  p.setStrokeWidth(1.1 * f.k);
  canvas.drawPoints(PointMode.Lines, f.lines[3], p);

  p.setColor(TEXT);
  p.setAlphaf(0.8);
  p.setStrokeWidth(2 * f.k);
  canvas.drawPoints(PointMode.Points, f.sparks, p);

  // Reactor del pecho y ojos: brillo difuso + trazo sólido, solo de frente.
  const glow = Skia.Paint();
  glow.setAntiAlias(true);
  glow.setColor(CORE);
  glow.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 6 * f.k, true));
  if (f.reactor.alpha > 0.05) {
    glow.setAlphaf(0.7 * f.reactor.alpha);
    canvas.drawCircle(f.reactor.x, f.reactor.y, f.reactor.r * 2, glow);
    const solid = Skia.Paint();
    solid.setAntiAlias(true);
    solid.setColor(CORE);
    solid.setAlphaf(f.reactor.alpha);
    canvas.drawCircle(f.reactor.x, f.reactor.y, f.reactor.r, solid);
  }
  // Costuras de luz cian: brillo difuso y trazo fino encima.
  if (f.glow.length) {
    const seam = Skia.Paint();
    seam.setAntiAlias(true);
    seam.setColor(CORE);
    seam.setStyle(PaintStyle.Stroke);
    seam.setStrokeCap(StrokeCap.Round);
    seam.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 3 * f.k, true));
    seam.setAlphaf(0.75);
    seam.setStrokeWidth(4 * f.k);
    canvas.drawPoints(PointMode.Lines, f.glow, seam);
    p.setColor(TEXT);
    p.setAlphaf(0.9);
    p.setStrokeWidth(1.3 * f.k);
    canvas.drawPoints(PointMode.Lines, f.glow, p);
  }
  if (f.eyes.length) {
    glow.setAlphaf(0.7 * f.facing);
    glow.setStyle(PaintStyle.Stroke);
    glow.setStrokeCap(StrokeCap.Round);
    glow.setStrokeWidth(5 * f.k);
    canvas.drawPoints(PointMode.Lines, f.eyes, glow);
    p.setColor(TEXT);
    p.setAlphaf(0.4 + 0.6 * f.facing);
    p.setStrokeWidth(2 * f.k);
    canvas.drawPoints(PointMode.Lines, f.eyes, p);
  }
}

export function SuitCore({ height, active = true }: SuitCoreProps) {
  const { still } = useMotion();
  const suit = useMemo(() => buildSuit(), []);
  const width = Math.round(height * SUIT_RATIO);

  const angle = useSharedValue(0.5);
  const time = useSharedValue(0);
  const pending = useSharedValue(0);

  const frames = useFrameCallback((info) => {
    const dt = pending.get() + Math.min(0.05, (info.timeSincePreviousFrame ?? 16) / 1000);
    if (dt < STEP) return pending.set(dt);
    pending.set(0);
    time.set(time.get() + dt);
    angle.set(angle.get() + dt * 0.5); // una vuelta cada ~12 s
  }, false);

  useEffect(() => {
    frames.setActive(active && !still);
  }, [frames, active, still]);

  const picture = useDerivedValue(() =>
    createPicture((canvas) => draw(canvas, computeSuitFrame(suit, width, height, angle.get(), Math.sin(time.get() * 0.6) * 0.95)), { width, height }),
  );

  return (
    <Canvas style={{ width, height }} pointerEvents="none">
      <Circle cx={width / 2} cy={height * 0.42} r={width * 0.55}>
        <RadialGradient c={vec(width / 2, height * 0.42)} r={width * 0.55} colors={[`${C.accent}33`, `${C.bg}00`]} />
      </Circle>
      <Picture picture={picture} />
    </Canvas>
  );
}
