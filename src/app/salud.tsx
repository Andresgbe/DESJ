// Pantalla 04 · Salud: plan de pastillas del día, recordatorios y agregar medicamentos.
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Card, HudRing, Label, Mono, Row, Screen, Title } from '@/components/ui';
import { hhmm, today, useStore } from '@/lib/store';
import { C } from '@/theme';

export default function Salud() {
  const { meds, taken, toggleTaken, addMed, removeMed, enableMedReminders } = useStore();
  const takenIds = taken[today()] ?? [];
  const done = meds.filter((m) => takenIds.includes(m.id)).length;
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const [time, setTime] = useState('');

  const save = () => {
    const t = time.match(/^(\d{1,2}):?(\d{2})?$/);
    if (!name.trim() || !t || Number(t[1]) > 23) {
      Alert.alert('Falta algo', 'Escribe el nombre y la hora en formato 24h, por ejemplo 08:00 o 21:30.');
      return;
    }
    addMed({ name: name.trim(), dose: dose.trim() || '1 dosis', hour: Number(t[1]), minute: Number(t[2] ?? 0) });
    setName(''); setDose(''); setTime(''); setAdding(false);
  };

  const reminders = async () => {
    const ok = await enableMedReminders();
    Alert.alert(ok ? 'Recordatorios activos' : 'Sin permiso', ok ? 'Te aviso todos los días a la hora de cada pastilla.' : 'Activa las notificaciones de Expo Go / DESJ en Ajustes del iPhone.');
  };

  return (
    <Screen module="Módulo 04 · Salud">
      <Row>
        <View style={{ gap: 2, flex: 1 }}>
          <Title accent="hoy">Tu plan de</Title>
          <Label>{`${done} de ${meds.length} tomadas`}</Label>
        </View>
        <HudRing size={110} big={`${meds.length ? Math.round((done / meds.length) * 100) : 0}%`} small="" progress={meds.length ? done / meds.length : 0} />
      </Row>

      {meds.map((m) => {
        const t = takenIds.includes(m.id);
        return (
          <Pressable key={m.id} onLongPress={() => Alert.alert('Eliminar', `¿Quitar ${m.name}?`, [{ text: 'Cancelar' }, { text: 'Quitar', style: 'destructive', onPress: () => removeMed(m.id) }])}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
              <Mono style={{ width: 52, fontSize: 15, fontWeight: '600', color: C.accentSoft }}>{hhmm(m.hour, m.minute)}</Mono>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{m.name}</Text>
                <Text style={styles.dose}>{m.dose}</Text>
              </View>
              <Pressable
                onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); toggleTaken(m.id); }}
                style={[styles.btn, t ? styles.btnDone : styles.btnTodo]}>
                <Text style={[styles.btnText, { color: t ? C.ok : C.onAccent }]}>{t ? '✓ Tomada' : 'Marcar'}</Text>
              </Pressable>
            </Card>
          </Pressable>
        );
      })}

      {adding ? (
        <Card glow>
          <Label style={{ color: C.accentSoft }}>Nuevo medicamento</Label>
          <TextInput style={styles.input} placeholder="Nombre (ej. Losartán)" placeholderTextColor={C.muted} value={name} onChangeText={setName} />
          <TextInput style={styles.input} placeholder="Dosis (ej. 50 mg con desayuno)" placeholderTextColor={C.muted} value={dose} onChangeText={setDose} />
          <TextInput style={styles.input} placeholder="Hora 24h (ej. 08:00)" placeholderTextColor={C.muted} value={time} onChangeText={setTime} keyboardType="numbers-and-punctuation" />
          <Row>
            <Pressable onPress={() => setAdding(false)} style={[styles.wide, styles.btnDone]}><Text style={[styles.btnText, { color: C.muted }]}>Cancelar</Text></Pressable>
            <Pressable onPress={save} style={[styles.wide, styles.btnTodo]}><Text style={[styles.btnText, { color: C.onAccent }]}>Guardar</Text></Pressable>
          </Row>
        </Card>
      ) : (
        <Pressable onPress={() => setAdding(true)} style={[styles.wide, styles.outline]}>
          <Text style={[styles.btnText, { color: '#E9DDFF' }]}>+ Agregar medicamento</Text>
        </Pressable>
      )}

      <Pressable onPress={reminders} style={[styles.wide, styles.btnTodo]}>
        <Text style={[styles.btnText, { color: C.onAccent }]}>Activar recordatorios diarios</Text>
      </Pressable>

      <Card>
        <Label>Próximamente</Label>
        <Text style={styles.dose}>Exámenes de sangre con lectura por IA · Garmin vía Apple Health</Text>
      </Card>
      <Text style={[styles.dose, { textAlign: 'center' }]}>Mantén presionado un medicamento para quitarlo.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  name: { color: C.text, fontSize: 15, fontWeight: '600' },
  dose: { color: C.muted, fontSize: 12.5 },
  btn: { minWidth: 92, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  btnTodo: { backgroundColor: C.accent },
  btnDone: { borderWidth: 1, borderColor: C.cardBorder },
  btnText: { fontSize: 14, fontWeight: '700' },
  wide: { flex: 1, minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  outline: { borderWidth: 1, borderColor: C.border, backgroundColor: '#140D24' },
  input: { color: C.text, fontSize: 15, borderWidth: 1, borderColor: C.cardBorder, borderRadius: 12, paddingHorizontal: 12, minHeight: 44, backgroundColor: '#0C0817' },
});
