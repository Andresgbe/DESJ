// YO · Plan físico. Todavía no hay dónde guardar una rutina: muestra el objetivo de salud que DESJ
// ya conoce (salud.md) y deja claro qué falta, sin inventar datos.
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { Card, Label, Screen, Title } from '@/components/ui';
import { readField, useKnowledge } from '@/lib/knowledge';
import { C } from '@/theme';

export default function PlanFisico() {
  const { docs } = useKnowledge();
  const goal = readField(docs, ['Objetivo de salud', 'Objetivo', 'Objetivos']);

  return (
    <Screen module="Yo · Plan físico" back>
      <Title accent="físico">Tu plan</Title>

      <Card>
        <Label>Objetivo</Label>
        <Text style={goal ? styles.value : styles.pending}>{goal ?? '[pendiente]'}</Text>
      </Card>

      <Card>
        <Label>Rutina, metas y avance</Label>
        <Text style={styles.pending}>[pendiente]</Text>
        <Text style={styles.note}>Este módulo todavía no guarda tu rutina. Mientras tanto, cuéntale a DESJ tu objetivo y tus datos (peso, talla) para que los tenga en cuenta.</Text>
      </Card>

      <Pressable onPress={() => router.push('/conocimiento')} style={styles.btn} accessibilityRole="button">
        <Text style={styles.btnText}>Completar mis datos con DESJ</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  value: { color: C.text, fontSize: 15, lineHeight: 21 },
  pending: { color: C.muted, fontSize: 15 },
  note: { color: C.muted, fontSize: 12.5, lineHeight: 18 },
  btn: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: C.accent },
  btnText: { color: C.onAccent, fontSize: 14.5, fontWeight: '700' },
});
