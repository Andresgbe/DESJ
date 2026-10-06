// Pantalla · Negocios: ganadería, legal y mercado (por ahora con datos de ejemplo).
import { StyleSheet, Text, View } from 'react-native';

import { Card, Label, Mono, Row, Screen, Title } from '@/components/ui';
import { C, mono } from '@/theme';

function Soon() {
  return <Text style={styles.soon}>EJEMPLO</Text>;
}

export default function Negocios() {
  return (
    <Screen module="Módulo · Negocios">
      <Title accent="negocios">Tus</Title>

      <Card>
        <Row><Label style={{ color: C.accentSoft }}>Ganadería</Label><Soon /></Row>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Stat k="Cabezas" v="148" />
          <Stat k="Lotes" v="6" />
          <Stat k="Alertas" v="3" color={C.warn} />
        </View>
        <Row><Text style={styles.item}>Lote 3 · vacuna aftosa</Text><Mono style={{ fontSize: 11, color: C.warn }}>19 OCT</Mono></Row>
        <Row><Text style={styles.item}>Lote 1 · pesaje</Text><Mono style={{ fontSize: 11, color: C.accentSoft }}>VIE 10</Mono></Row>
      </Card>

      <Card>
        <Row><Label style={{ color: C.accentSoft }}>Legal · inmuebles y vehículos</Label><Soon /></Row>
        <Text style={styles.item}>Pregúntale a DESJ por trámites. Responderá con base en leyes venezolanas cargadas y citará la fuente.</Text>
        <Text style={styles.muted}>Validar siempre con abogado.</Text>
      </Card>

      <Card>
        <Row><Label style={{ color: C.accentSoft }}>Mercado</Label><Soon /></Row>
        <Row><Text style={styles.item}>Oro (onza)</Text><Mono>[precio]</Mono></Row>
        <Row><Text style={styles.item}>Plata (onza)</Text><Mono>[precio]</Mono></Row>
        <Row><Text style={styles.item}>Ganado en pie (kg)</Text><Mono>[precio]</Mono></Row>
        <Text style={styles.muted}>Información de mercado · no es asesoría financiera.</Text>
      </Card>
    </Screen>
  );
}

function Stat({ k, v, color = C.text }: { k: string; v: string; color?: string }) {
  return (
    <View style={styles.stat}>
      <Label>{k}</Label>
      <Text style={{ fontFamily: mono, fontSize: 22, fontWeight: '600', color }}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  item: { color: C.text, fontSize: 14.5, flex: 1, lineHeight: 20 },
  muted: { color: C.muted, fontSize: 12 },
  soon: { fontFamily: mono, fontSize: 10, letterSpacing: 1, color: C.warn },
  stat: { flex: 1, backgroundColor: '#0C0817', borderRadius: 12, padding: 10, gap: 2, borderWidth: 1, borderColor: C.cardBorder },
});
