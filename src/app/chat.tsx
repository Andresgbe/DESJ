// Pantalla 02 · Chat con DESJ, con respuesta en voz.
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Label, Row, Screen } from '@/components/ui';
import { think } from '@/lib/brain';
import { today, useStore } from '@/lib/store';
import { C, mono } from '@/theme';

type Msg = { id: string; from: 'me' | 'desj'; text: string };

export default function Chat() {
  const { meds, taken } = useStore();
  const [msgs, setMsgs] = useState<Msg[]>([
    { id: '0', from: 'desj', text: 'Hola, Steven. Soy DESJ. Prueba: "¿qué pastillas me faltan?" o "recuérdame llamar al notario a las 4 de la tarde".' },
  ]);
  const [input, setInput] = useState('');
  const [voice, setVoice] = useState(true);
  const [busy, setBusy] = useState(false);
  const list = useRef<FlatList<Msg>>(null);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMsgs((m) => [...m, { id: `${Date.now()}`, from: 'me', text }]);
    setBusy(true);
    const reply = await think(text, { meds, takenIds: taken[today()] ?? [] });
    setBusy(false);
    setMsgs((m) => [...m, { id: `${Date.now()}r`, from: 'desj', text: reply }]);
    if (voice) Speech.speak(reply, { language: 'es-ES', rate: 1.0 });
  };

  return (
    <Screen module="Módulo 02 · Chat" scroll={false}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <Row style={{ paddingBottom: 8 }}>
          <View>
            <Text style={{ color: C.text, fontWeight: '700', fontSize: 17 }}>DESJ</Text>
            <Text style={{ fontFamily: mono, fontSize: 10.5, color: C.ok }}>{busy ? '● pensando…' : '● en línea'}</Text>
          </View>
          <Pressable onPress={() => { setVoice(!voice); Speech.stop(); }} style={styles.voiceBtn} accessibilityLabel="Activar o desactivar voz">
            <Label style={{ color: voice ? C.accentSoft : C.muted }}>{voice ? 'VOZ ON' : 'VOZ OFF'}</Label>
          </Pressable>
        </Row>

        <FlatList
          ref={list}
          data={msgs}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ gap: 10, paddingVertical: 8 }}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => (
            <View style={item.from === 'me' ? styles.me : styles.bot}>
              <Text style={styles.msg}>{item.text}</Text>
            </View>
          )}
        />

        <View style={styles.inputBar}>
          <TextInput
            value={input}
            onChangeText={setInput}
            onSubmitEditing={send}
            placeholder="Escríbele a DESJ…"
            placeholderTextColor={C.muted}
            style={styles.input}
            returnKeyType="send"
          />
          <Pressable onPress={send} style={styles.send} accessibilityLabel="Enviar">
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={C.onAccent} strokeWidth={2.2} strokeLinecap="round">
              <Path d="M5 12h14" />
              <Path d="M13 6l6 6-6 6" />
            </Svg>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  me: { alignSelf: 'flex-end', maxWidth: '82%', backgroundColor: '#3B2470', borderRadius: 16, borderBottomRightRadius: 4, padding: 12 },
  bot: { alignSelf: 'flex-start', maxWidth: '86%', backgroundColor: '#140D24', borderColor: C.cardBorder, borderWidth: 1, borderRadius: 16, borderBottomLeftRadius: 4, padding: 12 },
  msg: { color: C.text, fontSize: 15, lineHeight: 21 },
  voiceBtn: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: C.cardBorder },
  inputBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#140D24', borderColor: C.cardBorder, borderWidth: 1, borderRadius: 28, paddingLeft: 16, padding: 6, marginBottom: 8 },
  input: { flex: 1, color: C.text, fontSize: 15, minHeight: 40 },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
});
