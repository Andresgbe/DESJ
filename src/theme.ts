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
};

/** Colores de los grupos del cerebro (NeuralCore), en el mismo orden que CLUSTERS en brain-graph.ts. */
export const NEURAL = [
  color('neural-memoria'),
  color('neural-conocimiento'),
  color('neural-negocios'),
  color('neural-salud'),
  color('neural-pendientes'),
  color('neural-calendario'),
];

// Las familias del Design System son pilas CSS; en el teléfono se usa la fuente del sistema y Menlo.
export const mono = Platform.select({ ios: 'Menlo', default: 'monospace' });

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
