// Agenda: Google Calendar de la persona si lo conectó en Ajustes (vía la Edge Function google-auth, sirve
// también en la web), y si no, el calendario del teléfono (incluye Google si la cuenta está en el iPhone).
// expo-calendar no funciona en Expo Go: ahí estas funciones devuelven "no disponible" en vez de fallar.
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

export type AgendaItem = { title: string; start: string; end: string; allDay: boolean; location: string | null; color?: string; googleId?: string };

export const calendarAvailable =
  Platform.OS !== 'web' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

// Carga diferida: en Expo Go el módulo nativo no existe y no debe tocarse.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const lib = () => require('expo-calendar') as typeof import('expo-calendar');

async function granted() {
  if (!calendarAvailable) return false;
  const { status } = await lib().requestCalendarPermissions();
  return status === 'granted';
}

/** Eventos de todos los calendarios del teléfono entre dos fechas, ordenados. null = sin acceso. */
export async function getEvents(start: Date, end: Date): Promise<AgendaItem[] | null> {
  if (!(await granted())) return null;
  const Calendar = lib();
  const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
  if (!calendars.length) return [];
  const events = await Calendar.listEvents(calendars, start, end);
  const colors = new Map(calendars.map((c) => [c.id, c.color]));
  return events
    .map((e) => ({
      color: colors.get(e.calendarId),
      title: e.title || '(sin título)',
      start: new Date(e.startDate).toISOString(),
      end: new Date(e.endDate).toISOString(),
      allDay: e.allDay,
      location: e.location,
    }))
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start));
}

// ---------------------------------------------------------------- Google Calendar

type GoogleEvent = { id: string; title: string; start: string; end: string; allDay: boolean; location: string | null };

/** Fecha "YYYY-MM-DD" de un evento de todo el día → medianoche local (si no, se correría un día por la zona horaria). */
const localDate = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`).toISOString() : v);

/** Eventos de Google Calendar entre dos fechas. null = Google no está conectado o no respondió. */
export async function getGoogleEvents(start: Date, end: Date): Promise<AgendaItem[] | null> {
  const { data, error } = await supabase.functions.invoke<{ events: GoogleEvent[] }>('google-auth', {
    body: { action: 'events', from: start.toISOString(), to: end.toISOString() },
  });
  if (error || !data?.events) return null;
  return data.events
    .map((e) => ({ title: e.title, start: localDate(e.start), end: localDate(e.end), allDay: e.allDay, location: e.location, googleId: e.id }))
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start));
}

/** Crea un evento en Google Calendar. Devuelve false si no se pudo. */
export async function createGoogleEvent(e: { title: string; start: Date; end: Date; location?: string; notes?: string }) {
  const { error } = await supabase.functions.invoke('google-auth', {
    body: { action: 'create', title: e.title, start: e.start.toISOString(), end: e.end.toISOString(), location: e.location ?? '', description: e.notes ?? '' },
  });
  return !error;
}

export async function deleteGoogleEvent(id: string) {
  const { error } = await supabase.functions.invoke('google-auth', { body: { action: 'delete', id } });
  return !error;
}

/** ¿Tiene Google conectado? (sin sesión, no). */
export async function googleConnected() {
  const { data: auth } = await supabase.auth.getSession();
  if (!auth.session) return false;
  const { data } = await supabase.from('google_accounts').select('user_id').maybeSingle();
  return Boolean(data);
}

/** Agenda de un rango: Google Calendar si está conectado; si no, el calendario del teléfono. null = sin acceso. */
export async function getAgenda(start: Date, end: Date): Promise<AgendaItem[] | null> {
  if (await googleConnected()) {
    const google = await getGoogleEvents(start, end);
    if (google) return google;
  }
  return calendarAvailable ? getEvents(start, end) : null;
}

/** Eventos de hoy. null = sin acceso. */
export async function getTodayAgenda(): Promise<AgendaItem[] | null> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return getAgenda(start, end);
}

/** Crea un evento en el calendario principal del teléfono. Devuelve false si no hay acceso. */
export async function createCalendarEvent(e: { title: string; start: Date; end: Date; notes?: string }) {
  if (!(await granted())) return false;
  const Calendar = lib();
  let calendar;
  if (Platform.OS === 'ios') {
    calendar = Calendar.getDefaultCalendarSync();
  } else {
    // Android no tiene "calendario por defecto": se usa el principal editable.
    const writable = (await Calendar.getCalendars(Calendar.EntityTypes.EVENT)).filter((c) => c.allowsModifications);
    calendar = writable.find((c) => c.isPrimary) ?? writable[0];
  }
  if (!calendar) return false;
  await calendar.createEvent({ title: e.title, startDate: e.start, endDate: e.end, notes: e.notes ?? '' });
  return true;
}
