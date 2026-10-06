// "Cerebro" de DESJ en modo demo: reglas simples que corren en el teléfono.
// Paso siguiente: reemplazar `think()` por una llamada a una Edge Function de Supabase
// que hable con Claude (la API key nunca va dentro de la app).
import { scheduleOnce, askPermission } from '@/lib/notifications';
import { hhmm, Med } from '@/lib/store';

type Ctx = { meds: Med[]; takenIds: string[] };

function parseTime(text: string): Date | null {
  const m = text.match(/(?:a las|a la)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm|de la tarde|de la noche|de la mañana)?/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const suf = (m[3] ?? '').toLowerCase();
  if ((suf === 'pm' || suf.includes('tarde') || suf.includes('noche')) && h < 12) h += 12;
  if ((suf === 'am' || suf.includes('mañana')) && h === 12) h = 0;
  const d = new Date();
  d.setHours(h, min, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d;
}

export async function think(text: string, ctx: Ctx): Promise<string> {
  const t = text.toLowerCase();

  if (t.includes('recuérdame') || t.includes('recuerdame')) {
    const when = parseTime(text);
    if (!when) return 'Dime a qué hora. Por ejemplo: "recuérdame llamar al notario a las 4 de la tarde".';
    if (!(await askPermission())) return 'Necesito permiso de notificaciones para avisarte. Actívalo en Ajustes.';
    const what = text.replace(/recu[eé]rdame/i, '').replace(/(a las|a la).*$/i, '').trim() || 'tu recordatorio';
    await scheduleOnce('DESJ te recuerda', what, when);
    const dia = when.getDate() === new Date().getDate() ? 'hoy' : 'mañana';
    return `Listo. Te aviso ${dia} a las ${hhmm(when.getHours(), when.getMinutes())}: "${what}".`;
  }

  if (/(pastilla|medicamento|medicina|tomar)/.test(t)) {
    const pending = ctx.meds.filter((m) => !ctx.takenIds.includes(m.id));
    if (pending.length === 0) return 'Hoy ya te tomaste todo. Bien ahí.';
    return `Te faltan ${pending.length}: ${pending.map((m) => `${m.name} a las ${hhmm(m.hour, m.minute)}`).join(', ')}.`;
  }

  if (/(hola|buenas|buenos)/.test(t)) return 'Hola, Steven. ¿Qué necesitas?';

  return 'Estoy en modo demo. Por ahora sé de recordatorios ("recuérdame … a las 5") y de tus pastillas. Pronto me conectan al cerebro completo.';
}
