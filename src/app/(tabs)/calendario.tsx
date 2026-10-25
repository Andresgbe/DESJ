// Pantalla · Calendario: vista Mes, Semana o Día (como Google Calendar), detalle del día y agregar.
// Junta tres fuentes: tu Google Calendar (si lo conectaste en Ajustes; si no, el calendario del teléfono en la
// app instalada), los recordatorios de DESJ y el plan diario de pastillas. Con Google, los eventos que agregas
// o quitas aquí se crean o se borran en tu Google Calendar.
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GestureResponderEvent, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { IconPill } from '@/components/icons';
import { Card, Label, Mono, Row, Screen, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { AgendaItem, calendarAvailable, createCalendarEvent, createGoogleEvent, deleteGoogleEvent, getEvents, getGoogleEvents, googleConnected } from '@/lib/calendar';
import { confirm, notify } from '@/lib/confirm';
import { addReminder, listReminders, Reminder, removeReminder } from '@/lib/reminders';
import { hhmm, useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { C, mono } from '@/theme';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const WEEK = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
const MAX_CHIPS = 3; // etiquetas visibles por día; el resto va en "+N más"
const HOUR_H = 48; // alto de una hora en las vistas Semana y Día
const GUTTER = 40; // columna de las horas
const MIN_BLOCK = 22; // alto mínimo de un evento corto, para que se lea

type View3 = 'mes' | 'semana' | 'dia';
type Item = {
  key: string;
  time: string | null;
  title: string;
  kind: 'evento' | 'desj' | 'pastillas';
  color: string;
  reminderId?: string;
  googleId?: string;
  /** Minutos desde las 00:00 de ese día (solo los que tienen hora), para ubicarlo en la grilla. */
  startMin?: number;
  endMin?: number;
};
type Source = 'google' | 'telefono' | null;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const startOfWeek = (d: Date) => addDays(d, -d.getDay());
const timeOf = (iso: string) => {
  const d = new Date(iso);
  return hhmm(d.getHours(), d.getMinutes());
};

/** Semanas que cubren el mes (5 o 6), empezando en domingo como Google Calendar. */
function monthGrid(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = first.getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const weeks = Math.ceil((offset + daysInMonth) / 7);
  const start = addDays(first, -offset);
  return Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
}

/** Color con transparencia para las etiquetas con hora. */
function tint(color: string) {
  return /^#[0-9a-f]{6}$/i.test(color) ? `${color}33` : 'rgba(143,208,255,0.18)';
}

/** Título de la semana: "Octubre 2026" o, si cruza meses, "Oct – Nov 2026". */
function weekTitle(first: Date): [string, string] {
  const last = addDays(first, 6);
  if (first.getMonth() === last.getMonth()) return [MONTHS[first.getMonth()], String(first.getFullYear())];
  return [`${MONTHS[first.getMonth()].slice(0, 3)} – ${MONTHS[last.getMonth()].slice(0, 3)}`, String(last.getFullYear())];
}

export default function Calendario() {
  const { meds } = useStore();
  const { session } = useAuth();
  const [view, setView] = useState<View3>('mes');
  const [month, setMonth] = useState(() => startOfDay(new Date()));
  const [selected, setSelected] = useState(() => startOfDay(new Date()));
  const [events, setEvents] = useState<AgendaItem[] | null>(null);
  const [source, setSource] = useState<Source>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [adding, setAdding] = useState<{ time: string } | null>(null);
  const [now, setNow] = useState(() => new Date());
  const { width, height } = useWindowDimensions();
  const wide = width >= 700;

  const grid = useMemo(() => monthGrid(month), [month]);
  const today = startOfDay(now);

  // Semana y Día siempre caen dentro del mes de `selected`, así que basta con cargar la grilla del mes.
  const go = (day: Date) => {
    setSelected(day);
    if (day.getMonth() !== month.getMonth() || day.getFullYear() !== month.getFullYear()) setMonth(new Date(day.getFullYear(), day.getMonth(), 1));
  };

  const reload = useCallback(() => {
    setNow(new Date());
    listReminders().then(setReminders);
    const from = grid[0];
    const to = addDays(grid[grid.length - 1], 1);
    (async () => {
      // Google Calendar si está conectado; si no, el calendario del teléfono (app instalada).
      if (await googleConnected()) {
        const google = await getGoogleEvents(from, to);
        if (google) {
          setEvents(google);
          setSource('google');
          return;
        }
      }
      if (calendarAvailable) {
        setEvents(await getEvents(from, to).catch(() => null));
        setSource('telefono');
      } else {
        setEvents(null);
        setSource(null);
      }
    })();
  }, [grid]);

  // Al volver a la pestaña (p. ej. después de pedirle algo a DESJ) se recarga.
  useFocusEffect(reload);

  // La línea de "ahora" avanza cada minuto mientras la pestaña está a la vista.
  useFocusEffect(
    useCallback(() => {
      const id = setInterval(() => setNow(new Date()), 60_000);
      return () => clearInterval(id);
    }, []),
  );

  const itemsFor = (day: Date): Item[] => {
    const dayStart = startOfDay(day).getTime();
    const dayEnd = dayStart + 86_400_000;
    const out: Item[] = [];
    for (const [i, e] of (events ?? []).entries()) {
      const s = new Date(e.start).getTime();
      const en = new Date(e.end).getTime();
      if (s < dayEnd && en > dayStart) {
        out.push({
          key: `e${i}`,
          time: e.allDay ? null : timeOf(e.start),
          title: e.title,
          kind: 'evento',
          color: e.color ?? C.accentSoft,
          googleId: e.googleId,
          ...(e.allDay ? {} : { startMin: Math.max(0, (s - dayStart) / 60_000), endMin: Math.min(1440, (en - dayStart) / 60_000) }),
        });
      }
    }
    for (const r of reminders) {
      const at = new Date(r.at);
      const show = r.repeat === 'daily' ? at.getTime() < dayEnd : sameDay(at, day);
      if (show) {
        const min = at.getHours() * 60 + at.getMinutes();
        out.push({ key: r.id, time: timeOf(r.at), title: r.repeat === 'daily' ? `${r.title} (diario)` : r.title, kind: 'desj', color: C.warn, reminderId: r.id, startMin: min, endMin: Math.min(1440, min + 30) });
      }
    }
    if (meds.length && dayStart >= today.getTime()) {
      out.push({ key: 'meds', time: null, title: `Pastillas: ${meds.map((m) => `${m.times.length ? `${m.times.join(', ')} ` : ''}${m.name}${m.perDay > 1 ? ` (${m.perDay}×)` : ''}`).join(' · ')}`, kind: 'pastillas', color: C.muted });
    }
    return out.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
  };

  const quitar = async (item: Item) => {
    if (item.googleId) {
      if (!(await confirm('Quitar evento', `¿Borrar "${item.title}" de tu Google Calendar?`, 'Borrar'))) return;
      if (!(await deleteGoogleEvent(item.googleId))) notify('No pude borrarlo de Google Calendar. Revisa tu conexión.');
      return reload();
    }
    if (!item.reminderId) return;
    if (!(await confirm('Quitar recordatorio', `¿Quitar "${item.title}"?`, 'Quitar'))) return;
    await removeReminder(item.reminderId);
    // Si vino de DESJ en la nube, también se borra allá para que deje de tenerlo en cuenta.
    if (session) await supabase.from('reminders').delete().eq('id', item.reminderId);
    reload();
  };

  // ‹ › avanzan un mes, una semana o un día según la vista.
  const step = (dir: 1 | -1) => {
    if (view === 'mes') setMonth(new Date(month.getFullYear(), month.getMonth() + dir, 1));
    else go(addDays(selected, view === 'semana' ? 7 * dir : dir));
  };
  const unit = view === 'mes' ? 'Mes' : view === 'semana' ? 'Semana' : 'Día';

  const changeView = (v: View3) => {
    // Al salir de Mes, la semana o el día parten del día elegido (o de hoy si estaba viendo otro mes).
    const inMonth = (d: Date) => d.getMonth() === month.getMonth() && d.getFullYear() === month.getFullYear();
    if (view === 'mes' && v !== 'mes' && !inMonth(selected)) go(inMonth(today) ? today : new Date(month.getFullYear(), month.getMonth(), 1));
    setView(v);
  };

  const weekStart = startOfWeek(selected);
  const [titleText, titleAccent] =
    view === 'mes'
      ? [MONTHS[month.getMonth()], String(month.getFullYear())]
      : view === 'semana'
        ? weekTitle(weekStart)
        : [`${DAYS[selected.getDay()]} ${selected.getDate()}`, MONTHS[selected.getMonth()].toLowerCase()];

  const pickSlot = (day: Date, hour: number) => {
    go(day);
    setAdding({ time: hhmm(hour, 0) });
  };

  const items = itemsFor(selected);

  return (
    <Screen module="Módulo 02 · Calendario" wide>
      <Row>
        <Title accent={titleAccent}>{titleText}</Title>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <NavBtn label="‹" a11y={`${unit} anterior`} onPress={() => step(-1)} />
          <NavBtn label="Hoy" a11y="Ir a hoy" onPress={() => { setMonth(today); setSelected(today); }} />
          <NavBtn label="›" a11y={`${unit} siguiente`} onPress={() => step(1)} />
        </View>
      </Row>

      <View style={styles.segment}>
        <Seg label="Mes" active={view === 'mes'} onPress={() => changeView('mes')} />
        <Seg label="Semana" active={view === 'semana'} onPress={() => changeView('semana')} />
        <Seg label="Día" active={view === 'dia'} onPress={() => changeView('dia')} />
      </View>

      {view === 'mes' ? (
        <Card style={styles.month}>
          <View style={styles.week}>
            {WEEK.map((d, i) => (
              <Text key={i} style={styles.weekDay}>{d}</Text>
            ))}
          </View>
          <View style={styles.grid}>
            {grid.map((day) => {
              const inMonth = day.getMonth() === month.getMonth();
              const isSel = sameDay(day, selected);
              const isToday = sameDay(day, today);
              const dayItems = itemsFor(day).filter((it) => it.kind !== 'pastillas');
              const extra = dayItems.length - MAX_CHIPS;
              return (
                <Pressable
                  key={day.toISOString()}
                  onPress={() => setSelected(day)}
                  style={[styles.cell, { minHeight: wide ? 112 : 92 }, isSel && styles.cellSel]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSel }}
                  accessibilityLabel={`${DAYS[day.getDay()]} ${day.getDate()} de ${MONTHS[day.getMonth()]}, ${dayItems.length} elementos`}>
                  <View style={[styles.dayCircle, isToday && styles.today]}>
                    <Text style={[styles.dayNum, !inMonth && { color: C.textFaint }, isToday && { color: C.onAccent, fontWeight: '700' }]}>{day.getDate()}</Text>
                  </View>
                  {dayItems.slice(0, extra > 0 ? MAX_CHIPS - 1 : MAX_CHIPS).map((it) => (
                    <View
                      key={it.key}
                      style={[
                        styles.chip,
                        it.time === null
                          ? { backgroundColor: it.color }
                          : { backgroundColor: tint(it.color), borderLeftWidth: 2, borderLeftColor: it.color },
                        !inMonth && { opacity: 0.5 },
                      ]}>
                      <Text style={[styles.chipText, it.time === null && { color: C.onAccent, fontWeight: '600' }]} numberOfLines={1}>
                        {wide && it.time ? `${it.time} ${it.title}` : it.title}
                      </Text>
                    </View>
                  ))}
                  {extra > 0 ? <Text style={styles.more}>{`+${extra + 1} más`}</Text> : null}
                </Pressable>
              );
            })}
          </View>
        </Card>
      ) : (
        <TimeGrid
          days={view === 'semana' ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)) : [selected]}
          today={today}
          now={now}
          selected={selected}
          itemsFor={itemsFor}
          height={Math.max(360, Math.min(620, height * 0.62))}
          wide={wide}
          onDay={(d) => { go(d); setView('dia'); }}
          onSelect={go}
          onSlot={pickSlot}
          onLong={quitar}
        />
      )}

      <Row>
        <Label style={{ color: C.accentSoft }}>{`${DAYS[selected.getDay()]} ${selected.getDate()} ${MONTHS[selected.getMonth()].toLowerCase()}`}</Label>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Legend color={C.accentSoft} text={source === 'google' ? 'Google Calendar' : 'Calendario'} />
          <Legend color={C.warn} text="DESJ" />
        </View>
      </Row>

      <Card>
        {items.length === 0 ? (
          <Text style={styles.muted}>Nada para este día.</Text>
        ) : (
          items.map((it) => (
            <Pressable key={it.key} onLongPress={() => quitar(it)} disabled={!it.reminderId && !it.googleId} style={styles.item}>
              {it.kind === 'pastillas' ? (
                <View style={styles.itemTime}><IconPill color={C.muted} /></View>
              ) : (
                <Mono style={[styles.itemTime, { color: it.color }]}>{it.time ?? 'Todo el día'}</Mono>
              )}
              <Text style={[styles.itemTitle, it.kind === 'pastillas' && styles.muted]} numberOfLines={2}>{it.title}</Text>
              {it.reminderId || it.googleId ? (
                <Pressable onPress={() => quitar(it)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Quitar ${it.title}`}>
                  <Text style={styles.remove}>Quitar</Text>
                </Pressable>
              ) : null}
            </Pressable>
          ))
        )}
      </Card>

      {adding ? (
        <AddForm key={`${selected.toDateString()}-${adding.time}`} day={selected} source={source} initialTime={adding.time} onDone={() => { setAdding(null); reload(); }} />
      ) : (
        <Pressable onPress={() => setAdding({ time: '' })} style={[styles.wide, styles.outline]} accessibilityRole="button">
          <Text style={styles.wideText}>＋ Agregar a este día</Text>
        </Pressable>
      )}

      {source === null ? (
        <Card>
          <Label>Google Calendar</Label>
          <Text style={styles.muted}>
            Conecta tu cuenta en tu perfil › Ajustes › Cuenta de Google y aquí verás tu Google Calendar: lo que agregues o quites se cambia también allá.
          </Text>
        </Card>
      ) : null}
    </Screen>
  );
}

/** Reparte los eventos que se pisan en columnas, como Google Calendar. */
function layoutDay(items: Item[]) {
  const timed = items
    .filter((it) => it.startMin !== undefined)
    .map((it) => {
      const top = (it.startMin! / 60) * HOUR_H;
      const h = Math.max(MIN_BLOCK, ((it.endMin! - it.startMin!) / 60) * HOUR_H);
      return { it, top, bottom: top + h, col: 0, cols: 1 };
    })
    .sort((a, b) => a.top - b.top || b.bottom - a.bottom);
  let group: typeof timed = [];
  let ends: number[] = [];
  let groupEnd = -1;
  const flush = () => {
    for (const g of group) g.cols = ends.length;
    group = [];
    ends = [];
  };
  for (const b of timed) {
    if (b.top >= groupEnd) flush();
    let col = ends.findIndex((e) => e <= b.top);
    if (col === -1) {
      col = ends.length;
      ends.push(b.bottom);
    } else ends[col] = b.bottom;
    b.col = col;
    group.push(b);
    groupEnd = Math.max(groupEnd, b.bottom);
  }
  flush();
  return timed;
}

/** Vistas Semana y Día: fila de "todo el día" arriba y la grilla de horas con los eventos ubicados por hora. */
function TimeGrid({
  days,
  today,
  now,
  selected,
  itemsFor,
  height,
  wide,
  onDay,
  onSelect,
  onSlot,
  onLong,
}: {
  days: Date[];
  today: Date;
  now: Date;
  selected: Date;
  itemsFor: (d: Date) => Item[];
  height: number;
  wide: boolean;
  onDay: (d: Date) => void;
  onSelect: (d: Date) => void;
  onSlot: (d: Date, hour: number) => void;
  onLong: (it: Item) => void;
}) {
  const scroll = useRef<ScrollView>(null);
  const single = days.length === 1;
  const perDay = days.map((d) => itemsFor(d).filter((it) => it.kind !== 'pastillas'));
  const allDay = perDay.map((list) => list.filter((it) => it.startMin === undefined));
  const hasAllDay = allDay.some((l) => l.length > 0);
  const nowTop = ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_H;

  // Al abrir la vista se baja hasta una hora antes de ahora, como Google Calendar.
  const firstKey = days[0].toDateString();
  useEffect(() => {
    const hour = Math.max(0, Math.min(16, new Date().getHours() - 1));
    scroll.current?.scrollTo({ y: hour * HOUR_H, animated: false });
  }, [single, firstKey]);

  const tap = (day: Date) => (e: GestureResponderEvent) => {
    const ev = e.nativeEvent as GestureResponderEvent['nativeEvent'] & { offsetY?: number };
    const y = ev.locationY ?? ev.offsetY ?? 0;
    onSlot(day, Math.max(0, Math.min(23, Math.floor(y / HOUR_H))));
  };

  return (
    <Card style={styles.month}>
      {!single ? (
        <View style={[styles.week, { paddingLeft: GUTTER }]}>
          {days.map((d) => {
            const isToday = sameDay(d, today);
            const isSel = sameDay(d, selected);
            return (
              <Pressable
                key={d.toISOString()}
                onPress={() => onDay(d)}
                style={[styles.colHead, isSel && styles.cellSel]}
                accessibilityRole="button"
                accessibilityLabel={`Ver ${DAYS[d.getDay()]} ${d.getDate()}`}>
                <Text style={[styles.weekDay, { width: 'auto', paddingVertical: 0 }, isToday && { color: C.accentSoft }]}>{WEEK[d.getDay()]}</Text>
                <View style={[styles.dayCircle, isToday && styles.today]}>
                  <Text style={[styles.dayNum, { fontSize: 14 }, isToday && { color: C.onAccent, fontWeight: '700' }]}>{d.getDate()}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {hasAllDay ? (
        <View style={[styles.allDayRow, { paddingLeft: GUTTER }]}>
          {allDay.map((list, i) => (
            <View key={i} style={styles.allDayCol}>
              {list.map((it) => (
                <Pressable key={it.key} onPress={() => onSelect(days[i])} onLongPress={() => onLong(it)} style={[styles.chip, { backgroundColor: it.color }]}>
                  <Text style={[styles.chipText, { color: C.onAccent, fontWeight: '600' }]} numberOfLines={1}>{it.title}</Text>
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      ) : null}

      <ScrollView ref={scroll} style={{ height }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
        <View style={{ height: 24 * HOUR_H, flexDirection: 'row' }}>
          {/* Horas y líneas de fondo */}
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            {Array.from({ length: 24 }, (_, h) => (
              <View key={h} style={[styles.hourLine, { top: h * HOUR_H, left: GUTTER }]} />
            ))}
          </View>
          <View pointerEvents="none" style={{ width: GUTTER }}>
            {Array.from({ length: 23 }, (_, h) => (
              <Text key={h} style={[styles.hourLabel, { top: (h + 1) * HOUR_H - 7 }]}>{hhmm(h + 1, 0)}</Text>
            ))}
          </View>

          {days.map((d, i) => {
            const blocks = layoutDay(perDay[i]);
            const isToday = sameDay(d, today);
            return (
              <Pressable
                key={d.toISOString()}
                onPress={tap(d)}
                style={[styles.dayCol, i > 0 && styles.dayColBorder]}
                accessibilityLabel={`Agregar el ${DAYS[d.getDay()]} ${d.getDate()}`}>
                {blocks.map(({ it, top, bottom, col, cols }) => (
                  <Pressable
                    key={it.key}
                    onPress={() => onSelect(d)}
                    onLongPress={() => onLong(it)}
                    style={[
                      styles.block,
                      {
                        top,
                        height: bottom - top - 1,
                        left: `${(col / cols) * 100}%`,
                        width: `${100 / cols}%`,
                        backgroundColor: tint(it.color),
                        borderLeftColor: it.color,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`${it.time ?? ''} ${it.title}`}>
                    <Text style={styles.blockTitle} numberOfLines={bottom - top > 40 ? 3 : 1}>
                      {it.title}
                    </Text>
                    {bottom - top > 36 && (single || wide) ? <Text style={styles.blockTime}>{it.time}</Text> : null}
                  </Pressable>
                ))}
                {isToday ? (
                  <View pointerEvents="none" style={[styles.nowLine, { top: nowTop }]}>
                    <View style={styles.nowDot} />
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </Card>
  );
}

function AddForm({ day, source, initialTime = '', onDone }: { day: Date; source: Source; initialTime?: string; onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [time, setTime] = useState(initialTime);
  const [until, setUntil] = useState(() => {
    const h = Number(initialTime.split(':')[0]);
    return initialTime && h < 23 ? hhmm(h + 1, 0) : '';
  });
  const [kind, setKind] = useState<'desj' | 'evento'>(source ? 'evento' : 'desj');
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const t = time.match(/^(\d{1,2}):?(\d{2})?$/);
    if (!title.trim() || !t || Number(t[1]) > 23 || Number(t[2] ?? 0) > 59) {
      setError('Escribe un título y la hora en formato 24h, por ejemplo 16:30.');
      return;
    }
    const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Number(t[1]), Number(t[2] ?? 0));
    if (kind === 'evento') {
      // Fin opcional ("Hasta"); si no, dura una hora.
      const u = until.match(/^(\d{1,2}):?(\d{2})?$/);
      if (until.trim() && (!u || Number(u[1]) > 23 || Number(u[2] ?? 0) > 59)) return setError('La hora de fin va en formato 24h, por ejemplo 17:30, o déjala vacía.');
      const end = u ? new Date(day.getFullYear(), day.getMonth(), day.getDate(), Number(u[1]), Number(u[2] ?? 0)) : new Date(at.getTime() + 3_600_000);
      if (end <= at) return setError('La hora de fin tiene que ser después del inicio.');
      const ok = source === 'google' ? await createGoogleEvent({ title: title.trim(), start: at, end }) : await createCalendarEvent({ title: title.trim(), start: at, end });
      if (!ok) return setError(source === 'google' ? 'No pude crearlo en Google Calendar. Revisa tu conexión.' : 'No tengo acceso al calendario. Actívalo en Ajustes › DESJ › Calendarios.');
    } else {
      const r = await addReminder({ title: title.trim(), at });
      if (!r) return setError('Esa hora ya pasó o falta el permiso de notificaciones.');
    }
    onDone();
  };

  return (
    <Card glow>
      <Label style={{ color: C.accentSoft }}>{`Nuevo · ${DAYS[day.getDay()]} ${day.getDate()} ${MONTHS[day.getMonth()].toLowerCase()}`}</Label>
      <View style={styles.segment}>
        <Seg label="Recordatorio DESJ" active={kind === 'desj'} onPress={() => setKind('desj')} />
        <Seg label={source === 'google' ? 'Evento en Google' : 'Evento'} active={kind === 'evento'} disabled={!source} onPress={() => setKind('evento')} />
      </View>
      <TextInput style={styles.input} placeholder="Título (ej. Llamar al notario)" placeholderTextColor={C.muted} value={title} onChangeText={setTitle} autoFocus={!!initialTime} />
      <TextInput style={styles.input} placeholder="Hora 24h (ej. 16:30)" placeholderTextColor={C.muted} value={time} onChangeText={setTime} keyboardType="numbers-and-punctuation" />
      {kind === 'evento' ? (
        <TextInput style={styles.input} placeholder="Hasta (opcional, ej. 17:30)" placeholderTextColor={C.muted} value={until} onChangeText={setUntil} keyboardType="numbers-and-punctuation" />
      ) : null}
      {error ? <Text style={{ color: C.bad, fontSize: 13 }}>{error}</Text> : null}
      <Row>
        <Pressable onPress={onDone} style={[styles.wide, styles.ghost]}><Text style={[styles.wideText, { color: C.muted }]}>Cancelar</Text></Pressable>
        <Pressable onPress={save} style={[styles.wide, { backgroundColor: C.accent }]}><Text style={[styles.wideText, { color: C.onAccent }]}>Guardar</Text></Pressable>
      </Row>
    </Card>
  );
}

function NavBtn({ label, a11y, onPress }: { label: string; a11y: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.nav} hitSlop={4} accessibilityRole="button" accessibilityLabel={a11y}>
      <Text style={styles.navText}>{label}</Text>
    </Pressable>
  );
}

function Seg({ label, active, disabled, onPress }: { label: string; active: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.seg, active && { backgroundColor: C.accent }, disabled && { opacity: 0.4 }]} accessibilityRole="button" accessibilityState={{ selected: active, disabled }}>
      <Text style={{ color: active ? C.onAccent : C.text, fontSize: 13.5, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

function Legend({ color, text }: { color: string; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={{ color: C.muted, fontSize: 11.5 }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  month: { padding: 0, gap: 0, overflow: 'hidden' },
  week: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.cardBorder },
  weekDay: { width: `${100 / 7}%`, textAlign: 'center', color: C.muted, fontSize: 10, letterSpacing: 0.5, paddingVertical: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: `${100 / 7}%`,
    paddingHorizontal: 2,
    paddingTop: 4,
    paddingBottom: 4,
    gap: 2,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: C.cardBorder,
  },
  cellSel: { backgroundColor: C.surfaceSelected },
  dayCircle: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 1 },
  today: { backgroundColor: C.accent },
  dayNum: { color: C.text, fontSize: 12 },
  chip: { borderRadius: 4, paddingHorizontal: 3, paddingVertical: 1.5 },
  chipText: { color: C.text, fontSize: 10, lineHeight: 13 },
  more: { color: C.muted, fontSize: 10, paddingHorizontal: 3 },
  colHead: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: 4 },
  allDayRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.cardBorder, paddingVertical: 3 },
  allDayCol: { flex: 1, gap: 2, paddingHorizontal: 1 },
  hourLine: { position: 'absolute', right: 0, height: StyleSheet.hairlineWidth, backgroundColor: C.cardBorder },
  hourLabel: { position: 'absolute', left: 0, width: GUTTER - 4, textAlign: 'right', color: C.muted, fontSize: 9.5, fontFamily: mono },
  dayCol: { flex: 1, height: '100%' },
  dayColBorder: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: C.cardBorder },
  block: { position: 'absolute', borderRadius: 4, borderLeftWidth: 2, paddingHorizontal: 3, paddingVertical: 2, overflow: 'hidden' },
  blockTitle: { color: C.text, fontSize: 10.5, lineHeight: 13, fontWeight: '600' },
  blockTime: { color: C.muted, fontSize: 9.5, fontFamily: mono },
  nowLine: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: C.bad },
  nowDot: { position: 'absolute', left: -4, top: -3, width: 8, height: 8, borderRadius: 4, backgroundColor: C.bad },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 },
  itemTime: { width: 56, fontSize: 12 },
  itemTitle: { flex: 1, color: C.text, fontSize: 15 },
  remove: { color: C.bad, fontSize: 12.5 },
  muted: { color: C.muted, fontSize: 13.5 },
  nav: { minWidth: 44, minHeight: 44, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: C.cardBorder, alignItems: 'center', justifyContent: 'center' },
  navText: { color: C.accentSoft, fontSize: 15 },
  wide: { flex: 1, minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  wideText: { fontSize: 14.5, fontWeight: '700', color: C.chipText },
  outline: { borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceInput },
  ghost: { borderWidth: 1, borderColor: C.cardBorder },
  segment: { flexDirection: 'row', gap: 6 },
  seg: { flex: 1, minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: C.cardBorder, alignItems: 'center', justifyContent: 'center' },
  input: { color: C.text, fontSize: 15, borderWidth: 1, borderColor: C.cardBorder, borderRadius: 12, paddingHorizontal: 12, minHeight: 44, backgroundColor: C.surfaceSunken },
});
