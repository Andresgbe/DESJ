// Recordatorios locales: los programa el propio teléfono, sin servidor (gratis).
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function askPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const req = await Notifications.requestPermissionsAsync();
  return req.granted;
}

/** Programa un aviso diario a la hora indicada. Devuelve el id para poder cancelarlo. */
export async function scheduleDaily(title: string, body: string, hour: number, minute: number) {
  return Notifications.scheduleNotificationAsync({
    content: { title, body, sound: true },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
  });
}

/** Aviso único en una fecha concreta. */
export async function scheduleOnce(title: string, body: string, date: Date) {
  return Notifications.scheduleNotificationAsync({
    content: { title, body, sound: true },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
  });
}

export async function cancel(id?: string) {
  if (id) await Notifications.cancelScheduledNotificationAsync(id);
}
