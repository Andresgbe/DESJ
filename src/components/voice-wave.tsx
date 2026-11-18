// Onda de voz: barras que suben y bajan mientras hablas con DESJ (escuchando) o mientras DESJ te
// responde en voz alta. Más altas al centro, como una onda de audio. Se anima con Reanimated (solo
// transform); con ANIM OFF, "Reducir movimiento" o fuera de vista queda quieta con su forma.
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming, type SharedValue } from 'react-native-reanimated';

import { useMotion } from '@/lib/motion';

const BARS = 31;

/** Altura relativa de cada barra (0–1): más alta al centro. */
const ENVELOPE = Array.from({ length: BARS }, (_, i) => {
  const x = (i - (BARS - 1) / 2) / ((BARS - 1) / 2);
  return 0.28 + 0.72 * Math.exp(-x * x * 2.2);
});

/** `width` y `height` del área; `color` de las barras (el del estado del Corazón de DESJ). */
export function VoiceWave({ width, height, color, active = true }: { width: number; height: number; color: string; active?: boolean }) {
  const { still } = useMotion();
  const t = useSharedValue(0);
  const running = active && !still;

  useEffect(() => {
    cancelAnimation(t);
    if (!running) return t.set(0.25);
    t.set(0);
    t.set(withRepeat(withTiming(1, { duration: 1400, easing: Easing.linear }), -1));
  }, [running, t]);

  const gap = width / BARS;
  const bar = Math.max(2, gap * 0.55);
  return (
    <View style={[styles.row, { width, height }]} pointerEvents="none" accessible={false}>
      {ENVELOPE.map((e, i) => (
        <Bar key={i} i={i} t={t} envelope={e} width={bar} height={height} color={color} />
      ))}
    </View>
  );
}

function Bar({ i, t, envelope, width, height, color }: { i: number; t: SharedValue<number>; envelope: number; width: number; height: number; color: string }) {
  // Cada barra con su fase y su velocidad, para que no suban todas a la vez.
  const phase = (i * 0.37) % 1;
  const speed = 1 + ((i * 7) % 5) * 0.35;
  const style = useAnimatedStyle(() => {
    const s = Math.abs(Math.sin(Math.PI * 2 * (t.get() * speed + phase)));
    return { transform: [{ scaleY: envelope * (0.3 + 0.7 * s) }] };
  });
  return <Animated.View style={[{ width, height, borderRadius: width / 2, backgroundColor: color, opacity: 0.55 + envelope * 0.45 }, style]} />;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
