// Logo de DESJ: una "D" luminosa sobre fondo HUD azul (colores de design/tokens.json).
// Exporta el SVG en sus variantes; scripts/render-logo.mjs lo convierte en los PNG de la app.
//   full: ícono completo (fondo + red + anillo + D)          → icon, apple-touch-icon, PWA, favicon
//   mark: solo la D con su resplandor, fondo transparente    → splash, Android foreground
//   bg:   solo el fondo                                      → Android background
//   mono: la D en blanco plano                               → Android monochrome
export const COLORS = {
  bg: '#03070f',
  card: '#08132a',
  border: '#2763b8',
  accent: '#2f9bff',
  accentSoft: '#8fd0ff',
  accentText: '#5cc2ff',
  core: '#8fe8ff',
};
const c = COLORS;

// La D: barra vertical + medio círculo, centrada en el lienzo de 1024.
const D_PATH = 'M 331 300 V 724 H 471 A 212 212 0 0 0 471 300 Z';

// Red de nodos tenue (como NeuralBackground), en las esquinas para no competir con la D.
const NODES = [
  [96, 150], [210, 92], [300, 196], [150, 300], [820, 120], [930, 236], [860, 330], [742, 210],
  [110, 760], [214, 900], [320, 820], [80, 640], [900, 790], [800, 914], [940, 660], [700, 860],
];
const EDGES = [
  [0, 1], [1, 2], [0, 3], [2, 3], [4, 5], [5, 6], [4, 7], [6, 7], [8, 9], [9, 10], [8, 11], [10, 8],
  [12, 13], [13, 15], [12, 14], [15, 12],
];

function background() {
  const lines = EDGES.map(([a, b]) => `<line x1="${NODES[a][0]}" y1="${NODES[a][1]}" x2="${NODES[b][0]}" y2="${NODES[b][1]}" />`).join('');
  const dots = NODES.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i % 3 === 0 ? 6 : 4}" />`).join('');
  return `
    <rect width="1024" height="1024" fill="${c.bg}" />
    <rect width="1024" height="1024" fill="url(#glow)" />
    <g stroke="${c.accent}" stroke-opacity="0.22" stroke-width="2">${lines}</g>
    <g fill="${c.accentSoft}" fill-opacity="0.5">${dots}</g>
    <!-- Anillos HUD -->
    <circle cx="512" cy="512" r="400" fill="none" stroke="${c.border}" stroke-opacity="0.55" stroke-width="3" />
    <circle cx="512" cy="512" r="360" fill="none" stroke="${c.border}" stroke-opacity="0.45" stroke-width="2" stroke-dasharray="6 14" />
    <path d="M 512 112 A 400 400 0 0 1 858 312" fill="none" stroke="${c.accent}" stroke-width="10" stroke-linecap="round" />
    <path d="M 254 818 A 400 400 0 0 1 150 680" fill="none" stroke="${c.accentSoft}" stroke-width="6" stroke-linecap="round" />`;
}

function mark() {
  return `
    <path d="${D_PATH}" fill="none" stroke="${c.accent}" stroke-width="96" stroke-linejoin="round" opacity="0.55" filter="url(#blur)" />
    <path d="${D_PATH}" fill="none" stroke="url(#stroke)" stroke-width="64" stroke-linejoin="round" />
    <path d="${D_PATH}" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="10" stroke-linejoin="round" />
    <!-- Núcleo: un nodo encendido dentro de la D -->
    <circle cx="500" cy="512" r="34" fill="${c.core}" opacity="0.35" filter="url(#blur)" />
    <circle cx="500" cy="512" r="16" fill="${c.core}" />`;
}

const DEFS = `
  <defs>
    <radialGradient id="glow" cx="50%" cy="46%" r="75%">
      <stop offset="0" stop-color="${c.accent}" stop-opacity="0.55" />
      <stop offset="0.45" stop-color="${c.border}" stop-opacity="0.45" />
      <stop offset="1" stop-color="${c.card}" stop-opacity="0.9" />
    </radialGradient>
    <linearGradient id="stroke" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${c.core}" />
      <stop offset="0.55" stop-color="${c.accentText}" />
      <stop offset="1" stop-color="${c.accent}" />
    </linearGradient>
    <filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="22" /></filter>
  </defs>`;

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${DEFS}${body}</svg>`;

export const LOGO = {
  full: svg(background() + mark()),
  mark: svg(mark()),
  bg: svg(background()),
  mono: svg(`<path d="${D_PATH}" fill="none" stroke="#ffffff" stroke-width="64" stroke-linejoin="round" />`),
};
