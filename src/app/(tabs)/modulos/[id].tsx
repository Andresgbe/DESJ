// Módulos · Vehículo: lo que viene (papeles por vencer y servicios que tocan), la ficha con el kilometraje,
// los mantenimientos (del más reciente al más antiguo) y los papeles con su foto o PDF.
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Btn, Field } from '@/components/form';
import { IconPlus } from '@/components/icons';
import { ModuleIcon } from '@/components/modules';
import { DocCard, DocForm, ServiceForm, ServiceRow, VehicleCard, VehicleForm } from '@/components/vehicle';
import { Card, Label, Row, Screen, Title } from '@/components/ui';
import { confirm, notify } from '@/lib/confirm';
import { useModules } from '@/lib/modules';
import { Service, upcoming, useVehicle, VehicleDoc } from '@/lib/vehicles';
import { C, R } from '@/theme';

export default function VehicleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ready: modulesReady, modules, reload: reloadModules, rename } = useModules();
  const v = useVehicle(id);
  const { reload } = v;
  const [editingCard, setEditingCard] = useState(false);
  const [service, setService] = useState<Service | 'new' | null>(null);
  const [doc, setDoc] = useState<VehicleDoc | 'new' | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const mod = modules.find((m) => m.id === id);

  // DESJ también registra mantenimientos desde el chat: se relee al volver.
  useFocusEffect(
    useCallback(() => {
      void reloadModules();
      void reload();
    }, [reloadModules, reload]),
  );

  // Negocios tiene su propia pantalla.
  useEffect(() => {
    if (mod?.kind === 'negocios') router.replace('/modulos/negocios');
  }, [mod?.kind]);

  if (!mod) {
    return (
      <Screen module="Módulos" back>
        <Text style={styles.caption}>{modulesReady ? 'Este módulo ya no existe.' : 'Cargando…'}</Text>
      </Screen>
    );
  }

  const coming = upcoming(v.vehicle, v.services, v.docs);
  const empty = v.ready && !v.vehicle.brand && !v.vehicle.model && v.vehicle.odometer_km === null;

  const removeService = async (s: Service) => {
    if (await confirm('Eliminar mantenimiento', `¿Eliminar este mantenimiento del ${s.service_date.split('-').reverse().join('/')}?`, 'Eliminar')) void v.removeService(s.id);
  };
  const removeDoc = async (d: VehicleDoc) => {
    if (await confirm('Eliminar papel', `¿Eliminar "${d.name}"${d.storage_path ? ' y su archivo' : ''}?`, 'Eliminar')) void v.removeDoc(d);
  };
  const saveName = async () => {
    setRenaming(null);
    if (renaming !== null && renaming.trim() && renaming.trim() !== mod.name && !(await rename(mod.id, renaming))) notify('No pude cambiar el nombre.');
  };

  return (
    <Screen module={`Módulos · ${mod.name}`} back>
      <Row style={{ justifyContent: 'flex-start' }}>
        <View style={styles.icon}>
          <ModuleIcon kind="vehiculo" color={C.accentSoft} size={24} />
        </View>
        <View style={{ gap: 2, flex: 1 }}>
          <Label>Vehículo</Label>
          <Title>{mod.name}</Title>
        </View>
      </Row>

      {/* Lo que viene: arriba de todo para que no se pase. */}
      {coming.length ? (
        <View style={styles.warnBox}>
          <Label style={{ color: C.warn }}>Próximos</Label>
          {coming.map((u) => (
            <View key={u.key} style={{ gap: 1 }}>
              <Text style={[styles.name, u.overdue && { color: C.bad }]}>{u.title}</Text>
              <Text style={styles.caption}>{u.detail}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {editingCard || empty ? (
        <VehicleForm
          initial={v.vehicle}
          onCancel={() => setEditingCard(false)}
          onSave={async (data) => {
            await v.saveVehicle(data);
            setEditingCard(false);
          }}
        />
      ) : (
        <VehicleCard vehicle={v.vehicle} onEdit={() => setEditingCard(true)} />
      )}

      <Row style={{ marginTop: 4 }}>
        <Label style={{ color: C.accentSoft }}>{`Mantenimientos (${v.services.length})`}</Label>
        {!service ? <Btn label="Agregar" kind="outline" icon={<IconPlus color={C.chipText} />} onPress={() => setService('new')} style={styles.small} /> : null}
      </Row>
      {service === 'new' ? (
        <ServiceForm
          currentKm={v.vehicle.odometer_km}
          onCancel={() => setService(null)}
          onSave={async (input) => {
            await v.saveService(input);
            setService(null);
          }}
        />
      ) : null}
      {v.ready && v.services.length === 0 && service !== 'new' ? (
        <Text style={styles.caption}>Anota cada cambio de aceite, frenos o cauchos con su kilometraje, y cuándo toca el próximo: DESJ te avisa aquí cuando se acerque.</Text>
      ) : null}
      {v.services.length ? (
        <Card style={{ gap: 4 }}>
          {v.services.map((s) =>
            service !== 'new' && service?.id === s.id ? (
              <ServiceForm
                key={s.id}
                initial={s}
                currentKm={v.vehicle.odometer_km}
                onCancel={() => setService(null)}
                onSave={async (input) => {
                  await v.saveService(input, s.id);
                  setService(null);
                }}
              />
            ) : (
              <ServiceRow key={s.id} s={s} onEdit={() => setService(s)} onRemove={() => removeService(s)} />
            ),
          )}
        </Card>
      ) : null}

      <Row style={{ marginTop: 4 }}>
        <Label style={{ color: C.accentSoft }}>{`Papeles (${v.docs.length})`}</Label>
        {!doc ? <Btn label="Agregar" kind="outline" icon={<IconPlus color={C.chipText} />} onPress={() => setDoc('new')} style={styles.small} /> : null}
      </Row>
      {doc === 'new' ? (
        <DocForm
          cloud={v.cloud}
          onCancel={() => setDoc(null)}
          onSave={async (input, file) => {
            await v.saveDoc(input, file);
            setDoc(null);
          }}
        />
      ) : null}
      {v.ready && v.docs.length === 0 && doc !== 'new' ? <Text style={styles.caption}>Guarda el seguro, la revisión y el título con su vencimiento y la foto: te aviso un mes antes de que venzan.</Text> : null}
      {v.docs.map((d) =>
        doc !== 'new' && doc?.id === d.id ? (
          <DocForm
            key={d.id}
            initial={d}
            cloud={v.cloud}
            onCancel={() => setDoc(null)}
            onSave={async (input, file) => {
              await v.saveDoc(input, file, d.id);
              setDoc(null);
            }}
          />
        ) : (
          <DocCard key={d.id} d={d} getUrl={v.docUrl} onEdit={() => setDoc(d)} onRemove={() => removeDoc(d)} />
        ),
      )}

      {renaming !== null ? (
        <Card glow>
          <Field label="Nombre del vehículo" value={renaming} onChangeText={setRenaming} onSubmitEditing={saveName} autoFocus maxLength={80} />
          <Row style={{ justifyContent: 'flex-end' }}>
            <Btn label="Cancelar" kind="ghost" onPress={() => setRenaming(null)} style={styles.small} />
            <Btn label="Guardar" onPress={saveName} style={styles.small} />
          </Row>
        </Card>
      ) : (
        <Btn label="Cambiar nombre del vehículo" kind="ghost" onPress={() => setRenaming(mod.name)} style={{ ...styles.small, alignSelf: 'center', marginTop: 8 }} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  name: { color: C.text, fontSize: 15, fontWeight: '600' },
  caption: { color: C.muted, fontSize: 12.5, lineHeight: 18 },
  small: { flexGrow: 0, minHeight: 44, paddingHorizontal: 14 },
  icon: { width: 44, height: 44, borderRadius: R.control, borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceInput, alignItems: 'center', justifyContent: 'center' },
  warnBox: { gap: 8, padding: 14, borderRadius: R.card, borderWidth: 1, borderColor: C.warn, backgroundColor: C.surfaceInput },
});
