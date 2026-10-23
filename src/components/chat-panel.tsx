// Conversación con DESJ: texto, adjuntos (hasta 5 fotos / archivos por mensaje), dictado por voz y respuesta en voz. Vive en el Núcleo;
// el historial, la conversación nueva y la voz están en el menú hamburguesa (chat-menu.tsx).
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { Image } from 'expo-image';
import { useRef, useState } from 'react';
import { Alert, FlatList, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { IconClip, IconClose, IconFile, IconMic, IconStop } from '@/components/icons';
import { Attachment, MAX_FILES, MAX_TOTAL, pickAttachments } from '@/lib/attachments';
import { ChatMsg, useChats } from '@/lib/chats';
import { dictationAvailable, startDictation } from '@/lib/dictation';
import { C } from '@/theme';

/** `voice`: leer en voz alta las respuestas (se cambia desde el menú hamburguesa). */
export function ChatPanel({ voice }: { voice: boolean }) {
  const { messages, busy, send } = useChats();
  const [input, setInput] = useState('');
  const [files, setFiles] = useState<Attachment[]>([]);
  const [tray, setTray] = useState(false);
  const [listening, setListening] = useState(false);
  const stopListening = useRef<(() => void) | null>(null);
  const list = useRef<FlatList<ChatMsg>>(null);

  const canSend = Boolean(input.trim() || files.length);

  const notify = (msg: string) => (Platform.OS === 'web' ? window.alert(msg) : Alert.alert('DESJ', msg));

  const submit = async () => {
    const text = input.trim();
    if (!canSend || busy) return;
    stopListening.current?.();
    const sending = files;
    setInput('');
    setFiles([]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const reply = await send(text, sending);
    if (reply && voice) Speech.speak(reply, { language: 'es-ES', rate: 1.0 });
  };

  const attach = async (source: 'galeria' | 'camara' | 'archivo') => {
    setTray(false);
    const room = MAX_FILES - files.length;
    if (room <= 0) return notify(`Puedes adjuntar hasta ${MAX_FILES} archivos por mensaje.`);
    try {
      const picked = await pickAttachments(source, room);
      const total = [...files, ...picked].reduce((sum, f) => sum + (f.size ?? 0), 0);
      if (total > MAX_TOTAL) return notify('Entre todos los archivos pasan de 18 MB. Envíalos en dos mensajes.');
      if (picked.length) setFiles((list) => [...list, ...picked].slice(0, MAX_FILES));
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
            {item.attachments?.map((name, i) => (
              <View key={`${name}${i}`} style={styles.attached}>
                <IconFile color={C.accentSoft} size={15} />
                <Text style={styles.attachedName} numberOfLines={1}>{name}</Text>
              </View>
            ))}
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

      {files.map((f, i) => (
        <View key={`${f.uri}${i}`} style={styles.preview}>
          {f.mimeType.startsWith('image/') ? (
            <Image source={{ uri: f.uri }} style={styles.thumb} contentFit="cover" />
          ) : (
            <View style={[styles.thumb, styles.fileThumb]}>
              <Text style={styles.fileExt}>{(f.name.split('.').pop() ?? 'doc').slice(0, 4).toUpperCase()}</Text>
            </View>
          )}
          <Text style={styles.previewName} numberOfLines={1}>{files.length > 1 ? `${i + 1}. ${f.name}` : f.name}</Text>
          <Pressable onPress={() => setFiles((list) => list.filter((_, j) => j !== i))} hitSlop={10} style={styles.remove} accessibilityRole="button" accessibilityLabel={`Quitar ${f.name}`}>
            <IconClose color={C.muted} />
          </Pressable>
        </View>
      ))}

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
