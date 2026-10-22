// Módulos · bitácora de un módulo (Vehículo, Hogar, Mascotas…): registros con título, fecha opcional y
// detalle, del más reciente al más antiguo. Ej. "Cambio de aceite · 12/10/2026 · 45.000 km".
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Btn, Field } from '@/components/form';
import { IconPlus } from '@/components/icons';
import { ModuleIcon } from '@/components/modules';
import { Card, Label, Mono, Row, Screen, Title } from '@/components/ui';
import { confirm, notify } from '@/lib/confirm';
import { formatDate, parseDate, toDmy } from '@/lib/dates';
import { Entry, MODULE_KINDS, useModules } from '@/lib/modules';
import { C } from '@/theme';

export default function ModuleView() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ready, modules, entries, reload, saveEntry, removeEntry } = useModules();
  const [form, setForm] = useState<Entry | 'new' | null>(null);
  const mod = modules.find((m) => m.id === id);
  const list = entries.filter((e) => e.moduleId === id);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  if (!mod) {
    return (
      <Screen module="Módulos" back>
        <Text style={styles.caption}>{ready ? 'Este módulo ya no existe.' : 'Cargando…'}</Text>
      </Screen>
    );
  }

  const kind = MODULE_KINDS.find((k) => k.id === mod.kind)!;
  const remove = async (e: Entry) => {
    if (await confirm('Borrar registro', `¿Borrar "${e.title}"?`, 'Borrar')) void removeEntry(e.id);
  };

  return (
    <Screen module={`Módulos · ${mod.name}`} back>
      <Row style={{ justifyContent: 'flex-start' }}>
        <ModuleIcon kind={mod.kind} color={C.accentSoft} size={28} />
        <View style={{ gap: 2, flex: 1 }}>
          <Label>{`${kind.label} · bitácora`}</Label>
          <Title>{mod.name}</Title>
        </View>
      </Row>
      {mod.description ? <Text style={styles.caption}>{mod.description}</Text> : null}

      {form ? (
        <EntryForm
          initial={form === 'new' ? undefined : form}
          onCancel={() => setForm(null)}
          onSave={async (input) => {
            if (await saveEntry(mod.id, input, form === 'new' ? undefined : form.id)) setForm(null);
            else notify('No pude guardar el registro. Revisa tu conexión e intenta de nuevo.');
          }}
        />
      ) : (
        <Btn label="Agregar registro" kind="outline" icon={<IconPlus color={C.chipText} />} onPress={() => setForm('new')} />
      )}

      {ready && list.length === 0 && !form ? (
        <Card>
          <Label>Sin registros todavía</Label>
          <Text style={styles.caption}>{`Anota aquí lo que pase con ${mod.name}: ${kind.hint.toLowerCase()}. También puedes decírselo a DESJ en el chat.`}</Text>
        </Card>
      ) : null}

      {list.map((e) =>
        form !== 'new' && form?.id === e.id ? null : (
          <Card key={e.id}>
            <Row style={{ alignItems: 'flex-start' }}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.name}>{e.title}</Text>
                {e.details ? (
                  <Text style={styles.body} selectable>
                    {e.details}
                  </Text>
                ) : null}
              </View>
              <Mono style={styles.date}>{e.date ? formatDate(e.date) : 'sin fecha'}</Mono>
            </Row>
            <Row style={{ justifyContent: 'flex-end' }}>
              <Btn label="Editar" kind="ghost" onPress={() => setForm(e)} style={styles.small} />
              <Btn label="Borrar" kind="danger" onPress={() => remove(e)} style={styles.small} />
            </Row>
          </Card>
        ),
      )}
    </Screen>
  );
}

function EntryForm({ initial, onSave, onCancel }: { initial?: Entry; onSave: (input: { title: string; date: string | null; details: string }) => Promise<void>; onCancel: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [dateText, setDateText] = useState(initial?.date ? toDmy(initial.date) : '');
  const [details, setDetails] = useState(initial?.details ?? '');

  const save = () => {
    if (!title.trim()) return notify('Escribe qué pasó, por ejemplo "Cambio de aceite".');
    const date = dateText.trim() ? parseDate(dateText) : null;
    if (dateText.trim() && !date) return notify('Escribe la fecha como DD/MM/AAAA, por ejemplo 12/10/2026, o déjala vacía. No puede ser futura.');
    void onSave({ title, date, details });
  };

  return (
    <Card glow>
      <Label style={{ color: C.accentSoft }}>{initial ? 'Editar registro' : 'Nuevo registro'}</Label>
      <Field label="Qué pasó" placeholder="Ej. Cambio de aceite" value={title} onChangeText={setTitle} />
      <Field label="Fecha" placeholder="DD/MM/AAAA (opcional)" value={dateText} onChangeText={setDateText} keyboardType="numbers-and-punctuation" maxLength={10} />
      <Field label="Detalle" placeholder="Opcional. Ej. 45.000 km, taller Pérez, $60" value={details} onChangeText={setDetails} multiline />
      <Row>
        <Btn label="Cancelar" kind="ghost" onPress={onCancel} />
        <Btn label="Guardar" onPress={save} />
      </Row>
    </Card>
  );
}

const styles = StyleSheet.create({
  name: { color: C.text, fontSize: 15, fontWeight: '600' },
  body: { color: C.text, fontSize: 14, lineHeight: 20 },
  caption: { color: C.muted, fontSize: 12.5, lineHeight: 18 },
  small: { flexGrow: 0, minHeight: 44, paddingHorizontal: 18 },
  date: { fontSize: 11, letterSpacing: 1, color: C.accentSoft, textTransform: 'uppercase' },
});
