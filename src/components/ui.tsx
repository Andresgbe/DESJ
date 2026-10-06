// Piezas visuales reutilizables: pantalla, tarjeta, etiquetas y el anillo HUD.
import { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, TextProps, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';

import { C, mono, S } from '@/theme';

export function Screen({ module, children, scroll = true }: { module: string; children: ReactNode; scroll?: boolean }) {
  const body = scroll ? (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, { flex: 1 }]}>{children}</View>
  );
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.brand}>● DESJ</Text>
        <Label>{module}</Label>
      </View>
      {body}
    </SafeAreaView>
  );
}

export function Title({ children, accent }: { children: string; accent?: string }) {
  return (
    <Text style={styles.title}>
      {children}
      {accent ? <Text style={{ color: C.accentText }}> {accent}</Text> : null}
    </Text>
  );
}

export function Label({ children, style, ...rest }: TextProps & { children: ReactNode }) {
  return (
    <Text style={[styles.label, style]} {...rest}>
      {children}
    </Text>
  );
}

export function Mono({ children, style, ...rest }: TextProps & { children: ReactNode }) {
  return (
    <Text style={[{ fontFamily: mono, color: C.text }, style]} {...rest}>
      {children}
    </Text>
  );
}

export function Card({ children, style, glow }: { children: ReactNode; style?: ViewStyle; glow?: boolean }) {
  return <View style={[styles.card, glow && styles.glow, style]}>{children}</View>;
}

export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

/** Anillo tipo HUD. `progress` va de 0 a 1. */
export function HudRing({ size = 210, big, small, progress }: { size?: number; big: string; small: string; progress?: number }) {
  const r = 100;
  const circ = 2 * Math.PI * 58;
  return (
    <Svg width={size} height={size} viewBox="0 0 220 220">
      <Circle cx={110} cy={110} r={r} stroke={C.cardBorder} strokeWidth={1} fill="none" />
      <Path d="M110 10 A100 100 0 0 1 193 54" stroke={C.accent} strokeWidth={3} strokeLinecap="round" fill="none" />
      <Path d="M50 190 A100 100 0 0 1 18 149" stroke={C.accentSoft} strokeWidth={2} strokeLinecap="round" fill="none" />
      <Circle cx={110} cy={110} r={80} stroke={C.border} strokeWidth={1} strokeDasharray="3 5" fill="none" />
      <Circle cx={110} cy={110} r={58} stroke="#8B5CF6" strokeWidth={1.2} fill="rgba(168,85,247,0.10)" />
      {progress !== undefined && (
        <Circle
          cx={110}
          cy={110}
          r={58}
          stroke={C.accent}
          strokeWidth={5}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circ * progress} ${circ}`}
          transform="rotate(-90 110 110)"
        />
      )}
      <SvgText x={110} y={116} textAnchor="middle" fill={C.text} fontFamily={mono} fontSize={30} fontWeight="600">
        {big}
      </SvgText>
      <SvgText x={110} y={138} textAnchor="middle" fill={C.muted} fontFamily={mono} fontSize={9} letterSpacing={2}>
        {small}
      </SvgText>
    </Svg>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: S.pad + 4,
    paddingTop: 8,
    paddingBottom: 4,
  },
  brand: { fontFamily: mono, fontSize: 12, letterSpacing: 3, color: C.accentSoft },
  content: { padding: S.pad, gap: S.gap, paddingBottom: 40 },
  title: { fontSize: 30, fontWeight: '800', color: C.text, letterSpacing: -0.5 },
  label: { fontFamily: mono, fontSize: 10.5, letterSpacing: 2, color: C.muted, textTransform: 'uppercase' },
  card: {
    backgroundColor: C.card,
    borderColor: C.cardBorder,
    borderWidth: 1,
    borderRadius: S.radius,
    padding: 14,
    gap: 10,
  },
  glow: {
    borderColor: C.border,
    shadowColor: C.accent,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
});
