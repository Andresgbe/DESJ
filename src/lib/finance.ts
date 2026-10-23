// YO · Finanzas: ingresos y gastos en varias monedas y formas de pago, llevados a una sola unidad, el dólar BCV;
// deudas por pagar y presupuesto mensual.
// Regla: amount_usd = amount / rate_per_usd. Se GUARDA con cada movimiento junto con la tasa usada, así que
// cambiar una tasa después no toca lo ya registrado. Las tasas nunca se inventan: nacen "sin cargar" (null)
// hasta que se escriben a mano o se traen de DolarAPI.
// - Con sesión: viven en Supabase (privadas por usuario). DESJ las ve y registra movimientos desde el chat.
// - Sin nube: viven en el teléfono.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useState } from 'react';

import { useAuth } from '@/lib/auth';
import { fetchRates, RATE_CODE_MAP } from '@/lib/dolar-api';
import { supabase } from '@/lib/supabase';

// ---------------------------------------------------------------------------- tipos

export type Kind = 'income' | 'expense';
export type CategoryKind = Kind | 'both';
export type Category = { id: string; name: string; kind: CategoryKind; color: string; sort_order: number };
export type Rate = { id: string; code: string; label: string; currency: string; per_usd: number | null; updated_at: string };
export type Transaction = {
  id: string;
  kind: Kind;
  occurred_on: string; // YYYY-MM-DD
  description: string;
  place: string;
  category_id: string | null;
  amount: number;
  currency: string;
  rate_per_usd: number;
  rate_label: string;
  amount_usd: number;
  note: string;
  created_at: string;
};
export type TransactionInput = Omit<Transaction, 'id' | 'amount_usd' | 'created_at'>;
export type Bill = { id: string; name: string; description: string; amount: number; due_date: string | null; paid: boolean; created_at: string };
export type BillInput = Pick<Bill, 'name' | 'description' | 'amount' | 'due_date'>;
export type BudgetItem = { id: string; month: string; category: string; description: string; amount: number; recurring: boolean; created_at: string };
export type BudgetInput = Omit<BudgetItem, 'id' | 'created_at'>;

/** Forma de pago de referencia: dólar BCV, tasa 1, siempre primero. */
export const USD_BCV = 'USD_BCV';

// Colores de las categorías: son datos de la persona (se guardan con cada categoría), no colores de la interfaz.
export const CATEGORY_PALETTE = ['#10b981', '#f59e0b', '#06b6d4', '#ef4444', '#f97316', '#8b5cf6', '#ec4899', '#3b82f6', '#a855f7', '#14b8a6', '#eab308', '#64748b'];
export const NO_CATEGORY_COLOR = '#64748b';

const SEED_CATEGORIES: Omit<Category, 'id'>[] = [
  ['Supermercado', 'expense', '#10b981'],
  ['Comida fuera', 'expense', '#f59e0b'],
  ['Transporte', 'expense', '#06b6d4'],
  ['Gasolina', 'expense', '#ef4444'],
  ['Moto', 'expense', '#f97316'],
  ['Universidad', 'expense', '#8b5cf6'],
  ['Salud', 'expense', '#ec4899'],
  ['Servicios', 'expense', '#3b82f6'],
  ['Suscripciones', 'expense', '#a855f7'],
  ['Casa', 'expense', '#14b8a6'],
  ['Ocio', 'expense', '#eab308'],
  ['Otros gastos', 'expense', '#64748b'],
  ['Agencia', 'income', '#22c55e'],
  ['Freelance', 'income', '#84cc16'],
  ['Otros ingresos', 'income', '#64748b'],
].map(([name, kind, color], sort_order) => ({ name, kind: kind as CategoryKind, color, sort_order }));

const SEED_RATES: Omit<Rate, 'id' | 'updated_at'>[] = [
  { code: 'BCV', label: 'Bolívares (Bs)', currency: 'VES', per_usd: null },
  { code: 'EUR', label: 'Euro', currency: 'EUR', per_usd: null },
  { code: 'CASH', label: 'Dólar efectivo', currency: 'USD', per_usd: null },
  { code: 'USDT', label: 'USDT', currency: 'USD', per_usd: null },
];

// ---------------------------------------------------------------------------- funciones puras

export function toUsd(amount: number, ratePerUsd: number): number {
  if (!Number.isFinite(ratePerUsd) || ratePerUsd <= 0) return 0;
  return amount / ratePerUsd;
}

const fmt = (n: number, digits = 2) => n.toLocaleString('es-VE', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function money(usd: number): string {
  return fmt(usd);
}

/** Tasa guardada para mostrar: hasta 4 decimales, sin ceros de más ("873,87", "0,8672"). */
export function rateText(n: number) {
  return n.toLocaleString('es-VE', { maximumFractionDigits: 4 });
}

/** Monto original con el símbolo de su moneda. */
export function amountLabel(tx: Pick<Transaction, 'amount' | 'currency'>): string {
  const n = fmt(tx.amount);
  if (tx.currency === 'USD') return `$${n}`;
  if (tx.currency === 'VES') return `Bs ${n}`;
  if (tx.currency === 'EUR') return `€${n}`;
  return `${n} ${tx.currency}`;
}

export const rateName = (tx: Pick<Transaction, 'rate_label'>) => tx.rate_label || 'BCV';
export const wasConverted = (tx: Pick<Transaction, 'rate_per_usd'>) => tx.rate_per_usd !== 1;

/** "12,5", "12.5" o "1.250,50" → número; NaN si no es un número. */
export function parseAmount(text: string) {
  const t = text.trim().replace(/\s/g, '');
  const clean = t.includes(',') && t.includes('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(',', '.');
  return /^\d*\.?\d+$/.test(clean) ? Number(clean) : NaN;
}

// Meses siempre como 'yyyy-mm'. Las fechas ISO se leen como hora local para que no se corran un día.
export function monthKey(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(`${date}T00:00:00`) : date;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
export const currentMonth = () => monthKey(new Date());
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString('es-VE', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}
export function dayLabel(iso: string): string {
  const s = new Date(`${iso}T00:00:00`).toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
export function todayIso() {
  const d = new Date();
  return `${monthKey(d)}-${String(d.getDate()).padStart(2, '0')}`;
}

export function totals(txs: Transaction[]) {
  let income = 0;
  let expense = 0;
  for (const t of txs) {
    if (t.kind === 'income') income += t.amount_usd;
    else expense += t.amount_usd;
  }
  return { income, expense, balance: income - expense };
}

export type CategoryShare = { id: string | null; name: string; color: string; total: number; share: number };

export function byCategory(txs: Transaction[], categories: Category[], kind: Kind): CategoryShare[] {
  const sums = new Map<string | null, number>();
  let all = 0;
  for (const t of txs) {
    if (t.kind !== kind) continue;
    sums.set(t.category_id, (sums.get(t.category_id) ?? 0) + t.amount_usd);
    all += t.amount_usd;
  }
  return [...sums.entries()]
    .map(([id, total]) => {
      const c = categories.find((x) => x.id === id);
      return { id, name: c?.name ?? 'Sin categoría', color: c?.color ?? NO_CATEGORY_COLOR, total, share: all ? total / all : 0 };
    })
    .sort((a, b) => b.total - a.total);
}

export function byDay(txs: Transaction[], month: string) {
  const days = Array.from({ length: daysInMonth(month) }, (_, i) => ({ day: i + 1, income: 0, expense: 0 }));
  for (const t of txs) {
    const d = days[Number(t.occurred_on.slice(8, 10)) - 1];
    if (!d) continue;
    if (t.kind === 'income') d.income += t.amount_usd;
    else d.expense += t.amount_usd;
  }
  return days;
}

/** Hay que traer tasas: alguna está sin cargar o no se actualizó hoy. */
export function ratesStale(rates: Rate[]) {
  const localDay = (iso: string) => {
    const d = new Date(iso);
    return `${monthKey(d)}-${String(d.getDate()).padStart(2, '0')}`;
  };
  return rates.some((r) => r.per_usd === null || localDay(r.updated_at) !== todayIso());
}

/** Más reciente primero; a igual fecha, el último cargado primero. */
const byRecent = (a: Transaction, b: Transaction) => b.occurred_on.localeCompare(a.occurred_on) || b.created_at.localeCompare(a.created_at);

// ---------------------------------------------------------------------------- almacenamiento

const LOCAL_KEY = 'desj:finance:v1';
type LocalState = { categories: Category[]; rates: Rate[]; transactions: Transaction[]; bills: Bill[]; budget: BudgetItem[] };

const uid = () => `l${Date.now()}${Math.random().toString(36).slice(2, 7)}`;

async function readLocal(): Promise<LocalState> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_KEY);
    if (raw) return { categories: [], rates: [], transactions: [], bills: [], budget: [], ...JSON.parse(raw) };
  } catch {
    // sin copia local: se arranca con los datos iniciales
  }
  const now = new Date().toISOString();
  return {
    categories: SEED_CATEGORIES.map((c) => ({ ...c, id: uid() })),
    rates: SEED_RATES.map((r) => ({ ...r, id: uid(), updated_at: now })),
    transactions: [],
    bills: [],
    budget: [],
  };
}

async function writeLocal(patch: Partial<LocalState>) {
  const next = { ...(await readLocal()), ...patch };
  await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(next));
  return next;
}

// Supabase devuelve numeric como texto.
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const normTx = (r: Record<string, unknown>): Transaction =>
  ({ ...r, amount: Number(r.amount), rate_per_usd: Number(r.rate_per_usd), amount_usd: Number(r.amount_usd) }) as Transaction;
const normRate = (r: Record<string, unknown>): Rate => ({ ...r, per_usd: num(r.per_usd) }) as Rate;
const normBill = (r: Record<string, unknown>): Bill => ({ ...r, amount: Number(r.amount) }) as Bill;
const normBudget = (r: Record<string, unknown>): BudgetItem => ({ ...r, amount: Number(r.amount) }) as BudgetItem;

const TX_COLS = 'id, kind, occurred_on, description, place, category_id, amount, currency, rate_per_usd, rate_label, amount_usd, note, created_at';
const RATE_COLS = 'id, code, label, currency, per_usd, updated_at';
const CAT_COLS = 'id, name, kind, color, sort_order';

// ---------------------------------------------------------------------------- Ingresos y gastos

export function useFinanceFlow() {
  const { session } = useAuth();
  const cloud = Boolean(session);
  const [categories, setCategories] = useState<Category[]>([]);
  const [rates, setRates] = useState<Rate[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [ready, setReady] = useState(false);

  /** Categorías y tasas. Si la cuenta no tiene ninguna, se siembran las iniciales. Devuelve las tasas. */
  const loadSetup = useCallback(async (): Promise<Rate[]> => {
    if (!cloud) {
      const local = await readLocal();
      setCategories([...local.categories].sort((a, b) => a.sort_order - b.sort_order));
      setRates(local.rates);
      return local.rates;
    }
    let [c, r] = await Promise.all([
      supabase.from('finance_categories').select(CAT_COLS).order('sort_order'),
      supabase.from('finance_rates').select(RATE_COLS).order('created_at'),
    ]);
    if (!c.error && !c.data.length) {
      await supabase.from('finance_categories').upsert(SEED_CATEGORIES, { onConflict: 'user_id,name', ignoreDuplicates: true });
      c = await supabase.from('finance_categories').select(CAT_COLS).order('sort_order');
    }
    if (!r.error && !r.data.length) {
      await supabase.from('finance_rates').upsert(SEED_RATES, { onConflict: 'user_id,code', ignoreDuplicates: true });
      r = await supabase.from('finance_rates').select(RATE_COLS).order('created_at');
    }
    if (c.error || r.error) throw new Error('No pude cargar tus finanzas. Revisa tu conexión.');
    setCategories(c.data as Category[]);
    const loaded = r.data.map(normRate);
    setRates(loaded);
    return loaded;
  }, [cloud]);

  /** Movimientos de un mes, por rango de fechas (usa el índice), del más reciente al más antiguo. */
  const loadMonth = useCallback(
    async (month: string) => {
      const from = `${month}-01`;
      const to = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;
      if (!cloud) {
        const local = await readLocal();
        setTransactions(local.transactions.filter((t) => t.occurred_on >= from && t.occurred_on <= to).sort(byRecent));
      } else {
        const { data, error } = await supabase
          .from('finance_transactions')
          .select(TX_COLS)
          .gte('occurred_on', from)
          .lte('occurred_on', to)
          .order('occurred_on', { ascending: false })
          .order('created_at', { ascending: false });
        if (error) throw new Error('No pude cargar los movimientos. Revisa tu conexión.');
        setTransactions(data.map(normTx));
      }
      setReady(true);
    },
    [cloud],
  );

  /** Crea o edita. amount_usd se calcula aquí (no en la pantalla). Devuelve el movimiento guardado. */
  const saveTransaction = async (input: TransactionInput, id?: string): Promise<Transaction> => {
    const row = { ...input, amount_usd: toUsd(input.amount, input.rate_per_usd) };
    if (cloud) {
      const res = id
        ? await supabase.from('finance_transactions').update(row).eq('id', id).select(TX_COLS).single()
        : await supabase.from('finance_transactions').insert(row).select(TX_COLS).single();
      if (res.error || !res.data) throw new Error('No pude guardar el movimiento. Revisa tu conexión.');
      return normTx(res.data);
    }
    const local = await readLocal();
    const saved: Transaction = id
      ? { ...local.transactions.find((t) => t.id === id)!, ...row }
      : { ...row, id: uid(), created_at: new Date().toISOString() };
    await writeLocal({ transactions: [...local.transactions.filter((t) => t.id !== saved.id), saved] });
    return saved;
  };

  /** Después de guardar: si el movimiento cae en otro mes sale de la vista; si no, se pone en su lugar. */
  const placeInMonth = (tx: Transaction, month: string) =>
    setTransactions((list) => {
      const rest = list.filter((t) => t.id !== tx.id);
      return monthKey(tx.occurred_on) === month ? [...rest, tx].sort(byRecent) : rest;
    });

  const removeTransaction = async (id: string) => {
    const before = transactions;
    setTransactions((list) => list.filter((t) => t.id !== id));
    if (cloud) {
      const { error } = await supabase.from('finance_transactions').delete().eq('id', id);
      if (error) {
        setTransactions(before);
        throw new Error('No pude eliminarlo. Revisa tu conexión.');
      }
    } else {
      const local = await readLocal();
      await writeLocal({ transactions: local.transactions.filter((t) => t.id !== id) });
    }
  };

  /** Trae las tasas de hoy (DolarAPI y Binance) y actualiza solo las de códigos conocidos (BCV, EUR, CASH, USDT). */
  const syncRates = async (current: Rate[] = rates) => {
    const fetched = await fetchRates(cloud);
    const now = new Date().toISOString();
    const updates = current
      .map((r) => ({ r, value: fetched[RATE_CODE_MAP[r.code.toUpperCase()]] }))
      .filter((x): x is { r: Rate; value: number } => typeof x.value === 'number' && x.value > 0);
    if (!updates.length) throw new Error('DolarAPI respondió, pero sin tasas que pueda usar.');
    if (cloud) {
      const results = await Promise.all(updates.map(({ r, value }) => supabase.from('finance_rates').update({ per_usd: value, updated_at: now }).eq('id', r.id)));
      if (results.some((x) => x.error)) throw new Error('Traje las tasas pero no pude guardarlas. Revisa tu conexión.');
    }
    const next = current.map((r) => {
      const u = updates.find((x) => x.r.id === r.id);
      return u ? { ...r, per_usd: u.value, updated_at: now } : r;
    });
    if (!cloud) await writeLocal({ rates: next });
    setRates(next);
    return next;
  };

  const setRate = async (id: string, perUsd: number | null) => {
    const before = rates;
    const now = new Date().toISOString();
    const next = rates.map((r) => (r.id === id ? { ...r, per_usd: perUsd, updated_at: now } : r));
    setRates(next);
    if (cloud) {
      const { error } = await supabase.from('finance_rates').update({ per_usd: perUsd, updated_at: now }).eq('id', id);
      if (error) {
        setRates(before);
        throw new Error('No pude guardar la tasa. Revisa tu conexión.');
      }
    } else await writeLocal({ rates: next });
  };

  const addCategory = async (name: string, kind: CategoryKind) => {
    const row = { name: name.trim().slice(0, 60), kind, color: CATEGORY_PALETTE[categories.length % CATEGORY_PALETTE.length], sort_order: categories.length };
    if (!row.name) return;
    if (categories.some((c) => c.name.toLowerCase() === row.name.toLowerCase())) throw new Error('Ya tienes una categoría con ese nombre.');
    if (cloud) {
      const { data, error } = await supabase.from('finance_categories').insert(row).select(CAT_COLS).single();
      if (error || !data) throw new Error('No pude crear la categoría. Revisa tu conexión.');
      setCategories((list) => [...list, data as Category]);
    } else {
      const next = [...categories, { ...row, id: uid() }];
      setCategories(next);
      await writeLocal({ categories: next });
    }
  };

  const updateCategory = async (id: string, patch: Partial<Pick<Category, 'name' | 'color' | 'kind'>>) => {
    const before = categories;
    const next = categories.map((c) => (c.id === id ? { ...c, ...patch } : c));
    setCategories(next);
    if (cloud) {
      const { error } = await supabase.from('finance_categories').update(patch).eq('id', id);
      if (error) {
        setCategories(before);
        throw new Error('No pude guardar la categoría. ¿Ya existe otra con ese nombre?');
      }
    } else await writeLocal({ categories: next });
  };

  /** Sus movimientos NO se borran: quedan como "Sin categoría". */
  const removeCategory = async (id: string) => {
    const before = categories;
    setCategories((list) => list.filter((c) => c.id !== id));
    setTransactions((list) => list.map((t) => (t.category_id === id ? { ...t, category_id: null } : t)));
    if (cloud) {
      const { error } = await supabase.from('finance_categories').delete().eq('id', id);
      if (error) {
        setCategories(before);
        throw new Error('No pude eliminar la categoría. Revisa tu conexión.');
      }
    } else {
      const local = await readLocal();
      await writeLocal({
        categories: local.categories.filter((c) => c.id !== id),
        transactions: local.transactions.map((t) => (t.category_id === id ? { ...t, category_id: null } : t)),
      });
    }
  };

  return {
    cloud,
    ready,
    categories,
    rates,
    transactions,
    loadSetup,
    loadMonth,
    saveTransaction,
    placeInMonth,
    removeTransaction,
    syncRates,
    setRate,
    addCategory,
    updateCategory,
    removeCategory,
  };
}

// ---------------------------------------------------------------------------- Deudas

export function useBills() {
  const { session } = useAuth();
  const cloud = Boolean(session);
  const [bills, setBills] = useState<Bill[]>([]);
  const [ready, setReady] = useState(false);
  const COLS = 'id, name, description, amount, due_date, paid, created_at';

  const reload = useCallback(async () => {
    if (cloud) {
      const { data } = await supabase.from('finance_bills').select(COLS).order('created_at');
      if (data) setBills(data.map(normBill));
    } else setBills((await readLocal()).bills);
    setReady(true);
  }, [cloud]);

  const save = async (input: BillInput, id?: string) => {
    const row = { ...input, name: input.name.trim(), description: input.description.trim(), interest_rate: null };
    if (cloud) {
      const res = id
        ? await supabase.from('finance_bills').update(row).eq('id', id).select(COLS).single()
        : await supabase.from('finance_bills').insert(row).select(COLS).single();
      if (res.error || !res.data) throw new Error('No pude guardar la deuda. Revisa tu conexión.');
      const saved = normBill(res.data);
      setBills((list) => (id ? list.map((b) => (b.id === id ? saved : b)) : [...list, saved]));
      return;
    }
    const local = await readLocal();
    const next = id
      ? local.bills.map((b) => (b.id === id ? { ...b, ...input } : b))
      : [...local.bills, { ...input, id: uid(), paid: false, created_at: new Date().toISOString() }];
    setBills(next);
    await writeLocal({ bills: next });
  };

  const togglePaid = async (id: string) => {
    const bill = bills.find((b) => b.id === id);
    if (!bill) return;
    const next = bills.map((b) => (b.id === id ? { ...b, paid: !b.paid } : b));
    setBills(next);
    if (cloud) {
      const { error } = await supabase.from('finance_bills').update({ paid: !bill.paid }).eq('id', id);
      if (error) setBills(bills);
    } else await writeLocal({ bills: next });
  };

  const remove = async (id: string) => {
    const next = bills.filter((b) => b.id !== id);
    setBills(next);
    if (cloud) await supabase.from('finance_bills').delete().eq('id', id);
    else await writeLocal({ bills: next });
  };

  return { cloud, ready, bills, reload, save, togglePaid, remove };
}

// ---------------------------------------------------------------------------- Presupuesto mensual

export function useBudget() {
  const { session } = useAuth();
  const cloud = Boolean(session);
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [ready, setReady] = useState(false);
  const COLS = 'id, month, category, description, amount, recurring, created_at';
  const order = (a: BudgetItem, b: BudgetItem) => b.month.localeCompare(a.month) || b.created_at.localeCompare(a.created_at);

  const reload = useCallback(async () => {
    if (cloud) {
      const { data } = await supabase.from('finance_monthly_budget').select(COLS).order('month', { ascending: false }).order('created_at', { ascending: false });
      if (data) setItems(data.map(normBudget));
    } else setItems([...(await readLocal()).budget].sort(order));
    setReady(true);
  }, [cloud]);

  const save = async (input: BudgetInput, id?: string) => {
    const row = { ...input, category: input.category.trim(), description: input.description.trim() };
    if (cloud) {
      const res = id
        ? await supabase.from('finance_monthly_budget').update(row).eq('id', id).select(COLS).single()
        : await supabase.from('finance_monthly_budget').insert(row).select(COLS).single();
      if (res.error || !res.data) throw new Error('No pude guardar el gasto. Revisa tu conexión.');
      const saved = normBudget(res.data);
      setItems((list) => [...list.filter((x) => x.id !== saved.id), saved].sort(order));
      return;
    }
    const local = await readLocal();
    const next = id ? local.budget.map((x) => (x.id === id ? { ...x, ...row } : x)) : [...local.budget, { ...row, id: uid(), created_at: new Date().toISOString() }];
    setItems([...next].sort(order));
    await writeLocal({ budget: next });
  };

  const remove = async (id: string) => {
    const next = items.filter((x) => x.id !== id);
    setItems(next);
    if (cloud) await supabase.from('finance_monthly_budget').delete().eq('id', id);
    else await writeLocal({ budget: next });
  };

  return { cloud, ready, items, reload, save, remove };
}
