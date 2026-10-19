// Piezas visuales reutilizables: pantalla, tarjeta, etiquetas y el anillo HUD.
import { router } from 'expo-router';
import { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextProps, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';

import { IconBack } from '@/components/icons';
import { NeuralBackground } from '@/components/neural-bg';
import { ProfileButton } from '@/components/profile-menu';
import { useMotion } from '@/lib/motion';
import { C, mono, S } from '@/theme';

/**
 * `menu`: botón extra en el header, a la izquierda del perfil (p. ej. el menú hamburguesa del Núcleo).
 * `back`: muestra la flecha para volver (pantallas dentro de un módulo, como YO → Salud).
 */
export function Screen({ module, children, scroll = true, wide = false, menu, back = false }: { module: string; children: ReactNode; scroll?: boolean; wide?: boolean; menu?: ReactNode; back?: boolean }) {
  const body = scroll ? (
    <ScrollView contentContainerStyle={[styles.content, wide && styles.wide]} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, wide && styles.wide, { flex: 1, paddingBottom: 8 }]}>{children}</View>
  );
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <NeuralBackground />
      <View style={[styles.header, wide && styles.wide]}>
        {back ? (
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back} accessibilityRole="button" accessibilityLabel="Volver">
            <IconBack color={C.accentSoft} size={20} />
            <Text style={styles.brand}>DESJ</Text>
          </Pressable>
        ) : (
          <Text style={styles.brand}>● DESJ</Text>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
          <Label numberOfLines={1} style={{ flexShrink: 1 }}>{module}</Label>
          <MotionToggle />
          {menu}
          <ProfileButton />
        </View>
      </View>
      {body}
    </SafeAreaView>
  );
}

/** Interruptor de animaciones del header: en OFF el cerebro y la red de fondo quedan estáticos. */
export function MotionToggle() {
  const { animations, setAnimations } = useMotion();
  return (
    <Pressable
      onPress={() => setAnimations(!animations)}
      hitSlop={6}
      style={styles.toggle}
      accessibilityRole="switch"
      accessibilityState={{ checked: animations }}
      accessibilityLabel="Animaciones"
      accessibilityHint={animations ? "Apágalas para que la app quede estática y consuma menos" : "Enciéndelas para que el cerebro vuelva a girar"}>
      <View style={[styles.dot, { backgroundColor: animations ? C.accent : C.muted }]} />
      <Text style={[styles.toggleText, { color: animations ? C.accentSoft : C.muted }]}>{animations ? 'Anim on' : 'Anim off'}</Text>
    </Pressable>
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
      <Circle cx={110} cy={110} r={58} stroke={C.hudCore} strokeWidth={1.2} fill={C.hudCoreFill} />
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

// En pantallas anchas (web, iPad) el contenido no se estira: columna centrada.
const WIDE = { width: '100%', maxWidth: 640, alignSelf: 'center' } as const;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: S.pad + 4,
    paddingTop: 8,
    paddingBottom: 4,
    ...WIDE,
  },
  brand: { fontFamily: mono, fontSize: 12, letterSpacing: 3, color: C.accentSoft },
  content: { padding: S.pad, gap: S.gap, paddingBottom: 40, ...WIDE },
  // Pantallas que aprovechan el ancho en computadora/iPad (p. ej. el calendario).
  wide: { maxWidth: 1200 },
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
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 32, paddingHorizontal: 9, borderRadius: 10, borderWidth: 1, borderColor: C.cardBorder },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44, marginLeft: -6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  toggleText: { fontFamily: mono, fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
});
