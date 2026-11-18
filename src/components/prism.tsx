// El Corazón de DESJ: el Prisma, el logo de la app. Se dibuja en el centro del cerebro y en el header.
// El color cambia con el estado de DESJ (en línea, escuchando, pensando, respondiendo, alerta) y las
// cuchillas se separan o laten según el estado. Cada cuchilla es una capa propia que se mueve con
// Reanimated (solo transform), así el SVG no se vuelve a dibujar en cada cuadro.
// Con las animaciones en OFF, "Reducir movimiento" o la pantalla fuera de vista queda quieto.
import { ReactNode, useEffect, useId, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { SvgXml } from 'react-native-svg';

import {
  PRISM_SPREAD,
  prismAura,
  prismBody,
  prismDefs,
  prismInner,
  prismPalette,
  prismRing,
  prismShard,
  SHARD_ANGLES,
  svgCentered,
  type PrismState,
} from '@/components/prism-shape';
import { useMotion } from '@/lib/motion';
import { C, PRISM } from '@/theme';

export type { PrismState } from '@/components/prism-shape';

const EASE = Easing.bezier(0.77, 0, 0.175, 1);
/**
 * Color de las sombras del vidrio por estado (por defecto, el fondo). Pensando es un azul muy claro:
 * con sombras hacia el fondo casi negro se veía gris; con sombras azules se lee azul.
 */
const SHADE: Partial<Record<PrismState, string>> = { thinking: C.border };
/** Duración del fundido entre colores de estado (ms). */
const FADE = 300;

/** Id seguro para usar dentro de url(#…) en el SVG. */
function useSvgId() {
  return `p${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
}

/** Prisma animado. `size` es el lado del lienzo; el prisma ocupa ~70 % de él. */
export function Prism({ size, state = 'online', active = true }: { size: number; state?: PrismState; active?: boolean }) {
  const { still } = useMotion();
  const running = active && !still;
  const id = useSvgId();

  // Capas por estado: al cambiar, la nueva aparece sobre la anterior y la anterior se quita al terminar.
  // (Se hace a mano y no con entering/exiting: en web la capa que sale se movía de lugar.)
  const [layers, setLayers] = useState<PrismState[]>([state]);
  if (layers[layers.length - 1] !== state) setLayers([...layers.filter((s) => s !== state), state]);
  useEffect(() => {
    if (layers.length < 2) return;
    const t = setTimeout(() => setLayers((l) => l.slice(-1)), FADE + 50);
    return () => clearTimeout(t);
  }, [layers]);

  const s0 = useSharedValue<number>(PRISM_SPREAD[state]);
  const s1 = useSharedValue<number>(PRISM_SPREAD[state]);
  const s2 = useSharedValue<number>(PRISM_SPREAD[state]);
  const breath = useSharedValue(1);

  useEffect(() => {
    [s0, s1, s2].forEach((s, i) => {
      cancelAnimation(s);
      if (!running) return s.set(PRISM_SPREAD[state]);
      if (state === 'thinking') {
        // Pensando: las cuchillas laten hacia afuera por turnos, rápido.
        const pulse = withSequence(withTiming(16, { duration: 300, easing: EASE }), withTiming(0, { duration: 300, easing: EASE }));
        s.set(withDelay(i * 140, withRepeat(pulse, -1)));
      } else {
        s.set(withTiming(PRISM_SPREAD[state], { duration: 450, easing: EASE }));
      }
    });
    cancelAnimation(breath);
    if (!running) return breath.set(1);
    // Respira despacio en reposo; pensando, más rápido; en alerta, rápido y más marcado.
    const amount = state === 'alert' ? 1.05 : state === 'thinking' ? 1.04 : 1.025;
    const period = state === 'alert' ? 650 : state === 'thinking' ? 800 : 2600;
    breath.set(withRepeat(withTiming(amount, { duration: period, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [state, running, s0, s1, s2, breath]);

  const breathing = useAnimatedStyle(() => ({ transform: [{ scale: breath.get() }] }));

  return (
    <Animated.View style={[{ width: size, height: size }, breathing]} pointerEvents="none">
      {layers.map((s) => (
        <Layer key={s} visible={s === state} first={layers.length === 1} running={running}>
          <PrismLayers size={size} state={s} id={`${id}${s}`} spreads={[s0, s1, s2]} />
        </Layer>
      ))}
    </Animated.View>
  );
}

/** Capa de un estado: aparece o se apaga con un fundido de opacidad. */
function Layer({ visible, first, running, children }: { visible: boolean; first: boolean; running: boolean; children: ReactNode }) {
  const opacity = useSharedValue(first ? 1 : 0);
  useEffect(() => {
    opacity.set(running ? withTiming(visible ? 1 : 0, { duration: FADE }) : visible ? 1 : 0);
  }, [visible, running, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return <Animated.View style={[StyleSheet.absoluteFill, style]}>{children}</Animated.View>;
}

function PrismLayers({ size, state, id, spreads }: { size: number; state: PrismState; id: string; spreads: SharedValue<number>[] }) {
  const xml = useMemo(() => {
    const p = prismPalette(PRISM[state], SHADE[state] ?? C.bg);
    return {
      base: svgCentered(prismRing(p, C.bg) + prismAura(p, id) + prismInner(p)),
      shards: SHARD_ANGLES.map((a, i) => svgCentered(`<defs>${prismDefs(p, `${id}${i}`)}</defs>${prismShard(p, `${id}${i}`, a)}`)),
    };
  }, [state, id]);

  return (
    <>
      <SvgXml xml={xml.base} width={size} height={size} style={StyleSheet.absoluteFill} />
      {xml.shards.map((shard, i) => (
        <Shard key={i} xml={shard} size={size} angle={SHARD_ANGLES[i]} spread={spreads[i]} />
      ))}
    </>
  );
}

/** Una cuchilla: se separa del centro en la dirección de su ángulo. */
function Shard({ xml, size, angle, spread }: { xml: string; size: number; angle: number; spread: SharedValue<number> }) {
  const k = size / 1024;
  const dx = -Math.sin((angle * Math.PI) / 180) * k;
  const dy = Math.cos((angle * Math.PI) / 180) * k;
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: dx * spread.get() }, { translateY: dy * spread.get() }] }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]}>
      <SvgXml xml={xml} width={size} height={size} />
    </Animated.View>
  );
}

/** Prisma quieto en reposo, para el header. */
export function PrismMark({ size }: { size: number }) {
  const id = useSvgId();
  const xml = useMemo(() => {
    const p = prismPalette(PRISM.online, C.bg);
    // Recortado al prisma (sin el resplandor) para que se lea a tamaño de ícono.
    return svgCentered(prismBody(p, id)).replace('viewBox="-512 -512 1024 1024"', 'viewBox="-352 -352 704 704"');
  }, [id]);
  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      <SvgXml xml={xml} width={size} height={size} />
    </View>
  );
}
