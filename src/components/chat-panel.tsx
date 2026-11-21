// Conversación con DESJ: texto, adjuntos (hasta 5 fotos / archivos por mensaje), dictado por voz y respuesta en voz. Vive en el Núcleo;
// el historial y la conversación nueva están arriba a la derecha del Núcleo, y la voz en el menú hamburguesa (chat-menu.tsx).
// Si el worker está apagado, tus mensajes quedan "en cola" y una franja sobre la barra ofrece "Reintentar conexión".
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, NativeSyntheticEvent, Platform, Pressable, StyleSheet, TextInput as RNTextInput, TextInputKeyPressEventData, TextStyle, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Text, TextInput } from '@/components/text';
import { IconClip, IconClose, IconFile, IconMic, IconRetry, IconStop } from '@/components/icons';
import { Label } from '@/components/ui';
import { Attachment, MAX_FILES, MAX_TOTAL, pickAttachments } from '@/lib/attachments';
import { ChatMsg, useChats } from '@/lib/chats';
import { dictationAvailable, startDictation } from '@/lib/dictation';
import { C, R } from '@/theme';

/** Lo que hace la conversación en este momento (el prisma del Núcleo cambia de color con esto). */
export type ChatActivity = 'listening' | 'responding' | null;

/** Cuánto dura el estado "respondiendo" cuando la respuesta no se lee en voz alta. */
const REPLY_FLASH = 1500;

/**
 * `voice`: leer en voz alta las respuestas (se cambia desde el menú hamburguesa).
 * `onActivity`: avisa si DESJ te está escuchando (dictado) o respondiendo (leyendo la respuesta).
 */
export function ChatPanel({ voice, onActivity }: { voice: boolean; onActivity?: (a: ChatActivity) => void }) {
  const { messages, busy, send } = useChats();
  const [input, setInput] = useState('');
  const [files, setFiles] = useState<Attachment[]>([]);
  const [tray, setTray] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const flash = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopListening = useRef<(() => void) | null>(null);
  const list = useRef<FlatList<ChatMsg>>(null);
  // El chat se queda pegado abajo mientras la persona no suba a leer mensajes viejos.
  const stick = useRef(true);
  const lastCount = useRef(0);
  const toEnd = (animated: boolean) => requestAnimationFrame(() => list.current?.scrollToEnd({ animated }));
  const field = useRef<RNTextInput>(null);
  const [focused, setFocused] = useState(false);

  // En web el campo (un <textarea>) crece con el texto hasta INPUT_MAX y después hace scroll.
  // En el teléfono el TextInput multilínea ya crece solo hasta su maxHeight.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const el = field.current as unknown as HTMLTextAreaElement | null;
    if (!el?.style) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(Math.max(el.scrollHeight, INPUT_MIN), INPUT_MAX)}px`;
  }, [input]);

  const canSend = Boolean(input.trim() || files.length);

  useEffect(() => {
    onActivity?.(listening ? 'listening' : speaking ? 'responding' : null);
  }, [listening, speaking, onActivity]);

  // Al cerrar la conversación el prisma vuelve a reposo.
  useEffect(
    () => () => {
      if (flash.current) clearTimeout(flash.current);
      onActivity?.(null);
    },
    [onActivity],
  );

  // Teclado de computadora: Enter envía y Shift+Enter baja a otra línea. En el iPhone la tecla de
  // retorno siempre baja de línea y se envía con el botón, como en las apps de mensajes.
  const onKey = (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (Platform.OS !== 'web') return;
    const key = e.nativeEvent as TextInputKeyPressEventData & { shiftKey?: boolean; isComposing?: boolean };
    if (key.key === 'Enter' && !key.shiftKey && !key.isComposing) {
      e.preventDefault();
      submit();
    }
  };

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
    if (!reply) return;
    if (flash.current) clearTimeout(flash.current);
    setSpeaking(true);
    if (voice) {
      // Al cortar la lectura (Speech.stop: voz apagada, dictado, cerrar el chat) también vuelve a reposo.
      const done = () => setSpeaking(false);
      Speech.speak(reply, { language: 'es-ES', rate: 1.0, onDone: done, onStopped: done, onError: done });
    } else {
      flash.current = setTimeout(() => setSpeaking(false), REPLY_FLASH);
    }
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
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          stick.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 80;
        }}
        scrollEventThrottle={100}
        // Mensaje nuevo (tuyo o de DESJ): siempre baja. Otros cambios de tamaño: solo si ya estabas abajo.
        onContentSizeChange={() => {
          const grew = messages.length > lastCount.current;
          lastCount.current = messages.length;
          if (grew || stick.current) {
            stick.current = true;
            toEnd(true);
          }
        }}
        // Si el área del chat cambia de alto (aparece la barra de reintento, el teclado, adjuntos), se mantiene el último mensaje a la vista.
        onLayout={() => {
          if (stick.current) toEnd(false);
        }}
        renderItem={({ item }) => (
          <View style={item.from === 'me' ? styles.meWrap : undefined}>
            <View style={item.from === 'me' ? styles.me : styles.bot}>
              {item.attachments?.map((name, i) => (
                <View key={`${name}${i}`} style={styles.attached}>
                  <IconFile color={C.accentSoft} size={15} />
                  <Text style={styles.attachedName} numberOfLines={1}>{name}</Text>
                </View>
              ))}
              {item.text ? <Text style={styles.msg}>{item.text}</Text> : null}
            </View>
            {item.status ? (
              <Label style={[styles.status, { color: item.status === 'error' ? C.bad : C.warn }]}>{item.status === 'error' ? '● Sin respuesta' : '● En cola'}</Label>
            ) : null}
          </View>
        )}
      />

      <QueueBar />

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

      <View style={[styles.inputBar, focused && styles.inputBarFocused, listening && styles.inputBarListening]}>
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
          ref={field}
          multiline
          onKeyPress={onKey}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={listening ? 'Te escucho…' : 'Escríbele a DESJ…'}
          placeholderTextColor={listening ? C.ok : C.muted}
          style={[styles.input, NO_FOCUS_RING]}
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

/** Franja sobre la barra del chat: cuántos mensajes esperan al worker y el botón "Reintentar conexión". */
function QueueBar() {
  const { unanswered, retrying, retry } = useChats();
  const [note, setNote] = useState<{ text: string; tone: 'ok' | 'warn' | 'bad' } | null>(null);

  // El resultado del reintento se muestra unos segundos y se va solo.
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 8000);
    return () => clearTimeout(t);
  }, [note]);

  if (!retrying && !unanswered && !note) return null;

  const press = async () => {
    setNote(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const res = await retry();
    if (!res) return;
    if (res.error) return setNote({ text: res.error, tone: 'bad' });
    if (!res.online) {
      return setNote({ text: `DESJ sigue desconectado (el computador que lo atiende está apagado). ${res.total === 1 ? 'Tu mensaje sigue' : `Tus ${res.total} mensajes siguen`} en cola.`, tone: 'warn' });
    }
    const pending = res.total - res.answered - res.failed;
    const parts = [
      res.answered ? `DESJ respondió ${res.answered === 1 ? '1 mensaje' : `${res.answered} mensajes`}` : '',
      res.failed ? `${res.failed} no se ${res.failed === 1 ? 'pudo' : 'pudieron'} responder${res.reason ? ` (${res.reason.replace(/\.$/, '')})` : ''}` : '',
      pending ? `${pending} ${pending === 1 ? 'sigue' : 'siguen'} en cola` : '',
    ].filter(Boolean);
    setNote({ text: `${parts.join(' · ') || 'Listo'}.`, tone: res.failed || pending ? 'warn' : 'ok' });
  };

  const done = retrying ? retrying.answered + retrying.failed : 0;
  const text = retrying
    ? done
      ? `Conectado. DESJ va ${done} de ${retrying.total}…`
      : 'Conectando con DESJ…'
    : (note?.text ?? `${unanswered === 1 ? '1 mensaje' : `${unanswered} mensajes`} sin respuesta: DESJ estaba desconectado.`);
  const dot = retrying ? C.accentSoft : note ? C[note.tone] : C.warn;

  return (
    <View style={styles.queue} accessibilityLiveRegion="polite">
      <Text style={styles.queueText}>
        <Text style={{ color: dot }}>● </Text>
        {text}
      </Text>
      {unanswered || retrying ? (
        <Pressable
          onPress={press}
          disabled={Boolean(retrying)}
          style={({ pressed }) => [styles.retry, pressed && { backgroundColor: C.surfaceSelected }, retrying && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityState={{ busy: Boolean(retrying) }}>
          <IconRetry color={C.accentSoft} size={16} />
          <Text style={styles.retryText}>{retrying ? 'Reintentando…' : 'Reintentar conexión'}</Text>
        </Pressable>
      ) : null}
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

const INPUT_MIN = 44; // una línea, alineada con los botones de la barra
const INPUT_MAX = 140; // unas 6 líneas; de ahí en adelante el campo hace scroll
// Chrome dibuja su anillo de foco con outline-style "auto", que ignora outlineWidth: 0. "none" es válido en
// react-native-web aunque los tipos de React Native no lo incluyan.
const NO_FOCUS_RING = (Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) as TextStyle;

const styles = StyleSheet.create({
  meWrap: { alignItems: 'flex-end', gap: 4 },
  status: { fontSize: 10, marginRight: 4 },
  queue: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: R.card, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.card },
  queueText: { flex: 1, minWidth: 180, color: C.text, fontSize: 13.5, lineHeight: 19 },
  retry: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: R.pill, borderWidth: 1, borderColor: C.border },
  retryText: { color: C.accentSoft, fontSize: 14, fontWeight: '600' },
  me: { alignSelf: 'flex-end', maxWidth: '82%', backgroundColor: C.bubbleMe, borderRadius: 16, borderBottomRightRadius: 4, padding: 12 },
  bot: { alignSelf: 'flex-start', maxWidth: '86%', backgroundColor: C.surfaceInput, borderColor: C.cardBorder, borderWidth: 1, borderRadius: 16, borderBottomLeftRadius: 4, padding: 12 },
  msg: { color: C.text, fontSize: 15, lineHeight: 21 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, backgroundColor: C.surfaceInput, borderColor: C.cardBorder, borderWidth: 1, borderRadius: 28, padding: 6 },
  inputBarFocused: { borderColor: C.border },
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
  // El foco se marca en el borde de la barra (inputBarFocused), no con el recuadro del navegador.
  input: { flex: 1, color: C.text, fontSize: 15, lineHeight: 20, minHeight: INPUT_MIN, maxHeight: INPUT_MAX, paddingTop: 12, paddingBottom: 12, textAlignVertical: 'top' },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
});
