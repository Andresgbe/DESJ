// Módulos · Horarios: tu horario ("Yo") y el de tus amigos, para ver quién te puede dar la cola.
// Arriba eliges el día: "¿Quién te da la cola?" (para ir y para volver) y una línea de tiempo por persona para
// comparar de un vistazo. Abajo cada persona con su horario semanal: agregar bloques, editar, WhatsApp, borrar.
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text, TextInput } from '@/components/text';
import { Btn, Field } from '@/components/form';
import { IconChevron, IconPlus, IconTrash } from '@/components/icons';
import { ModuleIcon } from '@/components/modules';
import { Card, Label, Mono, Row, Screen, Title } from '@/components/ui';
import { Chip, openUrl } from '@/components/university';
import { confirm } from '@/lib/confirm';
import { CATEGORY_PALETTE } from '@/lib/finance';
import { useModules } from '@/lib/modules';
import { Block, DAY_LONG, DAY_SHORT, gap, parseHour, Person, rides, todayWeekday, toMin, useSchedules, whatsapp } from '@/lib/schedules';
import { C, mono, R } from '@/theme';

const FROM = 6 * 60; // la línea de tiempo va de 6:00 a 22:00
const TO = 22 * 60;
const TICKS = [6, 10, 14, 18, 22];

export default function Horarios() {
  const { ready: modulesReady, modules, reload: reloadModules } = useModules();
  const mod = modules.find((m) => m.kind === 'horarios');
  const sc = useSchedules(mod?.id);
  const { reload, insert } = sc;
  const [day, setDay] = useState(() => Math.min(6, todayWeekday()));
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const seeding = useRef(false);

  useFocusEffect(
    useCallback(() => {
      void reloadModules();
      reload()
        .then(async (d) => {
          setLoadError(null);
          // "Yo" existe siempre: es el horario con el que se compara.
          if (d && !d.sched_people.some((p) => p.is_me) && !seeding.current) {
            seeding.current = true;
            if (!(await insert('sched_people', { name: 'Yo', color: CATEGORY_PALETTE[7], phone: '', is_me: true, position: 0 }))) seeding.current = false;
          }
        })
        .catch((e: Error) => setLoadError(e.message));
      // eslint-disable-next-line react-hooks/exhaustive-deps -- insert cambia en cada render; basta con reload
    }, [reloadModules, reload]),
  );

  if (!mod || !sc.ready) {
    return (
      <Screen module="Módulos · Horarios" back>
        <Text style={styles.caption}>{loadError ?? (modulesReady && !mod ? 'Este módulo ya no existe. Agrégalo desde el catálogo de Módulos.' : 'Cargando…')}</Text>
      </Screen>
    );
  }

  const people = [...sc.data.sched_people].sort((a, b) => Number(b.is_me) - Number(a.is_me) || a.position - b.position);
  const blocks = sc.data.sched_blocks;
  const me = people.find((p) => p.is_me);
  const ride = rides(people, blocks, day);

  const removePerson = async (p: Person) => {
    if (!(await confirm('Borrar', `¿Borrar a ${p.name} y su horario?`, 'Borrar'))) return;
    await sc.remove({ sched_people: [p.id], sched_blocks: blocks.filter((b) => b.person_id === p.id).map((b) => b.id) });
  };

  return (
    <Screen module="Módulos · Horarios" back>
      <Row style={{ justifyContent: 'flex-start' }}>
        <View style={styles.icon}>
          <ModuleIcon kind="horarios" color={C.accentSoft} size={24} />
        </View>
        <View style={{ gap: 2, flex: 1 }}>
          <Label>¿Quién te da la cola?</Label>
          <Title accent="horarios">Los</Title>
        </View>
      </Row>

      <View style={styles.days}>
        {DAY_SHORT.slice(0, 6).map((d, i) => (
          <Pressable key={d} onPress={() => setDay(i + 1)} style={[styles.dayBtn, day === i + 1 && styles.dayOn]} accessibilityRole="button" accessibilityState={{ selected: day === i + 1 }} accessibilityLabel={DAY_LONG[i]}>
            <Text style={[styles.dayText, day === i + 1 && { color: C.onAccent }]}>{d}</Text>
          </Pressable>
        ))}
      </View>

      <Card glow>
        <Label style={{ color: C.accentSoft }}>{`Cola el ${DAY_LONG[day - 1].toLowerCase()}`}</Label>
        {!ride ? (
          <Text style={styles.body}>{me ? `No tienes clases el ${DAY_LONG[day - 1].toLowerCase()}. Agrega tu horario abajo, en "Yo".` : 'Cargando…'}</Text>
        ) : (
          <>
            <RideList title={`Para ir · entras ${ride.mine.first}`} empty="Nadie llega cerca de tu hora." items={ride.go.map((x) => ({ p: x.p, text: `${gap(x.diff, 'llega')} (${x.span.first})` }))} />
            <RideList title={`Para volver · sales ${ride.mine.last}`} empty="Nadie sale cerca de tu hora." items={ride.back.map((x) => ({ p: x.p, text: `${gap(x.diff, 'sale')} (${x.span.last})` }))} />
          </>
        )}
      </Card>

      <Card>
        <Label>Línea de tiempo</Label>
        <View style={[styles.ticks, { marginLeft: 72 }]}>
          {TICKS.map((h) => (
            <Text key={h} style={[styles.tick, { left: `${((h * 60 - FROM) / (TO - FROM)) * 100}%` }]}>{`${h}h`}</Text>
          ))}
        </View>
        {people.map((p) => (
          <Timeline key={p.id} person={p} blocks={blocks.filter((b) => b.person_id === p.id && b.weekday === day)} />
        ))}
      </Card>

      <Label style={{ color: C.accentSoft, marginTop: 4 }}>Horarios</Label>
      {people.map((p) => (
        <PersonCard
          key={p.id}
          person={p}
          blocks={blocks.filter((b) => b.person_id === p.id)}
          open={openId === p.id}
          onToggle={() => setOpenId(openId === p.id ? null : p.id)}
          onAddBlock={async (b) => Boolean(await sc.insert('sched_blocks', { ...b, person_id: p.id }))}
          onRemoveBlock={(id) => sc.remove({ sched_blocks: [id] })}
          onUpdate={(patch) => sc.update('sched_people', p.id, patch)}
          onRemove={() => removePerson(p)}
        />
      ))}

      {adding ? (
        <PersonForm
          onCancel={() => setAdding(false)}
          onSave={async (p) => {
            const saved = await sc.insert('sched_people', { ...p, is_me: false, position: people.length });
            if (!saved) return false;
            setAdding(false);
            setOpenId(saved.id);
            return true;
          }}
        />
      ) : (
        <Btn label="Agregar amigo" kind="outline" icon={<IconPlus color={C.chipText} />} onPress={() => setAdding(true)} />
      )}
    </Screen>
  );
}

function RideList({ title, empty, items }: { title: string; empty: string; items: { p: Person; text: string }[] }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.rideTitle}>{title}</Text>
      {items.length === 0 ? <Text style={styles.caption}>{empty}</Text> : null}
      {items.map(({ p, text }) => {
        const wa = whatsapp(p.phone);
        return (
          <View key={p.id} style={styles.rideRow}>
            <View style={[styles.avatar, { backgroundColor: p.color }]}>
              <Text style={styles.avatarText}>{p.name.slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{p.name}</Text>
              <Text style={styles.caption}>{text}</Text>
            </View>
            {wa ? (
              <Pressable onPress={() => openUrl(wa)} style={styles.waBtn} accessibilityRole="link" accessibilityLabel={`Escribirle a ${p.name} por WhatsApp`}>
                <Text style={styles.waText}>WhatsApp</Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function Timeline({ person, blocks }: { person: Person; blocks: Block[] }) {
  const pct = (t: string) => `${((Math.min(TO, Math.max(FROM, toMin(t))) - FROM) / (TO - FROM)) * 100}%` as const;
  return (
    <View style={styles.tlRow}>
      <Text style={[styles.tlName, person.is_me && { color: C.accentSoft, fontWeight: '700' }]} numberOfLines={1}>
        {person.name}
      </Text>
      <View style={styles.tlTrack}>
        {TICKS.map((h) => (
          <View key={h} style={[styles.tlTick, { left: `${((h * 60 - FROM) / (TO - FROM)) * 100}%` }]} />
        ))}
        {blocks.map((b) => (
          <View
            key={b.id}
            style={[styles.tlBlock, { left: pct(b.starts), width: `${((Math.min(TO, toMin(b.ends)) - Math.max(FROM, toMin(b.starts))) / (TO - FROM)) * 100}%`, backgroundColor: person.color }]}
            accessibilityLabel={`${person.name}: ${b.starts} a ${b.ends}${b.label ? `, ${b.label}` : ''}`}
          />
        ))}
        {blocks.length === 0 ? <Text style={styles.tlEmpty}>no va</Text> : null}
      </View>
    </View>
  );
}

function PersonCard({
  person,
  blocks,
  open,
  onToggle,
  onAddBlock,
  onRemoveBlock,
  onUpdate,
  onRemove,
}: {
  person: Person;
  blocks: Block[];
  open: boolean;
  onToggle: () => void;
  onAddBlock: (b: Omit<Block, 'id' | 'person_id'>) => Promise<boolean>;
  onRemoveBlock: (id: string) => void;
  onUpdate: (patch: Partial<Person>) => Promise<boolean>;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const days = [1, 2, 3, 4, 5, 6, 7].filter((d) => blocks.some((b) => b.weekday === d));
  const summary = days.length ? days.map((d) => DAY_SHORT[d - 1]).join(' · ') : 'Sin horario';
  const wa = whatsapp(person.phone);
  return (
    <Card style={{ gap: 8 }}>
      <Pressable onPress={onToggle} style={styles.personHead} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <View style={[styles.avatar, { backgroundColor: person.color }]}>
          <Text style={styles.avatarText}>{person.name.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{person.is_me ? 'Yo · mi horario' : person.name}</Text>
          <Text style={styles.caption}>{summary}</Text>
        </View>
        <View style={{ transform: [{ rotate: open ? '-90deg' : '90deg' }] }}>
          <IconChevron color={C.muted} />
        </View>
      </Pressable>
      {open ? (
        <>
          {days.map((d) => (
            <View key={d} style={{ gap: 2 }}>
              <Text style={styles.dayLabel}>{DAY_LONG[d - 1]}</Text>
              {blocks
                .filter((b) => b.weekday === d)
                .sort((a, b) => a.starts.localeCompare(b.starts))
                .map((b) => (
                  <View key={b.id} style={styles.blockRow}>
                    <Mono style={styles.blockTime}>{`${b.starts}–${b.ends}`}</Mono>
                    <Text style={[styles.body, { flex: 1 }]} numberOfLines={1}>
                      {b.label || '—'}
                    </Text>
                    <Pressable onPress={() => onRemoveBlock(b.id)} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel={`Borrar ${b.starts} a ${b.ends}`}>
                      <IconTrash color={C.muted} size={14} />
                    </Pressable>
                  </View>
                ))}
            </View>
          ))}
          <BlockForm onAdd={onAddBlock} />
          {editing ? (
            <PersonForm initial={person} onCancel={() => setEditing(false)} onSave={async (p) => (await onUpdate(p)) && (setEditing(false), true)} />
          ) : (
            <Row style={{ justifyContent: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
              {wa ? <Btn label="WhatsApp" kind="outline" onPress={() => openUrl(wa)} style={styles.small} /> : null}
              <Btn label={person.is_me ? 'Color' : 'Editar'} kind="ghost" onPress={() => setEditing(true)} style={styles.small} />
              {!person.is_me ? <Btn label="Borrar" kind="danger" onPress={onRemove} style={styles.small} /> : null}
            </Row>
          )}
        </>
      ) : null}
    </Card>
  );
}

function BlockForm({ onAdd }: { onAdd: (b: Omit<Block, 'id' | 'person_id'>) => Promise<boolean> }) {
  const [weekday, setWeekday] = useState(Math.min(6, todayWeekday()));
  const [starts, setStarts] = useState('');
  const [ends, setEnds] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const add = async () => {
    const s = parseHour(starts);
    const e = parseHour(ends);
    if (!s || !e) return setError('Escribe las horas en 24h, por ejemplo 7:00 y 9:30.');
    if (e <= s) return setError('La hora de salida tiene que ser después de la de entrada.');
    if (!(await onAdd({ weekday, starts: s, ends: e, label: label.trim().slice(0, 120) }))) return setError('No pude guardarlo. Revisa tu conexión.');
    setError(null);
    setStarts(e);
    setEnds('');
    setLabel('');
  };
  return (
    <View style={styles.form}>
      <Text style={styles.dayLabel}>Agregar clase</Text>
      <View style={styles.chips}>
        {DAY_SHORT.slice(0, 6).map((d, i) => (
          <Chip key={d} label={d} active={weekday === i + 1} onPress={() => setWeekday(i + 1)} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput style={[styles.input, { flex: 1 }]} placeholder="Entra (7:00)" placeholderTextColor={C.muted} value={starts} onChangeText={setStarts} keyboardType="numbers-and-punctuation" accessibilityLabel="Hora de entrada" />
        <TextInput style={[styles.input, { flex: 1 }]} placeholder="Sale (9:30)" placeholderTextColor={C.muted} value={ends} onChangeText={setEnds} keyboardType="numbers-and-punctuation" accessibilityLabel="Hora de salida" />
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput style={[styles.input, { flex: 1 }]} placeholder="Materia (opcional)" placeholderTextColor={C.muted} value={label} onChangeText={setLabel} onSubmitEditing={add} />
        <Pressable onPress={add} style={styles.addBtn} accessibilityRole="button" accessibilityLabel="Agregar clase">
          <IconPlus color={C.onAccent} size={18} />
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function PersonForm({ initial, onSave, onCancel }: { initial?: Person; onSave: (p: { name: string; phone: string; color: string }) => Promise<boolean>; onCancel: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [color, setColor] = useState(() => initial?.color ?? CATEGORY_PALETTE[Math.floor(Math.random() * CATEGORY_PALETTE.length)]);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (!name.trim()) return setError('Escribe el nombre.');
    if (!(await onSave({ name: name.trim().slice(0, 60), phone: phone.trim().slice(0, 30), color }))) setError('No pude guardarlo. Revisa tu conexión.');
  };
  return (
    <Card glow>
      <Label style={{ color: C.accentSoft }}>{initial ? (initial.is_me ? 'Tu color' : 'Editar amigo') : 'Nuevo amigo'}</Label>
      {!initial?.is_me ? (
        <>
          <Field label="Nombre" placeholder="Ej. Carlos" value={name} onChangeText={setName} autoFocus={!initial} />
          <Field label="Teléfono (opcional, para WhatsApp)" placeholder="Ej. 0414 1234567" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        </>
      ) : null}
      <View style={styles.chips}>
        {CATEGORY_PALETTE.map((c) => (
          <Pressable key={c} onPress={() => setColor(c)} style={styles.swatchBtn} accessibilityRole="radio" accessibilityState={{ checked: color === c }} accessibilityLabel={`Color ${c}`}>
            <View style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchOn]} />
          </Pressable>
        ))}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Row>
        <Btn label="Cancelar" kind="ghost" onPress={onCancel} />
        <Btn label="Guardar" onPress={save} />
      </Row>
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { color: C.text, fontSize: 14.5, lineHeight: 20 },
  caption: { color: C.muted, fontSize: 12.5, lineHeight: 18 },
  error: { color: C.bad, fontSize: 13 },
  name: { color: C.text, fontSize: 15, fontWeight: '600' },
  icon: { width: 48, height: 48, borderRadius: R.card, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surfaceInput },
  days: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 999, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.surfaceSunken },
  dayBtn: { flex: 1, minHeight: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  dayOn: { backgroundColor: C.accent },
  dayText: { color: C.muted, fontSize: 13.5, fontWeight: '600' },
  rideTitle: { color: C.text, fontSize: 14, fontWeight: '700', marginTop: 4 },
  rideRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: C.text, fontSize: 15, fontWeight: '700' },
  waBtn: { minHeight: 44, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: C.ok, justifyContent: 'center' },
  waText: { color: C.ok, fontSize: 13, fontWeight: '600' },
  ticks: { height: 16 },
  tick: { position: 'absolute', transform: [{ translateX: -8 }], color: C.muted, fontSize: 10, fontFamily: mono },
  tlRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 },
  tlName: { width: 64, color: C.text, fontSize: 13 },
  tlTrack: { flex: 1, height: 22, borderRadius: 6, backgroundColor: C.surfaceSunken, overflow: 'hidden', justifyContent: 'center' },
  tlTick: { position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: C.cardBorder },
  tlBlock: { position: 'absolute', top: 3, bottom: 3, borderRadius: 4 },
  tlEmpty: { color: C.textFaint, fontSize: 11, paddingLeft: 8 },
  personHead: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  dayLabel: { color: C.accentSoft, fontSize: 12.5, fontWeight: '700', marginTop: 4 },
  blockRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  blockTime: { width: 96, fontSize: 12.5, color: C.text },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  form: { gap: 8, padding: 12, borderRadius: R.field, borderWidth: 1, borderColor: C.cardBorder },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  input: { color: C.text, fontSize: 15, borderWidth: 1, borderColor: C.cardBorder, borderRadius: R.field, paddingHorizontal: 12, minHeight: 44, backgroundColor: C.surfaceSunken },
  addBtn: { width: 44, height: 44, borderRadius: R.button, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  small: { flexGrow: 0, minHeight: 44, paddingHorizontal: 16 },
  swatchBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 28, height: 28, borderRadius: 14 },
  swatchOn: { borderWidth: 3, borderColor: C.text },
});
