// Fondo de red neuronal. Pensado para no pesar:
// - La red (nodos + conexiones) es un SVG que se dibuja una vez por tamaño de pantalla.
// - Solo se animan pocos elementos (nodos que laten y señales que viajan por una conexión),
//   con animaciones CSS de Reanimated sobre opacidad y transform: corren en el hilo de UI.
// - Con las animaciones en OFF o "Reducir movimiento" queda estática. No recibe toques (pointerEvents="none").
import { useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated from 'react-native-reanimated';
import Svg, { Circle, Defs, Line, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useMotion } from '@/lib/motion';
import { C } from '@/theme';

const CELL = 120; // un nodo por celda de ~120 px: densidad pareja sin saturar
const MAX_NODES = 90;
const LINK = 190; // distancia máxima para conectar dos nodos
const PULSES = 8;
const SIGNALS = 5;

type Node = { x: number; y: number; r: number };

/** Aleatorio con semilla: la red sale igual en cada render y en cada visita. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildNetwork(w: number, h: number) {
  const rand = seeded(7);
  const cols = Math.max(2, Math.round(w / CELL));
  const rows = Math.max(2, Math.round(h / CELL));
  const cw = w / cols;
  const ch = h / rows;
  let nodes: Node[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      nodes.push({ x: (c + 0.15 + rand() * 0.7) * cw, y: (r + 0.15 + rand() * 0.7) * ch, r: 1.2 + rand() * 1.6 });
    }
  }
  if (nodes.length > MAX_NODES) nodes = nodes.filter((_, i) => i % Math.ceil(nodes.length / MAX_NODES) === 0);

  // Cada nodo se une a sus 2–3 vecinos más cercanos.
  const edges: [number, number][] = [];
  const seen = new Set<string>();
  nodes.forEach((a, i) => {
    nodes
      .map((b, j) => ({ j, d: Math.hypot(a.x - b.x, a.y - b.y) }))
      .filter((n) => n.j !== i && n.d < LINK)
      .sort((p, q) => p.d - q.d)
      .slice(0, 2 + Math.round(rand()))
      .forEach(({ j }) => {
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (!seen.has(key)) {
          seen.add(key);
          edges.push([i, j]);
        }
      });
  });

  const pick = <T,>(list: T[], n: number) => list.filter((_, i) => i % Math.max(1, Math.floor(list.length / n)) === 0).slice(0, n);
  const pulses = pick(nodes, PULSES).map((n, i) => ({ ...n, duration: 3.2 + (i % 4) * 0.9, delay: i * 0.7 }));
  const signals = pick(edges, SIGNALS).map(([a, b], i) => ({
    from: nodes[a],
    keyframes: {
      '0%': { opacity: 0, transform: [{ translateX: 0 }, { translateY: 0 }] },
      '15%': { opacity: 1 },
      '85%': { opacity: 1 },
      '100%': { opacity: 0, transform: [{ translateX: nodes[b].x - nodes[a].x }, { translateY: nodes[b].y - nodes[a].y }] },
    },
    duration: 2.6 + (i % 3) * 0.8,
    delay: 1 + i * 1.3,
  }));

  return { nodes, edges, pulses, signals };
}

const PULSE = {
  '0%': { opacity: 0, transform: [{ scale: 0.6 }] },
  '50%': { opacity: 0.9, transform: [{ scale: 1 }] },
  '100%': { opacity: 0, transform: [{ scale: 0.6 }] },
};

export function NeuralBackground() {
  const { width, height } = useWindowDimensions();
  const { still: reduced } = useMotion();
  const net = useMemo(() => buildNetwork(width, height), [width, height]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={width} height={height}>
        <Defs>
          <RadialGradient id="glow" cx="50%" cy="28%" r="60%">
            <Stop offset="0" stopColor={C.accent} stopOpacity={0.16} />
            <Stop offset="1" stopColor={C.accent} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={width} height={height} fill="url(#glow)" />
        {net.edges.map(([a, b], i) => (
          <Line key={i} x1={net.nodes[a].x} y1={net.nodes[a].y} x2={net.nodes[b].x} y2={net.nodes[b].y} stroke={C.accent} strokeOpacity={0.2} strokeWidth={0.9} />
        ))}
        {net.nodes.map((n, i) => (
          <Circle key={i} cx={n.x} cy={n.y} r={n.r} fill={C.accentSoft} fillOpacity={0.55} />
        ))}
      </Svg>

      {reduced
        ? null
        : net.pulses.map((p, i) => (
            <Animated.View
              key={`p${i}`}
              style={[
                styles.pulse,
                { left: p.x - 6, top: p.y - 6 },
                {
                  animationName: PULSE,
                  animationDuration: `${p.duration}s`,
                  animationDelay: `${p.delay}s`,
                  animationIterationCount: 'infinite',
                  animationTimingFunction: 'ease-in-out',
                },
              ]}
            />
          ))}

      {reduced
        ? null
        : net.signals.map((s, i) => (
            <Animated.View
              key={`s${i}`}
              style={[
                styles.signal,
                { left: s.from.x - 2, top: s.from.y - 2 },
                {
                  animationName: s.keyframes,
                  animationDuration: `${s.duration}s`,
                  animationDelay: `${s.delay}s`,
                  animationIterationCount: 'infinite',
                  animationTimingFunction: 'ease-in-out',
                },
              ]}
            />
          ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pulse: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: 'rgba(47,155,255,0.35)', borderWidth: 1, borderColor: 'rgba(143,208,255,0.6)', opacity: 0 },
  signal: { position: 'absolute', width: 4, height: 4, borderRadius: 2, backgroundColor: C.accentSoft, shadowColor: C.accent, shadowOpacity: 1, shadowRadius: 4, opacity: 0 },
});
