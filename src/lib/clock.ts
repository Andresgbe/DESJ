// Reloj de DESJ: la hora actual, que se actualiza justo al cambiar el minuto (no cada segundo).
import { useEffect, useState } from 'react';

/** Hora actual, actualizada al cambiar el minuto. */
export function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const untilNextMinute = (d: Date) => 60_000 - (d.getSeconds() * 1000 + d.getMilliseconds());
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const d = new Date();
      setNow(d);
      timer = setTimeout(tick, untilNextMinute(d));
    };
    timer = setTimeout(tick, untilNextMinute(new Date()));
    return () => clearTimeout(timer);
  }, []);
  return now;
}

/** "21:58" */
export const hhmmOf = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
