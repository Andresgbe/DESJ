// Módulo NO MORE: contadores de días sin algo que la persona está dejando (fumar, alcohol, lujuria…), con el
// historial de cuándo se perdió la racha y un PIN que se pide cada vez que se entra.
// - Con sesión: tablas nomore_settings / nomore_habits / nomore_resets (RLS, solo lo propio). DESJ no las lee.
// - Sin nube: viven en el teléfono (desj:nomore:<módulo>).
// El PIN se guarda como SHA-256 de "sal:pin": es un candado de pantalla, no un cifrado de los datos.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { useCallback, useState } from 'react';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export type Habit = { id: string; name: string; reason: string; started_at: string; position: number };
export type Reset = { id: string; habit_id: string; at: string; streak_seconds: number; note: string };
type Pin = { pin_hash: string; pin_salt: string };
type LocalState = { pin: Pin | null; habits: Habit[]; resets: Reset[] };

export const PIN_LENGTH = 4;
const HABIT_COLS = 'id, name, reason, started_at, position';
const RESET_COLS = 'id, habit_id, at, streak_seconds, note';
const localKey = (moduleId: string) => `desj:nomore:${moduleId}`;
const uid = () => `l${Date.now()}${Math.random().toString(36).slice(2, 7)}`;

async function readLocal(moduleId: string): Promise<LocalState> {
  try {
    const raw = await AsyncStorage.getItem(localKey(moduleId));
    if (raw) return { pin: null, habits: [], resets: [], ...JSON.parse(raw) };
  } catch {
    // sin copia local
  }
  return { pin: null, habits: [], resets: [] };
}
const writeLocal = (moduleId: string, s: LocalState) => AsyncStorage.setItem(localKey(moduleId), JSON.stringify(s));

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
const hashPin = (pin: string, salt: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);

export function useNoMore(moduleId: string | undefined) {
  const { session } = useAuth();
  const cloud = Boolean(session);
  const [pin, setPinState] = useState<Pin | null>(null);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [resets, setResets] = useState<Reset[]>([]);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    if (!moduleId) return;
    if (cloud) {
      const [p, h, r] = await Promise.all([
        supabase.from('nomore_settings').select('pin_hash, pin_salt').eq('module_id', moduleId).maybeSingle(),
        supabase.from('nomore_habits').select(HABIT_COLS).eq('module_id', moduleId).order('position').order('created_at'),
        supabase.from('nomore_resets').select(RESET_COLS).order('at', { ascending: false }).limit(500),
      ]);
      if (p.error || h.error || r.error) throw new Error('No pude cargar NO MORE. Revisa tu conexión.');
      setPinState(p.data);
      setHabits(h.data as Habit[]);
      setResets((r.data ?? []).map((x) => ({ ...x, streak_seconds: Number(x.streak_seconds) })) as Reset[]);
    } else {
      const s = await readLocal(moduleId);
      setPinState(s.pin);
      setHabits([...s.habits].sort((a, b) => a.position - b.position));
      setResets([...s.resets].sort((a, b) => b.at.localeCompare(a.at)));
    }
    setReady(true);
  }, [cloud, moduleId]);

  const checkPin = async (entered: string) => Boolean(pin) && (await hashPin(entered, pin!.pin_salt)) === pin!.pin_hash;

  /** Crea o cambia el PIN. */
  const setPin = async (entered: string) => {
    if (!moduleId) return false;
    const salt = hex(Crypto.getRandomBytes(16));
    const row = { pin_hash: await hashPin(entered, salt), pin_salt: salt };
    if (cloud) {
      const { error } = await supabase.from('nomore_settings').upsert({ module_id: moduleId, ...row, updated_at: new Date().toISOString() }, { onConflict: 'module_id' });
      if (error) return false;
    } else {
      const s = await readLocal(moduleId);
      await writeLocal(moduleId, { ...s, pin: row });
    }
    setPinState(row);
    return true;
  };

  /** Agrega o edita algo que se está dejando. */
  const saveHabit = async (input: { name: string; reason: string; started_at: string }, id?: string) => {
    if (!moduleId) return false;
    const row = { name: input.name.trim().slice(0, 80), reason: input.reason.trim().slice(0, 500), started_at: input.started_at };
    if (cloud) {
      const res = id
        ? await supabase.from('nomore_habits').update(row).eq('id', id).select(HABIT_COLS).single()
        : await supabase.from('nomore_habits').insert({ ...row, module_id: moduleId, position: habits.length }).select(HABIT_COLS).single();
      if (res.error || !res.data) return false;
      const saved = res.data as Habit;
      setHabits((list) => (id ? list.map((h) => (h.id === id ? saved : h)) : [...list, saved]));
      return true;
    }
    const s = await readLocal(moduleId);
    const next = id ? s.habits.map((h) => (h.id === id ? { ...h, ...row } : h)) : [...s.habits, { ...row, id: uid(), position: s.habits.length }];
    await writeLocal(moduleId, { ...s, habits: next });
    setHabits(next);
    return true;
  };

  const removeHabit = async (id: string) => {
    if (!moduleId) return;
    setHabits((list) => list.filter((h) => h.id !== id));
    setResets((list) => list.filter((r) => r.habit_id !== id));
    if (cloud) await supabase.from('nomore_habits').delete().eq('id', id);
    else {
      const s = await readLocal(moduleId);
      await writeLocal(moduleId, { ...s, habits: s.habits.filter((h) => h.id !== id), resets: s.resets.filter((r) => r.habit_id !== id) });
    }
  };

  /** Perdí la racha: se guarda cuánto duró y el contador vuelve a empezar desde ahora. */
  const relapse = async (habit: Habit, note: string) => {
    if (!moduleId) return false;
    const now = new Date();
    const streak = Math.max(0, Math.floor((now.getTime() - new Date(habit.started_at).getTime()) / 1000));
    const reset = { habit_id: habit.id, at: now.toISOString(), streak_seconds: streak, note: note.trim().slice(0, 500) };
    if (cloud) {
      const r = await supabase.from('nomore_resets').insert(reset).select(RESET_COLS).single();
      if (r.error || !r.data) return false;
      const h = await supabase.from('nomore_habits').update({ started_at: reset.at }).eq('id', habit.id);
      if (h.error) return false;
      setResets((list) => [{ ...(r.data as Reset), streak_seconds: streak }, ...list]);
    } else {
      const s = await readLocal(moduleId);
      const saved = { ...reset, id: uid() };
      await writeLocal(moduleId, { ...s, habits: s.habits.map((x) => (x.id === habit.id ? { ...x, started_at: reset.at } : x)), resets: [saved, ...s.resets] });
      setResets((list) => [saved, ...list]);
    }
    setHabits((list) => list.map((x) => (x.id === habit.id ? { ...x, started_at: reset.at } : x)));
    return true;
  };

  return { cloud, ready, hasPin: Boolean(pin), habits, resets, reload, checkPin, setPin, saveHabit, removeHabit, relapse };
}

// ---------------------------------------------------------------------------- tiempo y metas

const DAY = 86_400;
export const MILESTONES = [1, 3, 7, 14, 21, 30, 60, 90, 180, 365];

/** Segundos de racha a "12 días" + "4 h 05 min 09 s". */
export function splitStreak(seconds: number) {
  const days = Math.floor(seconds / DAY);
  const rest = seconds % DAY;
  const h = Math.floor(rest / 3600);
  const m = Math.floor((rest % 3600) / 60);
  const s = rest % 60;
  return { days, clock: `${h} h ${String(m).padStart(2, '0')} min ${String(s).padStart(2, '0')} s` };
}

export const daysLabel = (days: number) => `${days} ${days === 1 ? 'día' : 'días'}`;

/** La próxima meta en días (después de un año, cada año) y cuánto falta en proporción. */
export function nextMilestone(seconds: number) {
  const days = seconds / DAY;
  const next = MILESTONES.find((m) => m > days) ?? (Math.floor(days / 365) + 1) * 365;
  const prev = [...MILESTONES].reverse().find((m) => m <= days) ?? 0;
  const from = next > 365 ? next - 365 : prev;
  return { next, progress: Math.min(1, (days - from) / (next - from)) };
}
