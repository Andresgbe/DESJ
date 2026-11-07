// Módulo UNIVERSIDAD: materias, plan de evaluación con notas, lo visto en cada clase (15 semanas) y links rápidos.
// Datos con lib/module-db (Supabase o el teléfono). Notas en escala de 20 (Venezuela): se aprueba con 10.
import { useModuleDb } from '@/lib/module-db';

export type Subject = { id: string; name: string; professor: string; color: string; position: number };
export type Evaluation = { id: string; subject_id: string; name: string; weight: number; max_score: number; score: number | null; due_on: string | null; position: number };
export type ClassNote = { id: string; subject_id: string; week: number; weekday: number; topic: string; created_at?: string };
export type UniLink = { id: string; subject_id: string | null; title: string; url: string; position: number };

type Uni = { uni_subjects: Subject[]; uni_evaluations: Evaluation[]; uni_classes: ClassNote[]; uni_links: UniLink[] };

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export function useUniversity(moduleId: string | undefined) {
  return useModuleDb<Uni>(moduleId, 'university', {
    uni_subjects: { cols: 'id, name, professor, color, position', byModule: true, order: 'position' },
    uni_evaluations: {
      cols: 'id, subject_id, name, weight, max_score, score, due_on, position',
      byModule: false,
      order: 'position',
      normalize: (r) => ({ ...r, weight: Number(r.weight), max_score: Number(r.max_score), score: num(r.score) }),
    },
    uni_classes: { cols: 'id, subject_id, week, weekday, topic, created_at', byModule: false, order: 'week' },
    uni_links: { cols: 'id, subject_id, title, url, position', byModule: true, order: 'position' },
  });
}

export const SCALE = 20;
export const PASS = 10;
export const WEEKS = 15;
export const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

/**
 * Cómo va la materia, en escala de 20: lo acumulado con las notas que ya hay, el porcentaje evaluado y cuánto
 * hace falta en promedio en lo que queda para llegar a 10. `needed` es null si ya no hace falta o no queda nada.
 */
export function standing(evals: Evaluation[]) {
  const graded = evals.filter((e) => e.score !== null);
  const earned = graded.reduce((s, e) => s + (Math.min(e.score!, e.max_score) / e.max_score) * e.weight, 0); // en %
  const evaluated = graded.reduce((s, e) => s + e.weight, 0);
  const planned = evals.reduce((s, e) => s + e.weight, 0);
  const remaining = Math.max(0, planned - evaluated);
  const acc = (earned / 100) * SCALE;
  const missing = PASS - acc;
  const needed = missing > 0 && remaining > 0 ? (missing / (remaining / 100)) : null; // promedio sobre 20
  return { acc, evaluated, planned, remaining, needed, average: evaluated ? (earned / evaluated) * SCALE : null };
}

export const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString('es-VE', { maximumFractionDigits: 2 });

/** Dominio de un link ("classroom.google.com"), o null si no es una URL válida. */
export function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** Arregla lo que la persona pega: sin https:// se lo agrega. null si no parece un link. */
export function cleanUrl(text: string) {
  const t = text.trim();
  if (!t) return null;
  const url = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  return hostOf(url)?.includes('.') ? url : null;
}

/** Logo del sitio (favicon) a través del servicio público de Google: solo se le envía el dominio. */
export const faviconOf = (url: string) => {
  const host = hostOf(url);
  return host ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64` : null;
};
