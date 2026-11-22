// Finanzas · Reportes: resumen de una semana (lunes a domingo) o de un mes, comparado con el periodo anterior.
// Totales, gastos e ingresos por categoría, los mayores gastos y el gasto promedio por día. "Compartir" arma el
// reporte en texto (con los montos reales, aunque estén ocultos en pantalla: compartirlo es decisión de la persona).
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Share, StyleSheet, View } from 'react-native';

import { IconBtn } from '@/components/finance';
import { Btn, Choice } from '@/components/form';
import { IconBack, IconChevron } from '@/components/icons';
import { Text } from '@/components/text';
import { Card, Label, Mono } from '@/components/ui';
import { notify } from '@/lib/confirm';
import {
  addDays,
  byCategory,
  type Category,
  type CategoryShare,
  currentMonth,
  daysInMonth,
  money,
  moneyExact,
  monthLabel,
  shiftMonth,
  todayIso,
  totals,
  type Transaction,
  useFinanceFlow,
  weekLabel,
  weekStart,
} from '@/lib/finance';
import { C, mono, R } from '@/theme';

type Period = 'semana' | 'mes';
type Range = { from: string; to: string; label: string; days: number };

/** Rango de la semana o del mes que empieza en `anchor` (lunes YYYY-MM-DD o mes YYYY-MM). */
function rangeOf(period: Period, anchor: string): Range {
  if (period === 'semana') return { from: anchor, to: addDays(anchor, 6), label: `Semana del ${weekLabel(anchor)}`, days: 7 };
  const days = daysInMonth(anchor);
  return { from: `${anchor}-01`, to: `${anchor}-${String(days).padStart(2, '0')}`, label: monthLabel(anchor), days };
}

const shift = (period: Period, anchor: string, delta: number) => (period === 'semana' ? addDays(anchor, 7 * delta) : shiftMonth(anchor, delta));
const nowAnchor = (period: Period) => (period === 'semana' ? weekStart(new Date()) : currentMonth());

/** Días del periodo que ya pasaron (para el promedio: una semana en curso no se divide entre 7). */
function elapsedDays(r: Range) {
  const today = todayIso();
  if (today < r.from) return 0;
  if (today > r.to) return r.days;
  return Math.round((new Date(`${today}T12:00:00`).getTime() - new Date(`${r.from}T12:00:00`).getTime()) / 86_400_000) + 1;
}

/** "+12 %" / "-8 %" frente al periodo anterior; null si no hay con qué comparar. */
function change(now: number, before: number) {
  if (!before) return null;
  const pct = Math.round(((now - before) / before) * 100);
  return `${pct > 0 ? '+' : ''}${pct} %`;
}

export function ReportTab() {
  const { categories, loadSetup, fetchRange } = useFinanceFlow();
  const [period, setPeriod] = useState<Period>('mes');
  const [anchor, setAnchor] = useState(nowAnchor('mes'));
  // Cada carga recuerda su periodo: mientras no coincida con el elegido, se muestra "Armando el reporte…".
  const [loaded, setLoaded] = useState<{ key: string; now: Transaction[]; before: Transaction[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadSetup().catch((e: Error) => setError(e.message));
    }, [loadSetup]),
  );

  const range = rangeOf(period, anchor);
  const prev = rangeOf(period, shift(period, anchor, -1));

  const key = `${range.from}|${prev.from}`;
  const data = loaded?.key === key ? loaded : null;

  useEffect(() => {
    let alive = true;
    Promise.all([fetchRange(range.from, range.to), fetchRange(prev.from, prev.to)])
      .then(([now, before]) => {
        if (!alive) return;
        setLoaded({ key: `${range.from}|${prev.from}`, now, before });
        setError(null);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [fetchRange, range.from, range.to, prev.from, prev.to]);

  const changePeriod = (p: Period) => {
    setPeriod(p);
    setAnchor(nowAnchor(p));
  };

  const t = totals(data?.now ?? []);
  const tb = totals(data?.before ?? []);
  const expenses = byCategory(data?.now ?? [], categories, 'expense');
  const incomes = byCategory(data?.now ?? [], categories, 'income');
  const top = (data?.now ?? []).filter((x) => x.kind === 'expense').sort((a, b) => b.amount_usd - a.amount_usd).slice(0, 5);
  const days = elapsedDays(range);
  const perDay = days ? t.expense / days : 0;
  const prevName = period === 'semana' ? 'la semana anterior' : 'el mes anterior';

  const share = async () => {
    if (!data) return;
    const text = reportText(range, prevName, t, tb, expenses, incomes, top, categories, perDay);
    try {
      if (Platform.OS === 'web' && !(globalThis as { navigator?: { share?: unknown } }).navigator?.share) {
        await (globalThis as unknown as { navigator: { clipboard: { writeText: (s: string) => Promise<void> } } }).navigator.clipboard.writeText(text);
        notify('Reporte copiado. Pégalo donde quieras.');
      } else {
        await Share.share({ message: text, title: `Reporte de finanzas · ${range.label}` });
      }
    } catch {
      // la persona cerró la hoja de compartir
    }
  };

  return (
    <>
      <Choice
        options={[
          { id: 'semana', label: 'Semanal' },
          { id: 'mes', label: 'Mensual' },
        ]}
        value={period}
        onChange={changePeriod}
      />

      <View style={styles.stepper}>
        <IconBtn label={period === 'semana' ? 'Semana anterior' : 'Mes anterior'} onPress={() => setAnchor(shift(period, anchor, -1))}>
          <IconBack color={C.accentSoft} size={18} />
        </IconBtn>
        <Text style={styles.period}>{range.label}</Text>
        <IconBtn label={period === 'semana' ? 'Semana siguiente' : 'Mes siguiente'} onPress={() => setAnchor(shift(period, anchor, 1))}>
          <IconChevron color={C.accentSoft} />
        </IconBtn>
        {anchor !== nowAnchor(period) ? <Btn label="Hoy" kind="ghost" onPress={() => setAnchor(nowAnchor(period))} style={styles.small} /> : null}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!data && !error ? <Text style={styles.caption}>Armando el reporte…</Text> : null}

      {data ? (
        <>
          <View style={styles.chips}>
            <Stat label="Ingresos" value={`$${money(t.income)}`} color={C.ok} delta={change(t.income, tb.income)} />
            <Stat label="Gastos" value={`$${money(t.expense)}`} color={C.bad} delta={change(t.expense, tb.expense)} />
          </View>
          <View style={styles.chips}>
            <Stat label="Balance" value={`${t.balance >= 0 ? '+' : '-'}$${money(Math.abs(t.balance))}`} color={t.balance >= 0 ? C.ok : C.bad} />
            <Stat label="Gasto por día" value={`$${money(perDay)}`} color={C.text} />
          </View>
          <Text style={styles.caption}>Los porcentajes comparan con {prevName}.</Text>

          {data.now.length === 0 ? (
            <Text style={styles.caption}>No hay movimientos en este periodo.</Text>
          ) : (
            <>
              <Shares title="Gastos por categoría" rows={expenses} />
              <Shares title="Ingresos por categoría" rows={incomes} />
              {top.length ? (
                <Card style={{ gap: 8 }}>
                  <Label>Mayores gastos</Label>
                  {top.map((x) => (
                    <View key={x.id} style={styles.line}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.body} numberOfLines={1}>
                          {x.description || categories.find((c) => c.id === x.category_id)?.name || 'Gasto'}
                        </Text>
                        <Text style={styles.caption}>{new Date(`${x.occurred_on}T12:00:00`).toLocaleDateString('es-VE', { day: 'numeric', month: 'short' })}</Text>
                      </View>
                      <Mono style={[styles.num, { color: C.bad }]}>{`-$${money(x.amount_usd)}`}</Mono>
                    </View>
                  ))}
                </Card>
              ) : null}
            </>
          )}

          <Btn label="Compartir reporte" kind="outline" onPress={share} />
        </>
      ) : null}
    </>
  );
}

function Stat({ label, value, color, delta }: { label: string; value: string; color: string; delta?: string | null }) {
  return (
    <View style={styles.chip}>
      <Label>{label}</Label>
      <Mono style={[styles.chipValue, { color }]}>{value}</Mono>
      {delta ? <Text style={styles.caption}>{delta}</Text> : null}
    </View>
  );
}

function Shares({ title, rows }: { title: string; rows: CategoryShare[] }) {
  if (!rows.length) return null;
  return (
    <Card style={{ gap: 10 }}>
      <Label>{title}</Label>
      {rows.map((r) => (
        <View key={r.id ?? 'none'} style={{ gap: 4 }}>
          <View style={styles.line}>
            <Text style={[styles.body, { flex: 1 }]} numberOfLines={1}>
              {r.name}
            </Text>
            <Text style={styles.caption}>{Math.round(r.share * 100)} %</Text>
            <Mono style={styles.num}>{`$${money(r.total)}`}</Mono>
          </View>
          <View style={styles.track}>
            {/* El color es el de la categoría (dato de la persona). */}
            <View style={[styles.fill, { width: `${Math.max(2, r.share * 100)}%`, backgroundColor: r.color }]} />
          </View>
        </View>
      ))}
    </Card>
  );
}

function reportText(
  r: Range,
  prevName: string,
  t: { income: number; expense: number; balance: number },
  tb: { income: number; expense: number },
  expenses: CategoryShare[],
  incomes: CategoryShare[],
  top: Transaction[],
  categories: Category[],
  perDay: number,
) {
  const usd = (n: number) => `$${moneyExact(n)}`;
  const vs = (now: number, before: number) => {
    const c = change(now, before);
    return c ? ` (${c} vs ${prevName})` : '';
  };
  const lines = [
    `Reporte de finanzas · ${r.label}`,
    '',
    `Ingresos: ${usd(t.income)}${vs(t.income, tb.income)}`,
    `Gastos: ${usd(t.expense)}${vs(t.expense, tb.expense)}`,
    `Balance: ${t.balance >= 0 ? '+' : '-'}${usd(Math.abs(t.balance))}`,
    `Gasto promedio por día: ${usd(perDay)}`,
  ];
  if (expenses.length) lines.push('', 'Gastos por categoría:', ...expenses.map((x) => `- ${x.name}: ${usd(x.total)} (${Math.round(x.share * 100)} %)`));
  if (incomes.length) lines.push('', 'Ingresos por categoría:', ...incomes.map((x) => `- ${x.name}: ${usd(x.total)} (${Math.round(x.share * 100)} %)`));
  if (top.length) {
    lines.push('', 'Mayores gastos:');
    for (const x of top) lines.push(`- ${x.description || categories.find((c) => c.id === x.category_id)?.name || 'Gasto'} (${x.occurred_on}): ${usd(x.amount_usd)}`);
  }
  lines.push('', 'Montos en dólar BCV. Hecho con DESJ.');
  return lines.join('\n');
}

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  period: { color: C.text, fontSize: 16, fontWeight: '600', textAlign: 'center', flexShrink: 1 },
  small: { flexGrow: 0, minHeight: 44, paddingHorizontal: 16 },
  error: { color: C.bad, fontSize: 13.5 },
  caption: { color: C.muted, fontSize: 12.5, lineHeight: 18 },
  body: { color: C.text, fontSize: 14.5 },
  num: { fontSize: 14, color: C.text, fontVariant: ['tabular-nums'] },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { flexGrow: 1, flexBasis: 140, gap: 2, paddingHorizontal: 14, paddingVertical: 10, borderRadius: R.card, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.card },
  chipValue: { fontSize: 18, fontWeight: '600', fontVariant: ['tabular-nums'], fontFamily: mono },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36 },
  track: { height: 6, borderRadius: R.pill, backgroundColor: C.surfaceSunken, overflow: 'hidden' },
  fill: { height: 6, borderRadius: R.pill },
});
