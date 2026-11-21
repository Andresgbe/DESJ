// Text y TextInput de DESJ: los de React Native con la tipografía DESJ Aether.
// Las fuentes se cargan una familia por peso (Sora_700Bold, PlusJakartaSans_400Regular…), así que aquí se traduce
// el estilo de siempre a la familia que toca:
// - `fontFamily: mono` → JetBrains Mono del peso más cercano.
// - Títulos (20 px o más y peso 600 o más) → Sora.
// - Todo lo demás → Plus Jakarta Sans.
// Un Text dentro de otro hereda el papel (mono, título o texto) y el peso del de afuera, como en React Native.
// El peso va en la familia; `fontWeight` se deja en normal para que la web no invente una negrita encima.
import { createContext, forwardRef, useContext } from 'react';
import { Text as RNText, TextInput as RNTextInput, StyleSheet, type TextInputProps, type TextProps, type TextStyle } from 'react-native';

import { FONTS, type FontRole, monoSystem } from '@/theme';

type Inherited = { role: FontRole; weight: number } | null;
const Parent = createContext<Inherited>(null);

const WEIGHTS: Record<string, number> = { normal: 400, bold: 700 };

function weightOf(w: TextStyle['fontWeight']): number | null {
  if (w == null) return null;
  if (typeof w === 'number') return w;
  return WEIGHTS[w] ?? (Number(w) || null);
}

function roleOf(family: string | undefined): FontRole | 'other' | null {
  if (!family) return null;
  if (family.startsWith('JetBrainsMono') || family === monoSystem) return 'mono';
  if (family.startsWith('Sora')) return 'title';
  if (family.startsWith('PlusJakartaSans')) return 'body';
  return 'other';
}

/** La familia cargada más cercana a ese peso. */
function familyFor(role: FontRole, weight: number) {
  const faces = FONTS[role] as Record<number, string>;
  const best = Object.keys(faces)
    .map(Number)
    .reduce((a, b) => (Math.abs(b - weight) < Math.abs(a - weight) ? b : a));
  return faces[best];
}

/** Papel, peso y estilo de fuente que corresponden a un estilo (null si usa una fuente ajena a DESJ). */
function resolve(style: TextProps['style'], parent: Inherited) {
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  const explicit = roleOf(flat.fontFamily);
  if (explicit === 'other') return null;
  const weight = weightOf(flat.fontWeight) ?? parent?.weight ?? 400;
  const role: FontRole = explicit ?? parent?.role ?? ((flat.fontSize ?? 0) >= 20 && weight >= 600 ? 'title' : 'body');
  return { role, weight, font: { fontFamily: familyFor(role, weight), fontWeight: 'normal' as const } };
}

export const Text = forwardRef<RNText, TextProps>(function Text({ style, children, ...rest }, ref) {
  const parent = useContext(Parent);
  const r = resolve(style, parent);
  return (
    <RNText ref={ref} {...rest} style={r ? [style, r.font] : style}>
      {r ? <Parent.Provider value={{ role: r.role, weight: r.weight }}>{children}</Parent.Provider> : children}
    </RNText>
  );
});

export const TextInput = forwardRef<RNTextInput, TextInputProps>(function TextInput({ style, ...rest }, ref) {
  const r = resolve(style, null);
  return <RNTextInput ref={ref} {...rest} style={r ? [style, r.font] : style} />;
});
