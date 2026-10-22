// YO · Finanzas. Las especificaciones de esta vista están por llegar (un MD de Andrés): por ahora solo
// la entrada al módulo, sin datos inventados.
import { StyleSheet, Text, View } from 'react-native';

import { Card, Label, Screen, Title } from '@/components/ui';
import { C } from '@/theme';

export default function Finanzas() {
  return (
    <Screen module="Módulo 03.2 · Finanzas" back>
      <View style={{ gap: 2 }}>
        <Label>Yo · finanzas personales</Label>
        <Title accent="finanzas">Tus</Title>
      </View>
      <Card>
        <Label>En construcción</Label>
        <Text style={styles.caption}>[pendiente] Este módulo se arma con las especificaciones de la vista de finanzas.</Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  caption: { color: C.muted, fontSize: 12.5, lineHeight: 18 },
});
