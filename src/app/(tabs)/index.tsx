// Pantalla 01 · Núcleo: saludo, HUD de DESJ, estado del día y la conversación.
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';

import { ChatPanel } from '@/components/chat-panel';
import { DesjCore } from '@/components/desj-core';
import { IconCalendar } from '@/components/icons';
import { Label, Screen, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { AgendaItem, calendarAvailable, getTodayAgenda } from '@/lib/calendar';
import { useChats } from '@/lib/chats';
import { firstName, useKnowledge } from '@/lib/knowledge';
import { hhmm } from '@/lib/store';
import { C } from '@/theme';

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export default function Nucleo() {
  const { name: accountName } = useAuth();
  const knowledge = useKnowledge();
  // El saludo usa el primer nombre de perfil.md; si aún no está, el nombre de la cuenta.
  const name = firstName(knowledge.docs) || accountName;
  const reloadKnowledge = knowledge.reload;
  useFocusEffect(useCallback(() => void reloadKnowledge(), [reloadKnowledge]));
  const { busy: thinking } = useChats();
  const [agenda, setAgenda] = useState<AgendaItem[] | null | undefined>(undefined);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    getTodayAgenda().then(setAgenda).catch(() => setAgenda(null));
  }, []);

  // Con el teclado abierto el HUD se achica para dejarle espacio a la conversación.
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setTyping(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setTyping(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Buenos días' : now.getHours() < 19 ? 'Buenas tardes' : 'Buenas noches';
  const next = agenda?.find((e) => !e.allDay && new Date(e.end) > now);

  return (
    <Screen module="Módulo 01 · Núcleo" scroll={false}>
      <KeyboardAvoidingView style={{ flex: 1, gap: 10 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        {!typing && (
          <View style={{ gap: 2 }}>
            <Title accent={name || undefined}>{name ? `${greeting},` : greeting}</Title>
            <Label>{`${DAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]} · Caracas`}</Label>
          </View>
        )}

        <View style={{ alignItems: 'center' }}>
          <DesjCore size={typing ? 110 : 200} label={thinking ? 'PENSANDO…' : 'SISTEMA EN LÍNEA'} />
        </View>

        {!typing && calendarAvailable && agenda ? (
          <View style={styles.chips}>
            <View style={styles.chip}>
              <IconCalendar color={C.accentSoft} size={15} />
              <Text style={styles.chipText} numberOfLines={1}>
                {next ? `${hhmm(new Date(next.start).getHours(), new Date(next.start).getMinutes())} ${next.title}` : agenda.length ? `${agenda.length} hoy` : 'Día libre'}
              </Text>
            </View>
          </View>
        ) : null}

        <ChatPanel />
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, maxWidth: 220, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceInput, justifyContent: 'center' },
  chipText: { color: C.chipText, fontSize: 13.5, fontWeight: '500' },
});
