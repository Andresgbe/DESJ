// Piezas del módulo Vehículo: ficha, formulario de mantenimiento, formulario de papel y sus tarjetas.
import * as WebBrowser from 'expo-web-browser';
import { ReactNode, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { DateField } from '@/components/date-field';
import { Btn, Choice, Field } from '@/components/form';
import { IconBtn } from '@/components/finance';
import { FilePicker, FileLine } from '@/components/health';
import { IconFile, IconPencil, IconTrash } from '@/components/icons';
import { Card, Label, Mono, Row } from '@/components/ui';
import type { Attachment } from '@/lib/attachments';
import { notify } from '@/lib/confirm';
import { formatDate, parseDate, toDmy } from '@/lib/dates';
import { money, parseAmount, todayIso } from '@/lib/finance';
import { DOC_KINDS, DocInput, DocKind, docLabel, kmText, Service, SERVICE_KINDS, ServiceInput, ServiceKind, serviceLabel, Vehicle, VehicleDoc } from '@/lib/vehicles';
import { C, mono, R } from '@/theme';

const FUTURE = new Date(2100, 0, 1); // las fechas de vencimiento y "próximo" pueden ser futuras
const int = (text: string) => {
  const n = parseAmount(text.replace(/\./g, ''));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};

// ---------------------------------------------------------------------------- ficha

export function VehicleCard({ vehicle, onEdit }: { vehicle: Vehicle; onEdit: () => void }) {
  const title = [vehicle.brand, vehicle.model, vehicle.year].filter(Boolean).join(' ');
  return (
    <Card>
      <Row>
        <Label style={{ color: C.accentSoft }}>Ficha</Label>
        <Btn label="Editar" kind="ghost" onPress={onEdit} style={styles.small} />
      </Row>
      <Text style={title ? styles.big : styles.missing}>{title || '[pendiente] marca y modelo'}</Text>
      <View style={styles.facts}>
        <Fact label="Placa" value={vehicle.plate} />
        <Fact label="Color" value={vehicle.color} />
        <Fact label="Kilometraje" value={vehicle.odometer_km !== null ? kmText(vehicle.odometer_km) : ''} sub={vehicle.odometer_on ? `al ${formatDate(vehicle.odometer_on)}` : undefined} />
      </View>
      {vehicle.notes ? <Text style={styles.caption}>{vehicle.notes}</Text> : null}
    </Card>
  );
}

function Fact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={styles.fact}>
      <Label>{label}</Label>
      <Mono style={value ? styles.factValue : [styles.factValue, { color: C.textFaint }]}>{value || '—'}</Mono>
      {sub ? <Text style={styles.caption}>{sub}</Text> : null}
    </View>
  );
}

export function VehicleForm({ initial, onSave, onCancel }: { initial: Vehicle; onSave: (v: Vehicle) => Promise<void>; onCancel: () => void }) {
  const [brand, setBrand] = useState(initial.brand);
  const [model, setModel] = useState(initial.model);
  const [year, setYear] = useState(initial.year ? String(initial.year) : '');
  const [plate, setPlate] = useState(initial.plate);
  const [color, setColor] = useState(initial.color);
  const [km, setKm] = useState(initial.odometer_km !== null ? String(initial.odometer_km) : '');
  const [notes, setNotes] = useState(initial.notes);

  const save = async () => {
    const y = year.trim() ? Number(year.trim()) : null;
    if (y !== null && (!Number.isInteger(y) || y < 1900 || y > 2100)) return notify('El año tiene que ser un número como 2018.');
    const k = km.trim() ? int(km) : null;
    if (km.trim() && k === null) return notify('Escribe el kilometraje como número, por ejemplo 45000.');
    const changedKm = k !== initial.odometer_km;
    try {
      await onSave({
        brand: brand.trim(),
        model: model.trim(),
        year: y,
        plate: plate.trim().toUpperCase(),
        color: color.trim(),
        odometer_km: k,
        odometer_on: changedKm ? (k === null ? null : todayIso()) : initial.odometer_on,
        notes: notes.trim(),
      });
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No pude guardar la ficha.');
    }
  };

  return (
    <Card glow>
      <Label style={{ color: C.accentSoft }}>Ficha del vehículo</Label>
      <View style={styles.pair}>
        <Half>
          <Field label="Marca" placeholder="Ej. Toyota" value={brand} onChangeText={setBrand} />
        </Half>
        <Half>
          <Field label="Modelo" placeholder="Ej. Hilux" value={model} onChangeText={setModel} />
        </Half>
      </View>
      <View style={styles.pair}>
        <Half>
          <Field label="Año" placeholder="Ej. 2018" value={year} onChangeText={setYear} keyboardType="number-pad" maxLength={4} />
        </Half>
        <Half>
          <Field label="Placa" placeholder="Ej. AB123CD" value={plate} onChangeText={setPlate} autoCapitalize="characters" />
        </Half>
      </View>
      <View style={styles.pair}>
        <Half>
          <Field label="Color" placeholder="Opcional" value={color} onChangeText={setColor} />
        </Half>
        <Half>
          <Field label="Kilometraje actual" placeholder="Ej. 45000" value={km} onChangeText={setKm} keyboardType="number-pad" />
        </Half>
      </View>
      <Field label="Notas" placeholder="Opcional" value={notes} onChangeText={setNotes} multiline />
      <Row style={{ justifyContent: 'flex-end' }}>
        <Btn label="Cancelar" kind="ghost" onPress={onCancel} style={styles.small} />
        <Btn label="Guardar" onPress={save} style={styles.small} />
      </Row>
    </Card>
  );
}

// ---------------------------------------------------------------------------- mantenimientos

export function ServiceForm({ initial, currentKm, onSave, onCancel }: { initial?: Service; currentKm: number | null; onSave: (s: ServiceInput) => Promise<void>; onCancel: () => void }) {
  const [kind, setKind] = useState<ServiceKind>(initial?.kind ?? 'aceite');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [date, setDate] = useState(toDmy(initial?.service_date ?? todayIso()));
  const [km, setKm] = useState(initial?.km != null ? String(initial.km) : currentKm != null ? String(currentKm) : '');
  const [cost, setCost] = useState(initial?.cost != null ? String(initial.cost).replace('.', ',') : '');
  const [shop, setShop] = useState(initial?.shop ?? '');
  const [nextKm, setNextKm] = useState(initial?.next_km != null ? String(initial.next_km) : '');
  const [nextDate, setNextDate] = useState(initial?.next_date ? toDmy(initial.next_date) : '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const d = parseDate(date);
    if (!d) return notify('Escribe la fecha como DD/MM/AAAA. No puede ser futura.');
    const k = km.trim() ? int(km) : null;
    if (km.trim() && k === null) return notify('El kilometraje tiene que ser un número.');
    const c = cost.trim() ? parseAmount(cost) : null;
    if (c !== null && (!Number.isFinite(c) || c < 0)) return notify('El costo tiene que ser un número.');
    const nk = nextKm.trim() ? int(nextKm) : null;
    if (nextKm.trim() && nk === null) return notify('El próximo kilometraje tiene que ser un número.');
    const nd = nextDate.trim() ? parseDate(nextDate, FUTURE) : null;
    if (nextDate.trim() && !nd) return notify('Escribe la próxima fecha como DD/MM/AAAA o déjala vacía.');
    if ((kind === 'otro' || kind === 'reparacion') && !title.trim()) return notify('Escribe qué se hizo, por ejemplo "Cambio de amortiguadores".');
    setSaving(true);
    try {
      await onSave({ kind, title: title.trim(), service_date: d, km: k, cost: c, shop: shop.trim(), next_km: nk, next_date: nd, notes: notes.trim() });
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No pude guardar el mantenimiento.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card glow>
      <Label style={{ color: C.accentSoft }}>{initial ? 'Editar mantenimiento' : 'Nuevo mantenimiento'}</Label>
      <Choice label="Qué se hizo" options={SERVICE_KINDS} value={kind} onChange={setKind} />
      <Field label="Detalle" placeholder={kind === 'otro' || kind === 'reparacion' ? 'Ej. Cambio de amortiguadores' : 'Opcional. Ej. Aceite 15W-40 y filtro'} value={title} onChangeText={setTitle} />
      <View style={styles.pair}>
        <Half>
          <DateField label="Fecha" value={date} onChange={setDate} />
        </Half>
        <Half>
          <Field label="Kilometraje" placeholder="Ej. 45000" value={km} onChangeText={setKm} keyboardType="number-pad" />
        </Half>
      </View>
      <View style={styles.pair}>
        <Half>
          <Field label="Costo ($)" placeholder="Opcional" value={cost} onChangeText={setCost} keyboardType="decimal-pad" />
        </Half>
        <Half>
          <Field label="Taller" placeholder="Opcional" value={shop} onChangeText={setShop} />
        </Half>
      </View>
      <Label style={{ marginTop: 4 }}>Próximo (opcional)</Label>
      <View style={styles.pair}>
        <Half>
          <Field label="A los km" placeholder="Ej. 50000" value={nextKm} onChangeText={setNextKm} keyboardType="number-pad" />
        </Half>
        <Half>
          <DateField label="O en la fecha" value={nextDate} onChange={setNextDate} future clearable placeholder="Opcional" />
        </Half>
      </View>
      <Field label="Notas" placeholder="Opcional" value={notes} onChangeText={setNotes} multiline />
      <Row style={{ justifyContent: 'flex-end' }}>
        <Btn label="Cancelar" kind="ghost" onPress={onCancel} style={styles.small} />
        <Btn label={saving ? 'Guardando…' : 'Guardar'} onPress={save} disabled={saving} style={styles.small} />
      </Row>
    </Card>
  );
}

export function ServiceRow({ s, onEdit, onRemove }: { s: Service; onEdit: () => void; onRemove: () => void }) {
  const name = s.title && (s.kind === 'otro' || s.kind === 'reparacion') ? s.title : serviceLabel(s.kind);
  const detail = [s.km !== null ? kmText(s.km) : '', s.shop, s.cost !== null ? `$${money(s.cost)}` : '', s.kind !== 'otro' && s.kind !== 'reparacion' && s.title ? s.title : '']
    .filter(Boolean)
    .join(' · ');
  const next = [s.next_km !== null ? `a los ${kmText(s.next_km)}` : '', s.next_date ? `el ${formatDate(s.next_date)}` : ''].filter(Boolean).join(' o ');
  return (
    <View style={styles.row}>
      <View style={styles.date}>
        <Mono style={styles.day}>{String(Number(s.service_date.slice(8, 10)))}</Mono>
        <Text style={styles.month}>{formatDate(s.service_date).split(' ').slice(1).join(' ')}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.name}>{name}</Text>
        {detail ? <Text style={styles.caption}>{detail}</Text> : null}
        {next ? <Text style={[styles.caption, { color: C.accentSoft }]}>{`Próximo: ${next}`}</Text> : null}
      </View>
      <IconBtn label={`Editar ${name}`} onPress={onEdit}>
        <IconPencil color={C.muted} />
      </IconBtn>
      <IconBtn label={`Eliminar ${name}`} onPress={onRemove}>
        <IconTrash color={C.bad} />
      </IconBtn>
    </View>
  );
}

// ---------------------------------------------------------------------------- papeles

export function DocForm({ initial, cloud, onSave, onCancel }: { initial?: VehicleDoc; cloud: boolean; onSave: (d: DocInput, file: Attachment | null) => Promise<void>; onCancel: () => void }) {
  const [kind, setKind] = useState<DocKind>(initial?.kind ?? 'seguro');
  const [name, setName] = useState(initial?.name ?? '');
  const [number, setNumber] = useState(initial?.number ?? '');
  const [expires, setExpires] = useState(initial?.expires_on ? toDmy(initial.expires_on) : '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [file, setFile] = useState<Attachment | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const exp = expires.trim() ? parseDate(expires, FUTURE) : null;
    if (expires.trim() && !exp) return notify('Escribe el vencimiento como DD/MM/AAAA o déjalo vacío.');
    setSaving(true);
    try {
      await onSave({ kind, name: name.trim() || docLabel(kind), number, expires_on: exp, notes }, file);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No pude guardar el papel.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card glow>
      <Label style={{ color: C.accentSoft }}>{initial ? 'Editar papel' : 'Nuevo papel'}</Label>
      <Choice label="Qué es" options={DOC_KINDS} value={kind} onChange={setKind} />
      <Field label="Nombre" placeholder={`Opcional. Si lo dejas vacío: "${docLabel(kind)}"`} value={name} onChangeText={setName} />
      <View style={styles.pair}>
        <Half>
          <Field label="Número" placeholder="Opcional. Ej. póliza" value={number} onChangeText={setNumber} />
        </Half>
        <Half>
          <DateField label="Vence" value={expires} onChange={setExpires} future clearable placeholder="Opcional" />
        </Half>
      </View>
      <Field label="Notas" placeholder="Opcional. Ej. aseguradora y teléfono" value={notes} onChangeText={setNotes} multiline />
      {cloud ? (
        <View style={{ gap: 8 }}>
          <Label>{initial?.file_name ? 'Reemplazar foto o PDF' : 'Foto o PDF'}</Label>
          {file ? <FileLine name={file.name} onRemove={() => setFile(null)} /> : initial?.file_name ? <Text style={styles.caption}>{`Actual: ${initial.file_name}`}</Text> : null}
          {!file ? <FilePicker withType={false} onPick={(a) => setFile(a)} /> : null}
        </View>
      ) : null}
      <Row style={{ justifyContent: 'flex-end' }}>
        <Btn label="Cancelar" kind="ghost" onPress={onCancel} style={styles.small} />
        <Btn label={saving ? 'Guardando…' : 'Guardar'} onPress={save} disabled={saving} style={styles.small} />
      </Row>
    </Card>
  );
}

export function DocCard({ d, getUrl, onEdit, onRemove }: { d: VehicleDoc; getUrl: (d: VehicleDoc, download?: boolean) => Promise<string | null>; onEdit: () => void; onRemove: () => void }) {
  const open = async (download: boolean) => {
    const url = await getUrl(d, download);
    if (!url) return notify('No pude abrir el archivo. Revisa tu conexión.');
    if (Platform.OS === 'web') window.open(url, '_blank', 'noopener');
    else await WebBrowser.openBrowserAsync(url);
  };
  const expired = d.expires_on !== null && d.expires_on < todayIso();
  return (
    <Card style={{ gap: 8 }}>
      <View style={styles.line}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.name}>{d.name}</Text>
          <Text style={styles.caption}>{[docLabel(d.kind), d.number ? `N.º ${d.number}` : ''].filter(Boolean).join(' · ')}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Label>{expired ? 'Venció' : 'Vence'}</Label>
          <Mono style={[styles.factValue, { fontSize: 14, color: expired ? C.bad : d.expires_on ? C.text : C.textFaint }]}>{d.expires_on ? formatDate(d.expires_on) : '—'}</Mono>
        </View>
        <IconBtn label={`Editar ${d.name}`} onPress={onEdit}>
          <IconPencil color={C.muted} />
        </IconBtn>
        <IconBtn label={`Eliminar ${d.name}`} onPress={onRemove}>
          <IconTrash color={C.bad} />
        </IconBtn>
      </View>
      {d.notes ? <Text style={styles.caption}>{d.notes}</Text> : null}
      {d.storage_path ? (
        <View style={styles.fileRow}>
          <IconFile color={C.accentSoft} />
          <Text style={[styles.caption, { flex: 1 }]} numberOfLines={1}>
            {d.file_name ?? 'Archivo'}
          </Text>
          <Btn label="Ver" kind="outline" onPress={() => open(false)} style={styles.tiny} />
          <Btn label="Descargar" kind="ghost" onPress={() => open(true)} style={styles.tiny} />
        </View>
      ) : null}
    </Card>
  );
}

const Half = ({ children }: { children: ReactNode }) => <View style={{ flex: 1 }}>{children}</View>;

const styles = StyleSheet.create({
  big: { color: C.text, fontSize: 20, fontWeight: '700' },
  missing: { color: C.muted, fontSize: 15 },
  name: { color: C.text, fontSize: 15, fontWeight: '600' },
  caption: { color: C.muted, fontSize: 12.5, lineHeight: 18 },
  small: { flexGrow: 0, minHeight: 44, paddingHorizontal: 16 },
  tiny: { flexGrow: 0, minHeight: 40, paddingHorizontal: 12 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  fact: { flexGrow: 1, flexBasis: 90, gap: 2 },
  factValue: { color: C.text, fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
  pair: { flexDirection: 'row', gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  date: { width: 52, alignItems: 'center' },
  day: { fontSize: 18, fontWeight: '600', color: C.text },
  month: { fontFamily: mono, fontSize: 9, letterSpacing: 0.6, color: C.accentSoft, textTransform: 'uppercase' },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: R.field, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.surfaceSunken },
});
