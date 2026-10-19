// Pantalla · Calendario: mes, detalle del día y agregar.
// Junta tres fuentes: calendario del teléfono (Apple / Google, solo en la app instalada),
// recordatorios de DESJ (funcionan también en Expo Go) y el plan diario de pastillas.
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { IconPill } from '@/components/icons';
import { Card, Label, Mono, Row, Screen, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { AgendaItem, calendarAvailable, createCalendarEvent, getEvents } from '@/lib/calendar';
import { confirm } from '@/lib/confirm';
import { addReminder, listReminders, Reminder, removeReminder } from '@/lib/reminders';
import { hhmm, useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { C } from '@/theme';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const WEEK = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
const MAX_CHIPS = 3; // etiquetas visibles por día; el resto va en "+N más"

type Item = { key: string; time: string | null; title: string; kind: 'evento' | 'desj' | 'pastillas'; color: string; reminderId?: string };

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
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

export default function Calendario() {
  const { meds } = useStore();
  const { session } = useAuth();
  const [month, setMonth] = useState(() => startOfDay(new Date()));
  const [selected, setSelected] = useState(() => startOfDay(new Date()));
  const [events, setEvents] = useState<AgendaItem[] | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [adding, setAdding] = useState(false);
  const wide = useWindowDimensions().width >= 700;

  const grid = useMemo(() => monthGrid(month), [month]);
  const today = startOfDay(new Date());

  const reload = useCallback(() => {
    listReminders().then(setReminders);
    if (calendarAvailable) {
      getEvents(grid[0], addDays(grid[grid.length - 1], 1)).then(setEvents).catch(() => setEvents(null));
    }
  }, [grid]);

  // Al volver a la pestaña (p. ej. después de pedirle algo a DESJ) se recarga.
  useFocusEffect(reload);

  const itemsFor = (day: Date): Item[] => {
    const dayStart = startOfDay(day).getTime();
    const dayEnd = dayStart + 86_400_000;
    const out: Item[] = [];
    for (const [i, e] of (events ?? []).entries()) {
      const s = new Date(e.start).getTime();
      const en = new Date(e.end).getTime();
      if (s < dayEnd && en > dayStart) out.push({ key: `e${i}`, time: e.allDay ? null : timeOf(e.start), title: e.title, kind: 'evento', color: e.color ?? C.accentSoft });
    }
    for (const r of reminders) {
      const at = new Date(r.at);
      const show = r.repeat === 'daily' ? at.getTime() < dayEnd : sameDay(at, day);
      if (show) out.push({ key: r.id, time: timeOf(r.at), title: r.repeat === 'daily' ? `${r.title} (diario)` : r.title, kind: 'desj', color: C.warn, reminderId: r.id });
    }
    if (meds.length && dayStart >= today.getTime()) {
      out.push({ key: 'meds', time: null, title: `Pastillas: ${meds.map((m) => `${hhmm(m.hour, m.minute)} ${m.name}`).join(' · ')}`, kind: 'pastillas', color: C.muted });
    }
    return out.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
  };

  const quitar = async (item: Item) => {
    if (!item.reminderId) return;
    if (!(await confirm('Quitar recordatorio', `¿Quitar "${item.title}"?`, 'Quitar'))) return;
    await removeReminder(item.reminderId);
    // Si vino de DESJ en la nube, también se borra allá para que deje de tenerlo en cuenta.
    if (session) await supabase.from('reminders').delete().eq('id', item.reminderId);
    reload();
  };

  const items = itemsFor(selected);

  return (
    <Screen module="Módulo 02 · Calendario" wide>
      <Row>
        <Title accent={String(month.getFullYear())}>{MONTHS[month.getMonth()]}</Title>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <NavBtn label="‹" a11y="Mes anterior" onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} />
          <NavBtn label="Hoy" a11y="Ir a hoy" onPress={() => { setMonth(today); setSelected(today); }} />
          <NavBtn label="›" a11y="Mes siguiente" onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} />
        </View>
      </Row>

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

      <Row>
        <Label style={{ color: C.accentSoft }}>{`${DAYS[selected.getDay()]} ${selected.getDate()} ${MONTHS[selected.getMonth()].toLowerCase()}`}</Label>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Legend color={C.accentSoft} text="Calendario" />
          <Legend color={C.warn} text="DESJ" />
        </View>
      </Row>

      <Card>
        {items.length === 0 ? (
          <Text style={styles.muted}>Nada para este día.</Text>
        ) : (
          items.map((it) => (
            <Pressable key={it.key} onLongPress={() => quitar(it)} disabled={!it.reminderId} style={styles.item}>
              {it.kind === 'pastillas' ? (
                <View style={styles.itemTime}><IconPill color={C.muted} /></View>
              ) : (
                <Mono style={[styles.itemTime, { color: it.color }]}>{it.time ?? 'Todo el día'}</Mono>
              )}
              <Text style={[styles.itemTitle, it.kind === 'pastillas' && styles.muted]} numberOfLines={2}>{it.title}</Text>
              {it.reminderId ? (
                <Pressable onPress={() => quitar(it)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Quitar ${it.title}`}>
                  <Text style={styles.remove}>Quitar</Text>
                </Pressable>
              ) : null}
            </Pressable>
          ))
        )}
      </Card>

      {adding ? (
        <AddForm day={selected} onDone={() => { setAdding(false); reload(); }} />
      ) : (
        <Pressable onPress={() => setAdding(true)} style={[styles.wide, styles.outline]} accessibilityRole="button">
          <Text style={styles.wideText}>＋ Agregar a este día</Text>
        </Pressable>
      )}

      {!calendarAvailable ? (
        <Card>
          <Label>Apple y Google Calendar</Label>
          <Text style={styles.muted}>
            Tus calendarios del iPhone (incluido Google, si la cuenta está en Ajustes › Calendario) aparecen aquí en la app instalada. En Expo Go solo se ven los recordatorios de DESJ.
          </Text>
        </Card>
      ) : null}
    </Screen>
  );
}

function AddForm({ day, onDone }: { day: Date; onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('');
  const [kind, setKind] = useState<'desj' | 'evento'>('desj');
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const t = time.match(/^(\d{1,2}):?(\d{2})?$/);
    if (!title.trim() || !t || Number(t[1]) > 23 || Number(t[2] ?? 0) > 59) {
      setError('Escribe un título y la hora en formato 24h, por ejemplo 16:30.');
      return;
    }
    const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Number(t[1]), Number(t[2] ?? 0));
    if (kind === 'evento') {
      const ok = await createCalendarEvent({ title: title.trim(), start: at, end: new Date(at.getTime() + 3_600_000) });
      if (!ok) return setError('No tengo acceso al calendario. Actívalo en Ajustes › DESJ › Calendarios.');
    } else {
      const r = await addReminder({ title: title.trim(), at });
      if (!r) return setError('Esa hora ya pasó o falta el permiso de notificaciones.');
    }
    onDone();
  };

  return (
    <Card glow>
      <Label style={{ color: C.accentSoft }}>Nuevo</Label>
      <View style={styles.segment}>
        <Seg label="Recordatorio DESJ" active={kind === 'desj'} onPress={() => setKind('desj')} />
        <Seg label="Evento" active={kind === 'evento'} disabled={!calendarAvailable} onPress={() => setKind('evento')} />
      </View>
      <TextInput style={styles.input} placeholder="Título (ej. Llamar al notario)" placeholderTextColor={C.muted} value={title} onChangeText={setTitle} />
      <TextInput style={styles.input} placeholder="Hora 24h (ej. 16:30)" placeholderTextColor={C.muted} value={time} onChangeText={setTime} keyboardType="numbers-and-punctuation" />
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
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 },
  itemTime: { width: 56, fontSize: 12 },
  itemTitle: { flex: 1, color: C.text, fontSize: 15 },
  remove: { color: C.bad, fontSize: 12.5 },
  muted: { color: C.muted, fontSize: 13.5 },
  nav: { minWidth: 40, minHeight: 36, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: C.cardBorder, alignItems: 'center', justifyContent: 'center' },
  navText: { color: C.accentSoft, fontSize: 15 },
  wide: { flex: 1, minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  wideText: { fontSize: 14.5, fontWeight: '700', color: C.chipText },
  outline: { borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceInput },
  ghost: { borderWidth: 1, borderColor: C.cardBorder },
  segment: { flexDirection: 'row', gap: 6 },
  seg: { flex: 1, minHeight: 40, borderRadius: 10, borderWidth: 1, borderColor: C.cardBorder, alignItems: 'center', justifyContent: 'center' },
  input: { color: C.text, fontSize: 15, borderWidth: 1, borderColor: C.cardBorder, borderRadius: 12, paddingHorizontal: 12, minHeight: 44, backgroundColor: C.surfaceSunken },
});
