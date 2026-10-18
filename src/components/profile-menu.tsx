// Círculo de perfil del header: al tocarlo se despliega el menú (Conocimiento, Ajustes, Cerrar sesión).
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { useAuth } from '@/lib/auth';
import { C, mono } from '@/theme';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

function initials(name: string, email?: string | null) {
  const src = name.trim() || email?.split('@')[0] || '';
  const parts = src.split(/[\s._-]+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
}

export function ProfileButton() {
  const { session, name, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [top, setTop] = useState(60);
  const btn = useRef<View>(null);
  const letters = initials(name, session?.user.email);

  const show = () => {
    btn.current?.measureInWindow((_x, y, _w, h) => setTop(y + h + 8));
    setOpen(true);
  };

  const go = (path: '/conocimiento' | '/ajustes') => {
    setOpen(false);
    router.push(path);
  };

  return (
    <>
      <Pressable ref={btn} onPress={show} hitSlop={8} style={styles.avatar} accessibilityRole="button" accessibilityLabel="Abrir menú de perfil" accessibilityState={{ expanded: open }}>
        {letters ? <Text style={styles.letters}>{letters}</Text> : <UserIcon />}
      </Pressable>

      <Modal visible={open} transparent animationType="none" onRequestClose={() => setOpen(false)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} accessibilityLabel="Cerrar menú" />
        <Animated.View entering={FadeIn.duration(160).easing(EASE_OUT)} exiting={FadeOut.duration(120)} style={[styles.menu, { top }]}>
          <View style={styles.who}>
            <View style={[styles.avatar, styles.avatarBig]}>
              {letters ? <Text style={[styles.letters, { fontSize: 15 }]}>{letters}</Text> : <UserIcon />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>{name || 'Tu perfil'}</Text>
              <Text style={styles.sub} numberOfLines={1}>{session?.user.email ?? 'Modo local · este teléfono'}</Text>
            </View>
          </View>

          <MenuItem title="Conocimiento" sub="Lo que DESJ sabe de ti" onPress={() => go('/conocimiento')} />
          <MenuItem title="Ajustes" sub="Cuenta, permisos y versión" onPress={() => go('/ajustes')} />
          {session ? (
            <MenuItem
              title="Cerrar sesión"
              danger
              onPress={() => {
                setOpen(false);
                signOut();
              }}
            />
          ) : null}
        </Animated.View>
      </Modal>
    </>
  );
}

function MenuItem({ title, sub, danger, onPress }: { title: string; sub?: string; danger?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.item, pressed && { backgroundColor: C.surfaceSelected }]} accessibilityRole="menuitem">
      <Text style={[styles.itemTitle, danger && { color: C.bad }]}>{title}</Text>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
    </Pressable>
  );
}

function UserIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={C.accentSoft} strokeWidth={2} strokeLinecap="round">
      <Circle cx={12} cy={8} r={4} />
      <Path d="M4 21a8 8 0 0 1 16 0" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: C.accent, backgroundColor: C.surfaceAvatar, alignItems: 'center', justifyContent: 'center' },
  avatarBig: { width: 40, height: 40, borderRadius: 20 },
  letters: { color: C.accentText, fontFamily: mono, fontSize: 12, fontWeight: '700' },
  menu: {
    position: 'absolute',
    right: 16,
    width: 260,
    backgroundColor: C.card,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 6,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  who: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderBottomWidth: 1, borderBottomColor: C.cardBorder, marginBottom: 4 },
  name: { color: C.text, fontSize: 15, fontWeight: '700' },
  sub: { color: C.muted, fontSize: 12 },
  item: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 10 },
  itemTitle: { color: C.text, fontSize: 15 },
});
