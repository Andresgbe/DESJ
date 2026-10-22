// Piezas del módulo YO · Salud: formulario de examen, formulario y tarjeta de contacto, fila de examen
// en la línea de tiempo y el selector para adjuntar archivos.
import { useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Btn, Choice, Field } from '@/components/form';
import { IconChevron, IconClip, IconFile } from '@/components/icons';
import { Card, Label, Mono, Row } from '@/components/ui';
import { Attachment, pickAttachment } from '@/lib/attachments';
import { notify } from '@/lib/confirm';
import { CONTACT_KINDS, Contact, ContactInput, EXAM_KINDS, Exam, ExamInput, ExamKind, formatDate, parseDate, toDmy } from '@/lib/health';
import { C, mono, R } from '@/theme';

const EMPTY_EXAM: ExamInput = { title: '', date: '', kind: 'laboratorio', place: '', doctor: '', results: '', notes: '' };

/** Nuevo examen o edición. `withFiles`: deja elegir archivos que se suben al guardar (solo exámenes nuevos). */
export function ExamForm({
  initial,
  withFiles,
  onSave,
  onCancel,
}: {
  initial?: Exam;
  withFiles?: boolean;
  onSave: (input: ExamInput, files: Attachment[]) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<ExamInput>(initial ? { ...initial } : EMPTY_EXAM);
  const [dateText, setDateText] = useState(initial ? toDmy(initial.date) : '');
  const [files, setFiles] = useState<Attachment[]>([]);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<ExamInput>) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    const date = parseDate(dateText);
    if (!form.title.trim()) return notify('Escribe qué examen es, por ejemplo "Hematología completa".');
    if (!date) return notify('Escribe la fecha en que te hiciste el examen como DD/MM/AAAA, por ejemplo 14/03/2023. No puede ser una fecha futura.');
    setSaving(true);
    try {
      await onSave({ ...form, date }, files);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card glow>
      <Label style={{ color: C.accentSoft }}>{initial ? 'Editar examen' : 'Nuevo examen'}</Label>
      <Field label="Examen" placeholder="Ej. Hematología completa" value={form.title} onChangeText={(title) => set({ title })} />
      <Field
        label="Fecha del examen"
        placeholder="DD/MM/AAAA"
        hint="Cuándo te lo hiciste, aunque lo cargues hoy. Así queda en su lugar en la línea de tiempo."
        value={dateText}
        onChangeText={setDateText}
        keyboardType="numbers-and-punctuation"
        maxLength={10}
      />
      <Choice<ExamKind> label="Tipo" options={EXAM_KINDS} value={form.kind} onChange={(kind) => set({ kind })} />
      <Field label="Clínica o laboratorio" placeholder="Opcional" value={form.place} onChangeText={(place) => set({ place })} />
      <Field label="Doctor" placeholder="Opcional" value={form.doctor} onChangeText={(doctor) => set({ doctor })} />
      <Field
        label="Resultados principales"
        placeholder="Opcional. Ej. Glucosa 98 mg/dL, colesterol 210 mg/dL"
        hint="DESJ también puede leer el archivo y anotarlos por ti."
        value={form.results}
        onChangeText={(results) => set({ results })}
        multiline
      />
      <Field label="Notas" placeholder="Opcional" value={form.notes} onChangeText={(notes) => set({ notes })} multiline />
      {withFiles ? (
        <View style={{ gap: 8 }}>
          <Label>Archivos</Label>
          {files.map((f, i) => (
            <FileLine key={`${f.name}${i}`} name={f.name} onRemove={() => setFiles((list) => list.filter((_, j) => j !== i))} />
          ))}
          <FilePicker onPick={(a) => setFiles((list) => [...list, a])} />
        </View>
      ) : null}
      <Row>
        <Btn label="Cancelar" kind="ghost" onPress={onCancel} />
        <Btn label={saving ? 'Guardando…' : 'Guardar'} onPress={save} disabled={saving} />
      </Row>
    </Card>
  );
}

/** Botones para adjuntar: galería, cámara (solo teléfono) y archivo (PDF, imagen). */
export function FilePicker({ onPick, disabled }: { onPick: (a: Attachment) => void | Promise<void>; disabled?: boolean }) {
  const pick = async (source: 'galeria' | 'camara' | 'archivo') => {
    try {
      const a = await pickAttachment(source);
      if (a) await onPick(a);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No pude abrir ese archivo.');
    }
  };
  return (
    <View style={styles.picker}>
      <Btn label="Foto" kind="outline" icon={<IconClip color={C.chipText} size={16} />} onPress={() => pick('galeria')} disabled={disabled} />
      {Platform.OS !== 'web' ? <Btn label="Cámara" kind="outline" onPress={() => pick('camara')} disabled={disabled} /> : null}
      <Btn label="PDF o archivo" kind="outline" icon={<IconFile color={C.chipText} />} onPress={() => pick('archivo')} disabled={disabled} />
    </View>
  );
}

export function FileLine({ name, onPress, onRemove }: { name: string; onPress?: () => void; onRemove?: () => void }) {
  return (
    <View style={styles.file}>
      <Pressable onPress={onPress} disabled={!onPress} style={styles.fileName} accessibilityRole={onPress ? 'link' : undefined}>
        <IconFile color={C.accentSoft} />
        <Text style={[styles.body, onPress && { color: C.accentSoft }]} numberOfLines={1}>
          {name}
        </Text>
      </Pressable>
      {onRemove ? (
        <Pressable onPress={onRemove} hitSlop={8} style={styles.fileRemove} accessibilityRole="button" accessibilityLabel={`Quitar ${name}`}>
          <Text style={styles.removeText}>Quitar</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Fila de la línea de tiempo: fecha a la izquierda, examen y detalle a la derecha. */
export function ExamRow({ exam, onPress }: { exam: Exam; onPress: () => void }) {
  const [day, month] = formatDate(exam.date).split(' ');
  const kind = EXAM_KINDS.find((k) => k.id === exam.kind)?.label ?? '';
  const detail = [kind, exam.place, exam.files.length ? `${exam.files.length} ${exam.files.length === 1 ? 'archivo' : 'archivos'}` : ''].filter(Boolean).join(' · ');
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.exam, pressed && { backgroundColor: C.surfaceSelected }]} accessibilityRole="button">
      <View style={styles.date}>
        <Mono style={styles.day}>{day}</Mono>
        <Text style={styles.month}>{month}</Text>
      </View>
      <View style={styles.rail} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.name} numberOfLines={2}>
          {exam.title}
        </Text>
        <Text style={styles.caption} numberOfLines={1}>
          {detail}
        </Text>
      </View>
      <IconChevron color={C.muted} />
    </Pressable>
  );
}

const EMPTY_CONTACT: ContactInput = { kind: 'doctor', name: '', specialty: '', phone: '', email: '', address: '', notes: '' };

export function ContactForm({ initial, onSave, onCancel }: { initial?: Contact; onSave: (c: ContactInput) => Promise<void>; onCancel: () => void }) {
  const [form, setForm] = useState<ContactInput>(initial ? { ...initial } : EMPTY_CONTACT);
  const set = (patch: Partial<ContactInput>) => setForm((f) => ({ ...f, ...patch }));
  const save = () => {
    if (!form.name.trim()) return notify('Escribe el nombre del doctor o de la clínica.');
    void onSave(form);
  };
  return (
    <Card glow>
      <Label style={{ color: C.accentSoft }}>{initial ? 'Editar contacto' : 'Nuevo contacto'}</Label>
      <Choice label="Tipo" options={CONTACT_KINDS} value={form.kind} onChange={(kind) => set({ kind })} />
      <Field label="Nombre" placeholder="Ej. Dra. María Pérez o Clínica Santa Fe" value={form.name} onChangeText={(name) => set({ name })} />
      <Field label="Especialidad" placeholder="Opcional. Ej. Cardiología" value={form.specialty} onChangeText={(specialty) => set({ specialty })} />
      <Field label="Teléfono" placeholder="Opcional" value={form.phone} onChangeText={(phone) => set({ phone })} keyboardType="phone-pad" />
      <Field label="Correo" placeholder="Opcional" value={form.email} onChangeText={(email) => set({ email })} keyboardType="email-address" autoCapitalize="none" />
      <Field label="Dirección" placeholder="Opcional" value={form.address} onChangeText={(address) => set({ address })} />
      <Field label="Notas" placeholder="Opcional. Ej. atiende martes y jueves" value={form.notes} onChangeText={(notes) => set({ notes })} multiline />
      <Row>
        <Btn label="Cancelar" kind="ghost" onPress={onCancel} />
        <Btn label="Guardar" onPress={save} />
      </Row>
    </Card>
  );
}

export function ContactCard({ contact, onEdit, onRemove }: { contact: Contact; onEdit: () => void; onRemove: () => void }) {
  const kind = CONTACT_KINDS.find((k) => k.id === contact.kind)?.label ?? '';
  const open = (url: string) => Linking.openURL(url).catch(() => notify('No pude abrir ese enlace en este dispositivo.'));
  return (
    <Card>
      <View style={{ gap: 2 }}>
        <Text style={styles.name}>{contact.name}</Text>
        <Text style={styles.caption}>{[kind, contact.specialty].filter(Boolean).join(' · ')}</Text>
      </View>
      {contact.phone ? <Link label="Teléfono" value={contact.phone} onPress={() => open(`tel:${contact.phone.replace(/[^\d+]/g, '')}`)} /> : null}
      {contact.email ? <Link label="Correo" value={contact.email} onPress={() => open(`mailto:${contact.email}`)} /> : null}
      {contact.address ? <Link label="Dirección" value={contact.address} /> : null}
      {contact.notes ? <Text style={styles.caption}>{contact.notes}</Text> : null}
      <Row style={{ justifyContent: 'flex-end' }}>
        <Btn label="Editar" kind="ghost" onPress={onEdit} style={styles.small} />
        <Btn label="Quitar" kind="danger" onPress={onRemove} style={styles.small} />
      </Row>
    </Card>
  );
}

function Link({ label, value, onPress }: { label: string; value: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={styles.link} accessibilityRole={onPress ? 'link' : undefined}>
      <Text style={styles.linkLabel}>{label}</Text>
      <Text style={[styles.body, { flex: 1 }, onPress && { color: C.accentSoft }]} selectable>
        {value}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { color: C.text, fontSize: 14.5, flexShrink: 1 },
  name: { color: C.text, fontSize: 15, fontWeight: '600' },
  caption: { color: C.muted, fontSize: 12.5 },
  picker: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  small: { flexGrow: 0, minHeight: 44, paddingHorizontal: 18 },
  file: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 12, borderRadius: R.field, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.surfaceSunken },
  fileName: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  fileRemove: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  removeText: { color: C.bad, fontSize: 13, fontWeight: '600' },
  exam: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 10, paddingHorizontal: 12, borderRadius: R.card, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.card },
  date: { width: 40, alignItems: 'center' },
  day: { fontSize: 18, fontWeight: '600', color: C.text },
  month: { fontFamily: mono, fontSize: 10, letterSpacing: 1.5, color: C.accentSoft, textTransform: 'uppercase' },
  rail: { width: 1, alignSelf: 'stretch', backgroundColor: C.border },
  link: { flexDirection: 'row', gap: 10, minHeight: 44, alignItems: 'center' },
  linkLabel: { fontFamily: mono, fontSize: 10, letterSpacing: 1.5, color: C.muted, textTransform: 'uppercase', width: 80 },
});
