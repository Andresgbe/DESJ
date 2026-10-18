// Conversación con DESJ: texto, adjuntos (foto / archivo), dictado por voz y respuesta en voz. Vive en el Núcleo.
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { Image } from 'expo-image';
import { useRef, useState } from 'react';
import { Alert, FlatList, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { ChatHistory } from '@/components/chat-history';
import { IconClip, IconClose, IconFile, IconMic, IconPlus, IconStop } from '@/components/icons';
import { Label } from '@/components/ui';
import { Attachment, pickAttachment } from '@/lib/attachments';
import { ChatMsg, useChats } from '@/lib/chats';
import { dictationAvailable, startDictation } from '@/lib/dictation';
import { C } from '@/theme';

export function ChatPanel() {
  const { conversations, activeId, messages, busy, send, newChat } = useChats();
  const [input, setInput] = useState('');
  const [voice, setVoice] = useState(true);
  const [history, setHistory] = useState(false);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [tray, setTray] = useState(false);
  const [listening, setListening] = useState(false);
  const stopListening = useRef<(() => void) | null>(null);
  const list = useRef<FlatList<ChatMsg>>(null);

  const title = conversations.find((c) => c.id === activeId)?.title ?? 'Nueva conversación';
  const canSend = Boolean(input.trim() || attachment);

  const notify = (msg: string) => (Platform.OS === 'web' ? window.alert(msg) : Alert.alert('DESJ', msg));

  const submit = async () => {
    const text = input.trim();
    if (!canSend || busy) return;
    stopListening.current?.();
    const file = attachment;
    setInput('');
    setAttachment(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const reply = await send(text, file);
    if (reply && voice) Speech.speak(reply, { language: 'es-ES', rate: 1.0 });
  };

  const attach = async (source: 'galeria' | 'camara' | 'archivo') => {
    setTray(false);
    try {
      const a = await pickAttachment(source);
      if (a) setAttachment(a);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No pude abrir ese archivo.');
    }
  };

  // Micrófono: toca para dictar, toca otra vez para parar. El texto va apareciendo en el campo.
  const toggleMic = async () => {
    if (listening) return stopListening.current?.();
    if (!dictationAvailable) {
      return notify('El dictado de DESJ funciona en la app instalada. Mientras tanto, usa el micrófono del teclado del iPhone.');
    }
    Speech.stop();
    const before = input.trim();
    const stop = await startDictation({
      onText: (t) => setInput(before ? `${before} ${t}` : t),
      onEnd: () => {
        setListening(false);
        stopListening.current = null;
      },
      onError: notify,
    });
    if (stop) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      stopListening.current = stop;
      setListening(true);
    }
  };

  return (
    <View style={{ flex: 1, gap: 6 }}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Label style={{ color: busy ? C.ok : C.muted }}>{busy ? '● DESJ pensando…' : 'Conversación'}</Label>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
        </View>
        <Pressable onPress={() => setHistory(true)} style={styles.btn} hitSlop={6} accessibilityRole="button" accessibilityLabel="Ver historial de conversaciones">
          <Label style={{ color: C.accentSoft }}>Historial</Label>
        </Pressable>
        <Pressable onPress={newChat} disabled={busy} style={styles.btn} hitSlop={6} accessibilityRole="button" accessibilityLabel="Nueva conversación">
          <IconPlus color={C.accentSoft} />
        </Pressable>
        <Pressable
          onPress={() => { setVoice(!voice); Speech.stop(); }}
          style={styles.btn}
          hitSlop={6}
          accessibilityRole="switch"
          accessibilityState={{ checked: voice }}
          accessibilityLabel="Respuesta en voz">
          <Label style={{ color: voice ? C.accentSoft : C.muted }}>{voice ? 'Voz on' : 'Voz off'}</Label>
        </Pressable>
      </View>

      <FlatList
        ref={list}
        style={{ flex: 1 }}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ gap: 10, paddingVertical: 4 }}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => (
          <View style={item.from === 'me' ? styles.me : styles.bot}>
            {item.attachment ? (
              <View style={styles.attached}>
                <IconFile color={C.accentSoft} size={15} />
                <Text style={styles.attachedName} numberOfLines={1}>{item.attachment}</Text>
              </View>
            ) : null}
            {item.text ? <Text style={styles.msg}>{item.text}</Text> : null}
          </View>
        )}
      />

      {tray ? (
        <View style={styles.tray}>
          <TrayBtn label="Galería" onPress={() => attach('galeria')} />
          {Platform.OS !== 'web' ? <TrayBtn label="Cámara" onPress={() => attach('camara')} /> : null}
          <TrayBtn label="Archivo" onPress={() => attach('archivo')} />
        </View>
      ) : null}

      {attachment ? (
        <View style={styles.preview}>
          {attachment.mimeType.startsWith('image/') ? (
            <Image source={{ uri: attachment.uri }} style={styles.thumb} contentFit="cover" />
          ) : (
            <View style={[styles.thumb, styles.fileThumb]}>
              <Text style={styles.fileExt}>{(attachment.name.split('.').pop() ?? 'doc').slice(0, 4).toUpperCase()}</Text>
            </View>
          )}
          <Text style={styles.previewName} numberOfLines={1}>{attachment.name}</Text>
          <Pressable onPress={() => setAttachment(null)} hitSlop={10} style={styles.remove} accessibilityRole="button" accessibilityLabel="Quitar adjunto">
            <IconClose color={C.muted} />
          </Pressable>
        </View>
      ) : null}

      <View style={[styles.inputBar, listening && styles.inputBarListening]}>
        <Pressable
          onPress={() => setTray(!tray)}
          style={styles.iconBtn}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="Adjuntar foto o archivo"
          accessibilityState={{ expanded: tray }}>
          <IconClip color={tray ? C.accentSoft : C.muted} />
        </Pressable>
        <TextInput
          value={input}
          onChangeText={setInput}
          onSubmitEditing={submit}
          placeholder={listening ? 'Te escucho…' : 'Escríbele a DESJ…'}
          placeholderTextColor={listening ? C.ok : C.muted}
          style={styles.input}
          returnKeyType="send"
        />
        {canSend && !listening ? (
          <Pressable onPress={submit} style={styles.send} accessibilityLabel="Enviar">
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={C.onAccent} strokeWidth={2.2} strokeLinecap="round">
              <Path d="M5 12h14" />
              <Path d="M13 6l6 6-6 6" />
            </Svg>
          </Pressable>
        ) : (
          <Pressable
            onPress={toggleMic}
            style={[styles.send, listening ? { backgroundColor: C.bad } : styles.mic]}
            accessibilityRole="button"
            accessibilityLabel={listening ? 'Dejar de dictar' : 'Dictar por voz'}>
            {listening ? <IconStop color={C.onAccent} /> : <IconMic color={C.accentSoft} />}
          </Pressable>
        )}
      </View>

      <ChatHistory visible={history} onClose={() => setHistory(false)} />
    </View>
  );
}

function TrayBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.trayBtn} accessibilityRole="button">
      <Text style={styles.trayText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { color: C.text, fontSize: 14.5, fontWeight: '600' },
  btn: { minHeight: 34, minWidth: 34, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: C.cardBorder },
  me: { alignSelf: 'flex-end', maxWidth: '82%', backgroundColor: C.bubbleMe, borderRadius: 16, borderBottomRightRadius: 4, padding: 12 },
  bot: { alignSelf: 'flex-start', maxWidth: '86%', backgroundColor: C.surfaceInput, borderColor: C.cardBorder, borderWidth: 1, borderRadius: 16, borderBottomLeftRadius: 4, padding: 12 },
  msg: { color: C.text, fontSize: 15, lineHeight: 21 },
  inputBar: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.surfaceInput, borderColor: C.cardBorder, borderWidth: 1, borderRadius: 28, padding: 6 },
  inputBarListening: { borderColor: C.ok },
  iconBtn: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  mic: { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.border },
  tray: { flexDirection: 'row', gap: 8 },
  trayBtn: { minHeight: 40, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceInput, justifyContent: 'center' },
  trayText: { color: C.text, fontSize: 14 },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: 14, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.card },
  thumb: { width: 40, height: 40, borderRadius: 8 },
  fileThumb: { backgroundColor: C.surfaceThumb, alignItems: 'center', justifyContent: 'center' },
  fileExt: { color: C.accentSoft, fontSize: 10, fontWeight: '700' },
  previewName: { flex: 1, color: C.text, fontSize: 14 },
  remove: { paddingHorizontal: 6 },
  attached: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  attachedName: { color: C.accentSoft, fontSize: 13.5, flexShrink: 1 },
  input: { flex: 1, color: C.text, fontSize: 15, minHeight: 40 },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
});
