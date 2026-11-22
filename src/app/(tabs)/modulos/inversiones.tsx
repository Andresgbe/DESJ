// Módulo Inversiones: lo que inviertes cada mes (en qué, dónde y cuánto, en dólares), con totales, los últimos
// 12 meses y el reparto por activo. Solo es un registro: DESJ no da consejos de compra ni venta.
// El ojo de arriba oculta los montos (el mismo ajuste de Finanzas).
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { IconBtn } from '@/components/finance';
import { MonthStepper } from '@/components/finance-lists';
import { Btn, Field } from '@/components/form';
import { HideAmountsButton } from '@/components/hide-amounts';
import { IconPencil, IconTrash } from '@/components/icons';
import { Text } from '@/components/text';
import { Card, Label, Mono, Row, Screen, Title } from '@/components/ui';
import { confirm, notify } from '@/lib/confirm';
import { currentMonth, money, monthLabel, parseAmount } from '@/lib/finance';
import { byAsset, type Investment, type InvestmentInput, monthlyTotals, useInvestments } from '@/lib/investments';
import { useAmountsHidden } from '@/lib/privacy';
import { C, mono, R } from '@/theme';

export default function Inversiones() {
  useAmountsHidden(); // al ocultar o mostrar los montos se vuelve a dibujar la pantalla
  const { ready, items, reload, save, remove } = useInvestments();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      reload()
        .then(() => setError(null))
        .catch((e: Error) => setError(e.message));
    }, [reload]),
  );

  const now = currentMonth();
  const total = items.reduce((s, x) => s + x.amount_usd, 0);
  const thisMonth = items.filter((x) => x.month === now).reduce((s, x) => s + x.amount_usd, 0);
  const last12 = monthlyTotals(items, now, 12);
  const avg = last12.reduce((s, m) => s + m.total, 0) / 12;
  const assets = byAsset(items);
  const months = [...new Set(items.map((x) => x.month))];

  const askRemove = async (x: Investment) => {
    if (!(await confirm('Borrar inversión', `Se borra "${x.asset}" de ${monthLabel(x.month)}.`, 'Borrar'))) return;
    remove(x.id).catch((e: Error) => notify(e.message));
  };

  return (
    <Screen module="Módulo · Inversiones" back>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Title accent="inversiones">Tus</Title>
        </View>
        <HideAmountsButton />
      </View>
      <Text style={styles.caption}>Tu registro de aportes mensuales, en dólares. DESJ no da consejos de compra ni venta.</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.chips}>
        <Stat label="Total invertido" value={`$${money(total)}`} />
        <Stat label="Este mes" value={`$${money(thisMonth)}`} />
        <Stat label="Promedio al mes" value={`$${money(avg)}`} hint="últimos 12 meses" />
      </View>

      {items.length ? <MonthsChart data={last12} current={now} /> : null}

      {assets.length ? (
        <Card style={{ gap: 10 }}>
          <Label>Por activo</Label>
          {assets.map((a) => (
            <View key={a.asset} style={{ gap: 4 }}>
              <View style={styles.line}>
                <Text style={[styles.body, { flex: 1 }]} numberOfLines={1}>
                  {a.asset}
                </Text>
                <Text style={styles.caption}>{Math.round(a.share * 100)} %</Text>
                <Mono style={styles.num}>{`$${money(a.total)}`}</Mono>
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.max(2, a.share * 100)}%` }]} />
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      <InvestmentForm key={`new${items.length}`} assets={assets.map((a) => a.asset)} onSave={(input) => save(input)} />

      {ready && items.length === 0 ? <Text style={styles.caption}>Todavía no tienes inversiones. Agrega el aporte de este mes arriba.</Text> : null}

      {months.map((m) => {
        const list = items.filter((x) => x.month === m);
        return (
          <Card key={m} style={{ gap: 6 }}>
            <View style={styles.line}>
              <Label style={{ flex: 1 }}>{monthLabel(m)}</Label>
              <Mono style={[styles.num, { color: C.accentSoft }]}>{`$${money(list.reduce((s, x) => s + x.amount_usd, 0))}`}</Mono>
            </View>
            {list.map((x) =>
              editing === x.id ? (
                <InvestmentForm
                  key={x.id}
                  initial={x}
                  assets={assets.map((a) => a.asset)}
                  onCancel={() => setEditing(null)}
                  onSave={async (input) => {
                    await save(input, x.id);
                    setEditing(null);
                  }}
                />
              ) : (
                <View key={x.id} style={styles.line}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.name} numberOfLines={1}>
                      {x.asset}
                    </Text>
                    {x.platform || x.note ? (
                      <Text style={styles.caption} numberOfLines={2}>
                        {[x.platform, x.note].filter(Boolean).join(' · ')}
                      </Text>
                    ) : null}
                  </View>
                  <Mono style={styles.num}>{`$${money(x.amount_usd)}`}</Mono>
                  <IconBtn label={`Editar ${x.asset}`} onPress={() => setEditing(x.id)}>
                    <IconPencil color={C.muted} />
                  </IconBtn>
                  <IconBtn label={`Borrar ${x.asset}`} onPress={() => askRemove(x)}>
                    <IconTrash color={C.bad} />
                  </IconBtn>
                </View>
              ),
            )}
          </Card>
        );
      })}
    </Screen>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View style={styles.chip}>
      <Label>{label}</Label>
      <Mono style={styles.chipValue}>{value}</Mono>
      {hint ? <Text style={styles.caption}>{hint}</Text> : null}
    </View>
  );
}

/** Barras de los últimos 12 meses; el mes actual resaltado. Sin cifras: los montos van en las tarjetas. */
function MonthsChart({ data, current }: { data: { month: string; total: number }[]; current: string }) {
  const max = Math.max(...data.map((d) => d.total), 1);
  return (
    <Card style={{ gap: 8 }}>
      <Label>Últimos 12 meses</Label>
      <View style={styles.bars} accessibilityRole="image" accessibilityLabel={`Aportes de los últimos 12 meses: ${data.filter((d) => d.total).length} meses con inversión`}>
        {data.map((d) => (
          <View key={d.month} style={styles.barCol}>
            <View style={styles.barSlot}>
              <View style={[styles.bar, { height: `${(d.total / max) * 100}%`, backgroundColor: d.month === current ? C.accentSoft : C.accent, opacity: d.total ? 1 : 0 }]} />
            </View>
            <Text style={styles.barLabel}>{monthLabel(d.month).slice(0, 1).toUpperCase()}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

function InvestmentForm({ initial, assets, onSave, onCancel }: { initial?: Investment; assets: string[]; onSave: (input: InvestmentInput) => Promise<void>; onCancel?: () => void }) {
  const [month, setMonth] = useState(initial?.month ?? currentMonth());
  const [asset, setAsset] = useState(initial?.asset ?? '');
  const [platform, setPlatform] = useState(initial?.platform ?? '');
  const [amount, setAmount] = useState(initial ? String(initial.amount_usd).replace('.', ',') : '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const value = parseAmount(amount);
    if (!asset.trim() || !amount.trim()) return notify('Escribe en qué invertiste y el monto.');
    if (!Number.isFinite(value) || value <= 0) return notify('El monto tiene que ser un número mayor que cero.');
    setSaving(true);
    try {
      await onSave({ month, asset, platform, amount_usd: value, note });
      if (!initial) {
        setAsset('');
        setPlatform('');
        setAmount('');
        setNote('');
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No pude guardar la inversión.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card glow={Boolean(initial)} style={{ gap: 8 }}>
      <Label style={{ color: C.accentSoft }}>{initial ? 'Editar inversión' : 'Agregar inversión'}</Label>
      <MonthStepper month={month} onChange={setMonth} compact />
      <Field label="En qué" placeholder="Ej. S&P 500, Bitcoin, CDT" value={asset} onChangeText={setAsset} maxLength={80} />
      {/* Atajos con los activos que ya usaste. */}
      {!initial && assets.length ? (
        <View style={styles.suggest}>
          {assets.slice(0, 6).map((a) => (
            <Pressable key={a} onPress={() => setAsset(a)} style={[styles.pill, asset === a && styles.pillOn]} accessibilityRole="button" accessibilityLabel={`Usar ${a}`}>
              <Text style={styles.pillText} numberOfLines={1}>
                {a}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <View style={styles.pair}>
        <View style={{ flex: 1 }}>
          <Field label="Monto (USD)" placeholder="0,00" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Dónde" placeholder="Opcional" value={platform} onChangeText={setPlatform} maxLength={80} />
        </View>
      </View>
      <Field label="Nota" placeholder="Opcional" value={note} onChangeText={setNote} maxLength={300} />
      <Row style={{ justifyContent: 'flex-end' }}>
        {onCancel ? <Btn label="Cancelar" kind="ghost" onPress={onCancel} style={styles.small} /> : null}
        <Btn label={saving ? 'Guardando…' : initial ? 'Guardar' : '+ Agregar'} onPress={submit} disabled={saving} style={styles.small} />
      </Row>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  caption: { color: C.muted, fontSize: 12.5, lineHeight: 18 },
  error: { color: C.bad, fontSize: 13.5 },
  body: { color: C.text, fontSize: 14.5 },
  name: { color: C.text, fontSize: 15, fontWeight: '600' },
  num: { fontSize: 14, color: C.text, fontVariant: ['tabular-nums'] },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { flexGrow: 1, flexBasis: 120, gap: 2, paddingHorizontal: 14, paddingVertical: 10, borderRadius: R.card, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.card },
  chipValue: { fontSize: 18, fontWeight: '600', fontVariant: ['tabular-nums'], fontFamily: mono, color: C.text },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  track: { height: 6, borderRadius: R.pill, backgroundColor: C.surfaceSunken, overflow: 'hidden' },
  fill: { height: 6, borderRadius: R.pill, backgroundColor: C.accent },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 120 },
  barCol: { flex: 1, alignItems: 'center', gap: 4, height: '100%' },
  barSlot: { flex: 1, width: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 3, minHeight: 2 },
  barLabel: { color: C.muted, fontSize: 10, fontFamily: mono },
  suggest: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 12, borderRadius: R.pill, borderWidth: 1, borderColor: C.cardBorder, maxWidth: 180 },
  pillOn: { borderColor: C.border, backgroundColor: C.surfaceSelected },
  pillText: { color: C.chipText, fontSize: 13 },
  pair: { flexDirection: 'row', gap: 10 },
  small: { flexGrow: 0, minHeight: 44, paddingHorizontal: 16 },
});
