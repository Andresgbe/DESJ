// Estado de la app. Con sesión iniciada, medicamentos y tomas viven en Supabase (privados por usuario)
// y el teléfono guarda una copia local por usuario. Sin nube, todo vive solo en el dispositivo (demo).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';

import { useAuth } from '@/lib/auth';
import { askPermission, cancel, scheduleDaily } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';

export type Med = {
  id: string;
  name: string;
  dose: string;
  hour: number;
  minute: number;
  notifId?: string;
};

type State = {
  meds: Med[];
  taken: Record<string, string[]>; // fecha (YYYY-MM-DD) -> ids de pastillas tomadas
};

const DEFAULT: State = {
  meds: [
    { id: 'm1', name: 'Omega 3', dose: '1 cápsula · con desayuno', hour: 7, minute: 0 },
    { id: 'm2', name: 'Magnesio', dose: '1 tableta · con almuerzo', hour: 13, minute: 0 },
    { id: 'm3', name: 'Vitamina D', dose: '1.000 UI · con cena', hour: 21, minute: 0 },
  ],
  taken: {},
};

const LOCAL_KEY = 'desj:v1';

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const hhmm = (h: number, m: number) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

type Ctx = State & {
  ready: boolean;
  refresh: () => Promise<void>;
  toggleTaken: (id: string) => void;
  addMed: (m: Omit<Med, 'id'>) => void;
  removeMed: (id: string) => void;
  enableMedReminders: () => Promise<boolean>;
};

const StoreCtx = createContext<Ctx | null>(null);

const byTime = (a: Med, b: Med) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute);

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
      supabase.from('meds').select('id, name, dose, hour, minute').eq('active', true),
      supabase.from('med_intakes').select('med_id').eq('day', today()),
    ]);
    if (meds.error || intakes.error) return; // sin conexión: se queda la copia local
    setState((s) => ({
      ...s,
      meds: meds.data.map((m) => ({ ...m, notifId: s.meds.find((x) => x.id === m.id)?.notifId })).sort(byTime),
      taken: { [today()]: intakes.data.map((i) => i.med_id) },
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
        setState((s) => ({ ...s, ...saved }));
      })
      .finally(() => setReady(true))
      .then(refresh);
  }, [key, refresh]);

  useEffect(() => {
    if (ready) AsyncStorage.setItem(key, JSON.stringify(state));
  }, [state, ready, key]);

  const toggleTaken = (id: string) => {
    const wasTaken = (state.taken[today()] ?? []).includes(id);
    setState((s) => {
      const list = s.taken[today()] ?? [];
      const next = wasTaken ? list.filter((x) => x !== id) : [...list, id];
      return { ...s, taken: { ...s.taken, [today()]: next } };
    });
    if (!cloud) return;
    const q = wasTaken
      ? supabase.from('med_intakes').delete().eq('med_id', id).eq('day', today())
      : supabase.from('med_intakes').upsert({ med_id: id, day: today() }, { onConflict: 'med_id,day', ignoreDuplicates: true });
    q.then(({ error }) => error && refresh());
  };

  const addMed = async (m: Omit<Med, 'id'>) => {
    if (!cloud) {
      setState((s) => ({ ...s, meds: [...s.meds, { ...m, id: `m${Date.now()}` }].sort(byTime) }));
      return;
    }
    const { data, error } = await supabase.from('meds').insert(m).select('id, name, dose, hour, minute').single();
    if (!error) setState((s) => ({ ...s, meds: [...s.meds, data].sort(byTime) }));
  };

  const removeMed = (id: string) => {
    cancel(state.meds.find((m) => m.id === id)?.notifId);
    setState((s) => ({ ...s, meds: s.meds.filter((m) => m.id !== id) }));
    // En la nube se desactiva en vez de borrarlo, para no perder el historial de tomas.
    if (cloud) supabase.from('meds').update({ active: false }).eq('id', id).then(({ error }) => error && refresh());
  };

  const enableMedReminders = async () => {
    if (!(await askPermission())) return false;
    const meds = await Promise.all(
      state.meds.map(async (m) => {
        await cancel(m.notifId);
        const notifId = await scheduleDaily(`Pastilla: ${m.name}`, `Te toca: ${m.dose}`, m.hour, m.minute);
        return { ...m, notifId };
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
