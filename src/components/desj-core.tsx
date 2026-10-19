// Núcleo de DESJ (estilo JARVIS): el cerebro, una red neuronal 3D que gira despacio, con la hora
// y el estado debajo. El dibujo vive en neural-core (Skia en el teléfono, canvas en web).
// `size` es el tamaño al que se dibuja; `display`, el tamaño en pantalla. Al cambiar `display`
// el cerebro se agranda o achica con una animación (escala del lienzo, sin volver a generarlo).
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { NeuralCore } from '@/components/neural-core';
import { C, mono } from '@/theme';

export const RESIZE = { duration: 450, easing: Easing.bezier(0.77, 0, 0.175, 1) };

/** `active={false}` pausa el cerebro (pantalla fuera de vista). */
type Props = { size?: number; display?: number; label?: string; thinking?: boolean; active?: boolean };

export function DesjCore({ size = 260, display = size, label = 'SISTEMA EN LÍNEA', thinking = false, active = true }: Props) {
  const now = useClock();
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const scale = useSharedValue(display / size);
  useEffect(() => {
    scale.set(withTiming(display / size, RESIZE));
  }, [display, size, scale]);

  // La caja ocupa el tamaño visible (así lo de abajo sube con ella); el lienzo, a tamaño
  // completo, se escala desde su centro.
  const box = useAnimatedStyle(() => ({ width: size * scale.get(), height: size * scale.get() }));
  const canvas = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  return (
    <View style={styles.wrap} accessible accessibilityRole="image" accessibilityLabel={`DESJ, ${time}, ${label.toLowerCase()}`}>
      <Animated.View style={[styles.box, box]}>
        <Animated.View style={[{ width: size, height: size }, canvas]}>
          <NeuralCore size={size} thinking={thinking} labels={display >= 220} active={active} />
        </Animated.View>
      </Animated.View>
      <Text style={styles.status} numberOfLines={1}>
        <Text style={{ color: C.accentText }}>D·E·S·J</Text>
        {'  ·  '}
        <Text style={{ color: C.text }}>{time}</Text>
        {'  ·  '}
        <Text style={{ color: thinking ? C.ok : C.muted }}>{label}</Text>
      </Text>
    </View>
  );
}

/** Hora actual, actualizada al cambiar el minuto. */
function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const untilNextMinute = (d: Date) => 60_000 - (d.getSeconds() * 1000 + d.getMilliseconds());
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const d = new Date();
      setNow(d);
      timer = setTimeout(tick, untilNextMinute(d));
    };
    timer = setTimeout(tick, untilNextMinute(new Date()));
    return () => clearTimeout(timer);
  }, []);
  return now;
}

/** Alto de la línea de estado bajo el cerebro (para calcular cuánto ocupa el bloque entero). */
export const STATUS_HEIGHT = 18;

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 2 },
  box: { alignItems: 'center', justifyContent: 'center' },
  status: { fontFamily: mono, fontSize: 10.5, lineHeight: 16, letterSpacing: 2, color: C.muted, textTransform: 'uppercase' },
});
