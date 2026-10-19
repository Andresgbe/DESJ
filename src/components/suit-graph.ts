// Modelo de la armadura holográfica del módulo YO: una figura de traje blindado hecha de superficies
// continuas (pecho saliente, cintura en V, hombreras por capas, casco con placa facial, guanteletes,
// rodilleras y botas) dibujadas con anillos de contorno, costuras y líneas de detalle brillantes
// (reactor del pecho, ranuras de los ojos, placas del abdomen). Es una armadura genérica del género,
// no la copia de un personaje concreto. Se genera una vez; `computeSuitFrame` la proyecta girada para
// un cuadro (worklet: en el teléfono corre en el hilo de UI).

export type Pt = { x: number; y: number };

/**
 * Sección transversal: centro (x, y, z), ancho rx, fondo hacia adelante zf y hacia atrás zb, y
 * "cuadratura" p (2 = óvalo; más alto = más cuadrada, como una placa de metal).
 */
type Section = [x: number, y: number, z: number, rx: number, zf: number, zb: number, p: number];
type Loft = { sections: Section[]; seg: number; seams: number; sub: number };

// Unidades: la figura mide 2 de alto (pies en y = -1, coronilla en y = 1), mirando hacia +z.
// Proporciones heroicas: 8 cabezas de alto (la cabeza mide 0,25), hombros anchos, cintura angosta.
const TORSO: Section[] = [
  [0, -0.06, 0, 0.135, 0.095, 0.105, 2.2], // entrepierna
  [0, 0.0, 0, 0.17, 0.105, 0.115, 2.2],
  [0, 0.06, 0, 0.18, 0.11, 0.12, 2.2], // cadera
  [0, 0.13, 0.005, 0.16, 0.105, 0.105, 2.2],
  [0, 0.2, 0.01, 0.15, 0.11, 0.1, 2.2], // cintura
  [0, 0.27, 0.012, 0.165, 0.12, 0.105, 2.2], // abdomen
  [0, 0.34, 0.015, 0.195, 0.135, 0.115, 2.2], // serratos
  [0, 0.41, 0.018, 0.235, 0.155, 0.125, 2.2], // dorsales
  [0, 0.48, 0.02, 0.255, 0.17, 0.13, 2.2], // pectorales
  [0, 0.55, 0.01, 0.26, 0.15, 0.13, 2.25],
  [0, 0.6, 0, 0.245, 0.115, 0.12, 2.3],
  [0, 0.64, -0.01, 0.19, 0.08, 0.095, 2.2], // trapecios
  [0, 0.675, -0.01, 0.11, 0.065, 0.078, 2],
  [0, 0.7, 0, 0.068, 0.06, 0.062, 2], // cuello corto y fuerte
  [0, 0.72, 0.005, 0.062, 0.058, 0.058, 2],
];
/** El casco se ve un poco más grande que una cabeza real, como en las armaduras de cómic. */
const HEAD_SCALE = 1.3;
const HEAD_BASE: Section[] = [
  [0, 0.715, 0.01, 0.06, 0.06, 0.06, 2],
  [0, 0.735, 0.022, 0.07, 0.085, 0.07, 2.3], // mentón
  [0, 0.77, 0.02, 0.088, 0.1, 0.09, 2.4], // mandíbula
  [0, 0.81, 0.014, 0.1, 0.11, 0.105, 2.4], // pómulos
  [0, 0.855, 0.008, 0.106, 0.115, 0.112, 2.4], // ojos
  [0, 0.9, 0.002, 0.105, 0.11, 0.115, 2.3], // ceja
  [0, 0.94, -0.004, 0.095, 0.098, 0.108, 2.2],
  [0, 0.97, -0.008, 0.072, 0.075, 0.088, 2.1],
  [0, 0.99, -0.01, 0.04, 0.042, 0.05, 2],
  [0, 1.0, -0.01, 0.01, 0.01, 0.012, 2],
];
const HEAD: Section[] = HEAD_BASE.map((r) => [r[0], r[1], r[2] * HEAD_SCALE, r[3] * HEAD_SCALE, r[4] * HEAD_SCALE, r[5] * HEAD_SCALE, r[6]]);
const arm = (s: number): Section[] => [
  [s * 0.2, 0.635, 0, 0.075, 0.07, 0.075, 2.1], // nace del trapecio
  [s * 0.26, 0.62, 0, 0.09, 0.085, 0.085, 2.1],
  [s * 0.3, 0.575, 0, 0.095, 0.09, 0.09, 2.1], // deltoides
  [s * 0.315, 0.51, 0, 0.085, 0.085, 0.08, 2.1],
  [s * 0.322, 0.44, 0.005, 0.077, 0.082, 0.072, 2.1], // bíceps
  [s * 0.328, 0.37, 0.008, 0.068, 0.072, 0.064, 2.1],
  [s * 0.333, 0.3, 0.01, 0.056, 0.058, 0.056, 2.1], // codo
  [s * 0.338, 0.24, 0.02, 0.066, 0.066, 0.062, 2.1], // antebrazo
  [s * 0.343, 0.15, 0.03, 0.058, 0.056, 0.054, 2.1],
  [s * 0.347, 0.06, 0.035, 0.044, 0.042, 0.04, 2.1],
  [s * 0.35, 0.0, 0.038, 0.037, 0.033, 0.033, 2.1], // muñeca
  [s * 0.352, -0.05, 0.04, 0.045, 0.034, 0.032, 2.2], // mano
  [s * 0.354, -0.12, 0.04, 0.04, 0.03, 0.028, 2.2],
  [s * 0.355, -0.17, 0.04, 0.02, 0.017, 0.016, 2],
];
// Hombrera: una placa apenas más grande que el deltoides, pegada a él.
const pauldron = (s: number): Section[] => [
  [s * 0.305, 0.53, 0, 0.098, 0.096, 0.095, 2.2],
  [s * 0.305, 0.58, 0, 0.106, 0.1, 0.1, 2.25],
  [s * 0.28, 0.625, 0, 0.086, 0.082, 0.082, 2.2],
  [s * 0.24, 0.648, 0, 0.04, 0.04, 0.04, 2],
];
const leg = (s: number): Section[] => [
  [s * 0.1, 0.0, 0, 0.105, 0.105, 0.115, 2.1],
  [s * 0.105, -0.08, 0.005, 0.112, 0.115, 0.115, 2.1], // cuádriceps
  [s * 0.105, -0.18, 0.01, 0.105, 0.112, 0.105, 2.1],
  [s * 0.1, -0.28, 0.012, 0.092, 0.1, 0.09, 2.1],
  [s * 0.095, -0.37, 0.015, 0.076, 0.085, 0.074, 2.1],
  [s * 0.092, -0.45, 0.02, 0.062, 0.07, 0.062, 2.2],
  [s * 0.09, -0.5, 0.022, 0.058, 0.066, 0.06, 2.2], // rodilla
  [s * 0.09, -0.55, 0.012, 0.062, 0.062, 0.074, 2.1],
  [s * 0.091, -0.62, 0.005, 0.07, 0.062, 0.088, 2.1], // pantorrilla
  [s * 0.092, -0.7, 0, 0.064, 0.056, 0.078, 2.1],
  [s * 0.093, -0.8, 0, 0.05, 0.048, 0.056, 2.1],
  [s * 0.094, -0.89, 0, 0.04, 0.042, 0.042, 2.1], // tobillo
  [s * 0.094, -0.93, 0, 0.042, 0.046, 0.046, 2.2],
];
const boot = (s: number): Section[] => [
  [s * 0.094, -0.945, 0.02, 0.047, 0.078, 0.052, 2.3],
  [s * 0.094, -0.975, 0.045, 0.052, 0.112, 0.057, 2.4],
  [s * 0.094, -0.998, 0.045, 0.048, 0.108, 0.052, 2.4],
];

const LOFTS: Loft[] = [
  { sections: TORSO, seg: 28, seams: 10, sub: 3 },
  { sections: HEAD, seg: 24, seams: 10, sub: 2 },
  ...([-1, 1] as const).flatMap((s): Loft[] => [
    { sections: arm(s), seg: 16, seams: 6, sub: 2 },
    { sections: pauldron(s), seg: 20, seams: 6, sub: 2 },
    { sections: leg(s), seg: 18, seams: 6, sub: 2 },
    { sections: boot(s), seg: 18, seams: 4, sub: 1 },
  ]),
];

/** Altura del reactor del pecho. */
const REACTOR_Y = 0.5;

export type Suit = {
  /** Segmentos 3D de la figura: x1 y1 z1 x2 y2 z2 seguidos. */
  lines: number[];
  /** Líneas de detalle de la armadura (se dibujan más brillantes): mismo formato. */
  details: number[];
  /** Ranuras de los ojos: mismo formato. */
  eyes: number[];
  /** Costuras de luz (costados del torso, muslos, antebrazos, espinillas, V del pecho): mismo formato. */
  glow: number[];
  /** Puntos brillantes sobre la superficie: x y z seguidos. */
  sparks: number[];
  /** Anillos del piso (giran con la figura): segmentos 3D. */
  floor: number[];
};

function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Intercala `sub` secciones entre cada par (interpolación suave), para que los anillos queden parejos. */
function refine(sections: Section[], sub: number): Section[] {
  const out: Section[] = [];
  for (let i = 0; i < sections.length - 1; i++) {
    const a = sections[i];
    const b = sections[i + 1];
    for (let j = 0; j < sub; j++) {
      const t = j / sub;
      const e = t * t * (3 - 2 * t); // suaviza el cambio de grosor
      out.push(a.map((v, n) => v + (b[n] - v) * (n < 3 ? t : e)) as Section);
    }
  }
  out.push(sections[sections.length - 1]);
  return out;
}

/** Punto del contorno de una sección en el ángulo `lon` (0 = derecha, π/2 = adelante). */
function at(r: Section, lon: number) {
  const c = Math.cos(lon);
  const s = Math.sin(lon);
  const e = 2 / r[6];
  const x = r[0] + r[3] * Math.sign(c) * Math.abs(c) ** e;
  const z = r[2] + (s >= 0 ? r[4] : r[5]) * Math.sign(s) * Math.abs(s) ** e;
  return [x, r[1], z];
}

/** Punto sobre el frente del torso o del casco a la altura `y` y desplazamiento lateral `x`. */
function front(sections: Section[], y: number, x: number, lift = 0.004) {
  let i = 0;
  while (i < sections.length - 2 && sections[i + 1][1] < y) i++;
  const a = sections[i];
  const b = sections[i + 1];
  const t = Math.min(1, Math.max(0, (y - a[1]) / (b[1] - a[1])));
  const r = a.map((v, n) => v + (b[n] - v) * t) as Section;
  const u = Math.min(0.98, Math.abs(x - r[0]) / r[3]);
  const z = r[2] + r[4] * (1 - u ** r[6]) ** (1 / r[6]);
  return [x, y, z + lift];
}

export function buildSuit(): Suit {
  const rand = seeded(3);
  const s: Suit = { lines: [], details: [], eyes: [], glow: [], sparks: [], floor: [] };
  const seg = (out: number[], a: number[], b: number[]) => out.push(a[0], a[1], a[2], b[0], b[1], b[2]);
  const poly = (out: number[], pts: number[][]) => {
    for (let i = 0; i < pts.length - 1; i++) seg(out, pts[i], pts[i + 1]);
  };
  const range = (from: number, to: number, n: number) => Array.from({ length: n + 1 }, (_, i) => from + ((to - from) * i) / n);

  for (const loft of LOFTS) {
    const rows = refine(loft.sections, loft.sub);
    for (const r of rows) {
      for (let i = 0; i < loft.seg; i++) seg(s.lines, at(r, (2 * Math.PI * i) / loft.seg), at(r, (2 * Math.PI * (i + 1)) / loft.seg));
    }
    for (let m = 0; m < loft.seams; m++) {
      const lon = (2 * Math.PI * m) / loft.seams + Math.PI / 2;
      for (let k = 0; k < rows.length - 1; k++) seg(s.lines, at(rows[k], lon), at(rows[k + 1], lon));
    }
    for (let i = 0; i < rows.length * 1.2; i++) {
      const v = at(rows[Math.floor(rand() * rows.length)], rand() * Math.PI * 2);
      s.sparks.push(v[0], v[1], v[2]);
    }
  }

  // Detalles de la armadura, pegados al frente del torso y del casco.
  const torso = refine(TORSO, 3);
  const head = refine(HEAD, 2);
  const T = (y: number, x: number) => front(torso, y, x);
  const H = (y: number, x: number) => front(head, y, x * HEAD_SCALE);
  // Reactor del pecho: dos anillos y un borde exterior.
  for (const rr of [0.022, 0.036, 0.048]) {
    const pts = range(0, Math.PI * 2, 24).map((a) => {
      const p = T(REACTOR_Y + rr * Math.sin(a), rr * Math.cos(a));
      return [p[0], p[1], p[2] + 0.004];
    });
    poly(s.details, pts);
  }
  // Placa del pecho: borde inferior de los pectorales y línea central.
  for (const side of [-1, 1]) poly(s.details, range(0.05, 0.21, 8).map((x) => T(0.41 + (x - 0.05) * 0.4, side * x)));
  poly(s.details, range(0.36, 0.6, 6).map((y) => T(y, 0)));
  // Placas del abdomen y cinturón.
  for (const y of [0.32, 0.26, 0.2]) poly(s.details, range(-0.08, 0.08, 6).map((x) => T(y, x)));
  poly(s.details, range(0.18, 0.36, 6).map((y) => T(y, 0)));
  poly(s.details, range(-0.16, 0.16, 10).map((x) => T(0.06, x)));
  poly(s.details, range(-0.15, 0.15, 10).map((x) => T(0.01, x)));
  // Casco: placa facial, ceja, pómulos, rejilla de la boca, cresta y discos de las orejas.
  for (const side of [-1, 1]) {
    poly(s.details, [H(0.925, side * 0.085), H(0.895, side * 0.1), H(0.83, side * 0.095), H(0.78, side * 0.068), H(0.745, side * 0.03), H(0.738, 0)]);
    poly(s.details, [H(0.902, side * 0.092), H(0.896, side * 0.05), H(0.886, side * 0.012)]); // ceja
    poly(s.details, [H(0.84, side * 0.098), H(0.805, side * 0.064), H(0.792, side * 0.03)]); // pómulo
    // Ranura del ojo: larga y caída hacia el centro.
    poly(s.eyes, [H(0.875, side * 0.074), H(0.868, side * 0.05), H(0.858, side * 0.02)]);
    // Disco de la oreja, a cada lado del casco.
    const head0 = refine(HEAD, 2).reduce((b, r) => (Math.abs(r[1] - 0.845) < Math.abs(b[1] - 0.845) ? r : b));
    for (const rr of [0.03, 0.017]) {
      poly(s.details, range(0, Math.PI * 2, 16).map((a) => [side * (head0[3] + 0.004), 0.845 + rr * Math.sin(a), head0[2] + rr * Math.cos(a)]));
    }
  }
  for (const y of [0.778, 0.765, 0.752]) poly(s.details, range(-0.032, 0.032, 4).map((x) => H(y, x))); // rejilla
  poly(s.details, range(0.79, 0.84, 3).map((y) => H(y, 0)));
  // Cresta: del centro de la frente, por arriba, hasta la nuca.
  const skull = refine(HEAD, 2).filter((r) => r[1] >= 0.89);
  poly(s.details, skull.map((r) => at(r, Math.PI / 2)));
  poly(s.details, refine(HEAD, 2).filter((r) => r[1] >= 0.8).map((r) => at(r, -Math.PI / 2)));

  // Costuras de luz: siguen la superficie a un ángulo fijo, entre dos alturas.
  const strip = (sections: Section[], sub: number, lon: number, y0: number, y1: number) =>
    poly(s.glow, refine(sections, sub).filter((r) => r[1] >= y0 && r[1] <= y1).map((r) => at(r, lon)));
  for (const side of [-1, 1]) {
    const out = (a: number) => (side > 0 ? a : Math.PI - a); // ángulo hacia afuera de ese lado
    strip(TORSO, 3, out(0.35), 0.1, 0.5); // costados del torso
    strip(leg(side), 2, out(0.35), -0.42, -0.03); // muslo, por fuera
    strip(leg(side), 2, Math.PI / 2, -0.85, -0.56); // espinilla
    strip(arm(side), 2, out(0.5), 0.06, 0.28); // antebrazo
    // V del pecho: del reactor hacia los hombros y hacia las costillas.
    poly(s.glow, [T(0.52, side * 0.06), T(0.56, side * 0.13), T(0.59, side * 0.21)]);
    poly(s.glow, [T(0.47, side * 0.05), T(0.4, side * 0.13), T(0.34, side * 0.18)]);
  }

  // Piso: dos anillos y marcas cortas, como una plataforma de escaneo.
  const ring = (r: number, n: number, dash: boolean) => {
    for (let i = 0; i < n; i++) {
      if (dash && i % 2) continue;
      const a = (2 * Math.PI * i) / n;
      const b = (2 * Math.PI * (i + 1)) / n;
      seg(s.floor, [r * Math.cos(a), -1.0, r * Math.sin(a)], [r * Math.cos(b), -1.0, r * Math.sin(b)]);
    }
  };
  ring(0.42, 64, false);
  ring(0.5, 90, true);
  for (let i = 0; i < 36; i++) {
    const a = (2 * Math.PI * i) / 36;
    const long = i % 3 === 0;
    seg(s.floor, [0.55 * Math.cos(a), -1.0, 0.55 * Math.sin(a)], [(long ? 0.62 : 0.58) * Math.cos(a), -1.0, (long ? 0.62 : 0.58) * Math.sin(a)]);
  }
  return s;
}

export type SuitFrame = {
  /**
   * Líneas en pares de puntos: [0] atrás, [1] adelante, [2] dentro de la franja de escaneo,
   * [3] detalles de la armadura que miran a la cámara.
   */
  lines: Pt[][];
  /** Ranuras de los ojos (pares de puntos) y su brillo: solo de frente. */
  eyes: Pt[];
  /** Costuras de luz que miran a la cámara (pares de puntos). */
  glow: Pt[];
  sparks: Pt[];
  floor: Pt[];
  /** Brillo del reactor del pecho (solo cuando mira hacia la cámara). */
  reactor: { x: number; y: number; r: number; alpha: number };
  facing: number;
  k: number;
};

/**
 * Proyecta la armadura para un cuadro, en un lienzo de `w` × `h`.
 * @param angle giro alrededor del eje vertical (radianes)
 * @param scan altura de la franja de escaneo, de -1 (pies) a 1 (cabeza)
 */
export function computeSuitFrame(s: Suit, w: number, h: number, angle: number, scan: number): SuitFrame {
  'worklet';
  const scale = h * 0.44;
  const cx = w / 2;
  const cy = h * 0.47;
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const tilt = 0.12; // la cámara mira un poco desde arriba
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  const D = 5;
  const k = Math.max(0.6, h / 520);

  const project = (x: number, y: number, z: number) => {
    'worklet';
    const x1 = x * ca + z * sa;
    const z1 = -x * sa + z * ca;
    const y2 = y * ct - z1 * st;
    const z2 = y * st + z1 * ct;
    const f = D / (D - z2);
    return { x: cx + x1 * f * scale, y: cy - y2 * f * scale, z: z2 };
  };

  const lines: Pt[][] = [[], [], [], []];
  for (let i = 0; i < s.lines.length; i += 6) {
    const a = project(s.lines[i], s.lines[i + 1], s.lines[i + 2]);
    const b = project(s.lines[i + 3], s.lines[i + 4], s.lines[i + 5]);
    const ym = (s.lines[i + 1] + s.lines[i + 4]) / 2;
    const bucket = Math.abs(ym - scan) < 0.03 ? 2 : a.z + b.z > 0.02 ? 1 : 0;
    lines[bucket].push({ x: a.x, y: a.y }, { x: b.x, y: b.y });
  }
  for (let i = 0; i < s.details.length; i += 6) {
    const a = project(s.details[i], s.details[i + 1], s.details[i + 2]);
    const b = project(s.details[i + 3], s.details[i + 4], s.details[i + 5]);
    lines[a.z + b.z > 0.1 ? 3 : 0].push({ x: a.x, y: a.y }, { x: b.x, y: b.y });
  }

  const facing = Math.max(0, ca);
  const eyes: Pt[] = [];
  for (let i = 0; i < s.eyes.length; i += 6) {
    const a = project(s.eyes[i], s.eyes[i + 1], s.eyes[i + 2]);
    const b = project(s.eyes[i + 3], s.eyes[i + 4], s.eyes[i + 5]);
    if (a.z + b.z > 0) eyes.push({ x: a.x, y: a.y }, { x: b.x, y: b.y });
  }

  const glow: Pt[] = [];
  for (let i = 0; i < s.glow.length; i += 6) {
    const a = project(s.glow[i], s.glow[i + 1], s.glow[i + 2]);
    const b = project(s.glow[i + 3], s.glow[i + 4], s.glow[i + 5]);
    if (a.z + b.z > 0) glow.push({ x: a.x, y: a.y }, { x: b.x, y: b.y });
  }

  const sparks: Pt[] = [];
  for (let i = 0; i < s.sparks.length; i += 3) {
    const p = project(s.sparks[i], s.sparks[i + 1], s.sparks[i + 2]);
    if (p.z > 0) sparks.push({ x: p.x, y: p.y });
  }

  const floor: Pt[] = [];
  for (let i = 0; i < s.floor.length; i += 6) {
    const a = project(s.floor[i], s.floor[i + 1], s.floor[i + 2]);
    const b = project(s.floor[i + 3], s.floor[i + 4], s.floor[i + 5]);
    floor.push({ x: a.x, y: a.y }, { x: b.x, y: b.y });
  }

  const r = project(0, REACTOR_Y, 0.19);
  return { lines, eyes, glow, sparks, floor, reactor: { x: r.x, y: r.y, r: 0.022 * scale, alpha: facing }, facing, k };
}
