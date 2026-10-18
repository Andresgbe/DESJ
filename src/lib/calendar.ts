// Agenda del teléfono (incluye Google Calendar si la cuenta está agregada en Ajustes del iPhone).
// expo-calendar no funciona en Expo Go: ahí estas funciones devuelven "no disponible" en vez de fallar.
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

export type AgendaItem = { title: string; start: string; end: string; allDay: boolean; location: string | null; color?: string };

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

/** Eventos de hoy. null = sin acceso. */
export async function getTodayAgenda(): Promise<AgendaItem[] | null> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return getEvents(start, end);
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
