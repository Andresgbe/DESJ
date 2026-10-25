// Pestaña MÓDULOS: tus módulos. Tocas uno y abre su vista (cada tipo es distinto). "Agregar módulo" muestra el
// catálogo de los que existen (hoy Negocios y Vehículo); con "Editar" los quitas o cambias el orden.
import { router, useFocusEffect } from 'expo-router';
import { ReactNode, useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Btn } from '@/components/form';
import { IconArrowDown, IconArrowUp, IconChevron, IconPlus } from '@/components/icons';
import { Catalog, ModuleIcon } from '@/components/modules';
import { Card, Label, Row, Screen, Title } from '@/components/ui';
import { confirm, notify } from '@/lib/confirm';
import { catalogOf, Module, useModules } from '@/lib/modules';
import { C, R } from '@/theme';

export default function Modulos() {
  const { ready, modules, reload, addModule, removeModule, move } = useModules();
  const [catalog, setCatalog] = useState(false);
  const [editing, setEditing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const open = (m: Module) =>
    m.kind === 'negocios' ? router.push('/modulos/negocios') : m.kind === 'nomore' ? router.push('/modulos/nomore') : m.kind === 'tobuy' ? router.push('/modulos/tobuy') : router.push({ pathname: '/modulos/[id]', params: { id: m.id } });

  const remove = async (m: Module) => {
    const extra =
      m.kind === 'vehiculo' ? ' Se borran también su ficha, mantenimientos y papeles.' : m.kind === 'nomore' ? ' Se borran también tu PIN, tus contadores y su historial.' : m.kind === 'tobuy' ? ' Se borra también toda la lista y sus categorías.' : '';
    if (await confirm('Quitar módulo', `¿Quitar "${m.name}"?${extra} No se puede deshacer.`, 'Quitar')) void removeModule(m.id);
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

      {ready && modules.length === 0 && !catalog ? (
        <Card>
          <Label>Sin módulos</Label>
          <Text style={styles.caption}>Agrega los que te sirvan desde el catálogo: tus negocios, cada vehículo que tengas, tu lista de compras o lo que estás dejando.</Text>
        </Card>
      ) : null}

      {modules.map((m, i) => (
        <View key={m.id} style={styles.row}>
          <Pressable
            onPress={() => (editing ? null : open(m))}
            disabled={editing}
            style={({ pressed }) => [styles.module, pressed && { backgroundColor: C.surfaceSelected }]}
            accessibilityRole="button"
            accessibilityHint="Abrir el módulo">
            <View style={styles.icon}>
              <ModuleIcon kind={m.kind} color={C.accentSoft} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.name} numberOfLines={1}>
                {m.name}
              </Text>
              <Text style={styles.caption} numberOfLines={1}>
                {m.kind === 'vehiculo' && m.name !== 'Vehículo' ? 'Vehículo' : catalogOf(m.kind).description}
              </Text>
            </View>
            {editing ? null : <IconChevron color={C.muted} />}
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
      ))}

      {catalog ? (
        <Catalog
          modules={modules}
          onClose={() => setCatalog(false)}
          onAdd={async (kind, name) => {
            const id = await addModule(kind, name);
            if (!id) return notify('No pude agregar el módulo. Revisa tu conexión e intenta de nuevo.');
            setCatalog(false);
            // Recién agregado: se abre para llenarlo.
            if (kind === 'vehiculo') router.push({ pathname: '/modulos/[id]', params: { id } });
            if (kind === 'nomore') router.push('/modulos/nomore');
            if (kind === 'tobuy') router.push('/modulos/tobuy');
          }}
        />
      ) : (
        <Btn label="Agregar módulo" kind="outline" icon={<IconPlus color={C.chipText} />} onPress={() => setCatalog(true)} />
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
  tools: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  tool: { minWidth: 44, minHeight: 44, paddingHorizontal: 12, borderRadius: R.control, borderWidth: 1, borderColor: C.cardBorder, alignItems: 'center', justifyContent: 'center' },
  removeText: { color: C.bad, fontSize: 13, fontWeight: '600' },
});
