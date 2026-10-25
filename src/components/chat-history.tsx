// Historial de conversaciones: hoja que sube desde abajo, agrupada por fecha. Cada una se abre, se renombra o se borra.
import { useState } from 'react';
import { Modal, Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Label } from '@/components/ui';
import { Conversation, useChats } from '@/lib/chats';
import { confirm, notify } from '@/lib/confirm';
import { hhmm } from '@/lib/store';
import { C, mono } from '@/theme';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function groupByDate(list: Conversation[]) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const day = 86_400_000;
  const groups: { title: string; data: Conversation[] }[] = [
    { title: 'Hoy', data: [] },
    { title: 'Ayer', data: [] },
    { title: 'Últimos 7 días', data: [] },
    { title: 'Anteriores', data: [] },
  ];
  for (const c of list) {
    const t = new Date(c.updatedAt).getTime();
    const i = t >= start.getTime() ? 0 : t >= start.getTime() - day ? 1 : t >= start.getTime() - 7 * day ? 2 : 3;
    groups[i].data.push(c);
  }
  return groups.filter((g) => g.data.length);
}

function when(iso: string) {
  const d = new Date(iso);
  const isToday = d.toDateString() === new Date().toDateString();
  return isToday ? hhmm(d.getHours(), d.getMinutes()) : `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function ChatHistory({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { conversations, activeId, open, newChat, remove, rename } = useChats();
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);

  const saveName = async () => {
    if (!renaming) return;
    const ok = await rename(renaming.id, renaming.title);
    if (!ok) notify('No pude cambiar el nombre. Revisa tu conexión.');
    setRenaming(null);
  };

  const pick = (id: string) => {
    open(id);
    onClose();
  };

  const startNew = () => {
    newChat();
    onClose();
  };

  const askRemove = async (c: Conversation) => {
    if (await confirm('Borrar conversación', `"${c.title}" se borrará para siempre. Lo que DESJ guardó en su memoria se mantiene.`, 'Borrar')) {
      remove(c.id);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose} transparent={false}>
      <SafeAreaView style={styles.sheet} edges={['top', 'bottom']}>
        <View style={styles.head}>
          <Text style={styles.title}>Historial</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Cerrar historial">
            <Text style={styles.close}>Cerrar</Text>
          </Pressable>
        </View>

        <Pressable onPress={startNew} style={styles.newBtn} accessibilityRole="button">
          <Text style={styles.newText}>＋ Nueva conversación</Text>
        </Pressable>

        <SectionList
          sections={groupByDate(conversations)}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingBottom: 24 }}
          stickySectionHeadersEnabled={false}
          ListEmptyComponent={<Text style={styles.empty}>Todavía no hay conversaciones. Escríbele a DESJ y aparecerán aquí.</Text>}
          renderSectionHeader={({ section }) => <Label style={styles.section}>{section.title}</Label>}
          renderItem={({ item }) => {
            const active = item.id === activeId;
            if (renaming?.id === item.id) {
              return (
                <View style={[styles.row, styles.rowActive, { paddingHorizontal: 8, gap: 6 }]}>
                  <TextInput
                    value={renaming.title}
                    onChangeText={(title) => setRenaming({ id: item.id, title })}
                    onSubmitEditing={saveName}
                    autoFocus
                    maxLength={120}
                    selectTextOnFocus
                    style={styles.input}
                    accessibilityLabel="Nuevo nombre de la conversación"
                  />
                  <Pressable onPress={saveName} hitSlop={8} style={styles.del} accessibilityRole="button">
                    <Text style={styles.save}>Guardar</Text>
                  </Pressable>
                  <Pressable onPress={() => setRenaming(null)} hitSlop={8} style={styles.del} accessibilityRole="button">
                    <Text style={styles.rowWhen}>Cancelar</Text>
                  </Pressable>
                </View>
              );
            }
            return (
              <View style={[styles.row, active && styles.rowActive]}>
                <Pressable onPress={() => pick(item.id)} style={styles.rowMain} accessibilityRole="button" accessibilityState={{ selected: active }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.rowWhen}>{when(item.updatedAt)}</Text>
                </Pressable>
                <Pressable onPress={() => setRenaming({ id: item.id, title: item.title })} hitSlop={8} style={styles.del} accessibilityRole="button" accessibilityLabel={`Renombrar ${item.title}`}>
                  <Text style={styles.renameText}>Renombrar</Text>
                </Pressable>
                <Pressable onPress={() => askRemove(item)} hitSlop={8} style={styles.del} accessibilityRole="button" accessibilityLabel={`Borrar ${item.title}`}>
                  <Text style={styles.delText}>Borrar</Text>
                </Pressable>
              </View>
            );
          }}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 16, width: '100%', maxWidth: 640, alignSelf: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14 },
  title: { color: C.text, fontSize: 22, fontWeight: '800' },
  close: { color: C.accentSoft, fontSize: 15 },
  newBtn: { minHeight: 48, borderRadius: 14, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  newText: { color: C.onAccent, fontSize: 15, fontWeight: '700' },
  section: { marginTop: 16, marginBottom: 6 },
  empty: { color: C.muted, fontSize: 14, textAlign: 'center', marginTop: 32 },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: 'transparent', marginBottom: 4 },
  rowActive: { backgroundColor: C.card, borderColor: C.cardBorder },
  rowMain: { flex: 1, minHeight: 52, justifyContent: 'center', paddingHorizontal: 12, gap: 2 },
  rowTitle: { color: C.text, fontSize: 15 },
  rowWhen: { color: C.muted, fontFamily: mono, fontSize: 11 },
  del: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
  delText: { color: C.bad, fontSize: 13 },
  renameText: { color: C.accentSoft, fontSize: 13 },
  save: { color: C.accentSoft, fontSize: 13, fontWeight: '700' },
  input: { flex: 1, color: C.text, fontSize: 15, minHeight: 44, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 10, backgroundColor: C.surfaceSunken },
});
