// YO · Finanzas: pestañas Deudas (cuentas por pagar con vencimiento y "pagada") y Presupuesto (gastos
// estimados del mes: recurrentes, que salen todos los meses, más los puntuales de ese mes). No se cruzan con
// los movimientos de Ingresos y gastos; los montos van tal cual, sin conversión de moneda.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Btn, Field } from '@/components/form';
import { IconBtn } from '@/components/finance';
import { IconBack, IconCheck, IconChevron, IconPencil, IconTrash } from '@/components/icons';
import { Card, Label, Mono, Row } from '@/components/ui';
import { notify } from '@/lib/confirm';
import { formatDate, parseDate, toDmy } from '@/lib/dates';
import { Bill, BudgetItem, currentMonth, money, monthLabel, parseAmount, shiftMonth, useBills, useBudget } from '@/lib/finance';
import { C, mono, R } from '@/theme';

// ---------------------------------------------------------------------------- Deudas

export function BillsTab() {
  const { ready, bills, reload, save, togglePaid, remove } = useBills();
  const [editing, setEditing] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const total = bills.reduce((s, b) => s + b.amount, 0);
  const unpaid = bills.filter((b) => !b.paid).reduce((s, b) => s + b.amount, 0);

  return (
    <>
      <View style={styles.chips}>
        <Chip label="Total" value={money(total)} />
        <Chip label="Por pagar" value={money(unpaid)} color={C.bad} />
      </View>

      {ready && bills.length === 0 ? <Text style={styles.caption}>Todavía no tienes deudas. Agrega una abajo.</Text> : null}

      {bills.map((b) =>
        editing === b.id ? (
          <BillForm
            key={b.id}
            initial={b}
            onCancel={() => setEditing(null)}
            onSave={async (input) => {
              await save(input, b.id);
              setEditing(null);
            }}
          />
        ) : (
          <Card key={b.id} style={{ gap: 6 }}>
            <View style={styles.line}>
              <Pressable onPress={() => togglePaid(b.id)} style={styles.check} accessibilityRole="checkbox" accessibilityState={{ checked: b.paid }} accessibilityLabel={`${b.name} pagada`}>
                <View style={[styles.box, b.paid && styles.boxOn]}>{b.paid ? <IconCheck color={C.ok} size={14} /> : null}</View>
              </Pressable>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.name, b.paid && styles.done]} numberOfLines={1}>
                  {b.name}
                </Text>
                <Text style={styles.caption} numberOfLines={2}>
                  {[b.description, b.due_date ? `vence ${formatDate(b.due_date)}` : ''].filter(Boolean).join(' · ') || 'Sin vencimiento'}
                </Text>
              </View>
              <Mono style={[styles.num, { color: b.paid ? C.muted : C.text }]}>{money(b.amount)}</Mono>
              <IconBtn label={`Editar ${b.name}`} onPress={() => setEditing(b.id)}>
                <IconPencil color={C.muted} />
              </IconBtn>
              <IconBtn label={`Eliminar ${b.name}`} onPress={() => remove(b.id)}>
                <IconTrash color={C.bad} />
              </IconBtn>
            </View>
          </Card>
        ),
      )}

      <BillForm key={`new${bills.length}`} onSave={(input) => save(input)} />
    </>
  );
}

function BillForm({ initial, onSave, onCancel }: { initial?: Bill; onSave: (input: { name: string; description: string; amount: number; due_date: string | null }) => Promise<void>; onCancel?: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [amount, setAmount] = useState(initial ? String(initial.amount).replace('.', ',') : '');
  const [due, setDue] = useState(initial?.due_date ? toDmy(initial.due_date) : '');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const value = parseAmount(amount);
    if (!name.trim() || !amount.trim()) return notify('Escribe un nombre y un monto.');
    if (!Number.isFinite(value) || value <= 0) return notify('El monto tiene que ser un número mayor que cero.');
    const dueIso = due.trim() ? parseDate(due, new Date(2100, 0, 1)) : null;
    if (due.trim() && !dueIso) return notify('Escribe el vencimiento como DD/MM/AAAA o déjalo vacío.');
    setSaving(true);
    try {
      await onSave({ name, description, amount: value, due_date: dueIso });
      if (!initial) {
        setName('');
        setDescription('');
        setAmount('');
        setDue('');
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No pude guardar la deuda.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card glow={Boolean(initial)}>
      <Label style={{ color: C.accentSoft }}>{initial ? 'Editar deuda' : 'Agregar deuda'}</Label>
      <Field label="Nombre" placeholder="Ej. Préstamo del carro" value={name} onChangeText={setName} />
      <Field label="Descripción" placeholder="Opcional" value={description} onChangeText={setDescription} />
      <View style={styles.pair}>
        <View style={{ flex: 1 }}>
          <Field label="Monto" placeholder="0,00" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Vence" placeholder="DD/MM/AAAA" value={due} onChangeText={setDue} keyboardType="numbers-and-punctuation" maxLength={10} />
        </View>
      </View>
      <Row style={{ justifyContent: 'flex-end' }}>
        {onCancel ? <Btn label="Cancelar" kind="ghost" onPress={onCancel} style={styles.small} /> : null}
        <Btn label={saving ? 'Guardando…' : initial ? 'Guardar' : '+ Agregar'} onPress={submit} disabled={saving} style={styles.small} />
      </Row>
    </Card>
  );
}

// ---------------------------------------------------------------------------- Presupuesto

export function BudgetTab() {
  const { ready, items, reload, save, remove } = useBudget();
  const [month, setMonth] = useState(currentMonth());
  const [editing, setEditing] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const recurring = items.filter((x) => x.recurring);
  const oneOff = items.filter((x) => !x.recurring && x.month === month);
  const recurringTotal = recurring.reduce((s, x) => s + x.amount, 0);
  const estimated = recurringTotal + oneOff.reduce((s, x) => s + x.amount, 0);
  const visible = [...recurring, ...oneOff];

  return (
    <>
      <MonthStepper month={month} onChange={setMonth} />
      <View style={styles.chips}>
        <Chip label="Total estimado" value={money(estimated)} />
        <Chip label="Recurrente al mes" value={money(recurringTotal)} />
      </View>

      {/* La fila para agregar va arriba; su mes por defecto es el que estás viendo. */}
      <BudgetForm key={`new${month}${items.length}`} month={month} onSave={(input) => save(input)} />

      {ready && visible.length === 0 ? <Text style={styles.caption}>{`Todavía no hay gastos para ${monthLabel(month).toLowerCase()}. Agrega uno arriba.`}</Text> : null}

      {visible.map((x) =>
        editing === x.id ? (
          <BudgetForm
            key={x.id}
            initial={x}
            month={month}
            onCancel={() => setEditing(null)}
            onSave={async (input) => {
              await save(input, x.id);
              setEditing(null);
            }}
          />
        ) : (
          <Card key={x.id} style={{ gap: 4 }}>
            <View style={styles.line}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {x.category || 'Sin categoría'}
                </Text>
                <Text style={styles.caption} numberOfLines={2}>
                  {[x.description, x.recurring ? 'Todos los meses' : monthLabel(x.month)].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Mono style={styles.num}>{money(x.amount)}</Mono>
              <IconBtn label={`Editar ${x.category || 'gasto'}`} onPress={() => setEditing(x.id)}>
                <IconPencil color={C.muted} />
              </IconBtn>
              <IconBtn label={`Eliminar ${x.category || 'gasto'}`} onPress={() => remove(x.id)}>
                <IconTrash color={C.bad} />
              </IconBtn>
            </View>
          </Card>
        ),
      )}
    </>
  );
}

function BudgetForm({ initial, month, onSave, onCancel }: { initial?: BudgetItem; month: string; onSave: (input: Omit<BudgetItem, 'id' | 'created_at'>) => Promise<void>; onCancel?: () => void }) {
  const [category, setCategory] = useState(initial?.category ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [amount, setAmount] = useState(initial ? String(initial.amount).replace('.', ',') : '');
  const [recurring, setRecurring] = useState(initial?.recurring ?? false);
  const [itemMonth, setItemMonth] = useState(initial?.month ?? month);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const value = parseAmount(amount);
    if (!amount.trim() || !Number.isFinite(value) || value <= 0) return notify('El monto tiene que ser un número mayor que cero.');
    setSaving(true);
    try {
      await onSave({ category, description, amount: value, recurring, month: itemMonth });
      if (!initial) {
        setCategory('');
        setDescription('');
        setAmount('');
        setRecurring(false);
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No pude guardar el gasto.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card glow={Boolean(initial)}>
      <Label style={{ color: C.accentSoft }}>{initial ? 'Editar gasto' : 'Agregar gasto estimado'}</Label>
      <View style={styles.pair}>
        <View style={{ flex: 1 }}>
          <Field label="Categoría" placeholder="Ej. Supermercado" value={category} onChangeText={setCategory} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Monto" placeholder="0,00" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
        </View>
      </View>
      <Field label="Descripción" placeholder="Opcional" value={description} onChangeText={setDescription} />
      <Pressable onPress={() => setRecurring(!recurring)} style={styles.line} accessibilityRole="checkbox" accessibilityState={{ checked: recurring }}>
        <View style={[styles.box, recurring && styles.boxOn]}>{recurring ? <IconCheck color={C.ok} size={14} /> : null}</View>
        <Text style={styles.body}>Se repite todos los meses</Text>
      </Pressable>
      {/* El mes no aplica si es recurrente. */}
      {recurring ? null : <MonthStepper month={itemMonth} onChange={setItemMonth} compact />}
      <Row style={{ justifyContent: 'flex-end' }}>
        {onCancel ? <Btn label="Cancelar" kind="ghost" onPress={onCancel} style={styles.small} /> : null}
        <Btn label={saving ? 'Guardando…' : initial ? 'Guardar' : '+ Agregar'} onPress={submit} disabled={saving} style={styles.small} />
      </Row>
    </Card>
  );
}

// ---------------------------------------------------------------------------- comunes

/** ‹ Octubre de 2026 › y "Hoy" si no es el mes actual. */
export function MonthStepper({ month, onChange, compact }: { month: string; onChange: (m: string) => void; compact?: boolean }) {
  return (
    <View style={styles.stepper}>
      <IconBtn label="Mes anterior" onPress={() => onChange(shiftMonth(month, -1))}>
        <IconBack color={C.accentSoft} size={18} />
      </IconBtn>
      <Text style={[compact ? styles.body : styles.month, { minWidth: compact ? 130 : 170, textAlign: 'center' }]}>{monthLabel(month)}</Text>
      <IconBtn label="Mes siguiente" onPress={() => onChange(shiftMonth(month, 1))}>
        <IconChevron color={C.accentSoft} />
      </IconBtn>
      {month !== currentMonth() ? <Btn label="Hoy" kind="ghost" onPress={() => onChange(currentMonth())} style={styles.small} /> : null}
    </View>
  );
}

function Chip({ label, value, color = C.text }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.chip}>
      <Label>{label}</Label>
      <Mono style={[styles.chipValue, { color }]}>{value}</Mono>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { color: C.text, fontSize: 14.5 },
  name: { color: C.text, fontSize: 15, fontWeight: '600' },
  done: { color: C.muted, textDecorationLine: 'line-through' },
  caption: { color: C.muted, fontSize: 12.5, lineHeight: 18 },
  num: { fontSize: 14, color: C.text, fontVariant: ['tabular-nums'] },
  month: { color: C.text, fontSize: 17, fontWeight: '600' },
  small: { flexGrow: 0, minHeight: 44, paddingHorizontal: 16 },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { flexGrow: 1, gap: 2, paddingHorizontal: 14, paddingVertical: 10, borderRadius: R.card, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.card },
  chipValue: { fontSize: 18, fontWeight: '600', fontVariant: ['tabular-nums'], fontFamily: mono },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  pair: { flexDirection: 'row', gap: 10 },
  check: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  boxOn: { borderColor: C.ok },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
});
