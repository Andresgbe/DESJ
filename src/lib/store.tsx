// Estado de la app. Con sesión iniciada, medicamentos y tomas viven en Supabase (privados por usuario)
// y el teléfono guarda una copia local por usuario. Sin nube, todo vive solo en el dispositivo (demo).
// Un medicamento se toma 1 a 12 veces al día; cada dosis puede tener hora ("HH:MM") o no, y se marca aparte.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';

import { useAuth } from '@/lib/auth';
import { askPermission, cancel, scheduleDaily } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';

export type Med = {
  id: string;
  name: string;
  dose: string;
  perDay: number; // dosis al día
  times: string[]; // horas "HH:MM" de las primeras dosis; puede venir vacío (sin hora)
  notifIds?: string[];
};
export type MedInput = Omit<Med, 'id' | 'notifIds'>;

type State = {
  meds: Med[];
  taken: Record<string, string[]>; // fecha (YYYY-MM-DD) -> dosis tomadas, como doseKey(medId, n)
};

const DEFAULT: State = {
  meds: [
    { id: 'm1', name: 'Omega 3', dose: '1 cápsula · con desayuno', perDay: 1, times: ['07:00'] },
    { id: 'm2', name: 'Magnesio', dose: '1 tableta · con almuerzo y cena', perDay: 2, times: ['13:00', '21:00'] },
    { id: 'm3', name: 'Vitamina D', dose: '1.000 UI · cuando te acuerdes', perDay: 1, times: [] },
  ],
  taken: {},
};

const LOCAL_KEY = 'desj:v1';
export const MAX_DOSES = 12;

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const hhmm = (h: number, m: number) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

/** Clave de una dosis tomada: "id#2" = segunda dosis del medicamento `id`. */
export const doseKey = (medId: string, n: number) => `${medId}#${n}`;

/** "8", "8:00", "0800", "21:30" → "08:00"; null si no es una hora válida. */
export function parseTime(text: string) {
  const t = text.trim().match(/^(\d{1,2})(?::?(\d{2}))?$/);
  if (!t || Number(t[1]) > 23 || Number(t[2] ?? 0) > 59) return null;
  return hhmm(Number(t[1]), Number(t[2] ?? 0));
}

/** Etiqueta de cada dosis: su hora si la tiene, o "Dosis 2". */
export const doseLabel = (m: Med, n: number) => m.times[n - 1] ?? (m.perDay > 1 ? `Dosis ${n}` : 'Sin hora');

/** Dosis de hoy: tomadas y total, contando cada dosis de cada medicamento. */
export function dosesToday(meds: Med[], taken: Record<string, string[]>) {
  const list = taken[today()] ?? [];
  const total = meds.reduce((sum, m) => sum + m.perDay, 0);
  const done = meds.reduce((sum, m) => sum + Array.from({ length: m.perDay }, (_, i) => list.includes(doseKey(m.id, i + 1))).filter(Boolean).length, 0);
  return { done, total };
}

type Ctx = State & {
  ready: boolean;
  refresh: () => Promise<void>;
  toggleTaken: (medId: string, n: number) => void;
  addMed: (m: MedInput) => Promise<boolean>;
  removeMed: (id: string) => void;
  enableMedReminders: () => Promise<boolean>;
};

const StoreCtx = createContext<Ctx | null>(null);

// Primero los que tienen hora (por su primera hora), al final los que no.
const byTime = (a: Med, b: Med) => (a.times[0] ?? '99').localeCompare(b.times[0] ?? '99') || a.name.localeCompare(b.name);

type MedRow = { id: string; name: string; dose: string; doses_per_day: number; times: string[] };
const fromRow = (r: MedRow): Med => ({ id: r.id, name: r.name, dose: r.dose, perDay: r.doses_per_day, times: r.times ?? [] });
const MED_COLS = 'id, name, dose, doses_per_day, times';

/** Copias guardadas antes de las dosis múltiples: una hora obligatoria y tomas por id. */
type OldMed = { id: string; name: string; dose: string; perDay?: number; times?: string[]; notifIds?: string[]; hour?: number; minute?: number; notifId?: string };
function upgrade(saved: { meds?: OldMed[]; taken?: State['taken'] }): Partial<State> {
  const meds = saved.meds?.map((m): Med => {
    if (m.perDay && m.times) return { id: m.id, name: m.name, dose: m.dose, perDay: m.perDay, times: m.times, notifIds: m.notifIds };
    cancel(m.notifId);
    return { id: m.id, name: m.name, dose: m.dose, perDay: 1, times: m.hour !== undefined ? [hhmm(m.hour, m.minute ?? 0)] : [] };
  });
  const taken = saved.taken && Object.fromEntries(Object.entries(saved.taken).map(([day, ids]) => [day, ids.map((id) => (id.includes('#') ? id : doseKey(id, 1)))]));
  return { ...(meds && { meds }), ...(taken && { taken }) };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const cloud = Boolean(userId);
  // Copia local separada por usuario: dos personas en el mismo teléfono no se mezclan.
  const key = userId ? `${LOCAL_KEY}:${userId}` : LOCAL_KEY;

  const [state, setState] = useState<State>(cloud ? { ...DEFAULT, meds: [] } : DEFAULT);
  const [ready, setReady] = useState(false);

  // Trae medicamentos y tomas de hoy desde Supabase, conservando los ids de notificación locales.
  const refresh = useCallback(async () => {
    if (!cloud) return;
    const [meds, intakes] = await Promise.all([
      supabase.from('meds').select(MED_COLS).eq('active', true),
      supabase.from('med_intakes').select('med_id, dose').eq('day', today()),
    ]);
    if (meds.error || intakes.error) return; // sin conexión: se queda la copia local
    setState((s) => ({
      ...s,
      meds: meds.data.map((r) => ({ ...fromRow(r), notifIds: s.meds.find((x) => x.id === r.id)?.notifIds })).sort(byTime),
      taken: { [today()]: intakes.data.map((i) => doseKey(i.med_id, i.dose)) },
    }));
  }, [cloud]);

  // `key` no cambia mientras el provider vive: al cambiar de usuario, el layout lo vuelve a montar.
  useEffect(() => {
    AsyncStorage.getItem(key)
      .then((raw) => {
        if (!raw) return;
        const { routines, ...saved } = JSON.parse(raw) as Partial<State> & { routines?: { notifId?: string }[] };
        // La pestaña Rutinas se quitó: se cancelan los avisos diarios que hubieran quedado activos.
        routines?.forEach((r) => cancel(r.notifId));
        setState((s) => ({ ...s, ...upgrade(saved) }));
      })
      .finally(() => setReady(true))
      .then(refresh);
  }, [key, refresh]);

  useEffect(() => {
    if (ready) AsyncStorage.setItem(key, JSON.stringify(state));
  }, [state, ready, key]);

  const toggleTaken = (medId: string, n: number) => {
    const k = doseKey(medId, n);
    const wasTaken = (state.taken[today()] ?? []).includes(k);
    setState((s) => {
      const list = s.taken[today()] ?? [];
      const next = wasTaken ? list.filter((x) => x !== k) : [...list, k];
      return { ...s, taken: { ...s.taken, [today()]: next } };
    });
    if (!cloud) return;
    const q = wasTaken
      ? supabase.from('med_intakes').delete().eq('med_id', medId).eq('day', today()).eq('dose', n)
      : supabase.from('med_intakes').upsert({ med_id: medId, day: today(), dose: n }, { onConflict: 'med_id,day,dose', ignoreDuplicates: true });
    q.then(({ error }) => error && refresh());
  };

  const addMed = async (m: MedInput) => {
    const clean: MedInput = { name: m.name.trim(), dose: m.dose.trim(), perDay: Math.min(MAX_DOSES, Math.max(1, m.perDay)), times: [...m.times].sort().slice(0, m.perDay) };
    if (!cloud) {
      setState((s) => ({ ...s, meds: [...s.meds, { ...clean, id: `m${Date.now()}` }].sort(byTime) }));
      return true;
    }
    const { data, error } = await supabase
      .from('meds')
      .insert({ name: clean.name, dose: clean.dose, doses_per_day: clean.perDay, times: clean.times })
      .select(MED_COLS)
      .single();
    if (error || !data) return false;
    setState((s) => ({ ...s, meds: [...s.meds, fromRow(data)].sort(byTime) }));
    return true;
  };

  const removeMed = (id: string) => {
    state.meds.find((m) => m.id === id)?.notifIds?.forEach((n) => cancel(n));
    setState((s) => ({ ...s, meds: s.meds.filter((m) => m.id !== id) }));
    // En la nube se desactiva en vez de borrarlo, para no perder el historial de tomas.
    if (cloud) supabase.from('meds').update({ active: false }).eq('id', id).then(({ error }) => error && refresh());
  };

  // Un aviso diario por cada dosis con hora; las dosis sin hora no avisan.
  const enableMedReminders = async () => {
    if (!(await askPermission())) return false;
    const meds = await Promise.all(
      state.meds.map(async (m) => {
        await Promise.all((m.notifIds ?? []).map((n) => cancel(n)));
        const notifIds = await Promise.all(
          m.times.map((t) => {
            const [h, min] = t.split(':').map(Number);
            return scheduleDaily(`Pastilla: ${m.name}`, `Te toca: ${m.dose}`, h, min);
          }),
        );
        return { ...m, notifIds: notifIds.filter((n): n is string => Boolean(n)) };
      }),
    );
    setState((s) => ({ ...s, meds }));
    return true;
  };

  return (
    <StoreCtx.Provider value={{ ...state, ready, refresh, toggleTaken, addMed, removeMed, enableMedReminders }}>
      {children}
    </StoreCtx.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error('useStore debe usarse dentro de StoreProvider');
  return ctx;
}
