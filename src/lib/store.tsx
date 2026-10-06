// Estado de la app guardado en el teléfono (AsyncStorage).
// Más adelante esto se sincroniza con Supabase; por ahora vive solo en el dispositivo.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';

import { askPermission, cancel, scheduleDaily } from '@/lib/notifications';

export type Med = {
  id: string;
  name: string;
  dose: string;
  hour: number;
  minute: number;
  notifId?: string;
};

export type Routine = {
  id: string;
  when: string;
  name: string;
  desc: string;
  on: boolean;
  notifId?: string;
};

type State = {
  meds: Med[];
  taken: Record<string, string[]>; // fecha (YYYY-MM-DD) -> ids de pastillas tomadas
  routines: Routine[];
};

const DEFAULT: State = {
  meds: [
    { id: 'm1', name: 'Omega 3', dose: '1 cápsula · con desayuno', hour: 7, minute: 0 },
    { id: 'm2', name: 'Magnesio', dose: '1 tableta · con almuerzo', hour: 13, minute: 0 },
    { id: 'm3', name: 'Vitamina D', dose: '1.000 UI · con cena', hour: 21, minute: 0 },
  ],
  taken: {},
  routines: [
    { id: 'r1', when: '07:40', name: 'Resumen del día', desc: 'Pastillas, agenda y alertas', on: false },
    { id: 'r2', when: '18:00', name: 'Cierre de mercado', desc: 'Oro, plata y materias primas', on: false },
    { id: 'r3', when: 'LUN 06:30', name: 'Plan de entrenamiento', desc: 'Llega cuando conectemos Garmin', on: false },
  ],
};

const KEY = 'desj:v1';

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const hhmm = (h: number, m: number) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

type Ctx = State & {
  ready: boolean;
  toggleTaken: (id: string) => void;
  addMed: (m: Omit<Med, 'id'>) => void;
  removeMed: (id: string) => void;
  enableMedReminders: () => Promise<boolean>;
  toggleRoutine: (id: string) => Promise<void>;
};

const StoreCtx = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(DEFAULT);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => raw && setState({ ...DEFAULT, ...JSON.parse(raw) }))
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (ready) AsyncStorage.setItem(KEY, JSON.stringify(state));
  }, [state, ready]);

  const toggleTaken = (id: string) =>
    setState((s) => {
      const list = s.taken[today()] ?? [];
      const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
      return { ...s, taken: { ...s.taken, [today()]: next } };
    });

  const addMed = (m: Omit<Med, 'id'>) =>
    setState((s) => ({ ...s, meds: [...s.meds, { ...m, id: `m${Date.now()}` }].sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute)) }));

  const removeMed = (id: string) =>
    setState((s) => {
      cancel(s.meds.find((m) => m.id === id)?.notifId);
      return { ...s, meds: s.meds.filter((m) => m.id !== id) };
    });

  const enableMedReminders = async () => {
    if (!(await askPermission())) return false;
    const meds = await Promise.all(
      state.meds.map(async (m) => {
        await cancel(m.notifId);
        const notifId = await scheduleDaily(`💊 ${m.name}`, `Te toca: ${m.dose}`, m.hour, m.minute);
        return { ...m, notifId };
      }),
    );
    setState((s) => ({ ...s, meds }));
    return true;
  };

  const toggleRoutine = async (id: string) => {
    const r = state.routines.find((x) => x.id === id);
    if (!r) return;
    let notifId: string | undefined;
    if (!r.on) {
      if (!(await askPermission())) return;
      const match = r.when.match(/^(\d{2}):(\d{2})$/);
      if (match) notifId = await scheduleDaily(`DESJ · ${r.name}`, r.desc, Number(match[1]), Number(match[2]));
    } else {
      await cancel(r.notifId);
    }
    setState((s) => ({ ...s, routines: s.routines.map((x) => (x.id === id ? { ...x, on: !x.on, notifId } : x)) }));
  };

  return (
    <StoreCtx.Provider value={{ ...state, ready, toggleTaken, addMed, removeMed, enableMedReminders, toggleRoutine }}>
      {children}
    </StoreCtx.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error('useStore debe usarse dentro de StoreProvider');
  return ctx;
}
