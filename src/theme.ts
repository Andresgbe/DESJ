// Paleta y tipografía de DESJ (estética HUD morada).
import { Platform } from 'react-native';

export const C = {
  bg: '#07050D',
  card: '#120C1F',
  cardBorder: '#2B2142',
  border: '#4C3780',
  accent: '#A855F7',
  accentSoft: '#C4B5FD',
  accentText: '#C9A7FF',
  text: '#F1EAFE',
  muted: '#A99BC4',
  ok: '#6EE7B7',
  warn: '#F5B451',
  bad: '#FB7185',
  onAccent: '#0B0614',
};

export const mono = Platform.select({ ios: 'Menlo', default: 'monospace' });

export const S = {
  pad: 20,
  gap: 12,
  radius: 16,
};
