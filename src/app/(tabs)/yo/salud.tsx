// YO · Salud: tus pastillas del día con recordatorios, tus exámenes médicos en una línea de tiempo (por la fecha en que se hicieron, no por cuándo
// se cargaron) y tus contactos de salud. Se abre desde el módulo YO.
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Btn, Choice, Field } from '@/components/form';
import { ContactCard, ContactForm, ExamForm, ExamRow } from '@/components/health';
import { IconCheck, IconPlus } from '@/components/icons';
import { Card, HudRing, Label, Mono, Row, Screen, Title } from '@/components/ui';
import { confirm, notify } from '@/lib/confirm';
import { Contact, since, useHealth } from '@/lib/health';
import { hhmm, today, useStore } from '@/lib/store';
import { C, R } from '@/theme';

type Tab = 'examenes' | 'pastillas' | 'contactos';
const TABS: { id: Tab; label: string }[] = [
  { id: 'pastillas', label: 'Pastillas' },
  { id: 'examenes', label: 'Exámenes' },
  { id: 'contactos', label: 'Contactos' },
];

export default function Salud() {
  const params = useLocalSearchParams<{ tab?: Tab }>();
  const [tab, setTab] = useState<Tab>(TABS.some((t) => t.id === params.tab) ? params.tab! : 'pastillas');
  const health = useHealth();
  const { reload } = health;

  // DESJ también crea exámenes y contactos desde el chat: se relee al volver a la pantalla.
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return (
    <Screen module="Módulo 03.1 · Salud" back>
      <View style={{ gap: 2 }}>
        <Label>Yo · historial médico</Label>
        <Title accent="salud">Tu</Title>
      </View>
      <Choice options={TABS} value={tab} onChange={setTab} />
      {tab === 'examenes' ? <Exams health={health} /> : tab === 'pastillas' ? <Pills /> : <Contacts health={health} />}
    </Screen>
  );
}

type Health = ReturnType<typeof useHealth>;

function Exams({ health }: { health: Health }) {
  const { exams, ready, cloud, saveExam, addFile } = health;
  const [adding, setAdding] = useState(false);

  // Agrupados por año; dentro de cada año, el más reciente primero.
  const years: { year: string; items: typeof exams }[] = [];
  for (const e of exams) {
    const year = e.date.slice(0, 4);
    const group = years.find((g) => g.year === year);
    if (group) group.items.push(e);
    else years.push({ year, items: [e] });
  }

  return (
    <>
      {adding ? (
        <ExamForm
          withFiles={cloud}
          onCancel={() => setAdding(false)}
          onSave={async (input, files) => {
            const id = await saveExam(input);
            if (!id) return notify('No pude guardar el examen. Revisa tu conexión e intenta de nuevo.');
            const failed: string[] = [];
            for (const f of files) {
              try {
                await addFile(id, f);
              } catch {
                failed.push(f.name);
              }
            }
            setAdding(false);
            if (failed.length) notify(`El examen quedó guardado, pero no pude subir: ${failed.join(', ')}. Ábrelo para intentar de nuevo.`);
          }}
        />
      ) : (
        <Btn label="Agregar examen" kind="outline" icon={<IconPlus color={C.chipText} />} onPress={() => setAdding(true)} />
      )}

      {!cloud ? <Text style={styles.caption}>Sin nube: los exámenes se guardan solo en este teléfono y sin archivos.</Text> : null}

      {ready && exams.length === 0 && !adding ? (
        <Card>
          <Label>Sin exámenes todavía</Label>
          <Text style={styles.caption}>
            Agrega tus exámenes con la fecha en que te los hiciste; DESJ los ordena solo. También puedes mandarle la foto o el PDF por el chat y pedirle que lo guarde.
          </Text>
        </Card>
      ) : null}

      {years.map((g) => (
        <View key={g.year} style={{ gap: 8 }}>
          <Row>
            <Label style={{ color: C.accentSoft }}>{g.year}</Label>
            <Label>{since(g.items[0].date)}</Label>
          </Row>
          {g.items.map((e) => (
            <ExamRow key={e.id} exam={e} onPress={() => router.push({ pathname: '/yo/examen/[id]', params: { id: e.id } })} />
          ))}
        </View>
      ))}
    </>
  );
}

function Contacts({ health }: { health: Health }) {
  const { contacts, ready, saveContact, removeContact } = health;
  const [editing, setEditing] = useState<Contact | 'new' | null>(null);

  const remove = async (c: Contact) => {
    if (await confirm('Quitar contacto', `¿Quitar a ${c.name} de tus contactos de salud?`, 'Quitar')) void removeContact(c.id);
  };

  return (
    <>
      {editing ? (
        <ContactForm
          initial={editing === 'new' ? undefined : editing}
          onCancel={() => setEditing(null)}
          onSave={async (input) => {
            const ok = await saveContact(input, editing === 'new' ? undefined : editing.id);
            if (ok) setEditing(null);
            else notify('No pude guardar el contacto. Revisa tu conexión e intenta de nuevo.');
          }}
        />
      ) : (
        <Btn label="Agregar contacto" kind="outline" icon={<IconPlus color={C.chipText} />} onPress={() => setEditing('new')} />
      )}

      {ready && contacts.length === 0 && !editing ? (
        <Card>
          <Label>Sin contactos todavía</Label>
          <Text style={styles.caption}>Guarda tus doctores, clínicas y laboratorios con su teléfono para tenerlos a mano.</Text>
        </Card>
      ) : null}

      {contacts.map((c) =>
        editing !== 'new' && editing?.id === c.id ? null : <ContactCard key={c.id} contact={c} onEdit={() => setEditing(c)} onRemove={() => remove(c)} />,
      )}
    </>
  );
}

function Pills() {
  const { meds, taken, toggleTaken, addMed, removeMed, enableMedReminders } = useStore();
  const takenIds = taken[today()] ?? [];
  const done = meds.filter((m) => takenIds.includes(m.id)).length;
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const [time, setTime] = useState('');

  const save = () => {
    const t = time.match(/^(\d{1,2}):?(\d{2})?$/);
    if (!name.trim() || !t || Number(t[1]) > 23) {
      notify('Escribe el nombre y la hora en formato 24h, por ejemplo 08:00 o 21:30.');
      return;
    }
    addMed({ name: name.trim(), dose: dose.trim() || '1 dosis', hour: Number(t[1]), minute: Number(t[2] ?? 0) });
    setName('');
    setDose('');
    setTime('');
    setAdding(false);
  };

  const reminders = async () => {
    const ok = await enableMedReminders();
    notify(ok ? 'Te aviso todos los días a la hora de cada pastilla.' : 'Activa las notificaciones de DESJ en Ajustes del iPhone. En la versión web los avisos diarios no están disponibles.');
  };

  const remove = async (id: string, med: string) => {
    if (await confirm('Quitar medicamento', `¿Quitar ${med} de tu plan?`, 'Quitar')) removeMed(id);
  };

  return (
    <>
      <Row>
        <View style={{ gap: 2, flex: 1 }}>
          <Label>Tu plan de hoy</Label>
          <Text style={styles.big}>{`${done} de ${meds.length} tomadas`}</Text>
        </View>
        <HudRing size={110} big={`${meds.length ? Math.round((done / meds.length) * 100) : 0}%`} small="" progress={meds.length ? done / meds.length : 0} />
      </Row>

      {meds.map((m) => {
        const t = takenIds.includes(m.id);
        return (
          <Pressable key={m.id} onLongPress={() => remove(m.id, m.name)}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
              <Mono style={{ width: 52, fontSize: 15, fontWeight: '600', color: C.accentSoft }}>{hhmm(m.hour, m.minute)}</Mono>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{m.name}</Text>
                <Text style={styles.caption}>{m.dose}</Text>
              </View>
              <Pressable
                onPress={() => {
                  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  toggleTaken(m.id);
                }}
                style={[styles.btn, t ? styles.btnDone : styles.btnTodo]}
                accessibilityRole="button">
                {t ? <IconCheck color={C.ok} size={15} /> : null}
                <Text style={[styles.btnText, { color: t ? C.ok : C.onAccent }]}>{t ? 'Tomada' : 'Marcar'}</Text>
              </Pressable>
            </Card>
          </Pressable>
        );
      })}

      {adding ? (
        <Card glow>
          <Label style={{ color: C.accentSoft }}>Nuevo medicamento</Label>
          <Field label="Nombre" placeholder="Ej. Losartán" value={name} onChangeText={setName} />
          <Field label="Dosis" placeholder="Ej. 50 mg con desayuno" value={dose} onChangeText={setDose} />
          <Field label="Hora (24h)" placeholder="Ej. 08:00" value={time} onChangeText={setTime} keyboardType="numbers-and-punctuation" />
          <Row>
            <Btn label="Cancelar" kind="ghost" onPress={() => setAdding(false)} />
            <Btn label="Guardar" onPress={save} />
          </Row>
        </Card>
      ) : (
        <Btn label="Agregar medicamento" kind="outline" icon={<IconPlus color={C.chipText} />} onPress={() => setAdding(true)} />
      )}

      {meds.length ? <Btn label="Activar recordatorios diarios" onPress={reminders} /> : null}
      {meds.length ? <Text style={[styles.caption, { textAlign: 'center' }]}>Mantén presionado un medicamento para quitarlo.</Text> : null}
    </>
  );
}

const styles = StyleSheet.create({
  big: { color: C.text, fontSize: 18, fontWeight: '600' },
  name: { color: C.text, fontSize: 15, fontWeight: '600' },
  caption: { color: C.muted, fontSize: 12.5, lineHeight: 18 },
  btn: { minWidth: 92, height: 44, borderRadius: R.pill, flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  btnTodo: { backgroundColor: C.accent },
  btnDone: { borderWidth: 1, borderColor: C.cardBorder },
  btnText: { fontSize: 14, fontWeight: '700' },
});
