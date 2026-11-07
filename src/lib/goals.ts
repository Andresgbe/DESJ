// Módulo GOALS: metas a corto, mediano y largo plazo por categoría, con fecha meta, progreso y pasos.
// Datos con lib/module-db (Supabase o el teléfono). La primera vez se siembran categorías de base.
// Progreso: con número (ahorrar 5.000 $) es lo que se lleva sobre la meta; si no, con pasos es pasos hechos;
// si no hay ninguno de los dos, el porcentaje que la persona pone a mano.
import { CATEGORY_PALETTE } from '@/lib/finance';
import { useModuleDb } from '@/lib/module-db';

export type Horizon = 'corto' | 'mediano' | 'largo';
export type GoalCategory = { id: string; name: string; color: string; position: number };
export type Goal = {
  id: string;
  category_id: string | null;
  title: string;
  description: string;
  horizon: Horizon;
  target_date: string | null;
  target_amount: number | null;
  current_amount: number;
  unit: string;
  progress: number;
  done_at: string | null;
  position: number;
};
export type GoalStep = { id: string; goal_id: string; title: string; done: boolean; position: number };

type Goals = { goal_categories: GoalCategory[]; goals: Goal[]; goal_steps: GoalStep[] };

export function useGoals(moduleId: string | undefined) {
  return useModuleDb<Goals>(moduleId, 'goals', {
    goal_categories: { cols: 'id, name, color, position', byModule: true, order: 'position' },
    goals: {
      cols: 'id, category_id, title, description, horizon, target_date, target_amount, current_amount, unit, progress, done_at, position',
      byModule: true,
      order: 'position',
      normalize: (r) => ({ ...r, target_amount: r.target_amount === null ? null : Number(r.target_amount), current_amount: Number(r.current_amount ?? 0) }),
    },
    goal_steps: { cols: 'id, goal_id, title, done, position', byModule: false, order: 'position' },
  });
}

export const HORIZONS: { id: Horizon; label: string; hint: string }[] = [
  { id: 'corto', label: 'Corto', hint: 'Este año' },
  { id: 'mediano', label: 'Mediano', hint: '1 a 3 años' },
  { id: 'largo', label: 'Largo', hint: '3 años o más' },
];

export const SEED_CATEGORIES = ['Finanzas', 'Universidad', 'Personal', 'Escritura', 'Salud'].map((name, i) => ({ name, color: CATEGORY_PALETTE[i], position: i }));
export const GOAL_COLORS = CATEGORY_PALETTE;

/** Progreso de 0 a 1 y de dónde sale. */
export function progressOf(goal: Goal, steps: GoalStep[]): { value: number; label: string } {
  if (goal.done_at) return { value: 1, label: 'Logrado' };
  if (goal.target_amount) {
    return { value: Math.min(1, goal.current_amount / goal.target_amount), label: `${amount(goal.current_amount, goal.unit)} de ${amount(goal.target_amount, goal.unit)}` };
  }
  if (steps.length) {
    const done = steps.filter((s) => s.done).length;
    return { value: done / steps.length, label: `${done} de ${steps.length} pasos` };
  }
  return { value: goal.progress / 100, label: `${goal.progress}%` };
}

export function amount(n: number, unit: string) {
  const v = n.toLocaleString('es-VE', { maximumFractionDigits: 2 });
  if (!unit) return v;
  return unit === '$' || unit === '€' ? `${unit}${v}` : `${v} ${unit}`;
}

/** "faltan 3 meses", "faltan 12 días", "venció hace 5 días". */
export function untilLabel(iso: string, now = new Date()) {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (days === 0) return 'es hoy';
  const abs = Math.abs(days);
  const span = abs >= 730 ? `${Math.round(abs / 365)} años` : abs >= 60 ? `${Math.round(abs / 30)} meses` : `${abs} ${abs === 1 ? 'día' : 'días'}`;
  return days > 0 ? `faltan ${span}` : `venció hace ${span}`;
}
