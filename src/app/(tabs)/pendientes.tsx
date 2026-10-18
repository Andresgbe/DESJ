// Pantalla · Pendientes: tareas por hacer, agrupadas por fecha. DESJ también las maneja desde el chat.
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { IconClose } from '@/components/icons';
import { Card, Label, Row, Screen, Title } from '@/components/ui';
import { confirm } from '@/lib/confirm';
import { today } from '@/lib/store';
import { Task, useTasks } from '@/lib/tasks';
import { C } from '@/theme';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return isoDay(d);
};
const shortDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}${y !== new Date().getFullYear() ? ` ${y}` : ''}`;
};

export default function Pendientes() {
  const { ready, tasks, reload, add, toggle, remove } = useTasks();
  const [title, setTitle] = useState('');
  const [due, setDue] = useState<'none' | 'today' | 'tomorrow'>('none');
  const [showDone, setShowDone] = useState(false);

  // Al volver a la pestaña (p. ej. después de pedirle algo a DESJ) se recarga.
  useFocusEffect(useCallback(() => void reload(), [reload]));

  const t0 = today();
  const open = tasks.filter((t) => !t.done);
  const byDue = (a: Task, b: Task) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '') || a.createdAt.localeCompare(b.createdAt);
  const groups = [
    { title: 'Atrasados', color: C.bad, items: open.filter((t) => t.dueDate && t.dueDate < t0).sort(byDue) },
    { title: 'Hoy', color: C.accentSoft, items: open.filter((t) => t.dueDate === t0).sort(byDue) },
    { title: 'Próximos', color: C.accentSoft, items: open.filter((t) => t.dueDate && t.dueDate > t0).sort(byDue) },
    { title: 'Sin fecha', color: C.muted, items: open.filter((t) => !t.dueDate).sort(byDue) },
  ].filter((g) => g.items.length);
  const done = tasks.filter((t) => t.done).sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''));

  const submit = async () => {
    if (!title.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await add(title, due === 'today' ? t0 : due === 'tomorrow' ? tomorrow() : null);
    setTitle('');
    setDue('none');
  };

  const check = (t: Task) => {
    if (!t.done) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    toggle(t.id);
  };

  const askRemove = async (t: Task) => {
    if (await confirm('Quitar pendiente', `¿Quitar "${t.title}"?`, 'Quitar')) remove(t.id);
  };

  return (
    <Screen module="Módulo 05 · Pendientes">
      <View style={{ gap: 2 }}>
        <Title accent="pendientes">Tus</Title>
        <Label>{open.length === 0 ? 'Nada por hacer' : `${open.length} por hacer`}</Label>
      </View>

      <Card>
        <TextInput
          value={title}
          onChangeText={setTitle}
          onSubmitEditing={submit}
          placeholder="Agregar pendiente…"
          placeholderTextColor={C.muted}
          style={styles.input}
          returnKeyType="done"
        />
        <Row>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <DueChip label="Sin fecha" active={due === 'none'} onPress={() => setDue('none')} />
            <DueChip label="Hoy" active={due === 'today'} onPress={() => setDue('today')} />
            <DueChip label="Mañana" active={due === 'tomorrow'} onPress={() => setDue('tomorrow')} />
          </View>
          <Pressable onPress={submit} disabled={!title.trim()} style={[styles.addBtn, !title.trim() && { opacity: 0.4 }]} accessibilityRole="button" accessibilityLabel="Agregar pendiente">
            <Text style={styles.addText}>Agregar</Text>
          </Pressable>
        </Row>
      </Card>

      {ready && open.length === 0 ? (
        <Text style={styles.empty}>Todo al día. {'También puedes decirle a DESJ: «anótame llamar al notario el martes».'}</Text>
      ) : null}

      {groups.map((g) => (
        <View key={g.title} style={{ gap: 6 }}>
          <Label style={{ color: g.color }}>{`${g.title} · ${g.items.length}`}</Label>
          <Card style={{ paddingVertical: 4, gap: 0 }}>
            {g.items.map((t, i) => (
              <TaskRow key={t.id} task={t} first={i === 0} onCheck={() => check(t)} onRemove={() => askRemove(t)} overdue={g.title === 'Atrasados'} />
            ))}
          </Card>
        </View>
      ))}

      {done.length ? (
        <View style={{ gap: 6 }}>
          <Pressable onPress={() => setShowDone(!showDone)} hitSlop={8} accessibilityRole="button" accessibilityState={{ expanded: showDone }}>
            <Label>{`${showDone ? '▾' : '▸'} Hechos · ${done.length}`}</Label>
          </Pressable>
          {showDone ? (
            <Card style={{ paddingVertical: 4, gap: 0 }}>
              {done.map((t, i) => (
                <TaskRow key={t.id} task={t} first={i === 0} onCheck={() => check(t)} onRemove={() => askRemove(t)} />
              ))}
            </Card>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

function TaskRow({ task, first, overdue, onCheck, onRemove }: { task: Task; first: boolean; overdue?: boolean; onCheck: () => void; onRemove: () => void }) {
  return (
    <View style={[styles.row, !first && styles.rowBorder]}>
      <Pressable onPress={onCheck} hitSlop={6} style={styles.check} accessibilityRole="checkbox" accessibilityState={{ checked: task.done }} accessibilityLabel={task.title}>
        <Svg width={22} height={22} viewBox="0 0 24 24">
          <Circle cx={12} cy={12} r={10} stroke={task.done ? C.ok : C.border} strokeWidth={1.8} fill={task.done ? 'rgba(110,231,183,0.15)' : 'none'} />
          {task.done ? <Path d="M7.5 12.5l3 3 6-6.5" stroke={C.ok} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
        </Svg>
      </Pressable>
      <Pressable onPress={onCheck} onLongPress={onRemove} style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.title, task.done && styles.titleDone]}>{task.title}</Text>
        {task.dueDate && !task.done ? <Text style={[styles.due, overdue && { color: C.bad }]}>{shortDate(task.dueDate)}</Text> : null}
      </Pressable>
      <Pressable onPress={onRemove} hitSlop={8} style={styles.remove} accessibilityRole="button" accessibilityLabel={`Quitar ${task.title}`}>
        <IconClose color={C.muted} size={15} />
      </Pressable>
    </View>
  );
}

function DueChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]} accessibilityRole="button" accessibilityState={{ selected: active }}>
      <Text style={[styles.chipText, active && { color: C.onAccent }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  input: { color: C.text, fontSize: 15.5, minHeight: 44, borderBottomWidth: 1, borderBottomColor: C.cardBorder },
  chip: { minHeight: 34, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: C.cardBorder, justifyContent: 'center' },
  chipActive: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { color: C.text, fontSize: 13 },
  addBtn: { minHeight: 36, paddingHorizontal: 14, borderRadius: 10, backgroundColor: C.accent, justifyContent: 'center' },
  addText: { color: C.onAccent, fontWeight: '700', fontSize: 14 },
  empty: { color: C.muted, fontSize: 13.5, textAlign: 'center', marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingVertical: 6 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.cardBorder },
  check: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { color: C.text, fontSize: 15 },
  titleDone: { color: C.muted, textDecorationLine: 'line-through' },
  due: { color: C.muted, fontSize: 12 },
  remove: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
});
