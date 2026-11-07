// Pantalla · Calendario, al estilo de Google Calendar: vistas Agenda, Día, 3 días, Semana y Mes; eventos en
// bloques de color sólido (los 11 colores de Google), línea roja de "ahora", detalle al tocar un evento y botón
// flotante "+" para crear (con color). Junta tres fuentes: tu Google Calendar (si lo conectaste en Ajustes; si
// no, el calendario del teléfono en la app instalada), los recordatorios de DESJ y el plan diario de pastillas.
// Con Google, lo que agregas o borras aquí se crea o se borra en tu Google Calendar.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GestureResponderEvent, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { DateField } from '@/components/date-field';
import { Btn } from '@/components/form';
import { IconPill, IconPlus } from '@/components/icons';
import { Label, Screen, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import {
  AgendaItem,
  calendarAvailable,
  createCalendarEvent,
  createGoogleEvent,
  deleteGoogleEvent,
  getEvents,
  getGoogleEvents,
  GOOGLE_COLORS,
  GOOGLE_DEFAULT_COLOR,
  googleConnected,
} from '@/lib/calendar';
import { confirm, notify } from '@/lib/confirm';
import { addReminder, listReminders, Reminder, removeReminder } from '@/lib/reminders';
import { hhmm, useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { C, mono, R } from '@/theme';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const WEEK = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
const MAX_CHIPS = 3; // etiquetas visibles por día en Mes; el resto va en "+N más"
const HOUR_H = 52; // alto de una hora en Día, 3 días y Semana
const GUTTER = 44; // columna de las horas
const MIN_BLOCK = 22; // alto mínimo de un evento corto, para que se lea
const AGENDA_DAYS = 30;
const VIEW_KEY = 'desj:calendar:view';

type CalView = 'agenda' | 'dia' | '3dias' | 'semana' | 'mes';
const VIEWS: { id: CalView; label: string }[] = [
  { id: 'agenda', label: 'Agenda' },
  { id: 'dia', label: 'Día' },
  { id: '3dias', label: '3 días' },
  { id: 'semana', label: 'Semana' },
  { id: 'mes', label: 'Mes' },
];

type Item = {
  key: string;
  title: string;
  kind: 'evento' | 'desj' | 'pastillas';
  color: string;
  allDay: boolean;
  /** Inicio y fin reales (para el detalle y la agenda); null en el plan de pastillas. */
  start: Date | null;
  end: Date | null;
  location?: string | null;
  reminderId?: string;
  googleId?: string;
  /** Minutos desde las 00:00 de ese día (solo los que tienen hora), para ubicarlo en la grilla. */
  startMin?: number;
  endMin?: number;
};
type Source = 'google' | 'telefono' | null;
type AddDraft = { day: Date; time: string };

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const startOfWeek = (d: Date) => addDays(d, -d.getDay());
const clock = (d: Date) => hhmm(d.getHours(), d.getMinutes());
const dmy = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

/** "09:00 – 10:30", o "Todo el día". */
function range(it: Item) {
  if (it.allDay || !it.start) return 'Todo el día';
  return it.end ? `${clock(it.start)} – ${clock(it.end)}` : clock(it.start);
}

/** Semanas que cubren el mes (5 o 6), empezando en domingo como Google Calendar. */
function monthGrid(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = first.getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const weeks = Math.ceil((offset + daysInMonth) / 7);
  const start = addDays(first, -offset);
  return Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
}

/** Texto legible sobre un color de evento: oscuro sobre colores claros (Plátano), claro sobre el resto. */
function ink(color: string) {
  const m = color.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
  if (!m) return C.text;
  const [r, g, b] = m.slice(1).map((h) => parseInt(h, 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6 ? C.onAccent : C.text;
}

/** Título de un rango de días: "Octubre 2026" o, si cruza meses, "Oct – Nov 2026". */
function spanTitle(first: Date, last: Date): [string, string] {
  if (first.getMonth() === last.getMonth()) return [MONTHS[first.getMonth()], String(first.getFullYear())];
  return [`${MONTHS[first.getMonth()].slice(0, 3)} – ${MONTHS[last.getMonth()].slice(0, 3)}`, String(last.getFullYear())];
}

export default function Calendario() {
  const { meds } = useStore();
  const { session } = useAuth();
  const [view, setView] = useState<CalView>('mes');
  const [month, setMonth] = useState(() => startOfDay(new Date()));
  const [selected, setSelected] = useState(() => startOfDay(new Date()));
  const [events, setEvents] = useState<AgendaItem[] | null>(null);
  const [source, setSource] = useState<Source>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [adding, setAdding] = useState<AddDraft | null>(null);
  const [open, setOpen] = useState<Item | null>(null);
  const [now, setNow] = useState(() => new Date());
  const { width, height } = useWindowDimensions();
  const wide = width >= 700;

  const grid = useMemo(() => monthGrid(month), [month]);
  const today = startOfDay(now);

  // La vista elegida se recuerda en este dispositivo.
  useEffect(() => {
    AsyncStorage.getItem(VIEW_KEY)
      .then((v) => {
        if (v && VIEWS.some((x) => x.id === v)) setView(v as CalView);
      })
      .catch(() => null);
  }, []);
  const changeView = (v: CalView) => {
    // Al salir de Mes, las demás vistas parten del día elegido (o de hoy si estaba viendo otro mes).
    const inMonth = (d: Date) => d.getMonth() === month.getMonth() && d.getFullYear() === month.getFullYear();
    if (view === 'mes' && v !== 'mes' && !inMonth(selected)) go(inMonth(today) ? today : new Date(month.getFullYear(), month.getMonth(), 1));
    setView(v);
    AsyncStorage.setItem(VIEW_KEY, v).catch(() => null);
  };

  // El mes sigue al día elegido; se carga el mes con margen para que Semana, 3 días y Agenda (30 días) quepan.
  const go = (day: Date) => {
    setSelected(day);
    if (day.getMonth() !== month.getMonth() || day.getFullYear() !== month.getFullYear()) setMonth(new Date(day.getFullYear(), day.getMonth(), 1));
  };

  const reload = useCallback(() => {
    setNow(new Date());
    listReminders().then(setReminders);
    const from = addDays(grid[0], -7);
    const to = addDays(grid[grid.length - 1], AGENDA_DAYS + 6);
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
          title: e.title,
          kind: 'evento',
          color: e.color ?? GOOGLE_DEFAULT_COLOR,
          allDay: e.allDay,
          start: new Date(s),
          end: new Date(en),
          location: e.location,
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
        const start = new Date(dayStart + min * 60_000);
        out.push({
          key: `${r.id}-${dayStart}`,
          title: r.repeat === 'daily' ? `${r.title} (diario)` : r.title,
          kind: 'desj',
          color: C.warn,
          allDay: false,
          start,
          end: new Date(start.getTime() + 30 * 60_000),
          reminderId: r.id,
          startMin: min,
          endMin: Math.min(1440, min + 30),
        });
      }
    }
    if (meds.length && dayStart >= today.getTime()) {
      out.push({
        key: `meds-${dayStart}`,
        title: `Pastillas: ${meds.map((m) => `${m.times.length ? `${m.times.join(', ')} ` : ''}${m.name}${m.perDay > 1 ? ` (${m.perDay}×)` : ''}`).join(' · ')}`,
        kind: 'pastillas',
        color: C.muted,
        allDay: true,
        start: null,
        end: null,
      });
    }
    return out.sort((a, b) => Number(b.allDay) - Number(a.allDay) || (a.startMin ?? 0) - (b.startMin ?? 0));
  };

  const quitar = async (item: Item) => {
    if (item.googleId) {
      if (!(await confirm('Borrar evento', `¿Borrar "${item.title}" de tu Google Calendar?`, 'Borrar'))) return;
      setOpen(null);
      if (!(await deleteGoogleEvent(item.googleId))) notify('No pude borrarlo de Google Calendar. Revisa tu conexión.');
      return reload();
    }
    if (!item.reminderId) return;
    if (!(await confirm('Borrar recordatorio', `¿Borrar "${item.title}"?`, 'Borrar'))) return;
    setOpen(null);
    await removeReminder(item.reminderId);
    // Si vino de DESJ en la nube, también se borra allá para que deje de tenerlo en cuenta.
    if (session) await supabase.from('reminders').delete().eq('id', item.reminderId);
    reload();
  };

  // ‹ › avanzan según la vista.
  const STEP: Record<CalView, number> = { agenda: 7, dia: 1, '3dias': 3, semana: 7, mes: 0 };
  const step = (dir: 1 | -1) => {
    if (view === 'mes') setMonth(new Date(month.getFullYear(), month.getMonth() + dir, 1));
    else go(addDays(selected, STEP[view] * dir));
  };

  const days = view === 'semana' ? Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(selected), i)) : view === '3dias' ? [0, 1, 2].map((i) => addDays(selected, i)) : [selected];
  const [titleText, titleAccent] =
    view === 'mes'
      ? [MONTHS[month.getMonth()], String(month.getFullYear())]
      : view === 'dia'
        ? [`${DAYS[selected.getDay()]} ${selected.getDate()}`, MONTHS[selected.getMonth()].toLowerCase()]
        : view === 'agenda'
          ? [MONTHS[selected.getMonth()], String(selected.getFullYear())]
          : spanTitle(days[0], days[days.length - 1]);

  const fab = (
    <Pressable onPress={() => setAdding({ day: selected, time: '' })} style={styles.fab} accessibilityRole="button" accessibilityLabel="Crear">
      <IconPlus color={C.onAccent} size={26} />
    </Pressable>
  );

  return (
    <Screen module="Módulo 02 · Calendario" wide overlay={fab}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Title accent={titleAccent}>{titleText}</Title>
        </View>
        <Pressable onPress={() => { setMonth(today); setSelected(today); }} style={styles.todayBtn} accessibilityRole="button" accessibilityLabel="Ir a hoy">
          <Text style={styles.todayText}>Hoy</Text>
        </Pressable>
        <NavBtn label="‹" a11y="Anterior" onPress={() => step(-1)} />
        <NavBtn label="›" a11y="Siguiente" onPress={() => step(1)} />
      </View>

      <View style={styles.views}>
        {VIEWS.map((v) => (
          <Pressable key={v.id} onPress={() => changeView(v.id)} style={[styles.viewBtn, view === v.id && styles.viewOn]} accessibilityRole="button" accessibilityState={{ selected: view === v.id }}>
            <Text style={[styles.viewText, view === v.id && { color: C.onAccent }]}>{v.label}</Text>
          </Pressable>
        ))}
      </View>

      {view === 'mes' ? (
        <>
          <MonthView grid={grid} month={month} selected={selected} today={today} wide={wide} itemsFor={itemsFor} onSelect={setSelected} onOpenDay={(d) => { go(d); changeView('dia'); }} />
          <DaySchedule day={selected} today={today} items={itemsFor(selected)} onOpen={setOpen} />
        </>
      ) : view === 'agenda' ? (
        <AgendaView from={selected} today={today} itemsFor={itemsFor} onOpen={setOpen} onDay={(d) => { go(d); changeView('dia'); }} />
      ) : (
        <TimeGrid
          days={days}
          today={today}
          now={now}
          itemsFor={itemsFor}
          height={Math.max(380, Math.min(720, height * 0.66))}
          onDay={(d) => { go(d); changeView('dia'); }}
          onOpen={setOpen}
          onSlot={(day, hour) => setAdding({ day, time: hhmm(hour, 0) })}
        />
      )}

      <View style={styles.legend}>
        <Legend color={GOOGLE_DEFAULT_COLOR} text={source === 'google' ? 'Google Calendar' : source === 'telefono' ? 'Calendario del teléfono' : 'Calendario'} />
        <Legend color={C.warn} text="Recordatorios de DESJ" />
      </View>

      {source === null ? (
        <View style={styles.notice}>
          <Label>Google Calendar</Label>
          <Text style={styles.muted}>Conecta tu cuenta en tu perfil › Ajustes › Cuenta de Google y aquí verás tu Google Calendar: lo que agregues o borres se cambia también allá.</Text>
        </View>
      ) : null}
      {/* Espacio para que el botón "+" no tape lo último. */}
      <View style={{ height: 64 }} />

      <EventSheet item={open} onClose={() => setOpen(null)} onDelete={quitar} source={source} />
      {adding ? <AddSheet key={`${adding.day.toDateString()}-${adding.time}`} draft={adding} source={source} onClose={() => setAdding(null)} onSaved={() => { setAdding(null); reload(); }} /> : null}
    </Screen>
  );
}

// ---------------------------------------------------------------------------- Mes

function MonthView({
  grid,
  month,
  selected,
  today,
  wide,
  itemsFor,
  onSelect,
  onOpenDay,
}: {
  grid: Date[];
  month: Date;
  selected: Date;
  today: Date;
  wide: boolean;
  itemsFor: (d: Date) => Item[];
  onSelect: (d: Date) => void;
  onOpenDay: (d: Date) => void;
}) {
  return (
    <View style={styles.sheet}>
      <View style={styles.weekRow}>
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
              onPress={() => (isSel ? onOpenDay(day) : onSelect(day))}
              style={[styles.cell, { minHeight: wide ? 120 : 96 }, isSel && styles.cellSel]}
              accessibilityRole="button"
              accessibilityState={{ selected: isSel }}
              accessibilityHint={isSel ? 'Abrir el día' : undefined}
              accessibilityLabel={`${DAYS[day.getDay()]} ${day.getDate()} de ${MONTHS[day.getMonth()]}, ${dayItems.length} eventos`}>
              <View style={[styles.dayCircle, isToday && styles.today]}>
                <Text style={[styles.dayNum, !inMonth && { color: C.textFaint }, isToday && styles.todayNum]}>{day.getDate()}</Text>
              </View>
              {dayItems.slice(0, extra > 0 ? MAX_CHIPS - 1 : MAX_CHIPS).map((it) => (
                <View key={it.key} style={[styles.chip, { backgroundColor: it.color }, !inMonth && { opacity: 0.55 }]}>
                  <Text style={[styles.chipText, { color: ink(it.color) }]} numberOfLines={1}>
                    {wide && !it.allDay && it.start ? `${clock(it.start)} ${it.title}` : it.title}
                  </Text>
                </View>
              ))}
              {extra > 0 ? <Text style={styles.more}>{`${extra + 1} más`}</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Debajo del mes: el día elegido como en la Agenda de Google (número a la izquierda, eventos en color). */
function DaySchedule({ day, today, items, onOpen }: { day: Date; today: Date; items: Item[]; onOpen: (it: Item) => void }) {
  return (
    <View style={styles.sheet}>
      <View style={styles.agendaRow}>
        <DateBadge day={day} today={today} />
        <View style={{ flex: 1, gap: 6 }}>
          {items.length === 0 ? <Text style={[styles.muted, { paddingVertical: 12 }]}>Nada para este día. Toca + para agregar.</Text> : null}
          {items.map((it) => (
            <EventCard key={it.key} item={it} onPress={() => onOpen(it)} />
          ))}
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------- Agenda

function AgendaView({ from, today, itemsFor, onOpen, onDay }: { from: Date; today: Date; itemsFor: (d: Date) => Item[]; onOpen: (it: Item) => void; onDay: (d: Date) => void }) {
  const rows = Array.from({ length: AGENDA_DAYS }, (_, i) => addDays(from, i))
    .map((day) => ({ day, items: itemsFor(day).filter((it) => it.kind !== 'pastillas') }))
    .filter((r) => r.items.length || sameDay(r.day, today));
  return (
    <View style={styles.sheet}>
      {rows.length === 0 ? <Text style={[styles.muted, { padding: 16 }]}>{`Nada en los próximos ${AGENDA_DAYS} días.`}</Text> : null}
      {rows.map((r, i) => {
        const newMonth = i === 0 || r.day.getMonth() !== rows[i - 1].day.getMonth();
        return (
          <View key={r.day.toISOString()}>
            {newMonth ? <Text style={styles.agendaMonth}>{`${MONTHS[r.day.getMonth()]} ${r.day.getFullYear()}`}</Text> : null}
            <View style={styles.agendaRow}>
              <Pressable onPress={() => onDay(r.day)} accessibilityRole="button" accessibilityLabel={`Abrir ${DAYS[r.day.getDay()]} ${r.day.getDate()}`}>
                <DateBadge day={r.day} today={today} />
              </Pressable>
              <View style={{ flex: 1, gap: 6 }}>
                {r.items.length === 0 ? <Text style={[styles.muted, { paddingVertical: 12 }]}>Nada hoy.</Text> : null}
                {r.items.map((it) => (
                  <EventCard key={it.key} item={it} onPress={() => onOpen(it)} />
                ))}
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function DateBadge({ day, today }: { day: Date; today: Date }) {
  const isToday = sameDay(day, today);
  return (
    <View style={styles.badge}>
      <Text style={[styles.badgeDay, isToday && { color: C.accentSoft }]}>{WEEK[day.getDay()]}</Text>
      <View style={[styles.badgeCircle, isToday && styles.today]}>
        <Text style={[styles.badgeNum, isToday && styles.todayNum]}>{day.getDate()}</Text>
      </View>
    </View>
  );
}

/** Evento en bloque de color sólido, como en la Agenda de Google. */
function EventCard({ item, onPress }: { item: Item; onPress: () => void }) {
  const fg = item.kind === 'pastillas' ? C.text : ink(item.color);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, { backgroundColor: item.kind === 'pastillas' ? C.surfaceSunken : item.color }, pressed && { opacity: 0.85 }]} accessibilityRole="button">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {item.kind === 'pastillas' ? <IconPill color={C.muted} /> : null}
        <Text style={[styles.cardTitle, { color: fg }]} numberOfLines={2}>{item.title}</Text>
      </View>
      {item.kind !== 'pastillas' ? <Text style={[styles.cardTime, { color: fg }]}>{range(item)}</Text> : null}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------- Día, 3 días y Semana

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

function TimeGrid({
  days,
  today,
  now,
  itemsFor,
  height,
  onDay,
  onOpen,
  onSlot,
}: {
  days: Date[];
  today: Date;
  now: Date;
  itemsFor: (d: Date) => Item[];
  height: number;
  onDay: (d: Date) => void;
  onOpen: (it: Item) => void;
  onSlot: (d: Date, hour: number) => void;
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
    const hour = Math.max(0, Math.min(15, new Date().getHours() - 1));
    scroll.current?.scrollTo({ y: hour * HOUR_H, animated: false });
  }, [days.length, firstKey]);

  const tap = (day: Date) => (e: GestureResponderEvent) => {
    const ev = e.nativeEvent as GestureResponderEvent['nativeEvent'] & { offsetY?: number };
    const y = ev.locationY ?? ev.offsetY ?? 0;
    onSlot(day, Math.max(0, Math.min(23, Math.floor(y / HOUR_H))));
  };

  return (
    <View style={styles.sheet}>
      {/* Cabecera: día de la semana y número (hoy en círculo azul). */}
      <View style={[styles.weekRow, { paddingLeft: GUTTER }]}>
        {days.map((d) => {
          const isToday = sameDay(d, today);
          return (
            <Pressable
              key={d.toISOString()}
              onPress={() => onDay(d)}
              disabled={single}
              style={[styles.colHead, single && { alignItems: 'flex-start', paddingLeft: 8 }]}
              accessibilityRole={single ? undefined : 'button'}
              accessibilityLabel={`${DAYS[d.getDay()]} ${d.getDate()}`}>
              <Text style={[styles.colHeadDay, isToday && { color: C.accentSoft }]}>{WEEK[d.getDay()]}</Text>
              <View style={[styles.headCircle, isToday && styles.today]}>
                <Text style={[styles.headNum, isToday && styles.todayNum]}>{d.getDate()}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {hasAllDay ? (
        <View style={[styles.allDayRow, { paddingLeft: GUTTER }]}>
          {allDay.map((list, i) => (
            <View key={i} style={styles.allDayCol}>
              {list.map((it) => (
                <Pressable key={it.key} onPress={() => onOpen(it)} style={[styles.chip, { backgroundColor: it.color }]} accessibilityRole="button">
                  <Text style={[styles.chipText, { color: ink(it.color) }]} numberOfLines={1}>{it.title}</Text>
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      ) : null}

      <ScrollView ref={scroll} style={{ height }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
        <View style={{ height: 24 * HOUR_H, flexDirection: 'row' }}>
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
              <Pressable key={d.toISOString()} onPress={tap(d)} style={[styles.dayCol, styles.dayColBorder]} accessibilityLabel={`Crear el ${DAYS[d.getDay()]} ${d.getDate()}`}>
                {blocks.map(({ it, top, bottom, col, cols }) => {
                  const h = bottom - top;
                  const fg = ink(it.color);
                  return (
                    <Pressable
                      key={it.key}
                      onPress={() => onOpen(it)}
                      style={[styles.block, { top, height: h - 1, left: `${(col / cols) * 100}%`, width: `${100 / cols}%`, backgroundColor: it.color }, col > 0 && styles.blockOverlap]}
                      accessibilityRole="button"
                      accessibilityLabel={`${it.title}, ${range(it)}`}>
                      <Text style={[styles.blockTitle, { color: fg }]} numberOfLines={h > 44 ? 2 : 1}>
                        {h > 34 ? it.title : `${it.title}, ${it.start ? clock(it.start) : ''}`}
                      </Text>
                      {h > 34 ? <Text style={[styles.blockTime, { color: fg }]} numberOfLines={1}>{range(it)}</Text> : null}
                    </Pressable>
                  );
                })}
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
    </View>
  );
}

// ---------------------------------------------------------------------------- detalle y crear

const SOURCE_NAME: Record<Item['kind'], string> = { evento: 'Calendario', desj: 'Recordatorio de DESJ', pastillas: 'Plan de pastillas' };

function EventSheet({ item, onClose, onDelete, source }: { item: Item | null; onClose: () => void; onDelete: (it: Item) => void; source: Source }) {
  const when = item?.start ? `${DAYS[item.start.getDay()]}, ${item.start.getDate()} de ${MONTHS[item.start.getMonth()].toLowerCase()}` : '';
  const from = item?.kind === 'evento' ? (source === 'google' ? 'Google Calendar' : 'Calendario del teléfono') : item ? SOURCE_NAME[item.kind] : '';
  return (
    <Modal visible={Boolean(item)} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Cerrar" />
      {item ? (
        <View style={styles.modalWrap} pointerEvents="box-none">
          <View style={styles.modal}>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
              <View style={[styles.swatchBig, { backgroundColor: item.color }]} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.sheetTitle}>{item.title}</Text>
                {when ? <Text style={styles.body}>{when}</Text> : null}
                {item.kind !== 'pastillas' ? <Text style={styles.body}>{range(item)}</Text> : null}
              </View>
            </View>
            {item.location ? <Detail label="Lugar" value={item.location} /> : null}
            <Detail label="De" value={from} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Btn label="Cerrar" kind="ghost" onPress={onClose} />
              {item.googleId || item.reminderId ? <Btn label="Borrar" kind="danger" onPress={() => onDelete(item)} /> : null}
            </View>
          </View>
        </View>
      ) : null}
    </Modal>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Label>{label}</Label>
      <Text style={styles.body}>{value}</Text>
    </View>
  );
}

/** DD/MM/AAAA → fecha (también futura). null si no es una fecha real. */
function parseDay(text: string) {
  const m = text.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return d.getDate() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 ? d : null;
}
const parseTime = (t: string) => {
  const m = t.trim().match(/^(\d{1,2}):?(\d{2})?$/);
  return m && Number(m[1]) <= 23 && Number(m[2] ?? 0) <= 59 ? { h: Number(m[1]), m: Number(m[2] ?? 0) } : null;
};

function AddSheet({ draft, source, onClose, onSaved }: { draft: AddDraft; source: Source; onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState<'desj' | 'evento'>(source ? 'evento' : 'desj');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(dmy(draft.day));
  const [time, setTime] = useState(draft.time);
  const [until, setUntil] = useState(() => {
    const t = parseTime(draft.time);
    return t && t.h < 23 ? hhmm(t.h + 1, t.m) : '';
  });
  const [colorId, setColorId] = useState('7');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const day = parseDay(date);
    const t = parseTime(time);
    if (!title.trim()) return setError('Escribe un título.');
    if (!day) return setError('Elige la fecha.');
    if (!t) return setError('La hora va en formato 24h, por ejemplo 16:30.');
    const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), t.h, t.m);
    setSaving(true);
    setError(null);
    if (kind === 'evento') {
      // Fin opcional ("Hasta"); si no, dura una hora.
      const u = until.trim() ? parseTime(until) : null;
      if (until.trim() && !u) return (setSaving(false), setError('La hora de fin va en formato 24h, por ejemplo 17:30, o déjala vacía.'));
      const end = u ? new Date(day.getFullYear(), day.getMonth(), day.getDate(), u.h, u.m) : new Date(at.getTime() + 3_600_000);
      if (end <= at) return (setSaving(false), setError('La hora de fin tiene que ser después del inicio.'));
      const ok = source === 'google' ? await createGoogleEvent({ title: title.trim(), start: at, end, colorId }) : await createCalendarEvent({ title: title.trim(), start: at, end });
      setSaving(false);
      if (!ok) return setError(source === 'google' ? 'No pude crearlo en Google Calendar. Revisa tu conexión.' : 'No tengo acceso al calendario. Actívalo en Ajustes › DESJ › Calendarios.');
    } else {
      const r = await addReminder({ title: title.trim(), at });
      setSaving(false);
      if (!r) return setError('Esa hora ya pasó o falta el permiso de notificaciones.');
    }
    onSaved();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Cerrar" />
      <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined} pointerEvents="box-none">
        <View style={styles.modal}>
          <ScrollView contentContainerStyle={{ gap: 12 }} keyboardShouldPersistTaps="handled">
            <TextInput style={styles.titleInput} placeholder="Agrega un título" placeholderTextColor={C.muted} value={title} onChangeText={setTitle} autoFocus />
            <View style={styles.segment}>
              <Seg label="Evento" active={kind === 'evento'} disabled={!source} onPress={() => setKind('evento')} />
              <Seg label="Recordatorio" active={kind === 'desj'} onPress={() => setKind('desj')} />
            </View>
            <DateField label="Fecha" value={date} onChange={setDate} future />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TimeInput label="Desde" value={time} onChange={setTime} placeholder="Ej. 16:30" />
              {kind === 'evento' ? <TimeInput label="Hasta" value={until} onChange={setUntil} placeholder="Opcional" /> : null}
            </View>
            {kind === 'evento' && source === 'google' ? (
              <View style={{ gap: 6 }}>
                <Label>{`Color · ${GOOGLE_COLORS.find((c) => c.id === colorId)?.name ?? ''}`}</Label>
                <View style={styles.swatches}>
                  {GOOGLE_COLORS.map((c) => (
                    <Pressable key={c.id} onPress={() => setColorId(c.id)} style={styles.swatchBtn} accessibilityRole="radio" accessibilityState={{ checked: colorId === c.id }} accessibilityLabel={c.name}>
                      <View style={[styles.swatch, { backgroundColor: c.hex }, colorId === c.id && styles.swatchOn]} />
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
            {kind === 'desj' ? <Text style={styles.muted}>DESJ te avisa a esa hora con una notificación.</Text> : null}
            {error ? <Text style={{ color: C.bad, fontSize: 13 }}>{error}</Text> : null}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Btn label="Cancelar" kind="ghost" onPress={onClose} />
              <Btn label={saving ? 'Guardando…' : 'Guardar'} onPress={save} disabled={saving} />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function TimeInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Label>{label}</Label>
      <TextInput style={styles.input} placeholder={placeholder} placeholderTextColor={C.muted} value={value} onChangeText={onChange} keyboardType="numbers-and-punctuation" accessibilityLabel={label} />
    </View>
  );
}

function NavBtn({ label, a11y, onPress }: { label: string; a11y: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.nav} accessibilityRole="button" accessibilityLabel={a11y}>
      <Text style={styles.navText}>{label}</Text>
    </Pressable>
  );
}

function Seg({ label, active, disabled, onPress }: { label: string; active: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.seg, active && { backgroundColor: C.accent, borderColor: C.accent }, disabled && { opacity: 0.4 }]} accessibilityRole="button" accessibilityState={{ selected: active, disabled }}>
      <Text style={{ color: active ? C.onAccent : C.text, fontSize: 14, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

function Legend({ color, text }: { color: string; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={{ color: C.muted, fontSize: 12 }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  todayBtn: { minHeight: 44, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  todayText: { color: C.text, fontSize: 14, fontWeight: '600' },
  nav: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  navText: { color: C.text, fontSize: 24, lineHeight: 26 },
  views: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 999, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.surfaceSunken },
  viewBtn: { flex: 1, minHeight: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  viewOn: { backgroundColor: C.accent },
  viewText: { color: C.muted, fontSize: 13, fontWeight: '600' },
  sheet: { borderRadius: R.card, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.card, overflow: 'hidden' },
  weekRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.cardBorder },
  weekDay: { width: `${100 / 7}%`, textAlign: 'center', color: C.muted, fontSize: 10.5, fontWeight: '600', letterSpacing: 0.5, paddingVertical: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, paddingHorizontal: 2, paddingTop: 4, paddingBottom: 4, gap: 2, borderRightWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.cardBorder },
  cellSel: { backgroundColor: C.surfaceSelected },
  dayCircle: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 1 },
  today: { backgroundColor: C.accent },
  todayNum: { color: C.onAccent, fontWeight: '700' },
  dayNum: { color: C.text, fontSize: 12.5, fontWeight: '500' },
  chip: { borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2 },
  chipText: { fontSize: 10.5, lineHeight: 13, fontWeight: '600' },
  more: { color: C.muted, fontSize: 10.5, paddingHorizontal: 4, fontWeight: '600' },
  agendaMonth: { color: C.accentSoft, fontSize: 15, fontWeight: '700', paddingHorizontal: 14, paddingTop: 14, paddingBottom: 2 },
  agendaRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 10, paddingVertical: 8 },
  badge: { width: 48, alignItems: 'center', gap: 2, paddingTop: 2 },
  badgeDay: { color: C.muted, fontSize: 10.5, fontWeight: '600', letterSpacing: 0.5 },
  badgeCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  badgeNum: { color: C.text, fontSize: 18, fontWeight: '500' },
  card: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, minHeight: 44, justifyContent: 'center', gap: 2 },
  cardTitle: { fontSize: 14.5, fontWeight: '600', flexShrink: 1 },
  cardTime: { fontSize: 12.5, opacity: 0.9 },
  colHead: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: 4 },
  colHeadDay: { color: C.muted, fontSize: 10.5, fontWeight: '600', letterSpacing: 0.5 },
  headCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  headNum: { color: C.text, fontSize: 18, fontWeight: '500' },
  allDayRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.cardBorder, paddingVertical: 4 },
  allDayCol: { flex: 1, gap: 2, paddingHorizontal: 1 },
  hourLine: { position: 'absolute', right: 0, height: StyleSheet.hairlineWidth, backgroundColor: C.cardBorder },
  hourLabel: { position: 'absolute', left: 0, width: GUTTER - 6, textAlign: 'right', color: C.muted, fontSize: 10, fontFamily: mono },
  dayCol: { flex: 1, height: '100%' },
  dayColBorder: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: C.cardBorder },
  block: { position: 'absolute', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 3, overflow: 'hidden', marginRight: 2 },
  blockOverlap: { borderWidth: 1, borderColor: C.card },
  blockTitle: { fontSize: 11.5, lineHeight: 14, fontWeight: '700' },
  blockTime: { fontSize: 10.5, lineHeight: 13, opacity: 0.9 },
  nowLine: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: C.bad },
  nowDot: { position: 'absolute', left: -5, top: -4, width: 10, height: 10, borderRadius: 5, backgroundColor: C.bad },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingHorizontal: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  notice: { gap: 6, padding: 14, borderRadius: R.card, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.card },
  muted: { color: C.muted, fontSize: 13.5 },
  body: { color: C.text, fontSize: 14.5, lineHeight: 20 },
  fab: { position: 'absolute', right: 20, bottom: 20, width: 60, height: 60, borderRadius: 18, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', boxShadow: `0 6px 20px ${C.accent}66` },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: C.bg, opacity: 0.75 },
  modalWrap: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', padding: 12 },
  modal: { width: '100%', maxWidth: 520, maxHeight: '90%', gap: 14, padding: 18, borderRadius: R.card, borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  sheetTitle: { color: C.text, fontSize: 21, fontWeight: '600' },
  swatchBig: { width: 18, height: 18, borderRadius: 5, marginTop: 6 },
  titleInput: { color: C.text, fontSize: 22, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  segment: { flexDirection: 'row', gap: 6 },
  seg: { flex: 1, minHeight: 44, borderRadius: 999, borderWidth: 1, borderColor: C.cardBorder, alignItems: 'center', justifyContent: 'center' },
  input: { color: C.text, fontSize: 15, borderWidth: 1, borderColor: C.cardBorder, borderRadius: R.field, paddingHorizontal: 12, minHeight: 44, backgroundColor: C.surfaceSunken },
  swatches: { flexDirection: 'row', flexWrap: 'wrap' },
  swatchBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 28, height: 28, borderRadius: 14 },
  swatchOn: { borderWidth: 3, borderColor: C.text },
});
