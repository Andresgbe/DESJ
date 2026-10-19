// Menú hamburguesa del Núcleo: la conversación actual, el historial, empezar una nueva y la
// respuesta en voz. Se despliega bajo el botón, igual que el menú de perfil.
import { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut } from 'react-native-reanimated';

import { IconMenu } from '@/components/icons';
import { Label } from '@/components/ui';
import { useChats } from '@/lib/chats';
import { C } from '@/theme';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

/** `onNew` avisa que se empezó una conversación; `onBack` (solo con el chat abierto) vuelve a la pantalla de solo DESJ. */
export function ChatMenu({
  voice,
  onVoice,
  onHistory,
  onNew,
  onBack,
}: {
  voice: boolean;
  onVoice: (on: boolean) => void;
  onHistory: () => void;
  onNew?: () => void;
  onBack?: () => void;
}) {
  const { conversations, activeId, busy, newChat } = useChats();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 60, right: 16 });
  const { width } = useWindowDimensions();
  const btn = useRef<View>(null);
  const title = conversations.find((c) => c.id === activeId)?.title ?? 'Nueva conversación';

  const show = () => {
    // En web el contenido es una columna centrada: el menú se alinea con el botón, no con la ventana.
    btn.current?.measureInWindow((x, y, w, h) => setPos({ top: y + h + 8, right: Math.max(16, width - x - w) }));
    setOpen(true);
  };

  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <>
      <Pressable ref={btn} onPress={show} hitSlop={8} style={styles.btn} accessibilityRole="button" accessibilityLabel="Abrir menú de la conversación" accessibilityState={{ expanded: open }}>
        <IconMenu color={C.accentSoft} size={20} />
      </Pressable>

      <Modal visible={open} transparent animationType="none" onRequestClose={() => setOpen(false)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} accessibilityLabel="Cerrar menú" />
        <Animated.View entering={FadeIn.duration(160).easing(EASE_OUT)} exiting={FadeOut.duration(120)} style={[styles.menu, pos]}>
          <View style={styles.head}>
            <Label style={{ color: busy ? C.ok : C.muted }}>{busy ? '● DESJ pensando…' : 'Conversación'}</Label>
            <Text style={styles.title} numberOfLines={2}>{title}</Text>
          </View>

          <Item title="Historial" sub="Tus conversaciones anteriores" onPress={run(onHistory)} />
          <Item title="Nueva conversación" sub={busy ? 'Espera a que DESJ termine' : 'Empieza desde cero'} disabled={busy} onPress={run(() => {
              newChat();
              onNew?.();
            })}
          />
          <Item
            title="Respuesta en voz"
            sub={voice ? 'Activada: DESJ te lee sus respuestas' : 'Desactivada: solo texto'}
            state={voice ? 'ON' : 'OFF'}
            role="switch"
            checked={voice}
            onPress={run(() => onVoice(!voice))}
          />
          {onBack ? <Item title="Volver a DESJ" sub="Ocultar la conversación" onPress={run(onBack)} /> : null}
        </Animated.View>
      </Modal>
    </>
  );
}

function Item({
  title,
  sub,
  state,
  disabled,
  role = 'menuitem',
  checked,
  onPress,
}: {
  title: string;
  sub?: string;
  state?: string;
  disabled?: boolean;
  role?: 'menuitem' | 'switch';
  checked?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.item, pressed && { backgroundColor: C.surfaceSelected }, disabled && { opacity: 0.5 }]}
      accessibilityRole={role}
      accessibilityState={{ disabled, checked }}>
      <View style={{ flex: 1 }}>
        <Text style={styles.itemTitle}>{title}</Text>
        {sub ? <Text style={styles.sub}>{sub}</Text> : null}
      </View>
      {state ? <Label style={{ color: checked ? C.accentSoft : C.muted }}>{state}</Label> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { width: 32, height: 32, borderRadius: 10, borderWidth: 1, borderColor: C.cardBorder, alignItems: 'center', justifyContent: 'center' },
  menu: {
    position: 'absolute',
    width: 280,
    backgroundColor: C.card,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 6,
    boxShadow: '0 8px 20px rgba(0,0,0,0.5)',
  },
  head: { gap: 2, padding: 10, borderBottomWidth: 1, borderBottomColor: C.cardBorder, marginBottom: 4 },
  title: { color: C.text, fontSize: 15, fontWeight: '700' },
  item: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, borderRadius: 10 },
  itemTitle: { color: C.text, fontSize: 15 },
  sub: { color: C.muted, fontSize: 12 },
});
