// Núcleo de DESJ (estilo JARVIS): el cerebro, una red neuronal 3D que gira despacio con el Corazón
// de DESJ (el Prisma, el logo) en el centro. El estado se ve en el color del corazón (la hora va en el header). El cerebro vive en neural-core (Skia en el
// teléfono, canvas en web) y el prisma en prism.tsx; el color del prisma sigue el estado de DESJ.
// `size` es el tamaño al que se dibuja; `display`, el tamaño en pantalla. Al cambiar `display`
// el cerebro se agranda o achica con una animación (escala del lienzo, sin volver a generarlo).
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { NeuralCore } from '@/components/neural-core';
import { Prism, type PrismState } from '@/components/prism';
import { useClock, hhmmOf } from '@/lib/clock';

export const RESIZE = { duration: 450, easing: Easing.bezier(0.77, 0, 0.175, 1) };

/** Nombre de cada estado (para lectores de pantalla). */
export const STATE_LABEL: Record<PrismState, string> = {
  online: 'SISTEMA EN LÍNEA',
  listening: 'ESCUCHANDO…',
  thinking: 'PENSANDO…',
  responding: 'RESPONDIENDO…',
  alert: 'ALERTA',
};

/** Lado del Corazón de DESJ (el prisma) respecto del cerebro. */
const PRISM_SIZE = 0.2;

/** `active={false}` pausa el cerebro y el prisma (pantalla fuera de vista). `label` reemplaza el nombre del estado. */
type Props = { size?: number; display?: number; label?: string; state?: PrismState; active?: boolean };

export function DesjCore({ size = 260, display = size, label, state = 'online', active = true }: Props) {
  const thinking = state === 'thinking';
  const alert = state === 'alert';
  const text = label ?? STATE_LABEL[state];
  const time = hhmmOf(useClock());

  const scale = useSharedValue(display / size);
  useEffect(() => {
    scale.set(withTiming(display / size, RESIZE));
  }, [display, size, scale]);

  // La caja ocupa el tamaño visible (así lo de abajo sube con ella); el lienzo, a tamaño
  // completo, se escala desde su centro.
  const box = useAnimatedStyle(() => ({ width: size * scale.get(), height: size * scale.get() }));
  const canvas = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  return (
    <View style={styles.wrap} accessible accessibilityRole="image" accessibilityLabel={`DESJ, ${time}, ${text.toLowerCase()}`}>
      <Animated.View style={[styles.box, box]}>
        <Animated.View style={[{ width: size, height: size }, canvas]}>
          {/* El corazón va debajo: los nodos del cerebro pasan por encima de su anillo. */}
          <View style={styles.prism}>
            <Prism size={Math.round(size * PRISM_SIZE)} state={state} active={active} />
          </View>
          <NeuralCore size={size} thinking={thinking} alert={alert} labels={display >= 220} active={active} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

/** Alto de lo que va bajo el cerebro (la línea de estado se quitó el 18 nov 2026; la hora está en el header). */
export const STATUS_HEIGHT = 0;

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 2 },
  box: { alignItems: 'center', justifyContent: 'center' },
  prism: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
});
