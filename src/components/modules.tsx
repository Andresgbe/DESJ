// Piezas de la pestaña MÓDULOS: el ícono de cada tipo y el catálogo de módulos disponibles.
import { useState } from 'react';
import { ColorValue, StyleSheet, Text, TextInput, View } from 'react-native';

import { Btn } from '@/components/form';
import { IconBusiness, IconCar, IconCart, IconNoMore } from '@/components/icons';
import { Card, Label, Row } from '@/components/ui';
import { CATALOG, Module, ModuleKind } from '@/lib/modules';
import { C, R } from '@/theme';

export function ModuleIcon({ kind, color, size = 22 }: { kind: ModuleKind; color: ColorValue; size?: number }) {
  if (kind === 'vehiculo') return <IconCar color={color} size={size} />;
  if (kind === 'nomore') return <IconNoMore color={color} size={size} />;
  if (kind === 'tobuy') return <IconCart color={color} size={size} />;
  return <IconBusiness color={color} size={size} />;
}

/**
 * Catálogo: los módulos que existen, con su descripción. Negocios se agrega una sola vez; Vehículo, uno por
 * carro o moto (pide el nombre: "Toyota Hilux").
 */
export function Catalog({ modules, onAdd, onClose }: { modules: Module[]; onAdd: (kind: ModuleKind, name: string) => Promise<void>; onClose: () => void }) {
  const [naming, setNaming] = useState<ModuleKind | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async (kind: ModuleKind, label: string) => {
    setBusy(true);
    try {
      await onAdd(kind, name.trim() || label);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card glow>
      <Row>
        <Label style={{ color: C.accentSoft }}>Módulos disponibles</Label>
        <Btn label="Cerrar" kind="ghost" onPress={onClose} style={styles.small} />
      </Row>
      {CATALOG.map((c) => {
        const count = modules.filter((m) => m.kind === c.kind).length;
        const taken = !c.multiple && count > 0;
        return (
          <View key={c.kind} style={styles.item}>
            <View style={styles.line}>
              <View style={styles.icon}>
                <ModuleIcon kind={c.kind} color={C.accentSoft} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.name}>{c.label}</Text>
                <Text style={styles.caption}>{c.description}</Text>
                {c.multiple && count ? <Text style={styles.caption}>{`Tienes ${count}. Puedes agregar otro.`}</Text> : null}
              </View>
            </View>
            {naming === c.kind ? (
              <View style={{ gap: 8 }}>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  onSubmitEditing={() => add(c.kind, c.label)}
                  placeholder="Nombre, ej. Toyota Hilux"
                  placeholderTextColor={C.muted}
                  autoFocus
                  maxLength={80}
                  style={styles.input}
                  accessibilityLabel="Nombre del vehículo"
                />
                <Row style={{ justifyContent: 'flex-end' }}>
                  <Btn label="Cancelar" kind="ghost" onPress={() => setNaming(null)} style={styles.small} />
                  <Btn label={busy ? 'Agregando…' : 'Agregar'} onPress={() => add(c.kind, c.label)} disabled={busy} style={styles.small} />
                </Row>
              </View>
            ) : (
              <Btn
                label={taken ? 'Ya lo tienes' : 'Agregar'}
                kind={taken ? 'ghost' : 'primary'}
                disabled={taken || busy}
                onPress={() => (c.multiple ? (setName(''), setNaming(c.kind)) : add(c.kind, c.label))}
                style={{ ...styles.small, alignSelf: 'flex-end' }}
              />
            )}
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  item: { gap: 10, padding: 12, borderRadius: R.card, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.surfaceSunken },
  line: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  icon: { width: 40, height: 40, borderRadius: R.control, borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceInput, alignItems: 'center', justifyContent: 'center' },
  name: { color: C.text, fontSize: 15.5, fontWeight: '600' },
  caption: { color: C.muted, fontSize: 12.5, lineHeight: 18 },
  small: { flexGrow: 0, minHeight: 44, paddingHorizontal: 16 },
  input: { color: C.text, fontSize: 15, borderWidth: 1, borderColor: C.cardBorder, borderRadius: R.field, paddingHorizontal: 12, minHeight: 44, backgroundColor: C.surfaceInput },
});
