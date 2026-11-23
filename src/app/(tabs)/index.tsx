// Pantalla 01 · Núcleo. Al entrar solo está DESJ: el cerebro grande y centrado con el botón
// "Hablar con DESJ". Al tocarlo, el cerebro se achica y sube, y aparece la conversación.
// Historial, conversación nueva, respuesta en voz y "Volver a DESJ" viven en el menú hamburguesa (izquierda del header).
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Text } from '@/components/text';
import { ChatHistory } from '@/components/chat-history';
import { ChatMenu } from '@/components/chat-menu';
import { ChatActivity, ChatPanel } from '@/components/chat-panel';
import { DesjCore, RESIZE, STATUS_HEIGHT } from '@/components/desj-core';
import { IconAlert } from '@/components/icons';
import { Screen } from '@/components/ui';
import { startAlertSound, stopAlertSound } from '@/lib/alert-sound';
import { useChats } from '@/lib/chats';
import { useLayout } from '@/lib/layout';
import { C, mono, PRISM, S } from '@/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const GAP = 10;
const TALK_GAP = 28; // entre el cerebro y el botón
const TALK_HEIGHT = 52;
const DEMO_ALERT_TEXT =
  'ERROR CRÍTICO. SE HAN DETECTADO MÚLTIPLES FALLAS EN LAS PLATAFORMAS DE SU NEGOCIO, SEÑOR. HAY QUE TOMAR ACCIONES AL RESPECTO.';

export default function Nucleo() {
  const { busy: thinking, pushAlert } = useChats();
  const [talking, setTalking] = useState(false);
  const [typing, setTyping] = useState(false);
  const [voice, setVoice] = useState(true);
  const [history, setHistory] = useState(false);
  const [area, setArea] = useState(0);
  const [pressed, setPressed] = useState(false);
  const [activity, setActivity] = useState<ChatActivity>(null);
  const [demoAlert, setDemoAlert] = useState(false);
  const demoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Las pestañas quedan montadas: el cerebro se pausa cuando el Núcleo no está a la vista.
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => {
        setFocused(false);
        if (demoTimer.current) clearTimeout(demoTimer.current);
        setDemoAlert(false);
        stopAlertSound();
      };
    }, []),
  );
  const { width, height, column: layoutColumn } = useLayout();

  // Mientras DESJ habla una noticia crítica (por el chat o con el botón !), DESJ y el fondo del Núcleo se ponen en rojo alerta; al terminar de hablar vuelve a sus colores normales.
  const critical = Boolean(!thinking && (demoAlert || activity === 'alert'));
  const coreState = thinking ? 'thinking' : activity === 'listening' ? 'listening' : critical ? 'alert' : (activity ?? 'online');

  // Solo DESJ: el cerebro tan grande como quepa. Conversando: hasta el 32 % del alto.
  const column = Math.min(width, layoutColumn) - S.pad * 2;
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

  // Con el teclado abierto el cerebro se achica para dejarle espacio a la conversación.
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setTyping(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setTyping(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const changeVoice = (on: boolean) => {
    setVoice(on);
    if (demoTimer.current) clearTimeout(demoTimer.current);
    setDemoAlert(false);
    Speech.stop();
    stopAlertSound();
  };

  const triggerDemoAlert = () => {
    if (demoTimer.current) clearTimeout(demoTimer.current);
    Speech.stop();
    stopAlertSound();
    if (demoAlert) {
      setDemoAlert(false);
      return;
    }
    setDemoAlert(true);
    pushAlert(DEMO_ALERT_TEXT);
    const stopSiren = startAlertSound();
    const done = () => {
      if (demoTimer.current) clearTimeout(demoTimer.current);
      stopSiren();
      setDemoAlert(false);
    };
    // Respaldo por si el navegador no dispara onDone de SpeechSynthesis al terminar la frase.
    demoTimer.current = setTimeout(done, 9500);
    Speech.speak(DEMO_ALERT_TEXT, { language: 'es-ES', rate: 1.0, pitch: 0.95, onDone: done, onStopped: done, onError: done });
  };

  const startTalking = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTalking(true);
  };

  const stopTalking = () => {
    Keyboard.dismiss();
    if (demoTimer.current) clearTimeout(demoTimer.current);
    setDemoAlert(false);
    Speech.stop();
    stopAlertSound();
    setTalking(false);
  };

  const openHistory = () => {
    setTalking(true);
    setHistory(true);
  };

  const menu = <ChatMenu voice={voice} onVoice={changeVoice} onHistory={openHistory} onNew={() => setTalking(true)} onBack={talking ? stopTalking : undefined} />;
  const alertBtn = !typing ? (
    <Pressable
      onPress={triggerDemoAlert}
      hitSlop={8}
      style={[styles.alertFab, demoAlert && styles.alertFabActive, talking && styles.alertFabTalking]}
      accessibilityRole="button"
      accessibilityLabel={demoAlert ? 'Desactivar alerta crítica' : 'Simular alerta crítica'}>
      <IconAlert color={demoAlert ? C.onAccent : C.bad} size={18} />
    </Pressable>
  ) : null;

  return (
    <Screen module="Módulo 01 · Núcleo" scroll={false} menu={menu} alert={critical} overlay={alertBtn}>
      <KeyboardAvoidingView
        style={{ flex: 1, gap: GAP }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
        onLayout={(e) => setArea(e.nativeEvent.layout.height)}>
        <Animated.View style={[{ alignItems: 'center' }, liftStyle]}>
          <DesjCore size={big} display={display} state={coreState} active={focused} />
          {!talking ? (
            <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(150)} style={{ marginTop: TALK_GAP }}>
              <AnimatedPressable
                onPress={startTalking}
                onPressIn={() => setPressed(true)}
                onPressOut={() => setPressed(false)}
                style={[styles.talk, critical && styles.talkAlert, pressed && styles.talkPressed]}
                accessibilityRole="button">
                <Text style={styles.talkText}>Hablar con DESJ</Text>
              </AnimatedPressable>
            </Animated.View>
          ) : null}
        </Animated.View>

        {talking ? (
          <Animated.View entering={FadeInDown.duration(350).delay(200)} style={{ flex: 1, gap: GAP }}>
            <ChatPanel voice={voice} onActivity={setActivity} />
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
  talkAlert: {
    backgroundColor: PRISM.alert,
    boxShadow: `0 0 24px ${PRISM.alert}73`,
  },
  talkPressed: { transform: [{ scale: 0.97 }] },
  talkText: { color: C.onAccent, fontFamily: mono, fontSize: 13, fontWeight: '700', letterSpacing: 3, textTransform: 'uppercase' },
  alertFab: {
    position: 'absolute',
    right: S.pad,
    bottom: 14,
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: C.cardBorder,
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.78,
  },
  alertFabTalking: {
    bottom: undefined,
    top: 56,
  },
  alertFabActive: {
    backgroundColor: PRISM.alert,
    borderColor: PRISM.alert,
    opacity: 1,
    boxShadow: `0 0 18px ${PRISM.alert}80`,
  },
});
