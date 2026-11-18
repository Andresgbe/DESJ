// Corazón de DESJ: el Prisma (logo "Prisma B"): tres cuchillas de vidrio biselado alrededor de un triángulo,
// repetidas cada 120°. Es el logo de la app y el centro del cerebro.
// Este archivo es dibujo puro (texto SVG, sin React Native) para que lo usen la app (prism.tsx) y el
// script de íconos (design/logo.mjs). Coordenadas de un lienzo de 1024 con el centro de giro en (0, 0).
// Diseño original y sus 5 estados: design/prisma/ (de la propuesta de Gemini enlazada en CONTEXTO.md).

export const PRISM_STATES = ['online', 'listening', 'thinking', 'responding', 'alert'] as const;
export type PrismState = (typeof PRISM_STATES)[number];

/** Cuánto se separan las cuchillas del centro en cada estado (unidades del lienzo de 1024). */
export const PRISM_SPREAD: Record<PrismState, number> = { online: 0, listening: 12, thinking: 0, responding: 6, alert: 22 };

/** Ángulo de cada cuchilla (grados). */
export const SHARD_ANGLES = [0, 120, 240] as const;

export type PrismPalette = {
  /** Color del estado: resplandor y trazo del triángulo interior. */
  main: string;
  rim: string[];
  bevel: string[];
  glass: string[];
  highlight: string;
  center: string;
};

const WHITE = '#ffffff';

function rgb(hex: string) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Mezcla `a` con `b` (t = 0 → a, t = 1 → b). */
export function mix(a: string, b: string, t: number) {
  const x = rgb(a);
  const y = rgb(b);
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Paleta del prisma a partir del color del estado y del fondo: las luces salen de mezclar con blanco
 * y las sombras de mezclar con el fondo, igual que en los SVG originales.
 */
export function prismPalette(color: string, dark: string): PrismPalette {
  return {
    main: color,
    rim: [WHITE, mix(color, WHITE, 0.45), color, mix(color, dark, 0.7)],
    bevel: [mix(color, WHITE, 0.55), color, mix(color, dark, 0.25), mix(color, dark, 0.72)],
    glass: [color, mix(color, dark, 0.62), mix(color, dark, 0.92)],
    highlight: mix(color, WHITE, 0.65),
    center: mix(color, WHITE, 0.8),
  };
}

const stops = (colors: string[], opacity?: number[]) =>
  colors
    .map((c, i) => `<stop offset="${Math.round((i / (colors.length - 1)) * 100)}%" stop-color="${c}"${opacity ? ` stop-opacity="${opacity[i]}"` : ''}/>`)
    .join('');

/** Degradados de las cuchillas. `id` debe ser único en la página (en web los id del SVG son globales). */
export function prismDefs(p: PrismPalette, id: string) {
  return (
    `<linearGradient id="${id}r" x1="0%" y1="0%" x2="100%" y2="100%">${stops(p.rim)}</linearGradient>` +
    `<linearGradient id="${id}b" x1="0%" y1="0%" x2="90%" y2="100%">${stops(p.bevel)}</linearGradient>` +
    `<linearGradient id="${id}g" x1="0%" y1="0%" x2="100%" y2="100%">${stops(p.glass, [0.9, 0.95, 0.98])}</linearGradient>`
  );
}

/** Una cuchilla: hoja principal biselada + cuña del vértice, girada `angle` grados y separada `spread`. */
export function prismShard(p: PrismPalette, id: string, angle: number, spread = 0) {
  const g = `url(#${id}g)`;
  const b = `url(#${id}b)`;
  const r = `url(#${id}r)`;
  return (
    `<g transform="rotate(${angle}) translate(0 ${spread})">` +
    `<polygon points="-198,132 52,132 32,68 -96,68" fill="${g}"/>` +
    `<polygon points="-282,184 88,184 52,132 -198,132" fill="${b}"/>` +
    `<polygon points="-282,184 -198,132 -96,68" fill="${g}" opacity="0.88"/>` +
    `<polyline points="-282,184 -198,132 52,132 88,184" fill="none" stroke="${p.highlight}" stroke-width="2.2"/>` +
    `<polygon points="-282,184 88,184 32,68 -96,68" fill="none" stroke="${r}" stroke-width="4.5" stroke-linejoin="round"/>` +
    `<polygon points="78,126 185,126 98,68 50,68" fill="${g}"/>` +
    `<polygon points="106,184 294,184 185,126 78,126" fill="${b}"/>` +
    `<polyline points="106,184 78,126 185,126 294,184" fill="none" stroke="${p.highlight}" stroke-width="2"/>` +
    `<polygon points="106,184 294,184 98,68 50,68" fill="none" stroke="${r}" stroke-width="4.5" stroke-linejoin="round"/>` +
    `<circle cx="-198" cy="132" r="4.5" fill="${WHITE}"/>` +
    `<circle cx="185" cy="126" r="4.5" fill="${WHITE}"/>` +
    `</g>`
  );
}

/** Triángulo punteado del centro y su nodo. */
export function prismInner(p: PrismPalette) {
  return (
    `<g stroke="${p.main}" stroke-opacity="0.5" stroke-width="2">` +
    `<polygon points="0,-116 -100,58 100,58" fill="none" stroke-dasharray="6 5"/>` +
    `<circle r="8" fill="${p.center}"/>` +
    `</g>`
  );
}

/**
 * Anillo que rodea al corazón dentro del cerebro: un disco oscuro (atenúa los nodos de atrás para que
 * el corazón se lea), un círculo fino y otro punteado por dentro. `dark` es el color del fondo.
 */
export function prismRing(p: PrismPalette, dark: string) {
  return (
    `<circle r="430" fill="${dark}" fill-opacity="0.6"/>` +
    `<circle r="430" fill="none" stroke="${p.main}" stroke-width="5" stroke-opacity="0.9"/>` +
    `<circle r="400" fill="none" stroke="${p.highlight}" stroke-width="7" stroke-opacity="0.5" stroke-dasharray="3 16"/>`
  );
}

/** Resplandor del color del estado detrás del prisma. */
export function prismAura(p: PrismPalette, id: string, r = 380) {
  return (
    `<defs><radialGradient id="${id}a" cx="50%" cy="50%" r="50%">${stops([p.main, p.main], [0.45, 0])}</radialGradient></defs>` +
    `<circle r="${r}" fill="url(#${id}a)"/>`
  );
}

/** El prisma completo (sin fondo), centrado en (0, 0). */
export function prismBody(p: PrismPalette, id: string, spread = 0) {
  return `<defs>${prismDefs(p, id)}</defs>${prismInner(p)}${SHARD_ANGLES.map((a) => prismShard(p, id, a, spread)).join('')}`;
}

/** SVG listo para dibujar, con el centro del prisma en el centro del lienzo. */
export const svgCentered = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-512 -512 1024 1024">${body}</svg>`;
