// Pantalla 01 · Núcleo: resumen del día.
import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, HudRing, Label, Row, Screen, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { AgendaItem, calendarAvailable, getTodayAgenda } from '@/lib/calendar';
import { hhmm, today, useStore } from '@/lib/store';
import { C, mono } from '@/theme';

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export default function Nucleo() {
  const { meds, taken } = useStore();
  const { session, name, signOut } = useAuth();
  const [agenda, setAgenda] = useState<AgendaItem[] | null | undefined>(undefined);

  useEffect(() => {
    getTodayAgenda().then(setAgenda).catch(() => setAgenda(null));
  }, []);
  const now = new Date();
  const takenIds = taken[today()] ?? [];
  const pending = meds.filter((m) => !takenIds.includes(m.id));
  const greeting = now.getHours() < 12 ? 'Buenos días' : now.getHours() < 19 ? 'Buenas tardes' : 'Buenas noches';

  return (
    <Screen module="Módulo 01 · Núcleo">
      <View style={{ gap: 2 }}>
        <Title accent={name || undefined}>{name ? `${greeting},` : greeting}</Title>
        <Label>{`${DAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]} · Caracas`}</Label>
      </View>

      <View style={{ alignItems: 'center', marginVertical: 4 }}>
        <HudRing big={hhmm(now.getHours(), now.getMinutes())} small="SISTEMA EN LÍNEA" />
      </View>

      <Card>
        <Label style={{ color: C.accentSoft }}>Hoy tienes</Label>
        <Row>
          <Text style={styles.item}>
            {pending.length === 0 ? 'Pastillas al día ✓' : `${pending.length} pastilla${pending.length > 1 ? 's' : ''} pendiente${pending.length > 1 ? 's' : ''}`}
          </Text>
          <Link href="/salud" style={styles.link}>Ver</Link>
        </Row>
        <Row>
          <Text style={styles.item}>Lote 3 · vacuna aftosa</Text>
          <Text style={[styles.tag, { color: C.warn }]}>EJEMPLO</Text>
        </Row>
        <Row>
          <Text style={styles.item}>Mercado: oro y plata</Text>
          <Link href="/negocios" style={styles.link}>Abrir</Link>
        </Row>
      </Card>

      <Card>
        <Label style={{ color: C.accentSoft }}>Agenda de hoy</Label>
        {!calendarAvailable ? (
          <Text style={styles.note}>Disponible en la app instalada (no funciona en Expo Go).</Text>
        ) : agenda === undefined ? (
          <Text style={styles.note}>Cargando…</Text>
        ) : agenda === null ? (
          <Text style={styles.note}>Sin acceso al calendario. Actívalo en Ajustes › DESJ › Calendarios.</Text>
        ) : agenda.length === 0 ? (
          <Text style={styles.item}>Día libre: nada en el calendario.</Text>
        ) : (
          agenda.slice(0, 6).map((e, i) => (
            <Row key={`${e.start}${i}`}>
              <Text style={styles.time}>{e.allDay ? 'TODO' : hhmm(new Date(e.start).getHours(), new Date(e.start).getMinutes())}</Text>
              <Text style={styles.item} numberOfLines={1}>{e.title}</Text>
            </Row>
          ))
        )}
      </Card>

      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Link href="/chat" asChild>
          <Pressable style={styles.chip}><Text style={styles.chipText}>Hablar con DESJ</Text></Pressable>
        </Link>
        <Link href="/salud" asChild>
          <Pressable style={styles.chip}><Text style={styles.chipText}>Mis pastillas</Text></Pressable>
        </Link>
        {session ? (
          <Pressable onPress={signOut} style={styles.chip} accessibilityRole="button">
            <Text style={[styles.chipText, { color: C.muted }]}>Cerrar sesión</Text>
          </Pressable>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: { color: C.text, fontSize: 15, flex: 1 },
  time: { fontFamily: mono, fontSize: 13, color: C.accentSoft, width: 52 },
  note: { color: C.muted, fontSize: 13.5 },
  link: { color: C.accentSoft, fontSize: 13 },
  tag: { fontFamily: mono, fontSize: 10.5, letterSpacing: 1 },
  chip: { minHeight: 44, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: '#140D24', justifyContent: 'center' },
  chipText: { color: '#E9DDFF', fontSize: 14, fontWeight: '500' },
});
