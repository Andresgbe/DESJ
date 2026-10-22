// Piezas de la pestaña MÓDULOS: el ícono de cada tipo y el formulario de un módulo nuevo o editado.
import { useState } from 'react';
import { ColorValue, Pressable, StyleSheet, Text, View } from 'react-native';

import { Btn, Field } from '@/components/form';
import { IconBusiness, IconCar, IconFolder, IconGrid, IconHome, IconPaw, IconPlane } from '@/components/icons';
import { Card, Label, Row } from '@/components/ui';
import { notify } from '@/lib/confirm';
import { MODULE_KINDS, Module, ModuleInput, ModuleKind } from '@/lib/modules';
import { C, R } from '@/theme';

export function ModuleIcon({ kind, color, size = 22 }: { kind: ModuleKind; color: ColorValue; size?: number }) {
  const Icon = { negocios: IconBusiness, vehiculo: IconCar, hogar: IconHome, mascotas: IconPaw, viajes: IconPlane, documentos: IconFolder, otro: IconGrid }[kind];
  return <Icon color={color} size={size} />;
}

/** Nuevo módulo o edición. Al elegir el tipo se propone su nombre (se puede cambiar, p. ej. "Toyota Hilux"). */
export function ModuleForm({ initial, hasNegocios, onSave, onCancel }: { initial?: Module; hasNegocios: boolean; onSave: (m: ModuleInput) => Promise<void>; onCancel: () => void }) {
  const [form, setForm] = useState<ModuleInput>(initial ? { kind: initial.kind, name: initial.name, description: initial.description } : { kind: 'vehiculo', name: 'Vehículo', description: '' });
  // Negocios tiene vista propia: solo uno, y no se convierte en otro tipo ni al revés.
  const kinds = MODULE_KINDS.filter((k) => (initial ? (initial.kind === 'negocios') === (k.id === 'negocios') : k.id !== 'negocios' || !hasNegocios));
  const labelOf = (kind: ModuleKind) => MODULE_KINDS.find((k) => k.id === kind)!.label;

  const pick = (kind: ModuleKind) =>
    setForm((f) => ({ ...f, kind, name: !f.name.trim() || f.name === labelOf(f.kind) ? labelOf(kind) : f.name }));

  const save = () => {
    if (!form.name.trim()) return notify('Ponle un nombre al módulo, por ejemplo "Toyota Hilux" o "Casa de la playa".');
    void onSave(form);
  };

  return (
    <Card glow>
      <Label style={{ color: C.accentSoft }}>{initial ? 'Editar módulo' : 'Nuevo módulo'}</Label>
      <View style={{ gap: 6 }}>
        <Label>Tipo</Label>
        <View style={styles.kinds} accessibilityRole="radiogroup">
          {kinds.map((k) => {
            const on = k.id === form.kind;
            return (
              <Pressable key={k.id} onPress={() => pick(k.id)} style={[styles.kind, on && styles.kindOn]} accessibilityRole="radio" accessibilityState={{ checked: on }}>
                <ModuleIcon kind={k.id} color={on ? C.accentSoft : C.muted} size={20} />
                <Text style={[styles.kindText, on && { color: C.text }]}>{k.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <Field label="Nombre" placeholder="Ej. Toyota Hilux" value={form.name} onChangeText={(name) => setForm((f) => ({ ...f, name }))} maxLength={80} />
      <Field
        label="Descripción"
        placeholder={`Opcional. ${MODULE_KINDS.find((k) => k.id === form.kind)!.hint}`}
        value={form.description}
        onChangeText={(description) => setForm((f) => ({ ...f, description }))}
      />
      <Row>
        <Btn label="Cancelar" kind="ghost" onPress={onCancel} />
        <Btn label="Guardar" onPress={save} />
      </Row>
    </Card>
  );
}

const styles = StyleSheet.create({
  kinds: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kind: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 12, borderRadius: R.pill, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.surfaceInput },
  kindOn: { borderColor: C.accent, backgroundColor: C.surfaceSelected },
  kindText: { color: C.chipText, fontSize: 14, fontWeight: '600' },
});
