// Pantalla 01 · Núcleo. Al entrar solo está DESJ: el cerebro grande y centrado con el botón
// "Hablar con DESJ". Al tocarlo, el cerebro se achica y sube, y aparece la conversación.
// El historial, la conversación nueva, la voz y "Volver a DESJ" viven en el menú hamburguesa.
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { ChatHistory } from '@/components/chat-history';
import { ChatMenu } from '@/components/chat-menu';
import { ChatPanel } from '@/components/chat-panel';
import { DesjCore, RESIZE, STATUS_HEIGHT } from '@/components/desj-core';
import { IconCalendar } from '@/components/icons';
import { Screen } from '@/components/ui';
import { AgendaItem, calendarAvailable, getTodayAgenda } from '@/lib/calendar';
import { useChats } from '@/lib/chats';
import { hhmm } from '@/lib/store';
import { C, mono, S } from '@/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const GAP = 10;
const TALK_GAP = 28; // entre el cerebro y el botón
const TALK_HEIGHT = 52;

export default function Nucleo() {
  const { busy: thinking } = useChats();
  const [agenda, setAgenda] = useState<AgendaItem[] | null | undefined>(undefined);
  const [talking, setTalking] = useState(false);
  const [typing, setTyping] = useState(false);
  const [voice, setVoice] = useState(true);
  const [history, setHistory] = useState(false);
  const [area, setArea] = useState(0);
  const [pressed, setPressed] = useState(false);
  // Las pestañas quedan montadas: el cerebro se pausa cuando el Núcleo no está a la vista.
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const { width, height } = useWindowDimensions();

  // Solo DESJ: el cerebro tan grande como quepa. Conversando: hasta el 32 % del alto.
  const column = Math.min(width - S.pad * 2, S.column - S.pad * 2);
  const big = Math.round(Math.max(160, Math.min(column, (area || height * 0.7) - STATUS_HEIGHT - TALK_GAP - TALK_HEIGHT - 16)));
  const small = Math.round(Math.min(column, height * 0.32));
  const display = !talking ? big : typing ? 120 : small;

  // Sin conversación el bloque (cerebro + botón) va centrado en el alto; al conversar sube.
  const idleOffset = Math.max(0, (area - (big + STATUS_HEIGHT + TALK_GAP + TALK_HEIGHT)) / 2);
  const lift = useSharedValue(0);
  useEffect(() => {
    if (talking) lift.set(withTiming(0, RESIZE));
    else lift.set(idleOffset);
  }, [talking, idleOffset, lift]);
  const liftStyle = useAnimatedStyle(() => ({ transform: [{ translateY: lift.get() }] }));

  useEffect(() => {
    getTodayAgenda().then(setAgenda).catch(() => setAgenda(null));
  }, []);

  // Con el teclado abierto el cerebro se achica para dejarle espacio a la conversación.
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setTyping(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setTyping(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const now = new Date();
  const next = agenda?.find((e) => !e.allDay && new Date(e.end) > now);

  const changeVoice = (on: boolean) => {
    setVoice(on);
    Speech.stop();
  };

  const startTalking = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTalking(true);
  };

  const stopTalking = () => {
    Keyboard.dismiss();
    Speech.stop();
    setTalking(false);
  };

  const openHistory = () => {
    setTalking(true);
    setHistory(true);
  };

  const menu = <ChatMenu voice={voice} onVoice={changeVoice} onHistory={openHistory} onNew={() => setTalking(true)} onBack={talking ? stopTalking : undefined} />;

  return (
    <Screen module="Módulo 01 · Núcleo" scroll={false} menu={menu}>
      <KeyboardAvoidingView
        style={{ flex: 1, gap: GAP }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
        onLayout={(e) => setArea(e.nativeEvent.layout.height)}>
        <Animated.View style={[{ alignItems: 'center' }, liftStyle]}>
          <DesjCore size={big} display={display} thinking={thinking} active={focused} label={thinking ? 'PENSANDO…' : 'SISTEMA EN LÍNEA'} />
          {!talking ? (
            <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(150)} style={{ marginTop: TALK_GAP }}>
              <AnimatedPressable
                onPress={startTalking}
                onPressIn={() => setPressed(true)}
                onPressOut={() => setPressed(false)}
                style={[styles.talk, pressed && styles.talkPressed]}
                accessibilityRole="button">
                <Text style={styles.talkText}>Hablar con DESJ</Text>
              </AnimatedPressable>
            </Animated.View>
          ) : null}
        </Animated.View>

        {talking ? (
          <Animated.View entering={FadeInDown.duration(350).delay(200)} style={{ flex: 1, gap: GAP }}>
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
            <ChatPanel voice={voice} />
          </Animated.View>
        ) : null}
      </KeyboardAvoidingView>
      <ChatHistory visible={history} onClose={() => setHistory(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  talk: {
    minHeight: TALK_HEIGHT,
    paddingHorizontal: 32,
    borderRadius: 999,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: `0 0 24px ${C.accent}73`,
  },
  talkPressed: { transform: [{ scale: 0.97 }] },
  talkText: { color: C.onAccent, fontFamily: mono, fontSize: 13, fontWeight: '700', letterSpacing: 3, textTransform: 'uppercase' },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, maxWidth: 220, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceInput, justifyContent: 'center' },
  chipText: { color: C.chipText, fontSize: 13.5, fontWeight: '500' },
});
