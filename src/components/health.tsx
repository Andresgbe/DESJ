// Piezas del módulo YO · Salud: formulario de registro del historial (consulta, laboratorio…), selector de
// archivos con su tipo (informe, orden…), archivo con vista previa y descarga, fila del historial y contactos.
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Btn, Choice, Field } from '@/components/form';
import { IconChevron, IconClip, IconFile } from '@/components/icons';
import { Card, Label, Mono, Row } from '@/components/ui';
import { Attachment, pickAttachments } from '@/lib/attachments';
import { notify } from '@/lib/confirm';
import { CONTACT_KINDS, Contact, ContactInput, DOC_TYPES, DocType, EXAM_KINDS, Exam, ExamFile, ExamInput, ExamKind, parseDate, toDmy } from '@/lib/health';
import { C, mono, R } from '@/theme';

export type PendingFile = { file: Attachment; docType: DocType };

const EMPTY_EXAM: ExamInput = { title: '', date: '', kind: 'consulta', place: '', doctor: '', results: '', notes: '' };
const docLabel = (t: DocType) => DOC_TYPES.find((d) => d.id === t)!.label;

/** "22/10/2026" de hoy, para que una consulta de hoy no haya que escribirla. */
function todayDmy() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/** Nuevo registro del historial o edición. `withFiles`: deja elegir archivos que se suben al guardar. */
export function ExamForm({
  initial,
  withFiles,
  defaultKind = 'consulta',
  onSave,
  onCancel,
}: {
  initial?: Exam;
  withFiles?: boolean;
  defaultKind?: ExamKind;
  onSave: (input: ExamInput, files: PendingFile[]) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<ExamInput>(initial ? { ...initial } : { ...EMPTY_EXAM, kind: defaultKind });
  const [dateText, setDateText] = useState(initial ? toDmy(initial.date) : todayDmy());
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<ExamInput>) => setForm((f) => ({ ...f, ...patch }));
  const kind = EXAM_KINDS.find((k) => k.id === form.kind)!;

  const save = async () => {
    const date = parseDate(dateText);
    if (!date) return notify('Escribe la fecha como DD/MM/AAAA, por ejemplo 22/10/2026. No puede ser una fecha futura.');
    setSaving(true);
    try {
      await onSave({ ...form, date }, files);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card glow>
      <Label style={{ color: C.accentSoft }}>{initial ? 'Editar registro' : 'Nuevo registro'}</Label>
      <Choice<ExamKind> label="Qué fue" options={EXAM_KINDS} value={form.kind} onChange={(k) => set({ kind: k })} />
      <Field
        label="Fecha"
        placeholder="DD/MM/AAAA"
        hint="Cuándo pasó, aunque lo cargues después. Así queda en su lugar en el historial."
        value={dateText}
        onChangeText={setDateText}
        keyboardType="numbers-and-punctuation"
        maxLength={10}
      />
      <Field label="Nombre" placeholder={`Opcional. Si lo dejas vacío: "${kind.title}"`} value={form.title} onChangeText={(title) => set({ title })} />
      <Field label="Clínica o laboratorio" placeholder="Opcional" value={form.place} onChangeText={(place) => set({ place })} />
      <Field label="Doctor" placeholder="Opcional. Ej. Dra. Pérez, cardiología" value={form.doctor} onChangeText={(doctor) => set({ doctor })} />
      <Field
        label="Resultados o indicaciones"
        placeholder="Opcional. Ej. Glucosa 98 mg/dL; control en 3 meses"
        hint="DESJ también puede leer los archivos y anotarlos por ti."
        value={form.results}
        onChangeText={(results) => set({ results })}
        multiline
      />
      <Field label="Notas" placeholder="Opcional" value={form.notes} onChangeText={(notes) => set({ notes })} multiline />
      {withFiles ? (
        <View style={{ gap: 8 }}>
          <Label>Archivos</Label>
          {files.map((f, i) => (
            <FileLine key={`${f.file.name}${i}`} name={f.file.name} tag={docLabel(f.docType)} onRemove={() => setFiles((list) => list.filter((_, j) => j !== i))} />
          ))}
          <FilePicker onPick={(file, docType) => setFiles((list) => [...list, { file, docType }])} />
        </View>
      ) : null}
      <Row>
        <Btn label="Cancelar" kind="ghost" onPress={onCancel} />
        <Btn label={saving ? 'Guardando…' : 'Guardar'} onPress={save} disabled={saving} />
      </Row>
    </Card>
  );
}

/** Primero qué es el documento (informe, orden…), después de dónde sale: galería, cámara (teléfono) o archivo. Varios a la vez. */
export function FilePicker({ onPick, disabled }: { onPick: (a: Attachment, docType: DocType) => void | Promise<void>; disabled?: boolean }) {
  const [docType, setDocType] = useState<DocType>('informe');
  const pick = async (source: 'galeria' | 'camara' | 'archivo') => {
    try {
      for (const a of await pickAttachments(source)) await onPick(a, docType);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No pude abrir ese archivo.');
    }
  };
  return (
    <View style={{ gap: 8 }}>
      <Choice<DocType> label="Tipo de documento" options={DOC_TYPES} value={docType} onChange={setDocType} />
      <View style={styles.picker}>
        <Btn label="Foto" kind="outline" icon={<IconClip color={C.chipText} size={16} />} onPress={() => pick('galeria')} disabled={disabled} />
        {Platform.OS !== 'web' ? <Btn label="Cámara" kind="outline" onPress={() => pick('camara')} disabled={disabled} /> : null}
        <Btn label="PDF o archivo" kind="outline" icon={<IconFile color={C.chipText} />} onPress={() => pick('archivo')} disabled={disabled} />
      </View>
    </View>
  );
}

/** Archivo elegido que todavía no se sube (en el formulario). */
export function FileLine({ name, tag, onRemove }: { name: string; tag?: string; onRemove?: () => void }) {
  return (
    <View style={styles.file}>
      <View style={styles.fileName}>
        <IconFile color={C.accentSoft} />
        {tag ? <Text style={styles.tag}>{tag}</Text> : null}
        <Text style={styles.body} numberOfLines={1}>
          {name}
        </Text>
      </View>
      {onRemove ? (
        <Pressable onPress={onRemove} hitSlop={8} style={styles.fileRemove} accessibilityRole="button" accessibilityLabel={`Quitar ${name}`}>
          <Text style={styles.removeText}>Quitar</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Archivo guardado: tipo, nombre, miniatura si es foto, y Ver / Descargar / Quitar.
 * Ver abre la vista previa (el visor del teléfono o una pestaña del navegador para PDF); Descargar lo baja con su nombre.
 */
export function FileCard({ file, getUrl, onRemove }: { file: ExamFile; getUrl: (f: ExamFile, download?: boolean) => Promise<string | null>; onRemove: () => void }) {
  const isImage = file.mime.startsWith('image/');
  const [thumb, setThumb] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (isImage) void getUrl(file).then((u) => alive && setThumb(u));
    return () => {
      alive = false;
    };
  }, [file, getUrl, isImage]);

  const open = async (download: boolean) => {
    const url = await getUrl(file, download);
    if (!url) return notify('No pude abrir el archivo. Revisa tu conexión.');
    if (Platform.OS === 'web') window.open(url, '_blank', 'noopener');
    else await WebBrowser.openBrowserAsync(url);
  };

  return (
    <View style={styles.fileCard}>
      {isImage && thumb ? (
        <Pressable onPress={() => open(false)} accessibilityRole="imagebutton" accessibilityLabel={`Ver ${file.name}`}>
          <Image source={{ uri: thumb }} style={styles.thumb} contentFit="cover" />
        </Pressable>
      ) : null}
      <View style={styles.fileName}>
        <IconFile color={C.accentSoft} />
        <Text style={styles.tag}>{docLabel(file.docType)}</Text>
        <Text style={styles.body} numberOfLines={1}>
          {file.name}
        </Text>
      </View>
      <Row style={{ justifyContent: 'flex-start', gap: 8 }}>
        <Btn label="Ver" kind="outline" onPress={() => open(false)} style={styles.small} />
        <Btn label="Descargar" kind="ghost" onPress={() => open(true)} style={styles.small} />
        <View style={{ flex: 1 }} />
        <Pressable onPress={onRemove} hitSlop={8} style={styles.fileRemove} accessibilityRole="button" accessibilityLabel={`Quitar ${file.name}`}>
          <Text style={styles.removeText}>Quitar</Text>
        </Pressable>
      </Row>
    </View>
  );
}

/** Fila del historial: día a la izquierda, qué fue y su detalle a la derecha. */
export function ExamRow({ exam, onPress }: { exam: Exam; onPress: () => void }) {
  const day = Number(exam.date.slice(8, 10));
  const kind = EXAM_KINDS.find((k) => k.id === exam.kind)?.label ?? '';
  const types = [...new Set(exam.files.map((f) => docLabel(f.docType).toLowerCase()))];
  const detail = [exam.doctor || exam.place, types.length ? `${exam.files.length} ${exam.files.length === 1 ? 'archivo' : 'archivos'} (${types.join(', ')})` : ''].filter(Boolean).join(' · ');
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.exam, pressed && { backgroundColor: C.surfaceSelected }]} accessibilityRole="button">
      <View style={styles.date}>
        <Mono style={styles.day}>{String(day)}</Mono>
        <Text style={styles.month}>{kind}</Text>
      </View>
      <View style={styles.rail} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.name} numberOfLines={2}>
          {exam.title}
        </Text>
        {detail ? (
          <Text style={styles.caption} numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
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
  tag: { fontFamily: mono, fontSize: 10, letterSpacing: 1.2, color: C.accentSoft, textTransform: 'uppercase' },
  fileCard: { gap: 8, padding: 12, borderRadius: R.field, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.surfaceSunken },
  thumb: { width: '100%', height: 180, borderRadius: R.field, backgroundColor: C.surfaceInput },
  small: { flexGrow: 0, minHeight: 44, paddingHorizontal: 18 },
  file: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 12, borderRadius: R.field, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.surfaceSunken },
  fileName: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  fileRemove: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  removeText: { color: C.bad, fontSize: 13, fontWeight: '600' },
  exam: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 10, paddingHorizontal: 12, borderRadius: R.card, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.card },
  date: { width: 64, alignItems: 'center' },
  day: { fontSize: 18, fontWeight: '600', color: C.text },
  month: { fontFamily: mono, fontSize: 8.5, letterSpacing: 0.6, color: C.accentSoft, textTransform: 'uppercase' },
  rail: { width: 1, alignSelf: 'stretch', backgroundColor: C.border },
  link: { flexDirection: 'row', gap: 10, minHeight: 44, alignItems: 'center' },
  linkLabel: { fontFamily: mono, fontSize: 10, letterSpacing: 1.5, color: C.muted, textTransform: 'uppercase', width: 80 },
});
