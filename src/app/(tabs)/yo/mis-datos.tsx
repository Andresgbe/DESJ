// YO · Mis datos: tus datos básicos y médicos en un formulario. No tienen tabla propia: viven en tus
// archivos de conocimiento (perfil.md y salud.md) como "- **Campo:** valor", así que al guardar aquí se
// actualiza Conocimiento y DESJ los lee en el siguiente mensaje. Lo demás de esos archivos no se toca.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Btn, Field } from '@/components/form';
import { Card, Label, Row, Screen, Title } from '@/components/ui';
import { notify } from '@/lib/confirm';
import { ageFrom, Docs, readField, Slug, useKnowledge, writeField } from '@/lib/knowledge';
import { C } from '@/theme';

type Def = { id: string; slug: Slug; labels: string[]; title: string; placeholder: string; keyboard?: 'decimal-pad' | 'phone-pad' | 'numbers-and-punctuation'; multiline?: boolean };

// El primer nombre de `labels` es el que se escribe si el campo no existe; los demás son sinónimos que
// DESJ pudo haber usado en la entrevista (se respetan para no duplicar líneas).
const BASICOS: Def[] = [
  { id: 'nombre', slug: 'perfil', labels: ['Nombre completo', 'Nombre'], title: 'Nombre completo', placeholder: 'Nombre y apellido' },
  { id: 'nacimiento', slug: 'perfil', labels: ['Fecha de nacimiento', 'Nacimiento'], title: 'Fecha de nacimiento', placeholder: 'DD/MM/AAAA', keyboard: 'numbers-and-punctuation' },
  { id: 'ciudad', slug: 'perfil', labels: ['Ciudad'], title: 'Ciudad', placeholder: 'Dónde vives' },
  { id: 'talla', slug: 'salud', labels: ['Talla', 'Altura', 'Estatura'], title: 'Altura', placeholder: 'Ej. 1,78 m', keyboard: 'decimal-pad' },
  { id: 'peso', slug: 'salud', labels: ['Peso'], title: 'Peso', placeholder: 'Ej. 82 kg', keyboard: 'decimal-pad' },
  { id: 'sangre', slug: 'salud', labels: ['Tipo de sangre', 'Sangre'], title: 'Tipo de sangre', placeholder: 'Ej. O+' },
];
const MEDICOS: Def[] = [
  { id: 'alergias', slug: 'salud', labels: ['Alergias'], title: 'Alergias', placeholder: 'Ej. Penicilina. Escribe "Ninguna" si no tienes', multiline: true },
  { id: 'condiciones', slug: 'salud', labels: ['Condiciones médicas', 'Condiciones'], title: 'Condiciones médicas', placeholder: 'Ej. Hipertensión', multiline: true },
  { id: 'medico', slug: 'salud', labels: ['Médico de cabecera', 'Médico'], title: 'Médico de cabecera', placeholder: 'Nombre y teléfono' },
  { id: 'emergencia', slug: 'perfil', labels: ['Contacto de emergencia', 'Teléfono de emergencia'], title: 'Contacto de emergencia', placeholder: 'Nombre y teléfono', keyboard: 'phone-pad' },
];
const ALL = [...BASICOS, ...MEDICOS];

const read = (docs: Docs) => Object.fromEntries(ALL.map((d) => [d.id, readField(docs, d.labels) ?? ''])) as Record<string, string>;

export default function MisDatos() {
  const { docs, ready, reload, saveDocs } = useKnowledge();
  const [values, setValues] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  // Los campos siguen a los archivos mientras no hayas escrito nada (no pisa lo que estás editando).
  useEffect(() => {
    if (!dirty) Promise.resolve().then(() => setValues(read(docs)));
  }, [dirty, docs]);

  const original = read(docs);
  const changed = ALL.filter((d) => (values[d.id] ?? '').trim() !== original[d.id]);
  const edad = ageFrom(values.nacimiento || null);

  const save = async () => {
    if (values.nacimiento?.trim() && edad === null) return notify('Escribe la fecha de nacimiento como DD/MM/AAAA, por ejemplo 12/03/1985.');
    let working = docs;
    const patch: Partial<Record<Slug, string>> = {};
    for (const d of changed) {
      const p = writeField(working, d.slug, d.labels, values[d.id] ?? '');
      Object.assign(patch, p);
      working = { ...working };
      for (const s of Object.keys(p) as Slug[]) working[s] = { ...working[s], content: p[s]! };
    }
    setSaving(true);
    const ok = await saveDocs(patch);
    setSaving(false);
    if (!ok) return notify('No pude guardar tus datos. Revisa tu conexión e intenta de nuevo.');
    setDirty(false);
    notify('Listo. Tus datos quedaron guardados y DESJ ya los conoce.');
  };

  const field = (d: Def) => (
    <Field
      key={d.id}
      label={d.title}
      placeholder={d.placeholder}
      value={values[d.id] ?? ''}
      onChangeText={(v) => {
        setDirty(true);
        setValues((x) => ({ ...x, [d.id]: v }));
      }}
      keyboardType={d.keyboard}
      multiline={d.multiline}
      hint={d.id === 'nacimiento' && edad !== null ? `${edad} años` : undefined}
    />
  );

  return (
    <Screen module="Módulo 03.3 · Mis datos" back>
      <View style={{ gap: 2 }}>
        <Label>Yo · ficha personal</Label>
        <Title accent="datos">Mis</Title>
      </View>
      <Text style={styles.caption}>Lo que guardes aquí se actualiza en Conocimiento y DESJ lo usa en sus respuestas. Deja vacío lo que no quieras compartir.</Text>

      <Card>
        <Label style={{ color: C.accentSoft }}>Básicos</Label>
        {BASICOS.map(field)}
      </Card>
      <Card>
        <Label style={{ color: C.accentSoft }}>Médicos</Label>
        {MEDICOS.map(field)}
      </Card>

      <Row>
        <Btn label="Ver Conocimiento" kind="ghost" onPress={() => router.push('/conocimiento')} />
        <Btn label={saving ? 'Guardando…' : changed.length ? 'Guardar' : 'Sin cambios'} onPress={save} disabled={saving || !ready || changed.length === 0} />
      </Row>
    </Screen>
  );
}

const styles = StyleSheet.create({
  caption: { color: C.muted, fontSize: 12.5, lineHeight: 18 },
});
