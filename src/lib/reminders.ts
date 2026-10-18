// Recordatorios de DESJ guardados en el teléfono: programa la notificación y lleva un registro
// para mostrarlos en el Calendario y poder quitarlos. Funciona en Expo Go.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { askPermission, cancel, scheduleDaily, scheduleOnce } from '@/lib/notifications';

export type Reminder = { id: string; title: string; body: string; at: string; repeat: 'none' | 'daily'; notifId?: string };

const KEY = 'desj:reminders:v1';
const KEEP_DAYS = 60; // los de una sola vez se borran del registro 60 días después

async function read(): Promise<Reminder[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

const write = (list: Reminder[]) => AsyncStorage.setItem(KEY, JSON.stringify(list));

export async function listReminders(): Promise<Reminder[]> {
  const cutoff = Date.now() - KEEP_DAYS * 86_400_000;
  const all = await read();
  const kept = all.filter((r) => r.repeat === 'daily' || new Date(r.at).getTime() > cutoff);
  if (kept.length !== all.length) await write(kept);
  return kept;
}

/** Programa el aviso y lo registra. Devuelve null si no hay permiso o la hora ya pasó. */
export async function addReminder(r: { title: string; body?: string; at: Date; repeat?: 'none' | 'daily'; id?: string }) {
  const repeat = r.repeat ?? 'none';
  if (repeat === 'none' && r.at.getTime() <= Date.now()) return null;
  if (!(await askPermission())) return null;
  const body = r.body ?? '';
  const notifId =
    repeat === 'daily'
      ? await scheduleDaily(`DESJ · ${r.title}`, body, r.at.getHours(), r.at.getMinutes())
      : await scheduleOnce('DESJ te recuerda', r.title + (body ? ` · ${body}` : ''), r.at);
  const reminder: Reminder = { id: r.id ?? `r${Date.now()}`, title: r.title, body, at: r.at.toISOString(), repeat, notifId };
  await write([...(await read()).filter((x) => x.id !== reminder.id), reminder]);
  return reminder;
}

export async function removeReminder(id: string) {
  const all = await read();
  await cancel(all.find((r) => r.id === id)?.notifId);
  await write(all.filter((r) => r.id !== id));
}
