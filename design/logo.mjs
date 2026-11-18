// Logo de DESJ: el Prisma (versión B, estado En línea) sobre fondo HUD. La forma sale de
// src/components/prism-shape.ts (la misma que dibuja la app) y los colores de design/tokens.json.
// scripts/render-logo.mjs convierte estas variantes en los PNG de la app:
//   full:    ícono cuadrado (fondo + anillos + prisma)      → icon (iPhone), apple-touch-icon, PWA
//   favicon: esquinas redondeadas, prisma más grande        → favicon de la web
//   mark:    solo el prisma con su resplandor, sin fondo    → splash, Android foreground
//   bg:      solo el fondo                                  → Android background
//   mono:    el prisma en blanco plano                      → Android monochrome
// Los 5 estados originales (en línea, escuchando, pensando, respondiendo, alerta) están en design/prisma/.
import fs from 'node:fs';

import { mix, prismAura, prismBody, prismPalette } from '../src/components/prism-shape.ts';

const tokens = JSON.parse(fs.readFileSync(new URL('./tokens.json', import.meta.url), 'utf8'));
const token = (name) => tokens.color.tokens.find((t) => t.name === name).value;

const BG = token('bg');
const MAIN = token('prism-online');
const SPARK = token('neural-salud'); // nodo superior del anillo, como en el original
const WHITE = '#ffffff';
const palette = prismPalette(MAIN, BG);

// El prisma va un poco más abajo del centro para que el triángulo se vea centrado.
const CX = 512;
const CY = 548;

const DEFS = `
  <defs>
    <radialGradient id="bg" cx="50%" cy="52%" r="70%">
      <stop offset="0%" stop-color="${mix(MAIN, BG, 0.8)}"/>
      <stop offset="60%" stop-color="${BG}"/>
      <stop offset="100%" stop-color="${mix(BG, '#000000', 0.4)}"/>
    </radialGradient>
  </defs>`;

function rings() {
  return `
    <g transform="translate(${CX} ${CY})">
      <circle r="420" fill="none" stroke="${mix(MAIN, BG, 0.45)}" stroke-width="2" stroke-opacity="0.45"/>
      <circle r="390" fill="none" stroke="${MAIN}" stroke-width="3" stroke-opacity="0.8" stroke-dasharray="220 42 90 42"/>
      <circle r="342" fill="none" stroke="${mix(MAIN, WHITE, 0.2)}" stroke-width="8" stroke-opacity="0.55" stroke-dasharray="3 16"/>
      <circle cx="-314" r="8" fill="${mix(MAIN, WHITE, 0.4)}"/>
      <circle cx="314" r="8" fill="${mix(MAIN, WHITE, 0.4)}"/>
      <circle cy="314" r="8" fill="${mix(MAIN, WHITE, 0.4)}"/>
      <circle cy="-314" r="7" fill="${SPARK}"/>
    </g>`;
}

const prism = (scale = 1, aura = true) =>
  `<g transform="translate(${CX} ${CY}) scale(${scale})">${aura ? prismAura(palette, 'l') : ''}${prismBody(palette, 'l')}</g>`;

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${DEFS}${body}</svg>`;
const background = (rx = 0) => `<rect width="1024" height="1024" rx="${rx}" fill="url(#bg)"/>`;

export const LOGO = {
  full: svg(background() + rings() + prism()),
  favicon: svg(background(224) + prism(1.3)),
  mark: svg(prism(0.85)),
  bg: svg(background()),
  mono: svg(`<g transform="translate(${CX} ${CY}) scale(0.85)">${prismBody(prismPalette(WHITE, WHITE), 'm')}</g>`),
};
