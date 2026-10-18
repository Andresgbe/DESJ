// Núcleo animado de DESJ (estilo HUD/JARVIS): anillos que giran a distinto ritmo, un radar
// que barre y un centro que "respira". Solo se animan rotación y opacidad con animaciones CSS
// de Reanimated, que corren en el hilo de UI. Con "Reducir movimiento" activado queda quieto.
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';

import { C, mono } from '@/theme';

const VB = 300; // todo se dibuja en un lienzo de 300×300 y se escala al tamaño pedido
const MID = VB / 2;

const SPIN = { from: { transform: [{ rotate: '0deg' }] }, to: { transform: [{ rotate: '360deg' }] } };
const BREATHE = { from: { opacity: 0.25, transform: [{ scale: 0.97 }] }, to: { opacity: 1, transform: [{ scale: 1 }] } };

/** Punto sobre el círculo; 0° arriba y sentido horario. */
function polar(r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return { x: MID + r * Math.cos(a), y: MID + r * Math.sin(a) };
}

function arc(r: number, from: number, to: number) {
  const a = polar(r, from);
  const b = polar(r, to);
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${b.x} ${b.y}`;
}

// Marcas del anillo exterior: cortas cada 3°, largas cada 15°.
const TICKS = Array.from({ length: 120 }, (_, i) => {
  const deg = i * 3;
  const long = deg % 15 === 0;
  const a = polar(146, deg);
  const b = polar(long ? 136 : 141, deg);
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y, long };
});

// Banda segmentada (como los bloques del JARVIS), con brillo distinto por tramo.
const SEGMENTS: [number, number, number][] = [
  [4, 38, 0.35],
  [46, 112, 0.9],
  [120, 146, 0.5],
  [196, 268, 0.6],
  [276, 290, 0.9],
  [298, 336, 0.3],
];

export function DesjCore({ size = 260, label = 'SISTEMA EN LÍNEA' }: { size?: number; label?: string }) {
  const reduced = useReducedMotion();
  const now = useClock();

  const spin = (seconds: number, reverse = false) =>
    reduced
      ? null
      : {
          animationName: SPIN,
          animationDuration: `${seconds}s`,
          animationTimingFunction: 'linear' as const,
          animationIterationCount: 'infinite' as const,
          animationDirection: reverse ? ('reverse' as const) : ('normal' as const),
        };

  const breathe = reduced
    ? null
    : {
        animationName: BREATHE,
        animationDuration: '2.4s',
        animationTimingFunction: 'ease-in-out' as const,
        animationIterationCount: 'infinite' as const,
        animationDirection: 'alternate' as const,
      };

  const layer = { width: size, height: size };
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  return (
    <View style={[layer, styles.clip]} accessible accessibilityRole="image" accessibilityLabel={`DESJ, ${time}, ${label.toLowerCase()}`}>
      {/* Anillo exterior con marcas: vuelta lenta */}
      <Animated.View style={[styles.layer, layer, spin(90)]}>
        <Svg width={size} height={size} viewBox={`0 0 ${VB} ${VB}`}>
          <Circle cx={MID} cy={MID} r={146} stroke={C.cardBorder} strokeWidth={1} fill="none" />
          {TICKS.map((t, i) => (
            <Line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke={t.long ? C.accentSoft : C.border} strokeWidth={t.long ? 1.6 : 1} />
          ))}
        </Svg>
      </Animated.View>

      {/* Banda segmentada + acento ámbar: gira al revés */}
      <Animated.View style={[styles.layer, layer, spin(36, true)]}>
        <Svg width={size} height={size} viewBox={`0 0 ${VB} ${VB}`}>
          {SEGMENTS.map(([from, to, o]) => (
            <Path key={from} d={arc(126, from, to)} stroke={C.accent} strokeOpacity={o} strokeWidth={9} fill="none" />
          ))}
          <Path d={arc(116, 150, 178)} stroke={C.warn} strokeWidth={2} strokeLinecap="round" fill="none" />
          <Circle cx={polar(116, 150).x} cy={polar(116, 150).y} r={2.5} fill={C.warn} />
        </Svg>
      </Animated.View>

      {/* Anillo punteado con un punto que orbita */}
      <Animated.View style={[styles.layer, layer, spin(20)]}>
        <Svg width={size} height={size} viewBox={`0 0 ${VB} ${VB}`}>
          <Circle cx={MID} cy={MID} r={106} stroke={C.border} strokeWidth={1} strokeDasharray="2 6" fill="none" />
          <Circle cx={MID} cy={MID - 106} r={3.5} fill={C.accentSoft} />
        </Svg>
      </Animated.View>

      {/* Arcos brillantes */}
      <Animated.View style={[styles.layer, layer, spin(11, true)]}>
        <Svg width={size} height={size} viewBox={`0 0 ${VB} ${VB}`}>
          <Path d={arc(96, 0, 64)} stroke={C.accent} strokeWidth={3} strokeLinecap="round" fill="none" />
          <Path d={arc(96, 196, 236)} stroke={C.accentSoft} strokeWidth={2} strokeLinecap="round" fill="none" />
        </Svg>
      </Animated.View>

      {/* Radar: barrido rápido */}
      <Animated.View style={[styles.layer, layer, spin(4)]}>
        <Svg width={size} height={size} viewBox={`0 0 ${VB} ${VB}`}>
          <Path d={arc(82, 0, 80)} stroke={C.accent} strokeOpacity={0.14} strokeWidth={14} fill="none" />
          <Path d={arc(82, 55, 80)} stroke={C.accent} strokeOpacity={0.3} strokeWidth={14} fill="none" />
          <Line x1={polar(74, 80).x} y1={polar(74, 80).y} x2={polar(90, 80).x} y2={polar(90, 80).y} stroke={C.accentSoft} strokeWidth={2} />
        </Svg>
      </Animated.View>

      {/* Halo del núcleo: respira */}
      <Animated.View style={[styles.layer, layer, breathe]}>
        <Svg width={size} height={size} viewBox={`0 0 ${VB} ${VB}`}>
          <Circle cx={MID} cy={MID} r={72} stroke={C.accent} strokeOpacity={0.55} strokeWidth={6} fill="none" />
        </Svg>
      </Animated.View>

      {/* Núcleo fijo con la hora */}
      <Svg style={styles.layer} width={size} height={size} viewBox={`0 0 ${VB} ${VB}`}>
        <G>
          <Circle cx={MID} cy={MID} r={66} stroke={C.hudCore} strokeWidth={1.2} fill={C.hudCoreFill} />
          <SvgText x={MID} y={MID - 26} textAnchor="middle" fill={C.accentText} fontFamily={mono} fontSize={10} letterSpacing={4}>
            D·E·S·J
          </SvgText>
          <SvgText x={MID} y={MID + 12} textAnchor="middle" fill={C.text} fontFamily={mono} fontSize={34} fontWeight="600">
            {time}
          </SvgText>
          <SvgText x={MID} y={MID + 32} textAnchor="middle" fill={C.muted} fontFamily={mono} fontSize={8} letterSpacing={2}>
            {label}
          </SvgText>
        </G>
      </Svg>
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

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, left: 0 },
  // Al girar, las esquinas de cada capa sobresalen; sin recorte, en web ensanchan la página.
  clip: { overflow: 'hidden' },
});
