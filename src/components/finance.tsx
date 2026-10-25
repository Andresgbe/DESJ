// Piezas de YO · Finanzas (Ingresos y gastos): gráfica del mes, aviso de tasas faltantes, tarjeta de tasas,
// gestor de categorías, totales, desglose por categoría, lista de movimientos y el formulario de movimiento.
import { ReactNode, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';

import { DateField } from '@/components/date-field';
import { Btn, Choice, Field } from '@/components/form';
import { IconCheck, IconClose, IconPencil, IconTrash } from '@/components/icons';
import { Card, Label, Mono, Row } from '@/components/ui';
import { confirm, notify } from '@/lib/confirm';
import { parseDate, toDmy } from '@/lib/dates';
import {
  amountLabel,
  byCategory,
  byDay,
  CATEGORY_PALETTE,
  Category,
  CategoryKind,
  CategoryShare,
  dayLabel,
  Kind,
  money,
  monthLabel,
  NO_CATEGORY_COLOR,
  parseAmount,
  Rate,
  rateName,
  rateText,
  todayIso,
  Transaction,
  TransactionInput,
  USD_BCV,
  wasConverted,
} from '@/lib/finance';
import { C, mono, R } from '@/theme';

// ---------------------------------------------------------------------------- gráfica del mes

const VB_W = 1000;
const VB_H = 220;
const PAD = { top: 12, right: 8, bottom: 22, left: 8 };

/** Barras por día (ingreso a la izquierda, gasto a la derecha), dibujadas a mano en SVG: sin librería de gráficas. */
export function MonthChart({ txs, month }: { txs: Transaction[]; month: string }) {
  const days = byDay(txs, month);
  const max = Math.max(1, ...days.map((d) => Math.max(d.income, d.expense)));
  const empty = days.every((d) => !d.income && !d.expense);
  const w = VB_W - PAD.left - PAD.right;
  const h = VB_H - PAD.top - PAD.bottom;
  const slot = w / days.length;
  const bar = Math.max(2, Math.min(10, slot / 2 - 1.5));
  const y = (v: number) => PAD.top + h - (v / max) * h;
  const center = (day: number) => PAD.left + slot * (day - 1) + slot / 2;

  return (
    <Card>
      <Row>
        <Label>{`Día a día — ${monthLabel(month)}`}</Label>
        <View style={styles.legend}>
          <View style={[styles.swatch, { backgroundColor: C.ok }]} />
          <Text style={styles.caption}>Ingresos</Text>
          <View style={[styles.swatch, { backgroundColor: C.bad }]} />
          <Text style={styles.caption}>Gastos</Text>
        </View>
      </Row>
      {empty ? (
        <Text style={styles.caption}>Sin movimientos este mes.</Text>
      ) : (
        <View>
          <Svg
            width="100%"
            height={200}
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            preserveAspectRatio="none"
            accessibilityLabel={`Ingresos y gastos por día: ${days.filter((d) => d.income || d.expense).map((d) => `día ${d.day}${d.income ? ` +$${money(d.income)}` : ''}${d.expense ? ` -$${money(d.expense)}` : ''}`).join(', ')}`}>
            {[0.25, 0.5, 0.75, 1].map((f) => (
              <Line key={f} x1={PAD.left} x2={VB_W - PAD.right} y1={y(max * f)} y2={y(max * f)} stroke={C.cardBorder} strokeWidth={1} />
            ))}
            {days.map((d) => (
              <Rect key={`i${d.day}`} x={center(d.day) - bar} y={y(d.income)} width={d.income > 0 ? bar : 0} height={PAD.top + h - y(d.income)} rx={1.5} fill={C.ok} />
            ))}
            {days.map((d) => (
              <Rect key={`e${d.day}`} x={center(d.day)} y={y(d.expense)} width={d.expense > 0 ? bar : 0} height={PAD.top + h - y(d.expense)} rx={1.5} fill={C.bad} />
            ))}
          </Svg>
          {/* Etiquetas fuera del SVG: con preserveAspectRatio="none" el texto se estiraría. */}
          <View style={styles.axis} pointerEvents="none">
            {days
              .filter((d) => d.day === 1 || d.day % 5 === 0)
              .map((d) => (
                <Text key={d.day} style={[styles.tick, { left: `${(center(d.day) / VB_W) * 100}%` }]}>
                  {d.day}
                </Text>
              ))}
          </View>
        </View>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------- tasas

/** Aviso arriba de todo si alguna tasa está sin cargar: sin ella el módulo queda a medias. */
export function MissingRatesBanner({ rates, onSync }: { rates: Rate[]; onSync: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  const missing = rates.filter((r) => r.per_usd === null);
  if (!rates.length || !missing.length) return null;
  const run = async () => {
    setBusy(true);
    try {
      await onSync();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No pude traer las tasas.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.warnBox}>
      <Text style={styles.body}>
        Faltan las tasas de <Text style={{ fontWeight: '700' }}>{missing.map((r) => r.code).join(', ')}</Text>. Hasta cargarlas no puedo convertir a dólares nada que registres en esas monedas.
      </Text>
      <Btn label={busy ? 'Trayendo…' : 'Cargar las tasas de hoy'} onPress={run} disabled={busy} style={{ flexGrow: 0, alignSelf: 'flex-start' }} />
    </View>
  );
}

export function RatesCard({ rates, onSync, onSet }: { rates: Rate[]; onSync: () => Promise<unknown>; onSet: (id: string, v: number | null) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const missing = rates.filter((r) => r.per_usd === null);

  const sync = async () => {
    setBusy(true);
    setDone(null);
    try {
      await onSync();
      setDone(new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No pude traer las tasas.');
    } finally {
      setBusy(false);
    }
  };

  const save = async (id: string) => {
    const v = value.trim() ? parseAmount(value) : null;
    if (v !== null && (!Number.isFinite(v) || v <= 0)) return notify('La tasa tiene que ser un número mayor que cero.');
    setEditing(null);
    try {
      await onSet(id, v);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No pude guardar la tasa.');
    }
  };

  return (
    <Card>
      <Row>
        <Label style={{ color: C.accentSoft }}>Tasas</Label>
        <Btn label={busy ? 'Trayendo…' : 'Actualizar del BCV'} kind="outline" onPress={sync} disabled={busy} style={styles.small} />
      </Row>
      {done ? <Text style={[styles.caption, { color: C.ok }]}>{`Actualizadas a las ${done}.`}</Text> : null}
      {missing.length ? <Text style={[styles.caption, { color: C.warn }]}>{`Falta cargar ${missing.map((r) => r.label || r.code).join(', ')}. Sin eso no puedo convertir lo que gastes en esa moneda.`}</Text> : null}
      {rates.map((r) =>
        editing === r.id ? (
          <View key={r.id} style={styles.line}>
            <Text style={[styles.body, { flex: 1 }]} numberOfLines={1}>
              {r.label || r.code}
            </Text>
            <TextInput
              value={value}
              onChangeText={setValue}
              onSubmitEditing={() => save(r.id)}
              onKeyPress={(e) => e.nativeEvent.key === 'Escape' && setEditing(null)}
              placeholder="vacío = sin cargar"
              placeholderTextColor={C.muted}
              keyboardType="decimal-pad"
              autoFocus
              style={styles.inlineInput}
              accessibilityLabel={`Tasa de ${r.label || r.code}`}
            />
            <IconBtn label="Guardar tasa" onPress={() => save(r.id)}>
              <IconCheck color={C.ok} />
            </IconBtn>
          </View>
        ) : (
          <View key={r.id} style={styles.line}>
            <Text style={[styles.body, { flex: 1 }]} numberOfLines={1}>
              {r.label || r.code}
            </Text>
            {r.per_usd === null ? <Text style={[styles.caption, { color: C.warn }]}>sin cargar</Text> : <Mono style={styles.num}>{`${rateText(r.per_usd)} / $`}</Mono>}
            <IconBtn
              label={`Editar tasa de ${r.label || r.code}`}
              onPress={() => {
                setValue(r.per_usd === null ? '' : String(r.per_usd).replace('.', ','));
                setEditing(r.id);
              }}>
              <IconPencil color={C.muted} />
            </IconBtn>
          </View>
        ),
      )}
      <Text style={styles.caption}>
        Cuántas unidades de esa moneda equivalen a <Text style={{ fontWeight: '700', color: C.text }}>1 dólar BCV</Text>. Cambiarla no toca lo ya registrado: cada movimiento se guarda con la
        tasa que usaste ese día. «Actualizar del BCV» las trae de DolarAPI (ve.dolarapi.com) y el USDT de Binance P2P.
      </Text>
    </Card>
  );
}

// ---------------------------------------------------------------------------- categorías

const KIND_LABEL: Record<CategoryKind, string> = { expense: 'Gasto', income: 'Ingreso', both: 'Ambos' };
const KIND_OPTIONS: { id: CategoryKind; label: string }[] = [
  { id: 'expense', label: 'Gasto' },
  { id: 'income', label: 'Ingreso' },
  { id: 'both', label: 'Ambos' },
];

type CategoryOps = {
  onAdd: (name: string, kind: CategoryKind) => Promise<void>;
  onUpdate: (id: string, patch: Partial<Pick<Category, 'name' | 'color' | 'kind'>>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
};

export function CategoryManager({ categories, onAdd, onUpdate, onRemove }: { categories: Category[] } & CategoryOps) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<CategoryKind>('expense');
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [painting, setPainting] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No pude guardar el cambio.');
    }
  };

  const create = () =>
    run(async () => {
      if (!name.trim()) return;
      await onAdd(name, kind);
      setName('');
      setAdding(false);
    });

  const rename = (c: Category) => {
    setEditing(null);
    if (editName.trim() && editName.trim() !== c.name) void run(() => onUpdate(c.id, { name: editName.trim() }));
  };

  const remove = async (c: Category) => {
    if (await confirm('Eliminar categoría', `Se elimina "${c.name}". Los movimientos que la tengan NO se borran: quedan como "Sin categoría".`, 'Eliminar')) void run(() => onRemove(c.id));
  };

  return (
    <Card>
      <Row>
        <Label style={{ color: C.accentSoft }}>{`Categorías (${categories.length})`}</Label>
        {!adding ? <Btn label="+ Nueva" kind="outline" onPress={() => setAdding(true)} style={styles.small} /> : null}
      </Row>
      {adding ? (
        <View style={{ gap: 8 }}>
          <TextInput value={name} onChangeText={setName} onSubmitEditing={create} placeholder="Nombre" placeholderTextColor={C.muted} autoFocus style={styles.input} accessibilityLabel="Nombre de la categoría" />
          <Choice options={KIND_OPTIONS} value={kind} onChange={setKind} />
          <Row style={{ justifyContent: 'flex-end' }}>
            <Btn label="Cancelar" kind="ghost" onPress={() => setAdding(false)} style={styles.small} />
            <Btn label="Crear" onPress={create} style={styles.small} />
          </Row>
        </View>
      ) : null}
      {categories.map((c) => (
        <View key={c.id} style={{ gap: 6 }}>
          <View style={styles.line}>
            <Pressable onPress={() => setPainting(painting === c.id ? null : c.id)} style={styles.colorBtn} accessibilityRole="button" accessibilityLabel={`Color de ${c.name}`}>
              <View style={[styles.dot, { backgroundColor: c.color, width: 16, height: 16, borderRadius: 4 }]} />
            </Pressable>
            {editing === c.id ? (
              <TextInput value={editName} onChangeText={setEditName} onSubmitEditing={() => rename(c)} onBlur={() => rename(c)} autoFocus style={[styles.inlineInput, { flex: 1 }]} accessibilityLabel="Nombre de la categoría" />
            ) : (
              <Text style={[styles.body, { flex: 1 }]} numberOfLines={1}>
                {c.name}
              </Text>
            )}
            <Text style={styles.tag}>{KIND_LABEL[c.kind]}</Text>
            <IconBtn
              label={`Renombrar ${c.name}`}
              onPress={() => {
                setEditName(c.name);
                setEditing(c.id);
              }}>
              <IconPencil color={C.muted} />
            </IconBtn>
            <IconBtn label={`Eliminar ${c.name}`} onPress={() => remove(c)}>
              <IconTrash color={C.bad} />
            </IconBtn>
          </View>
          {painting === c.id ? (
            <View style={styles.palette}>
              {CATEGORY_PALETTE.map((color) => (
                <Pressable
                  key={color}
                  onPress={() => {
                    setPainting(null);
                    void run(() => onUpdate(c.id, { color }));
                  }}
                  style={[styles.paletteItem, color === c.color && { borderColor: C.text }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Usar color ${color}`}>
                  <View style={[styles.dot, { backgroundColor: color, width: 20, height: 20, borderRadius: 5 }]} />
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ))}
    </Card>
  );
}

// ---------------------------------------------------------------------------- totales y desglose

export function Totals({ income, expense, balance }: { income: number; expense: number; balance: number }) {
  const items = [
    { label: 'Ingresos', value: `$${money(income)}`, color: C.ok },
    { label: 'Gastos', value: `$${money(expense)}`, color: C.bad },
    { label: 'Balance', value: `${balance >= 0 ? '+' : '-'}$${money(Math.abs(balance))}`, color: balance >= 0 ? C.ok : C.bad },
  ];
  return (
    <View style={styles.totals}>
      {items.map((t) => (
        <Card key={t.label} style={styles.total}>
          <Label>{t.label}</Label>
          <Mono style={[styles.big, { color: t.color }]} numberOfLines={1} adjustsFontSizeToFit>
            {t.value}
          </Mono>
          <Text style={styles.caption}>USD BCV</Text>
        </Card>
      ))}
    </View>
  );
}

export function Breakdown({ txs, categories }: { txs: Transaction[]; categories: Category[] }) {
  return (
    <View style={styles.breakdown}>
      <ShareCard title="Gastos por categoría" rows={byCategory(txs, categories, 'expense')} />
      <ShareCard title="Ingresos por categoría" rows={byCategory(txs, categories, 'income')} />
    </View>
  );
}

function ShareCard({ title, rows }: { title: string; rows: CategoryShare[] }) {
  return (
    <Card style={{ flexGrow: 1, flexBasis: 280 }}>
      <Label>{title}</Label>
      {rows.length === 0 ? <Text style={styles.caption}>Nada este mes.</Text> : null}
      {rows.map((r) => (
        <View key={r.id ?? 'none'} style={{ gap: 4 }}>
          <View style={styles.line}>
            <Text style={[styles.body, { flex: 1 }]} numberOfLines={1}>
              {r.name}
            </Text>
            <Mono style={styles.num}>{`$${money(r.total)}`}</Mono>
            <Mono style={[styles.num, { color: C.muted, width: 40, textAlign: 'right' }]}>{`${Math.round(r.share * 100)}%`}</Mono>
          </View>
          <View style={styles.track}>
            <View style={{ width: `${Math.max(2, r.share * 100)}%`, height: '100%', backgroundColor: r.color, borderRadius: 3 }} />
          </View>
        </View>
      ))}
    </Card>
  );
}

// ---------------------------------------------------------------------------- lista de movimientos

export function TxList({ txs, categories, month, onEdit, onRemove }: { txs: Transaction[]; categories: Category[]; month: string; onEdit: (t: Transaction) => void; onRemove: (t: Transaction) => void }) {
  const [open, setOpen] = useState(true);
  const days: { day: string; items: Transaction[] }[] = [];
  for (const t of txs) {
    const g = days.find((d) => d.day === t.occurred_on);
    if (g) g.items.push(t);
    else days.push({ day: t.occurred_on, items: [t] });
  }
  const cat = (id: string | null) => categories.find((c) => c.id === id);

  return (
    <View style={{ gap: 8 }}>
      <Pressable onPress={() => setOpen(!open)} style={styles.collapse} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <Label style={{ color: C.accentSoft }}>{`Movimientos (${txs.length})`}</Label>
        <Text style={styles.caption}>{open ? 'Ocultar' : 'Mostrar'}</Text>
      </Pressable>
      {open && txs.length === 0 ? (
        <Card>
          <Text style={styles.body}>{`Sin movimientos en ${monthLabel(month).toLowerCase()}.`}</Text>
          <Text style={styles.caption}>Puedes cargarlos desde aquí, o decirle a DESJ en el chat algo como «gasté 5$ en el Gama en supermercado».</Text>
        </Card>
      ) : null}
      {open
        ? days.map((d) => {
            const net = d.items.reduce((s, t) => s + (t.kind === 'income' ? t.amount_usd : -t.amount_usd), 0);
            return (
              <Card key={d.day} style={{ gap: 6 }}>
                <Row>
                  <Label>{dayLabel(d.day)}</Label>
                  <Mono style={[styles.num, { color: net >= 0 ? C.ok : C.bad }]}>{`${net >= 0 ? '+' : '-'}$${money(Math.abs(net))}`}</Mono>
                </Row>
                {d.items.map((t) => {
                  const c = cat(t.category_id);
                  const title = t.description || t.place || c?.name || 'Movimiento';
                  const sub = c ? [c.name, t.place].filter(Boolean).join(' · ') : t.place ? `Sin categoría · ${t.place}` : 'Sin categoría';
                  return (
                    <View key={t.id} style={styles.tx}>
                      <View style={[styles.dot, { backgroundColor: c?.color ?? NO_CATEGORY_COLOR }]} accessibilityLabel={c?.name ?? 'Sin categoría'} />
                      <View style={{ flex: 1, gap: 1 }}>
                        <Text style={styles.name} numberOfLines={1}>
                          {title}
                        </Text>
                        <Text style={styles.caption} numberOfLines={1}>
                          {sub}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Mono style={[styles.num, { color: t.kind === 'income' ? C.ok : C.bad, fontWeight: '600' }]}>{`${t.kind === 'income' ? '+' : '-'}$${money(t.amount_usd)}`}</Mono>
                        <Text style={styles.caption}>{wasConverted(t) ? `${amountLabel(t)} · ${rateName(t)} ${rateText(t.rate_per_usd)}` : rateName(t)}</Text>
                      </View>
                      <IconBtn label={`Editar ${title}`} onPress={() => onEdit(t)}>
                        <IconPencil color={C.muted} />
                      </IconBtn>
                      <IconBtn label={`Eliminar ${title}`} onPress={() => onRemove(t)}>
                        <IconTrash color={C.bad} />
                      </IconBtn>
                    </View>
                  );
                })}
              </Card>
            );
          })
        : null}
    </View>
  );
}

// ---------------------------------------------------------------------------- formulario de movimiento

type PayOption = { code: string; label: string; currency: string; perUsd: number | null; rateLabel: string };

const unitName = (o: PayOption) => (o.currency === 'VES' ? 'Bs' : o.currency === 'EUR' ? '€' : o.label);

export function TransactionModal({
  visible,
  initial,
  categories,
  rates,
  onClose,
  onSave,
}: {
  visible: boolean;
  initial: Transaction | null;
  categories: Category[];
  rates: Rate[];
  onClose: () => void;
  onSave: (input: TransactionInput, id?: string) => Promise<void>;
}) {
  // Se vuelve a montar cada vez que se abre (key en el padre), así que el estado inicial sale de `initial`.
  const options: PayOption[] = [
    { code: USD_BCV, label: 'Dólar BCV ($)', currency: 'USD', perUsd: 1, rateLabel: 'BCV' },
    ...rates.map((r) => ({ code: r.code, label: r.label || r.code, currency: r.currency, perUsd: r.per_usd, rateLabel: r.code })),
  ];
  const initialPay = !initial || (initial.currency === 'USD' && initial.rate_per_usd === 1 && (!initial.rate_label || initial.rate_label === 'BCV')) ? USD_BCV : initial.rate_label;
  const [kind, setKind] = useState<Kind>(initial?.kind ?? 'expense');
  const [amount, setAmount] = useState(initial ? String(initial.amount).replace('.', ',') : '');
  const [pay, setPay] = useState(options.some((o) => o.code === initialPay) ? initialPay : USD_BCV);
  const [rateOverride, setRateOverride] = useState(initial && initial.rate_per_usd !== 1 ? String(initial.rate_per_usd).replace('.', ',') : '');
  const [categoryId, setCategoryId] = useState<string>(initial?.category_id ?? '');
  const [place, setPlace] = useState(initial?.place ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [date, setDate] = useState(toDmy(initial?.occurred_on ?? todayIso()));
  const [note, setNote] = useState(initial?.note ?? '');
  const [saving, setSaving] = useState(false);

  const selected = options.find((o) => o.code === pay) ?? options[0];
  const isReference = selected.code === USD_BCV;
  const effectiveRate = isReference ? 1 : rateOverride.trim() ? parseAmount(rateOverride) : (selected.perUsd ?? NaN);
  const missingRate = !isReference && (!Number.isFinite(effectiveRate) || effectiveRate <= 0);
  const value = parseAmount(amount);
  const usd = Number.isFinite(value) && !missingRate ? value / effectiveRate : null;
  const visibleCategories = categories.filter((c) => c.kind === kind || c.kind === 'both');

  const save = async () => {
    if (!Number.isFinite(value) || value <= 0) return notify('Pon un monto mayor que cero.');
    if (missingRate) return notify(`No hay tasa para ${selected.label}. Cárgala en «Tasas y categorías» o escríbela aquí.`);
    const iso = parseDate(date, new Date(2100, 0, 1));
    if (!iso) return notify('Escribe la fecha como DD/MM/AAAA, por ejemplo 23/10/2026.');
    setSaving(true);
    try {
      await onSave(
        {
          kind,
          occurred_on: iso,
          description: description.trim(),
          place: place.trim(),
          category_id: categoryId || null,
          amount: value,
          currency: selected.currency,
          rate_per_usd: isReference ? 1 : effectiveRate,
          rate_label: selected.rateLabel,
          note: note.trim(),
        },
        initial?.id,
      );
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No pude guardar el movimiento.');
    } finally {
      setSaving(false);
    }
  };

  const tone = kind === 'income' ? C.ok : C.bad;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Cerrar" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalWrap} pointerEvents="box-none">
        <View style={styles.modal}>
          <Row style={{ paddingHorizontal: 16, paddingTop: 14 }}>
            <Label style={{ color: C.accentSoft }}>{initial ? 'Editar movimiento' : 'Nuevo movimiento'}</Label>
            <IconBtn label="Cerrar" onPress={onClose}>
              <IconClose color={C.muted} />
            </IconBtn>
          </Row>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['expense', 'income'] as Kind[]).map((k) => {
                const on = kind === k;
                const color = k === 'income' ? C.ok : C.bad;
                return (
                  <Pressable
                    key={k}
                    onPress={() => {
                      if (k !== kind) setCategoryId('');
                      setKind(k);
                    }}
                    style={[styles.kindBtn, on && { borderColor: color, backgroundColor: C.surfaceSelected }]}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}>
                    <Text style={[styles.kindText, { color: on ? color : C.chipText }]}>{k === 'income' ? 'Ingreso' : 'Gasto'}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Field label="Monto *" value={amount} onChangeText={setAmount} placeholder="0,00" keyboardType="decimal-pad" inputMode="decimal" autoFocus style={styles.amount} />

            <Choice
              label="Cómo se pagó"
              options={options.map((o) => ({ id: o.code, label: o.label }))}
              value={pay}
              onChange={(c) => {
                setPay(c);
                setRateOverride('');
              }}
            />

            {!isReference ? (
              <Field
                label={`Tasa — cuántos ${unitName(selected)} equivalen a 1 $ BCV`}
                value={rateOverride}
                onChangeText={setRateOverride}
                placeholder={selected.perUsd !== null ? `${rateText(selected.perUsd)} (la guardada)` : 'sin tasa guardada'}
                hint="Déjala vacía para usar la tasa guardada. Lo que pongas aquí vale solo para este movimiento."
                keyboardType="decimal-pad"
              />
            ) : null}

            <View style={[styles.equiv, missingRate && styles.warnBox]}>
              {missingRate ? (
                <Text style={[styles.body, { color: C.warn }]}>{`Falta la tasa de ${selected.label}: sin eso no puedo calcular el equivalente.`}</Text>
              ) : (
                <Text style={styles.body}>
                  Equivale a{' '}
                  <Text style={{ color: tone, fontWeight: '700', fontFamily: mono }}>{usd === null ? '—' : `${kind === 'income' ? '+' : '-'}$${money(usd)}`}</Text> USD BCV
                  {isReference ? '' : ` · tasa ${selected.label} ${rateText(effectiveRate)}`}
                </Text>
              )}
            </View>

            <Choice
              label="Categoría"
              options={[{ id: '', label: 'Sin categoría' }, ...visibleCategories.map((c) => ({ id: c.id, label: c.name }))]}
              value={categoryId}
              onChange={setCategoryId}
            />
            <Field label="Lugar" value={place} onChangeText={setPlace} placeholder="El Gama, Farmatodo…" />
            <Field label="Descripción" value={description} onChangeText={setDescription} placeholder="Compra de la semana" />
            <DateField label="Fecha" value={date} onChange={setDate} future />
            <Field label="Nota" value={note} onChangeText={setNote} multiline />
          </ScrollView>
          <Row style={{ padding: 16, paddingTop: 8 }}>
            <Btn label="Cancelar" kind="ghost" onPress={onClose} />
            <Btn label={saving ? 'Guardando…' : 'Guardar'} onPress={save} disabled={saving} />
          </Row>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Pide confirmación y borra; el borrado es optimista y se deshace si falla (en el hook). */
export async function confirmRemoveTx(t: Transaction, remove: (id: string) => Promise<void>) {
  const what = t.description || t.place || 'este movimiento';
  if (!(await confirm('Eliminar movimiento', `Se elimina "${what}" de $${money(t.amount_usd)}.`, 'Eliminar'))) return;
  try {
    await remove(t.id);
  } catch (e) {
    notify(e instanceof Error ? e.message : 'No pude eliminarlo.');
  }
}

// ---------------------------------------------------------------------------- comunes

export function IconBtn({ children, label, onPress }: { children: ReactNode; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={4} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel={label}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { color: C.text, fontSize: 14.5, lineHeight: 20 },
  name: { color: C.text, fontSize: 14.5, fontWeight: '600' },
  caption: { color: C.muted, fontSize: 12, lineHeight: 17 },
  num: { fontSize: 13.5, color: C.text, fontVariant: ['tabular-nums'] },
  big: { fontSize: 22, fontWeight: '600', fontVariant: ['tabular-nums'] },
  tag: { fontFamily: mono, fontSize: 10, letterSpacing: 1, color: C.muted, textTransform: 'uppercase' },
  small: { flexGrow: 0, minHeight: 40, paddingHorizontal: 14 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  axis: { height: 16, marginTop: -18 },
  tick: { position: 'absolute', transform: [{ translateX: -6 }], fontFamily: mono, fontSize: 10, color: C.muted },
  warnBox: { gap: 10, padding: 12, borderRadius: R.card, borderWidth: 1, borderColor: C.warn, backgroundColor: C.surfaceInput },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  inlineInput: { color: C.text, fontSize: 15, borderWidth: 1, borderColor: C.border, borderRadius: R.field, paddingHorizontal: 10, minHeight: 40, minWidth: 110, backgroundColor: C.surfaceSunken },
  input: { color: C.text, fontSize: 15, borderWidth: 1, borderColor: C.cardBorder, borderRadius: R.field, paddingHorizontal: 12, minHeight: 44, backgroundColor: C.surfaceSunken },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  colorBtn: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  palette: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingLeft: 32 },
  paletteItem: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: R.control, borderWidth: 1, borderColor: 'transparent' },
  totals: { flexDirection: 'row', gap: 8 },
  total: { flex: 1, gap: 4, paddingHorizontal: 10 },
  breakdown: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  track: { height: 6, borderRadius: 3, backgroundColor: C.surfaceSunken, overflow: 'hidden' },
  collapse: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44 },
  tx: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: C.bg, opacity: 0.8 },
  modalWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 12 },
  modal: { width: '100%', maxWidth: 560, maxHeight: '92%', borderRadius: R.card, borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  kindBtn: { flex: 1, minHeight: 48, borderRadius: R.button, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.surfaceInput, alignItems: 'center', justifyContent: 'center' },
  kindText: { fontSize: 15, fontWeight: '700' },
  amount: { fontSize: 24, fontFamily: mono },
  equiv: { padding: 12, borderRadius: R.card, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.surfaceSunken },
});
