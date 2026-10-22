// Pestaña MÓDULOS: tus módulos (Negocios, Vehículo, Hogar…). Tocas uno y abre su vista; con "Editar"
// los quitas o cambias el orden, y con "Agregar módulo" sumas uno nuevo.
import { router, useFocusEffect } from 'expo-router';
import { ReactNode, useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Btn } from '@/components/form';
import { IconArrowDown, IconArrowUp, IconChevron, IconPlus } from '@/components/icons';
import { ModuleForm, ModuleIcon } from '@/components/modules';
import { Card, Label, Row, Screen, Title } from '@/components/ui';
import { confirm, notify } from '@/lib/confirm';
import { MODULE_KINDS, Module, useModules } from '@/lib/modules';
import { C, R } from '@/theme';

export default function Modulos() {
  const { ready, modules, entries, reload, saveModule, removeModule, move } = useModules();
  const [form, setForm] = useState<Module | 'new' | null>(null);
  const [editing, setEditing] = useState(false);

  // DESJ también anota registros desde el chat: se relee al volver.
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const open = (m: Module) =>
    m.kind === 'negocios' ? router.push('/modulos/negocios') : router.push({ pathname: '/modulos/[id]', params: { id: m.id } });

  const remove = async (m: Module) => {
    const n = entries.filter((e) => e.moduleId === m.id).length;
    const extra = n ? ` También se borran sus ${n} registros.` : '';
    if (await confirm('Quitar módulo', `¿Quitar "${m.name}"?${extra} No se puede deshacer.`, 'Quitar')) void removeModule(m.id);
  };

  const sub = (m: Module) => {
    if (m.description) return m.description;
    const n = entries.filter((e) => e.moduleId === m.id).length;
    if (m.kind === 'negocios') return MODULE_KINDS[0].hint;
    return n ? `${n} ${n === 1 ? 'registro' : 'registros'}` : 'Sin registros todavía';
  };

  return (
    <Screen module="Módulo 04 · Módulos">
      <Row>
        <View style={{ gap: 2, flex: 1 }}>
          <Label>Tus categorías</Label>
          <Title accent="módulos">Tus</Title>
        </View>
        {modules.length ? (
          <Pressable onPress={() => setEditing((e) => !e)} style={[styles.edit, editing && styles.editOn]} accessibilityRole="button">
            <Text style={[styles.editText, editing && { color: C.text }]}>{editing ? 'Listo' : 'Editar'}</Text>
          </Pressable>
        ) : null}
      </Row>

      {ready && modules.length === 0 && !form ? (
        <Card>
          <Label>Sin módulos</Label>
          <Text style={styles.caption}>Agrega uno para cada cosa que quieras llevar con DESJ: tu negocio, tu carro, tu casa, tus mascotas…</Text>
        </Card>
      ) : null}

      {modules.map((m, i) =>
        form !== 'new' && form?.id === m.id ? null : (
          <View key={m.id} style={styles.row}>
            <Pressable
              onPress={() => (editing ? setForm(m) : open(m))}
              style={({ pressed }) => [styles.module, pressed && { backgroundColor: C.surfaceSelected }]}
              accessibilityRole="button"
              accessibilityHint={editing ? 'Editar nombre y descripción' : 'Abrir el módulo'}>
              <View style={styles.icon}>
                <ModuleIcon kind={m.kind} color={C.accentSoft} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {m.name}
                </Text>
                <Text style={styles.caption} numberOfLines={1}>
                  {sub(m)}
                </Text>
              </View>
              {editing ? <Text style={styles.editHint}>Editar</Text> : <IconChevron color={C.muted} />}
            </Pressable>
            {editing ? (
              <View style={styles.tools}>
                <Tool label={`Subir ${m.name}`} disabled={i === 0} onPress={() => move(m.id, -1)}>
                  <IconArrowUp color={i === 0 ? C.textFaint : C.chipText} />
                </Tool>
                <Tool label={`Bajar ${m.name}`} disabled={i === modules.length - 1} onPress={() => move(m.id, 1)}>
                  <IconArrowDown color={i === modules.length - 1 ? C.textFaint : C.chipText} />
                </Tool>
                <Tool label={`Quitar ${m.name}`} onPress={() => remove(m)}>
                  <Text style={styles.removeText}>Quitar</Text>
                </Tool>
              </View>
            ) : null}
          </View>
        ),
      )}

      {form ? (
        <ModuleForm
          initial={form === 'new' ? undefined : form}
          hasNegocios={modules.some((m) => m.kind === 'negocios')}
          onCancel={() => setForm(null)}
          onSave={async (input) => {
            const id = await saveModule(input, form === 'new' ? undefined : form.id);
            if (id) setForm(null);
            else notify('No pude guardar el módulo. Revisa tu conexión e intenta de nuevo.');
          }}
        />
      ) : (
        <Btn label="Agregar módulo" kind="outline" icon={<IconPlus color={C.chipText} />} onPress={() => setForm('new')} />
      )}
    </Screen>
  );
}

function Tool({ children, label, onPress, disabled }: { children: ReactNode; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={styles.tool} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { gap: 6 },
  module: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 68, paddingHorizontal: 14, borderRadius: R.card, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.card },
  icon: { width: 40, height: 40, borderRadius: R.control, borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceInput, alignItems: 'center', justifyContent: 'center' },
  name: { color: C.text, fontSize: 15.5, fontWeight: '600' },
  caption: { color: C.muted, fontSize: 12.5, lineHeight: 18 },
  edit: { minHeight: 44, paddingHorizontal: 16, borderRadius: R.pill, borderWidth: 1, borderColor: C.cardBorder, alignItems: 'center', justifyContent: 'center' },
  editOn: { borderColor: C.accent, backgroundColor: C.surfaceSelected },
  editText: { color: C.chipText, fontSize: 14, fontWeight: '600' },
  editHint: { color: C.accentSoft, fontSize: 13, fontWeight: '600' },
  tools: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  tool: { minWidth: 44, minHeight: 44, paddingHorizontal: 12, borderRadius: R.control, borderWidth: 1, borderColor: C.cardBorder, alignItems: 'center', justifyContent: 'center' },
  removeText: { color: C.bad, fontSize: 13, fontWeight: '600' },
});
