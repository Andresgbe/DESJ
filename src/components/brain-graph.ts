// Modelo del cerebro de DESJ: una red neuronal 3D (nodos agrupados por módulo y conexiones). En el
// centro va el Corazón de DESJ (el Prisma, prism.tsx), dibujado encima del lienzo. Se genera una sola vez con semilla fija, así sale igual siempre.
// `computeFrame` proyecta la red girada en 2D para un cuadro; es un worklet para que en el teléfono
// corra en el hilo de UI (Skia) y en web se llama desde requestAnimationFrame (canvas).

/** Grupos del cerebro: los módulos de DESJ. El color de cada uno es NEURAL[i] en theme.ts. */
export const CLUSTERS = [
  { label: 'Memoria', share: 0.34, spread: 0.5, dir: [-1, 0.05, 0.25] },
  { label: 'Conocimiento', share: 0.18, spread: 0.42, dir: [0.95, 0.25, -0.2] },
  { label: 'Negocios', share: 0.16, spread: 0.4, dir: [0.45, -0.65, 0.55] },
  { label: 'Salud', share: 0.14, spread: 0.38, dir: [0.15, 0.85, 0.45] },
  { label: 'Pendientes', share: 0.12, spread: 0.36, dir: [-0.3, -0.75, -0.55] },
  { label: 'Calendario', share: 0.1, spread: 0.34, dir: [0.15, 0.2, -1] },
] as const;

export const CLUSTER_COUNT = CLUSTERS.length;

export type Graph = {
  n: number;
  /** Posiciones en una esfera de radio 1. */
  x: number[];
  y: number[];
  z: number[];
  /** Grupo de cada nodo. */
  c: number[];
  /** 1 = nodo grande, 0 = chico. */
  big: number[];
  /** Índices de los nodos principales (uno por grupo), con nombre. */
  hubs: number[];
  /** Conexiones: pares [a, b] seguidos. */
  edges: number[];
  /** Señales que viajan: [conexión, desfase 0–1, velocidad]. */
  signals: number[];
};

/** Aleatorio con semilla (mulberry32). */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalize(v: number[]) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

export function buildGraph(n = 1700, seed = 11): Graph {
  const rand = seeded(seed);
  const gauss = () => (rand() + rand() + rand() - 1.5) / 1.5;
  const g: Graph = { n: 0, x: [], y: [], z: [], c: [], big: [], hubs: [], edges: [], signals: [] };
  const push = (p: number[], c: number, big: number) => {
    g.x.push(p[0]);
    g.y.push(p[1]);
    g.z.push(p[2]);
    g.c.push(c);
    g.big.push(big);
    return g.x.length - 1;
  };

  // Un nodo principal por grupo, un poco hacia adentro de la cáscara.
  CLUSTERS.forEach((cl, c) => {
    const d = normalize([...cl.dir]);
    g.hubs.push(push([d[0] * 0.86, d[1] * 0.86, d[2] * 0.86], c, 1));
  });

  // Cáscara: cada grupo es una nube sobre la esfera alrededor de su dirección.
  const shell = Math.round(n * 0.86);
  CLUSTERS.forEach((cl, c) => {
    const count = Math.round(shell * cl.share);
    const d = normalize([...cl.dir]);
    for (let i = 0; i < count; i++) {
      const p = normalize([d[0] + gauss() * cl.spread * 1.6, d[1] + gauss() * cl.spread * 1.6, d[2] + gauss() * cl.spread * 1.6]);
      const r = 0.72 + 0.28 * Math.sqrt(rand());
      push([p[0] * r, p[1] * r, p[2] * r], c, rand() < 0.07 ? 1 : 0);
    }
  });

  // Interior: nodos sueltos entre la cáscara y el núcleo, un poco apartados del centro para dejarle
  // espacio al Corazón de DESJ.
  const inner = n - g.x.length;
  for (let i = 0; i < inner; i++) {
    const p = normalize([gauss(), gauss(), gauss()]);
    const r = 0.38 + 0.37 * rand();
    push([p[0] * r, p[1] * r, p[2] * r], Math.floor(rand() * CLUSTERS.length), rand() < 0.1 ? 1 : 0);
  }
  g.n = g.x.length;

  // Conexiones: cada nodo con sus 2 vecinos más cercanos de su grupo (el interior, con cualquiera),
  // algunos con el nodo principal de su grupo (los "abanicos") y unas pocas largas entre grupos.
  const seen = new Set<number>();
  const link = (a: number, b: number) => {
    if (a === b) return;
    const key = a < b ? a * 8192 + b : b * 8192 + a;
    if (seen.has(key)) return;
    seen.add(key);
    g.edges.push(a, b);
  };
  const firstInner = g.n - inner;
  for (let a = CLUSTERS.length; a < g.n; a++) {
    const isInner = a >= firstInner;
    let best1 = -1;
    let best2 = -1;
    let d1 = Infinity;
    let d2 = Infinity;
    for (let b = CLUSTERS.length; b < g.n; b++) {
      if (b === a || (!isInner && g.c[b] !== g.c[a])) continue;
      const d = (g.x[a] - g.x[b]) ** 2 + (g.y[a] - g.y[b]) ** 2 + (g.z[a] - g.z[b]) ** 2;
      if (d < d1) {
        d2 = d1;
        best2 = best1;
        d1 = d;
        best1 = b;
      } else if (d < d2) {
        d2 = d;
        best2 = b;
      }
    }
    if (best1 >= 0) link(a, best1);
    if (best2 >= 0 && rand() < 0.75) link(a, best2);
    if (rand() < (isInner ? 0.12 : 0.05)) link(a, g.hubs[g.c[a]]);
  }
  for (let i = 0; i < CLUSTERS.length; i++) for (let j = i + 1; j < CLUSTERS.length; j++) link(g.hubs[i], g.hubs[j]);
  for (let i = 0; i < 50; i++) link(Math.floor(rand() * g.n), Math.floor(rand() * g.n));

  // Señales: salen sobre todo de los abanicos y las conexiones largas, que son las que se ven.
  const edgeCount = g.edges.length / 2;
  for (let i = 0; i < 72; i++) g.signals.push(Math.floor(rand() * edgeCount), rand(), 0.35 + rand() * 0.5);

  return g;
}

export type Pt = { x: number; y: number };
export type Hub = { x: number; y: number; r: number; depth: number; c: number; label: string };

export type Frame = {
  /** Nodos por capa: índice = (grupo * 3 + profundidad) * 2 + tamaño. Profundidad 0 = atrás. */
  nodes: Pt[][];
  /** Conexiones por capa (pares de puntos): índice = grupo * 2 + profundidad (0 atrás, 1 adelante). */
  edges: Pt[][];
  hubs: Hub[];
  /** Señales que viajan por las conexiones, por grupo. */
  signals: Pt[][];
  /** Escala de dibujo según el tamaño (1 = 320 px). */
  k: number;
};

export const DEPTHS = 3;

/**
 * Proyecta la red para un cuadro.
 * @param angle giro alrededor del eje vertical (radianes)
 * @param time segundos desde que empezó (mueve señales y núcleo)
 * @param energy 0 en reposo, 1 cuando DESJ piensa: más señales y más rápidas
 */
export function computeFrame(g: Graph, size: number, angle: number, time: number, energy: number): Frame {
  'worklet';
  const half = size / 2;
  const scale = half * 0.84;
  const D = 3.4; // distancia de la cámara: perspectiva suave
  const tilt = 0.32 + Math.sin(time * 0.13) * 0.06;
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  const k = Math.max(0.55, size / 320);

  const px: number[] = new Array(g.n);
  const py: number[] = new Array(g.n);
  const pd: number[] = new Array(g.n);
  const pf: number[] = new Array(g.n);
  for (let i = 0; i < g.n; i++) {
    const x1 = g.x[i] * ca + g.z[i] * sa;
    const z1 = -g.x[i] * sa + g.z[i] * ca;
    const y2 = g.y[i] * ct - z1 * st;
    const z2 = g.y[i] * st + z1 * ct;
    const f = D / (D - z2);
    px[i] = half + x1 * f * scale;
    py[i] = half + y2 * f * scale;
    pd[i] = (z2 + 1) / 2;
    pf[i] = f;
  }

  // Claro alrededor del Corazón de DESJ: no se dibujan nodos ni conexiones que caigan sobre él.
  const clear2 = (size * 0.1) ** 2;
  const covered = (i: number) => (px[i] - half) ** 2 + (py[i] - half) ** 2 < clear2;
  // ¿El segmento a→b pasa por el claro? (distancia del centro al segmento)
  const crosses = (a: number, b: number) => {
    const dx = px[b] - px[a];
    const dy = py[b] - py[a];
    const l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((half - px[a]) * dx + (half - py[a]) * dy) / l2));
    return (px[a] + dx * t - half) ** 2 + (py[a] + dy * t - half) ** 2 < clear2;
  };

  const layers = CLUSTER_COUNT * DEPTHS * 2;
  const nodes: Pt[][] = [];
  for (let i = 0; i < layers; i++) nodes.push([]);
  for (let i = CLUSTER_COUNT; i < g.n; i++) {
    if (covered(i)) continue;
    const d = pd[i] < 0.38 ? 0 : pd[i] < 0.66 ? 1 : 2;
    nodes[(g.c[i] * DEPTHS + d) * 2 + g.big[i]].push({ x: px[i], y: py[i] });
  }

  const edges: Pt[][] = [];
  for (let i = 0; i < CLUSTER_COUNT * 2; i++) edges.push([]);
  for (let e = 0; e < g.edges.length; e += 2) {
    const a = g.edges[e];
    const b = g.edges[e + 1];
    if (crosses(a, b)) continue;
    const front = pd[a] + pd[b] > 1.05 ? 1 : 0;
    const list = edges[g.c[a] * 2 + front];
    list.push({ x: px[a], y: py[a] }, { x: px[b], y: py[b] });
  }

  const hubs: Hub[] = [];
  for (let c = 0; c < CLUSTER_COUNT; c++) {
    const i = g.hubs[c];
    hubs.push({ x: px[i], y: py[i], r: 4.2 * k * pf[i], depth: pd[i], c, label: CLUSTERS[c].label });
  }

  // Señales: en reposo unas pocas; pensando, casi todas y más rápidas.
  const signals: Pt[][] = [];
  for (let c = 0; c < CLUSTER_COUNT; c++) signals.push([]);
  const total = g.signals.length / 3;
  const active = Math.floor(total * (0.18 + 0.82 * energy));
  for (let s = 0; s < active; s++) {
    const e = g.signals[s * 3] * 2;
    const t = (time * g.signals[s * 3 + 2] * (1 + energy * 2.6) + g.signals[s * 3 + 1]) % 1;
    const a = g.edges[e];
    const b = g.edges[e + 1];
    const sx = px[a] + (px[b] - px[a]) * t;
    const sy = py[a] + (py[b] - py[a]) * t;
    if ((sx - half) ** 2 + (sy - half) ** 2 < clear2) continue;
    signals[g.c[a]].push({ x: sx, y: sy });
  }

  return { nodes, edges, hubs, signals, k };
}

/** Estilo de cada capa de nodos: radio en px (antes de `k`) y opacidad, por profundidad y tamaño. */
export const NODE_STYLE = {
  radius: [
    [0.9, 1.7],
    [1.15, 2.2],
    [1.45, 2.8],
  ],
  alpha: [0.4, 0.7, 1],
} as const;
