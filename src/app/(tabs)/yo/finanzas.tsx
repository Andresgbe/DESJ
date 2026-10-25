// YO · Finanzas: ingresos, gastos, deudas y presupuesto mensual. Todo se lleva a una sola unidad, el dólar BCV,
// para poder sumar bolívares, dólar efectivo, USDT y euros. Tres secciones independientes que se eligen en una
// lista plegable: Ingresos y gastos (la principal), Deudas y Presupuesto.
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Breakdown, CategoryManager, confirmRemoveTx, MissingRatesBanner, MonthChart, RatesCard, Totals, TransactionModal, TxList } from '@/components/finance';
import { BillsTab, BudgetTab, MonthStepper } from '@/components/finance-lists';
import { Btn } from '@/components/form';
import { IconChevron, IconPlus } from '@/components/icons';
import { Screen, Title } from '@/components/ui';
import { currentMonth, ratesStale, totals, Transaction, useFinanceFlow } from '@/lib/finance';
import { C, R } from '@/theme';

type Tab = 'flujo' | 'deudas' | 'presupuesto';
const TABS: { id: Tab; label: string }[] = [
  { id: 'flujo', label: 'Ingresos y gastos' },
  { id: 'deudas', label: 'Deudas' },
  { id: 'presupuesto', label: 'Presupuesto' },
];

export default function Finanzas() {
  const [tab, setTab] = useState<Tab>('flujo');
  return (
    <Screen module="Módulo 03.2 · Finanzas" back>
      <Title accent="finanzas">Tus</Title>
      <SectionPicker value={tab} onChange={setTab} />
      {tab === 'flujo' ? <FlowTab /> : tab === 'deudas' ? <BillsTab /> : <BudgetTab />}
    </Screen>
  );
}

/** Lista plegable para elegir la sección: muestra solo la elegida y, al tocarla, las demás. */
function SectionPicker({ value, onChange }: { value: Tab; onChange: (t: Tab) => void }) {
  const [open, setOpen] = useState(false);
  const current = TABS.find((t) => t.id === value)!;
  return (
    <View style={styles.picker}>
      <Pressable onPress={() => setOpen(!open)} style={styles.pickerHead} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`Sección: ${current.label}`}>
        <Text style={styles.pickerText}>{current.label}</Text>
        <View style={{ transform: [{ rotate: open ? '-90deg' : '90deg' }] }}>
          <IconChevron color={C.accentSoft} />
        </View>
      </Pressable>
      {open
        ? TABS.filter((t) => t.id !== value).map((t) => (
            <Pressable
              key={t.id}
              onPress={() => {
                onChange(t.id);
                setOpen(false);
              }}
              style={({ pressed }) => [styles.pickerItem, pressed && { backgroundColor: C.surfaceSelected }]}
              accessibilityRole="button">
              <Text style={styles.pickerItemText}>{t.label}</Text>
            </Pressable>
          ))
        : null}
    </View>
  );
}

function FlowTab() {
  const flow = useFinanceFlow();
  const { categories, rates, transactions, loadSetup, loadMonth } = flow;
  const [month, setMonth] = useState(currentMonth());
  const [settings, setSettings] = useState(false);
  const [modal, setModal] = useState<{ tx: Transaction | null; key: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const { syncRates } = flow;

  // Categorías y tasas al entrar (y al volver, por si DESJ registró algo desde el chat); movimientos por mes.
  // Las tasas se ponen solas: si alguna falta o no es de hoy, se traen las del día sin preguntar. El aviso
  // amarillo solo queda si eso falla (p. ej. sin internet).
  useFocusEffect(
    useCallback(() => {
      loadSetup()
        .then(async (loaded) => {
          if (!ratesStale(loaded)) return;
          setSyncing(true);
          await syncRates(loaded).catch(() => null);
          setSyncing(false);
        })
        .catch((e: Error) => setError(e.message));
      // eslint-disable-next-line react-hooks/exhaustive-deps -- syncRates cambia en cada render; basta con loadSetup
    }, [loadSetup]),
  );
  useEffect(() => {
    loadMonth(month)
      .then(() => setError(null))
      .catch((e: Error) => setError(e.message));
  }, [loadMonth, month]);

  const t = totals(transactions);

  return (
    <>
      <View style={styles.bar}>
        <MonthStepper month={month} onChange={setMonth} />
        <View style={styles.actions}>
          <Btn label={settings ? 'Ocultar tasas' : 'Tasas y categorías'} kind={settings ? 'outline' : 'ghost'} onPress={() => setSettings(!settings)} style={styles.small} />
          <Btn label="Movimiento" icon={<IconPlus color={C.onAccent} />} onPress={() => setModal({ tx: null, key: Date.now() })} style={styles.small} />
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {syncing ? <Text style={styles.caption}>Trayendo las tasas de hoy…</Text> : <MissingRatesBanner rates={rates} onSync={() => flow.syncRates()} />}

      {settings ? (
        <View style={styles.settings}>
          <View style={styles.half}>
            <RatesCard rates={rates} onSync={() => flow.syncRates()} onSet={flow.setRate} />
          </View>
          <View style={styles.half}>
            <CategoryManager categories={categories} onAdd={flow.addCategory} onUpdate={flow.updateCategory} onRemove={flow.removeCategory} />
          </View>
        </View>
      ) : null}

      <Totals {...t} />
      <MonthChart txs={transactions} month={month} />
      <Breakdown txs={transactions} categories={categories} />
      <TxList
        txs={transactions}
        categories={categories}
        month={month}
        onEdit={(tx) => setModal({ tx, key: Date.now() })}
        onRemove={(tx) => confirmRemoveTx(tx, flow.removeTransaction)}
      />

      {modal ? (
        <TransactionModal
          key={modal.key}
          visible
          initial={modal.tx}
          categories={categories}
          rates={rates}
          onClose={() => setModal(null)}
          onSave={async (input, id) => {
            const saved = await flow.saveTransaction(input, id);
            flow.placeInMonth(saved, month);
            setModal(null);
          }}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  small: { flexGrow: 0, minHeight: 44, paddingHorizontal: 14 },
  error: { color: C.bad, fontSize: 13.5 },
  caption: { color: C.muted, fontSize: 12.5 },
  settings: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  half: { flexGrow: 1, flexBasis: 300 },
  picker: { borderRadius: R.card, borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceInput, overflow: 'hidden' },
  pickerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, paddingHorizontal: 16 },
  pickerText: { color: C.text, fontSize: 16, fontWeight: '600' },
  pickerItem: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.cardBorder },
  pickerItemText: { color: C.muted, fontSize: 15 },
});
