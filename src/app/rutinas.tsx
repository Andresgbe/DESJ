// Pantalla 03 · Rutinas: avisos que se activan solos a su hora.
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Mono, Screen, Title } from '@/components/ui';
import { useStore } from '@/lib/store';
import { C } from '@/theme';

export default function Rutinas() {
  const { routines, toggleRoutine } = useStore();
  return (
    <Screen module="Módulo 03 · Rutinas">
      <Title accent="rutinas">Las</Title>
      <Text style={{ color: C.muted, fontSize: 14 }}>Se activan solas, a su hora. Tú no haces nada.</Text>
      {routines.map((r) => (
        <View key={r.id} style={styles.item}>
          <Mono style={{ width: 70, fontSize: 13, fontWeight: '600', color: C.accentSoft }}>{r.when}</Mono>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>{r.name}</Text>
            <Text style={{ color: C.muted, fontSize: 12.5 }}>{r.desc}</Text>
          </View>
          <Pressable
            onPress={() => toggleRoutine(r.id)}
            accessibilityRole="switch"
            accessibilityState={{ checked: r.on }}
            accessibilityLabel={r.name}
            style={[styles.track, r.on && styles.trackOn]}>
            <View style={[styles.knob, r.on && styles.knobOn]} />
          </Pressable>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderColor: C.cardBorder, borderWidth: 1, borderRadius: 14, padding: 12 },
  track: { width: 52, height: 30, borderRadius: 15, borderWidth: 1, borderColor: C.border, backgroundColor: '#0C0817', justifyContent: 'center', padding: 3 },
  trackOn: { borderColor: C.accent, backgroundColor: 'rgba(168,85,247,0.35)' },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#6D5A8E' },
  knobOn: { backgroundColor: '#E9DDFF', alignSelf: 'flex-end' },
});
