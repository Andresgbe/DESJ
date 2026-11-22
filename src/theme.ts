// Paleta, espaciados y radios de DESJ (estética HUD azul tecnología).
// Los valores salen de design/tokens.json, copia exacta del Design System:
// https://claude.ai/artifact/7CsREDLrakrXsKvdy7WDVu — no escribas colores ni tamaños a mano en las pantallas.
import { Platform } from 'react-native';

import tokens from '../design/tokens.json';

type Entry = { name: string; value: unknown };
const THEME = tokens.color.themes[0].id;

function find(list: Entry[], name: string) {
  const t = list.find((x) => x.name === name);
  if (!t) throw new Error(`Falta el token "${name}" en design/tokens.json`);
  return t.value;
}

/** Color del tema actual (la app tiene un solo tema: oscuro). */
const color = (name: string): string => {
  const v = find(tokens.color.tokens, name);
  return typeof v === 'string' ? v : (v as Record<string, string>)[THEME];
};

/** "16px" → 16 */
const px = (list: Entry[], name: string) => parseFloat(String(find(list, name)));
const space = (name: string) => px(tokens.spacing.tokens, name);
const radius = (name: string) => px(tokens.radius.tokens, name);

export const C = {
  bg: color('bg'),
  card: color('card'),
  cardBorder: color('card-border'),
  border: color('border'),
  accent: color('accent'),
  accentSoft: color('accent-soft'),
  accentText: color('accent-text'),
  text: color('text'),
  muted: color('muted'),
  ok: color('ok'),
  warn: color('warn'),
  bad: color('bad'),
  onAccent: color('on-accent'),
  surfaceInput: color('surface-input'),
  surfaceSunken: color('surface-sunken'),
  surfaceSelected: color('surface-selected'),
  surfaceThumb: color('surface-thumb'),
  surfaceAvatar: color('surface-avatar'),
  bubbleMe: color('bubble-me'),
  chipText: color('chip-text'),
  tabActive: color('tab-active'),
  textFaint: color('text-faint'),
  hudCore: color('hud-core'),
  hudCoreFill: color('hud-core-fill'),
  neuralCore: color('neural-core'),
  /** Cian del holograma 3D de YO (solo para el holograma). */
  hologram: color('hologram'),
};

/** Colores de los grupos del cerebro (NeuralCore), en el mismo orden que CLUSTERS en brain-graph.ts. */
export const NEURAL = [
  color('neural-memoria'),
  color('neural-conocimiento'),
  color('neural-negocios'),
  color('neural-salud'),
  color('neural-alertas'),
];

/** Colores del wordmark D.E.S.J (marca): degradado de las letras y los puntos cuadrados. Solo para el logotipo. */
export const BRAND = {
  wordTop: color('brand-word-top'),
  word: color('brand-word'),
  wordDeep: color('brand-word-deep'),
  dot: color('brand-dot'),
};

/** Color del prisma (logo y centro del cerebro) en cada estado de DESJ. Solo para el prisma y los íconos. */
export const PRISM = {
  online: color('prism-online'),
  listening: color('prism-listening'),
  thinking: color('prism-thinking'),
  responding: color('prism-responding'),
  alert: color('prism-alert'),
};

/**
 * Tipografía DESJ Aether (Design System): Sora para títulos, Plus Jakarta Sans para leer y JetBrains Mono para el HUD.
 * Los paquetes @expo-google-fonts cargan una familia por peso; el componente `Text` (components/text.tsx) elige la
 * que toca según el estilo, así en las pantallas se sigue escribiendo `fontWeight` y `fontFamily: mono`.
 */
export const FONTS = {
  title: { 600: 'Sora_600SemiBold', 700: 'Sora_700Bold', 800: 'Sora_800ExtraBold' },
  body: {
    400: 'PlusJakartaSans_400Regular',
    500: 'PlusJakartaSans_500Medium',
    600: 'PlusJakartaSans_600SemiBold',
    700: 'PlusJakartaSans_700Bold',
    800: 'PlusJakartaSans_800ExtraBold',
  },
  mono: { 400: 'JetBrainsMono_400Regular', 500: 'JetBrainsMono_500Medium', 600: 'JetBrainsMono_600SemiBold', 700: 'JetBrainsMono_700Bold' },
} as const;
export type FontRole = keyof typeof FONTS;

/** HUD: etiquetas, horas y cifras (JetBrains Mono). */
export const mono = FONTS.mono[400];
/** Monoespaciada del sistema, para lienzos que no ven las fuentes cargadas (Skia en el teléfono). */
export const monoSystem = Platform.select({ ios: 'Menlo', default: 'monospace' });

export const S = {
  pad: space('space-screen'),
  gap: space('space-md'),
  radius: radius('radius-card'),
  xs: space('space-xs'),
  sm: space('space-sm'),
  card: space('space-card'),
  touch: space('touch-min'),
  column: space('column-max'),
  columnWide: space('column-wide'),
  columnDesk: space('column-desk'),
  /** Ancho de ventana desde el que se usa el diseño de computadora (ver useLayout). */
  breakpoint: space('breakpoint-wide'),
};

export const R = {
  chipEvent: radius('radius-chip-event'),
  control: radius('radius-control'),
  field: radius('radius-field'),
  button: radius('radius-button'),
  card: radius('radius-card'),
  bar: radius('radius-bar'),
  pill: radius('radius-pill'),
};
