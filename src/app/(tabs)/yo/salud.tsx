// YO · Salud: tus pastillas del día con recordatorios, tu historial médico (consultas, exámenes y estudios con sus
// informes, órdenes y recetas, por año y mes según cuándo pasaron) y tus contactos de salud. Se abre desde YO.
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Btn, Choice, Field } from '@/components/form';
import { ContactCard, ContactForm, ExamForm, ExamRow } from '@/components/health';
import { IconCheck, IconPlus } from '@/components/icons';
import { Card, HudRing, Label, Mono, Row, Screen, Title } from '@/components/ui';
import { confirm, notify } from '@/lib/confirm';
import { Contact, ExamKind, since, useHealth } from '@/lib/health';
import { doseKey, doseLabel, dosesToday, MAX_DOSES, MedInput, parseTime, today, useStore } from '@/lib/store';
import { C, mono, R } from '@/theme';

type Tab = 'pastillas' | 'historial' | 'examenes' | 'contactos';
const TABS: { id: Tab; label: string }[] = [
  { id: 'pastillas', label: 'Pastillas' },
  { id: 'historial', label: 'Historial' },
  { id: 'examenes', label: 'Exámenes' },
  { id: 'contactos', label: 'Contactos' },
];
// Exámenes es una vista del mismo historial: solo laboratorio e imagen.
const EXAM_ONLY: ExamKind[] = ['laboratorio', 'imagen'];

export default function Salud() {
  const params = useLocalSearchParams<{ tab?: Tab }>();
  const [tab, setTab] = useState<Tab>(TABS.some((t) => t.id === params.tab) ? params.tab! : 'pastillas');
  const health = useHealth();
  const { reload } = health;

  // DESJ también guarda registros, archivos y contactos desde el chat: se relee al volver a la pantalla.
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
      {tab === 'pastillas' ? <Pills /> : null}
      {tab === 'historial' ? <Exams health={health} /> : null}
      {tab === 'examenes' ? <Exams health={health} only={EXAM_ONLY} /> : null}
      {tab === 'contactos' ? <Contacts health={health} /> : null}
    </Screen>
  );
}

type Health = ReturnType<typeof useHealth>;

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/** Historial médico (o solo exámenes, con `only`): año → mes → registros del día, lo más reciente primero. */
function Exams({ health, only }: { health: Health; only?: ExamKind[] }) {
  const { ready, cloud, saveExam, addFile } = health;
  const exams = only ? health.exams.filter((e) => only.includes(e.kind)) : health.exams;
  const [adding, setAdding] = useState(false);

  // `exams` ya viene del más reciente al más antiguo: se agrupa conservando ese orden.
  const years: { year: string; months: { month: number; items: typeof exams }[] }[] = [];
  for (const e of exams) {
    const year = e.date.slice(0, 4);
    const month = Number(e.date.slice(5, 7));
    let y = years.find((g) => g.year === year);
    if (!y) years.push((y = { year, months: [] }));
    const m = y.months.find((g) => g.month === month);
    if (m) m.items.push(e);
    else y.months.push({ month, items: [e] });
  }

  return (
    <>
      {adding ? (
        <ExamForm
          withFiles={cloud}
          defaultKind={only?.[0]}
          onCancel={() => setAdding(false)}
          onSave={async (input, files) => {
            const id = await saveExam(input);
            if (!id) return notify('No pude guardar el registro. Revisa tu conexión e intenta de nuevo.');
            const failed: string[] = [];
            for (const f of files) {
              try {
                await addFile(id, f.file, f.docType);
              } catch {
                failed.push(f.file.name);
              }
            }
            setAdding(false);
            if (failed.length) notify(`El registro quedó guardado, pero no pude subir: ${failed.join(', ')}. Ábrelo para intentar de nuevo.`);
          }}
        />
      ) : (
        <Btn label={only ? 'Agregar examen' : 'Agregar consulta o examen'} kind="outline" icon={<IconPlus color={C.chipText} />} onPress={() => setAdding(true)} />
      )}

      {!cloud ? <Text style={styles.caption}>Sin nube: el historial se guarda solo en este teléfono y sin archivos.</Text> : null}

      {ready && exams.length === 0 && !adding ? (
        <Card>
          <Label>{only ? 'Sin exámenes todavía' : 'Tu historial está vacío'}</Label>
          <Text style={styles.caption}>
            {only
              ? 'Aquí quedan juntos tus exámenes de laboratorio y estudios de imagen, por fecha. También aparecen en el Historial.'
              : 'Guarda aquí cada consulta, examen o estudio con su fecha, y dentro sus informes, órdenes y recetas. También puedes mandarle el informe a DESJ por el chat y pedirle que lo guarde.'}
          </Text>
        </Card>
      ) : null}

      {years.map((y) => (
        <View key={y.year} style={{ gap: 10 }}>
          <Row style={styles.yearRow}>
            <Text style={styles.year}>{y.year}</Text>
            <Label>{since(y.months[0].items[0].date)}</Label>
          </Row>
          {y.months.map((m) => (
            <View key={m.month} style={{ gap: 8 }}>
              <Label style={{ color: C.accentSoft }}>{`${MONTHS[m.month - 1]} ${y.year}`}</Label>
              {m.items.map((e) => (
                <ExamRow key={e.id} exam={e} onPress={() => router.push({ pathname: '/yo/examen/[id]', params: { id: e.id } })} />
              ))}
            </View>
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
  const takenKeys = taken[today()] ?? [];
  const { done, total } = dosesToday(meds, taken);
  const [adding, setAdding] = useState(false);

  const reminders = async () => {
    const ok = await enableMedReminders();
    notify(
      ok
        ? 'Te aviso todos los días a la hora de cada dosis. Las dosis sin hora no tienen aviso.'
        : 'Activa las notificaciones de DESJ en Ajustes del iPhone. En la versión web los avisos diarios no están disponibles.',
    );
  };

  const remove = async (id: string, med: string) => {
    if (await confirm('Quitar medicamento', `¿Quitar ${med} de tu plan?`, 'Quitar')) removeMed(id);
  };

  return (
    <>
      <Row>
        <View style={{ gap: 2, flex: 1 }}>
          <Label>Tu plan de hoy</Label>
          <Text style={styles.big}>{`${done} de ${total} ${total === 1 ? 'dosis tomada' : 'dosis tomadas'}`}</Text>
        </View>
        <HudRing size={110} big={`${total ? Math.round((done / total) * 100) : 0}%`} small="" progress={total ? done / total : 0} />
      </Row>

      {meds.map((m) => (
        <Card key={m.id}>
          <Row style={{ alignItems: 'flex-start' }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.name}>{m.name}</Text>
              <Text style={styles.caption}>{[m.dose, m.perDay > 1 ? `${m.perDay} veces al día` : ''].filter(Boolean).join(' · ')}</Text>
            </View>
            <Pressable onPress={() => remove(m.id, m.name)} hitSlop={8} style={styles.remove} accessibilityRole="button" accessibilityLabel={`Quitar ${m.name}`}>
              <Text style={styles.removeText}>Quitar</Text>
            </Pressable>
          </Row>
          <View style={styles.doses}>
            {Array.from({ length: m.perDay }, (_, i) => {
              const n = i + 1;
              const t = takenKeys.includes(doseKey(m.id, n));
              return (
                <Pressable
                  key={n}
                  onPress={() => {
                    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    toggleTaken(m.id, n);
                  }}
                  style={[styles.btn, t ? styles.btnDone : styles.btnTodo]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: t }}
                  accessibilityLabel={`${m.name}, ${doseLabel(m, n)}`}>
                  {t ? <IconCheck color={C.ok} size={15} /> : null}
                  <Text style={[styles.btnText, { color: t ? C.ok : C.onAccent }]}>{m.times[i] ?? (m.perDay > 1 ? `Dosis ${n}` : t ? 'Tomada' : 'Marcar')}</Text>
                </Pressable>
              );
            })}
          </View>
        </Card>
      ))}

      {adding ? (
        <MedForm
          onCancel={() => setAdding(false)}
          onSave={async (m) => {
            if (await addMed(m)) setAdding(false);
            else notify('No pude guardar el medicamento. Revisa tu conexión e intenta de nuevo.');
          }}
        />
      ) : (
        <Btn label="Agregar medicamento" kind="outline" icon={<IconPlus color={C.chipText} />} onPress={() => setAdding(true)} />
      )}

      {meds.some((m) => m.times.length) ? <Btn label="Activar recordatorios diarios" onPress={reminders} /> : null}
    </>
  );
}

/** Nuevo medicamento: cuántas veces al día y, si quieres, la hora de cada dosis. */
function MedForm({ onSave, onCancel }: { onSave: (m: MedInput) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const [perDay, setPerDay] = useState(1);
  const [times, setTimes] = useState<string[]>(['']);

  const setCount = (n: number) => {
    const next = Math.min(MAX_DOSES, Math.max(1, n));
    setPerDay(next);
    setTimes((list) => Array.from({ length: next }, (_, i) => list[i] ?? ''));
  };

  const save = () => {
    if (!name.trim()) return notify('Escribe el nombre del medicamento, por ejemplo Losartán.');
    const parsed = times.map((t) => t.trim()).filter(Boolean).map(parseTime);
    if (parsed.some((t) => !t)) return notify('Escribe las horas en formato 24h, por ejemplo 08:00 o 21:30, o déjalas vacías.');
    void onSave({ name, dose: dose.trim() || (perDay > 1 ? `${perDay} dosis al día` : '1 dosis'), perDay, times: parsed as string[] });
  };

  return (
    <Card glow>
      <Label style={{ color: C.accentSoft }}>Nuevo medicamento</Label>
      <Field label="Nombre" placeholder="Ej. Losartán" value={name} onChangeText={setName} />
      <Field label="Dosis" placeholder="Ej. 50 mg con comida" value={dose} onChangeText={setDose} />
      <View style={{ gap: 6 }}>
        <Label>Veces al día</Label>
        <View style={styles.stepper}>
          <Pressable onPress={() => setCount(perDay - 1)} disabled={perDay <= 1} style={styles.step} accessibilityRole="button" accessibilityLabel="Menos veces al día">
            <Text style={[styles.stepText, perDay <= 1 && { color: C.textFaint }]}>−</Text>
          </Pressable>
          <Mono style={styles.count}>{String(perDay)}</Mono>
          <Pressable onPress={() => setCount(perDay + 1)} disabled={perDay >= MAX_DOSES} style={styles.step} accessibilityRole="button" accessibilityLabel="Más veces al día">
            <Text style={[styles.stepText, perDay >= MAX_DOSES && { color: C.textFaint }]}>+</Text>
          </Pressable>
        </View>
      </View>
      <View style={{ gap: 6 }}>
        <View style={styles.times}>
          {times.map((t, i) => (
            <View key={i} style={styles.time}>
              <Field
                label={perDay > 1 ? `Hora dosis ${i + 1}` : 'Hora'}
                placeholder="Opcional · 08:00"
                value={t}
                onChangeText={(v) => setTimes((list) => list.map((x, j) => (j === i ? v : x)))}
                keyboardType="numbers-and-punctuation"
                maxLength={5}
              />
            </View>
          ))}
        </View>
        <Text style={styles.caption}>La hora es opcional: déjala vacía si lo tomas cuando te acuerdes o sin horario fijo. Solo las dosis con hora tienen aviso.</Text>
      </View>
      <Row>
        <Btn label="Cancelar" kind="ghost" onPress={onCancel} />
        <Btn label="Guardar" onPress={save} />
      </Row>
    </Card>
  );
}

const styles = StyleSheet.create({
  big: { color: C.text, fontSize: 18, fontWeight: '600' },
  yearRow: { borderBottomWidth: 1, borderBottomColor: C.cardBorder, paddingBottom: 4, marginTop: 4 },
  year: { fontFamily: mono, fontSize: 20, fontWeight: '600', color: C.text, letterSpacing: 1 },
  name: { color: C.text, fontSize: 15, fontWeight: '600' },
  caption: { color: C.muted, fontSize: 12.5, lineHeight: 18 },
  btn: { minWidth: 92, height: 44, borderRadius: R.pill, flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  btnTodo: { backgroundColor: C.accent },
  btnDone: { borderWidth: 1, borderColor: C.cardBorder },
  btnText: { fontSize: 14, fontWeight: '700' },
  doses: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  remove: { minHeight: 44, minWidth: 44, alignItems: 'flex-end' },
  removeText: { color: C.bad, fontSize: 13, fontWeight: '600' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  step: { width: 44, height: 44, borderRadius: R.pill, borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceInput, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: C.chipText, fontSize: 22, fontWeight: '600' },
  count: { fontSize: 22, fontWeight: '600', minWidth: 28, textAlign: 'center' },
  times: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  time: { flexBasis: '45%', flexGrow: 1 },
});
