// Piezas del módulo UNIVERSIDAD: links rápidos con logo, formulario de materia, plan de evaluación con notas y
// las 15 semanas de clases (plegables).
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { SharedValue, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { DateField } from '@/components/date-field';
import { Btn, Field } from '@/components/form';
import { IconClose, IconPlus, IconTrash } from '@/components/icons';
import { Card, Label, Mono, Row } from '@/components/ui';
import { notify } from '@/lib/confirm';
import { formatDate } from '@/lib/dates';
import { CATEGORY_PALETTE } from '@/lib/finance';
import { ClassNote, cleanUrl, Evaluation, faviconOf, fmt, hostOf, PASS, SCALE, standing, Subject, UniLink, WEEKDAYS, WEEKS } from '@/lib/university';
import { C, mono, R } from '@/theme';

export const SUBJECT_COLORS = CATEGORY_PALETTE;

export function openUrl(url: string) {
  if (Platform.OS === 'web') window.open(url, '_blank', 'noopener');
  else Linking.openURL(url).catch(() => notify('No pude abrir ese link.'));
}

// ---------------------------------------------------------------------------- links

/**
 * Accesos rápidos: mosaicos con el logo del sitio; un toque abre el link. Manteniendo presionado se entra en modo
 * edición (como en el iPhone): se arrastran para cambiarlos de orden y la ✕ los borra. "Listo" sale del modo.
 * Los mosaicos van siempre en el mismo orden en la vista y solo cambian de posición: si se reordenaran los nodos
 * mientras se arrastra, el gesto se cortaría.
 */
export function LinkGrid({
  links,
  subjects,
  defaultSubject = null,
  onAdd,
  onRemove,
  onReorder,
}: {
  links: UniLink[];
  subjects: Subject[];
  defaultSubject?: string | null;
  onAdd: (l: { title: string; url: string; subject_id: string | null }) => Promise<boolean>;
  onRemove: (id: string) => void;
  onReorder: (ids: string[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [width, setWidth] = useState(0);
  const [order, setOrder] = useState<string[] | null>(null); // orden mientras se arrastra
  const [dragId, setDragId] = useState<string | null>(null);
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const [start, setStart] = useState({ x: 0, y: 0 });

  const sorted = [...links].sort((a, b) => a.position - b.position);
  const ids = order ?? sorted.map((l) => l.id);
  const cols = Math.max(1, Math.floor((width + TILE_GAP) / (TILE_W + TILE_GAP)));
  const slot = (i: number) => ({ x: (i % cols) * (TILE_W + TILE_GAP), y: Math.floor(i / cols) * (TILE_H + TILE_GAP) });
  const count = ids.length + (adding || editing ? 0 : 1);
  const rows = Math.max(1, Math.ceil(count / cols));

  const begin = (id: string) => {
    const s = slot(ids.indexOf(id));
    setStart(s);
    dragX.value = s.x;
    dragY.value = s.y;
    setOrder(ids);
    setDragId(id);
    setEditing(true);
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };
  const move = (id: string, tx: number, ty: number) => {
    const x = start.x + tx;
    const y = start.y + ty;
    dragX.value = x;
    dragY.value = y;
    const col = Math.min(cols - 1, Math.max(0, Math.round(x / (TILE_W + TILE_GAP))));
    const row = Math.max(0, Math.round(y / (TILE_H + TILE_GAP)));
    const target = Math.min(ids.length - 1, row * cols + col);
    if (target !== ids.indexOf(id)) {
      const next = ids.filter((v) => v !== id);
      next.splice(target, 0, id);
      setOrder(next);
    }
  };
  const end = () => {
    if (order && order.join() !== sorted.map((l) => l.id).join()) onReorder(order);
    setDragId(null);
    setOrder(null);
  };

  return (
    <View style={{ gap: 8 }}>
      <Row>
        <Label style={{ color: C.accentSoft }}>Links rápidos</Label>
        {links.length ? (
          <Pressable onPress={() => setEditing(!editing)} style={styles.textBtn} accessibilityRole="button">
            <Text style={styles.textBtnText}>{editing ? 'Listo' : 'Editar'}</Text>
          </Pressable>
        ) : null}
      </Row>
      {editing ? <Text style={styles.caption}>Arrastra para ordenar · toca la ✕ para borrar.</Text> : null}
      <View style={{ height: rows * (TILE_H + TILE_GAP) - TILE_GAP }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {sorted.map((l) => (
          <LinkTile
            key={l.id}
            link={l}
            subject={subjects.find((s) => s.id === l.subject_id)}
            at={slot(ids.indexOf(l.id))}
            editing={editing}
            dragging={dragId === l.id}
            dragX={dragX}
            dragY={dragY}
            onBegin={() => begin(l.id)}
            onMove={(tx, ty) => move(l.id, tx, ty)}
            onEnd={end}
            onRemove={() => onRemove(l.id)}
          />
        ))}
        {!adding && !editing ? (
          <Pressable
            onPress={() => setAdding(true)}
            style={[styles.tile, styles.addTile, { position: 'absolute', left: slot(ids.length).x, top: slot(ids.length).y }]}
            accessibilityRole="button"
            accessibilityLabel="Agregar link">
            <IconPlus color={C.accentSoft} size={22} />
            <Text style={styles.tileText}>Link</Text>
          </Pressable>
        ) : null}
      </View>
      {adding ? <LinkForm subjects={subjects} defaultSubject={defaultSubject} onCancel={() => setAdding(false)} onSave={async (l) => (await onAdd(l)) && (setAdding(false), true)} /> : null}
    </View>
  );
}

const TILE_W = 84;
const TILE_H = 96;
const TILE_GAP = 10;
const SLIDE = { duration: 160 };

function LinkTile({
  link,
  subject,
  at,
  editing,
  dragging,
  dragX,
  dragY,
  onBegin,
  onMove,
  onEnd,
  onRemove,
}: {
  link: UniLink;
  subject?: Subject;
  at: { x: number; y: number };
  editing: boolean;
  dragging: boolean;
  dragX: SharedValue<number>;
  dragY: SharedValue<number>;
  onBegin: () => void;
  onMove: (tx: number, ty: number) => void;
  onEnd: () => void;
  onRemove: () => void;
}) {
  const [broken, setBroken] = useState(false);
  const icon = faviconOf(link.url);
  // Mantener presionado agarra el mosaico; un toque corto abre el link (en modo edición no abre).
  const pan = Gesture.Pan()
    .runOnJS(true)
    .activateAfterLongPress(300)
    .onStart(onBegin)
    .onUpdate((e) => onMove(e.translationX, e.translationY))
    .onFinalize(onEnd);
  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd((_e, ok) => {
      if (ok && !editing) openUrl(link.url);
    });
  // El que se arrastra sigue al dedo; los demás se deslizan a su lugar nuevo.
  const style = useAnimatedStyle(() =>
    dragging
      ? { transform: [{ translateX: dragX.value }, { translateY: dragY.value }, { scale: 1.08 }], zIndex: 10 }
      : { transform: [{ translateX: withTiming(at.x, SLIDE) }, { translateY: withTiming(at.y, SLIDE) }, { scale: withTiming(1, SLIDE) }], zIndex: 0 },
  );

  return (
    <Animated.View style={[{ position: 'absolute', left: 0, top: 0 }, style]}>
      <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
        <View style={[styles.tile, dragging && styles.tileDragging]} accessible accessibilityRole="link" accessibilityLabel={`Abrir ${link.title}`} accessibilityHint="Mantén presionado para ordenar o borrar">
          {/* Sin puntero en el logo ni en el texto: en la web el navegador arrastraría la imagen y cortaría el gesto. */}
          <View pointerEvents="none" style={[styles.logo, subject && { borderColor: subject.color }]}>
            {icon && !broken ? (
              <Image source={{ uri: icon }} style={{ width: 28, height: 28 }} contentFit="contain" onError={() => setBroken(true)} />
            ) : (
              <Text style={styles.logoLetter}>{link.title.slice(0, 1).toUpperCase()}</Text>
            )}
          </View>
          <Text style={styles.tileText} numberOfLines={2} selectable={false} pointerEvents="none">
            {link.title}
          </Text>
        </View>
      </GestureDetector>
      {editing && !dragging ? (
        <Pressable onPress={onRemove} style={styles.tileRemove} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Borrar ${link.title}`}>
          <IconClose color={C.bad} size={12} />
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

function LinkForm({ subjects, defaultSubject, onSave, onCancel }: { subjects: Subject[]; defaultSubject: string | null; onSave: (l: { title: string; url: string; subject_id: string | null }) => Promise<boolean>; onCancel: () => void }) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState<string | null>(defaultSubject);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    const clean = cleanUrl(url);
    if (!clean) return setError('Pega un link válido, por ejemplo https://classroom.google.com');
    const name = title.trim() || hostOf(clean) || 'Link';
    if (!(await onSave({ title: name.slice(0, 80), url: clean, subject_id: subject }))) setError('No pude guardarlo. Revisa tu conexión.');
  };
  return (
    <Card glow>
      <Label style={{ color: C.accentSoft }}>Nuevo link</Label>
      <Field label="Link" placeholder="https://…" value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url" autoFocus />
      <Field label="Nombre (opcional)" placeholder="Ej. Aula virtual" value={title} onChangeText={setTitle} />
      {subjects.length ? (
        <View style={{ gap: 6 }}>
          <Label>Materia (opcional)</Label>
          <View style={styles.chips}>
            <Chip label="Ninguna" active={subject === null} onPress={() => setSubject(null)} />
            {subjects.map((s) => (
              <Chip key={s.id} label={s.name} color={s.color} active={subject === s.id} onPress={() => setSubject(s.id)} />
            ))}
          </View>
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Row>
        <Btn label="Cancelar" kind="ghost" onPress={onCancel} />
        <Btn label="Guardar" onPress={save} />
      </Row>
    </Card>
  );
}

// ---------------------------------------------------------------------------- materias

export function SubjectForm({ initial, onSave, onCancel }: { initial?: Subject; onSave: (s: { name: string; professor: string; color: string }) => Promise<boolean>; onCancel: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [professor, setProfessor] = useState(initial?.professor ?? '');
  const [color, setColor] = useState(() => initial?.color ?? SUBJECT_COLORS[Math.floor(Math.random() * SUBJECT_COLORS.length)]);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (!name.trim()) return setError('Escribe el nombre de la materia.');
    if (!(await onSave({ name: name.trim().slice(0, 120), professor: professor.trim().slice(0, 120), color }))) setError('No pude guardarla. Revisa tu conexión.');
  };
  return (
    <Card glow>
      <Label style={{ color: C.accentSoft }}>{initial ? 'Editar materia' : 'Nueva materia'}</Label>
      <Field label="Materia" placeholder="Ej. Cálculo II" value={name} onChangeText={setName} />
      <Field label="Profesor (opcional)" placeholder="Ej. Prof. Rodríguez" value={professor} onChangeText={setProfessor} />
      <View style={{ gap: 6 }}>
        <Label>Color</Label>
        <View style={styles.chips}>
          {SUBJECT_COLORS.map((c) => (
            <Pressable key={c} onPress={() => setColor(c)} style={styles.swatchBtn} accessibilityRole="radio" accessibilityState={{ checked: color === c }} accessibilityLabel={`Color ${c}`}>
              <View style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchOn]} />
            </Pressable>
          ))}
        </View>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Row>
        <Btn label="Cancelar" kind="ghost" onPress={onCancel} />
        <Btn label="Guardar" onPress={save} />
      </Row>
    </Card>
  );
}

/** Tarjeta de materia en la lista: color, nombre, profesor y cómo va (acumulado sobre 20). */
export function SubjectCard({ subject, evals, onPress }: { subject: Subject; evals: Evaluation[]; onPress: () => void }) {
  const st = standing(evals);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.subject, pressed && { backgroundColor: C.surfaceSelected }]} accessibilityRole="button">
      <View style={[styles.subjectBar, { backgroundColor: subject.color }]} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.subjectName} numberOfLines={1}>
          {subject.name}
        </Text>
        <Text style={styles.caption} numberOfLines={1}>
          {[subject.professor, evals.length ? `Evaluado ${fmt(st.evaluated)}%` : 'Sin plan de evaluación'].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {st.evaluated ? (
        <View style={{ alignItems: 'flex-end' }}>
          <Mono style={[styles.grade, { color: st.acc >= PASS ? C.ok : C.text }]}>{fmt(st.acc)}</Mono>
          <Text style={styles.caption}>{`de ${SCALE}`}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------- plan de evaluación

type EvalInput = { name: string; weight: number; max_score: number; score: number | null; due_on: string | null };

const parseNum = (t: string) => {
  const v = Number(t.trim().replace(',', '.'));
  return t.trim() && Number.isFinite(v) ? v : null;
};
const dmy = (iso: string) => iso.split('-').reverse().join('/');
const isoOf = (text: string) => {
  const m = text.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return d.getDate() === Number(m[1]) ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
};

export function EvaluationPlan({
  evals,
  onAdd,
  onUpdate,
  onRemove,
}: {
  evals: Evaluation[];
  onAdd: (e: EvalInput) => Promise<boolean>;
  onUpdate: (id: string, e: EvalInput) => Promise<boolean>;
  onRemove: (id: string) => void;
}) {
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const st = standing(evals);
  return (
    <View style={{ gap: 8 }}>
      <Card>
        <Row>
          <View style={{ gap: 2 }}>
            <Label>Acumulado</Label>
            <Mono style={[styles.big, { color: st.acc >= PASS ? C.ok : C.text }]}>{`${fmt(st.acc)} / ${SCALE}`}</Mono>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            <Label>Evaluado</Label>
            <Mono style={styles.big}>{`${fmt(st.evaluated)}%`}</Mono>
          </View>
        </Row>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.min(100, st.evaluated)}%`, backgroundColor: st.acc >= PASS ? C.ok : C.accent }]} />
        </View>
        <Text style={styles.caption}>
          {st.acc >= PASS
            ? `Ya tienes ${PASS} o más: la materia está aprobada con lo acumulado.`
            : st.needed !== null
              ? st.needed > SCALE
                ? `Para llegar a ${PASS} necesitarías más de ${SCALE} en lo que falta (${fmt(st.remaining)}%).`
                : `Para llegar a ${PASS} necesitas un promedio de ${fmt(st.needed)} en lo que falta (${fmt(st.remaining)}%).`
              : evals.length
                ? 'Agrega tus notas a medida que te las den.'
                : 'Agrega las evaluaciones del plan con su porcentaje.'}
        </Text>
        {evals.length && Math.round(st.planned) !== 100 ? <Text style={[styles.caption, { color: C.warn }]}>{`El plan suma ${fmt(st.planned)}%, no 100%.`}</Text> : null}
      </Card>

      <Card style={{ gap: 0 }}>
        <Label style={{ color: C.accentSoft, marginBottom: 6 }}>Plan de evaluación</Label>
        {evals.length === 0 ? <Text style={[styles.caption, { paddingVertical: 8 }]}>Sin evaluaciones todavía.</Text> : null}
        {evals.map((e) =>
          editing === e.id ? (
            <EvalForm key={e.id} initial={e} onCancel={() => setEditing(null)} onSave={async (v) => (await onUpdate(e.id, v)) && (setEditing(null), true)} onRemove={() => (setEditing(null), onRemove(e.id))} />
          ) : (
            <Pressable key={e.id} onPress={() => setEditing(e.id)} style={({ pressed }) => [styles.evalRow, pressed && { backgroundColor: C.surfaceSelected }]} accessibilityRole="button" accessibilityHint="Editar">
              <View style={{ flex: 1, gap: 1 }}>
                <Text style={styles.body} numberOfLines={2}>
                  {e.name}
                </Text>
                <Text style={styles.caption}>{[`${fmt(e.weight)}%`, e.due_on ? formatDate(e.due_on) : null].filter(Boolean).join(' · ')}</Text>
              </View>
              <Mono style={[styles.score, e.score === null && { color: C.muted }]}>{e.score === null ? '—' : `${fmt(e.score)}/${fmt(e.max_score)}`}</Mono>
            </Pressable>
          ),
        )}
        {editing === 'new' ? (
          <EvalForm onCancel={() => setEditing(null)} onSave={async (v) => (await onAdd(v)) && (setEditing(null), true)} />
        ) : (
          <View style={{ marginTop: 8 }}>
            <Btn label="Agregar evaluación" kind="outline" icon={<IconPlus color={C.chipText} />} onPress={() => setEditing('new')} />
          </View>
        )}
      </Card>
    </View>
  );
}

function EvalForm({ initial, onSave, onCancel, onRemove }: { initial?: Evaluation; onSave: (e: EvalInput) => Promise<boolean>; onCancel: () => void; onRemove?: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [weight, setWeight] = useState(initial ? String(initial.weight) : '');
  const [score, setScore] = useState(initial?.score != null ? String(initial.score) : '');
  const [max, setMax] = useState(String(initial?.max_score ?? SCALE));
  const [date, setDate] = useState(initial?.due_on ? dmy(initial.due_on) : '');
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    const w = parseNum(weight);
    const m = parseNum(max);
    const s = score.trim() ? parseNum(score) : null;
    if (!name.trim()) return setError('Escribe la evaluación (ej. Parcial 1).');
    if (w === null || w < 0 || w > 100) return setError('El porcentaje va de 0 a 100.');
    if (m === null || m <= 0) return setError('La nota máxima tiene que ser mayor que 0.');
    if (score.trim() && (s === null || s < 0 || s > m)) return setError(`La nota va de 0 a ${fmt(m)}.`);
    const due = date.trim() ? isoOf(date) : null;
    if (date.trim() && !due) return setError('La fecha va en DD/MM/AAAA, o déjala vacía.');
    if (!(await onSave({ name: name.trim().slice(0, 120), weight: w, max_score: m, score: s, due_on: due }))) setError('No pude guardarla. Revisa tu conexión.');
  };
  return (
    <View style={styles.form}>
      <Field label="Evaluación" placeholder="Ej. Parcial 1" value={name} onChangeText={setName} autoFocus={!initial} />
      <View style={styles.pair}>
        <View style={{ flex: 1 }}>
          <Field label="Porcentaje" placeholder="Ej. 25" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Nota" placeholder="Pendiente" value={score} onChangeText={setScore} keyboardType="decimal-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Sobre" value={max} onChangeText={setMax} keyboardType="decimal-pad" />
        </View>
      </View>
      <DateField label="Fecha (opcional)" value={date} onChange={setDate} future clearable placeholder="Opcional" />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Row>
        {onRemove ? (
          <Pressable onPress={onRemove} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Borrar evaluación">
            <IconTrash color={C.bad} />
          </Pressable>
        ) : (
          <View />
        )}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Btn label="Cancelar" kind="ghost" onPress={onCancel} style={styles.small} />
          <Btn label="Guardar" onPress={save} style={styles.small} />
        </View>
      </Row>
    </View>
  );
}

// ---------------------------------------------------------------------------- 15 semanas

/** Las 15 semanas, plegadas. Cada semana se abre y muestra "Martes · tema"; se agrega con el día y el título. */
export function Weeks({ classes, onAdd, onRemove }: { classes: ClassNote[]; onAdd: (c: { week: number; weekday: number; topic: string }) => Promise<boolean>; onRemove: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [week, setWeek] = useState<number | null>(null);
  return (
    <Card style={{ gap: 0 }}>
      <Pressable onPress={() => setOpen(!open)} style={styles.collapse} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <Label style={{ color: C.accentSoft }}>{`Clases · ${WEEKS} semanas (${classes.length})`}</Label>
        <Text style={styles.caption}>{open ? 'Ocultar' : 'Mostrar'}</Text>
      </Pressable>
      {open
        ? Array.from({ length: WEEKS }, (_, i) => i + 1).map((w) => {
            const list = classes.filter((c) => c.week === w).sort((a, b) => a.weekday - b.weekday);
            const isOpen = week === w;
            return (
              <View key={w} style={styles.week}>
                <Pressable onPress={() => setWeek(isOpen ? null : w)} style={styles.weekHead} accessibilityRole="button" accessibilityState={{ expanded: isOpen }}>
                  <Text style={styles.weekTitle}>{`Semana ${w}`}</Text>
                  <Text style={styles.caption}>{list.length ? `${list.length} ${list.length === 1 ? 'clase' : 'clases'}` : isOpen ? '' : '—'}</Text>
                </Pressable>
                {isOpen ? (
                  <View style={{ gap: 6, paddingBottom: 10 }}>
                    {list.map((c) => (
                      <View key={c.id} style={styles.classRow}>
                        <Mono style={styles.classDay}>{WEEKDAYS[c.weekday - 1].slice(0, 3).toUpperCase()}</Mono>
                        <Text style={[styles.body, { flex: 1 }]}>{c.topic}</Text>
                        <Pressable onPress={() => onRemove(c.id)} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel={`Borrar ${c.topic}`}>
                          <IconTrash color={C.muted} size={14} />
                        </Pressable>
                      </View>
                    ))}
                    <ClassForm week={w} onAdd={onAdd} />
                  </View>
                ) : null}
              </View>
            );
          })
        : null}
    </Card>
  );
}

function ClassForm({ week, onAdd }: { week: number; onAdd: (c: { week: number; weekday: number; topic: string }) => Promise<boolean> }) {
  const [weekday, setWeekday] = useState(((new Date().getDay() + 6) % 7) + 1);
  const [topic, setTopic] = useState('');
  const add = async () => {
    if (!topic.trim()) return;
    if (await onAdd({ week, weekday, topic: topic.trim().slice(0, 300) })) setTopic('');
    else notify('No pude guardarla. Revisa tu conexión.');
  };
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.chips}>
        {WEEKDAYS.slice(0, 6).map((d, i) => (
          <Chip key={d} label={d.slice(0, 3)} active={weekday === i + 1} onPress={() => setWeekday(i + 1)} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput style={[styles.input, { flex: 1 }]} placeholder="Vimos… (ej. Integrales por partes)" placeholderTextColor={C.muted} value={topic} onChangeText={setTopic} onSubmitEditing={add} />
        <Pressable onPress={add} style={styles.addBtn} accessibilityRole="button" accessibilityLabel="Agregar clase">
          <IconPlus color={C.onAccent} size={18} />
        </Pressable>
      </View>
    </View>
  );
}

export function Chip({ label, color, active, onPress }: { label: string; color?: string; active?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipOn]} accessibilityRole="button" accessibilityState={{ selected: active }}>
      {color ? <View style={[styles.dot, { backgroundColor: color }]} /> : null}
      <Text style={[styles.chipText, active && { color: C.onAccent }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { color: C.text, fontSize: 14.5, lineHeight: 20 },
  caption: { color: C.muted, fontSize: 12.5, lineHeight: 18 },
  error: { color: C.bad, fontSize: 13 },
  textBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  textBtnText: { color: C.accentSoft, fontSize: 13.5, fontWeight: '600' },
  tile: { userSelect: 'none', width: TILE_W, height: TILE_H, alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 4, borderRadius: R.card, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.card },
  addTile: { justifyContent: 'center', borderStyle: 'dashed' },
  logo: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surfaceInput, borderWidth: 1.5, borderColor: C.cardBorder },
  logoLetter: { color: C.accentSoft, fontSize: 18, fontWeight: '700' },
  tileText: { color: C.text, fontSize: 11.5, textAlign: 'center' },
  tileRemove: { position: 'absolute', top: -8, right: -8, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.bad, zIndex: 11 },
  tileDragging: { borderColor: C.accent, backgroundColor: C.surfaceSelected },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, maxWidth: 220, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.surfaceInput },
  chipOn: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { color: C.chipText, fontSize: 13.5, fontWeight: '500' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  swatchBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 28, height: 28, borderRadius: 14 },
  swatchOn: { borderWidth: 3, borderColor: C.text },
  subject: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingRight: 14, borderRadius: R.card, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.card, overflow: 'hidden' },
  subjectBar: { width: 6, alignSelf: 'stretch' },
  subjectName: { color: C.text, fontSize: 15.5, fontWeight: '600' },
  grade: { fontSize: 20, fontWeight: '700' },
  big: { fontSize: 22, fontWeight: '700', color: C.text },
  track: { height: 6, borderRadius: 3, backgroundColor: C.surfaceSunken, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  evalRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.cardBorder },
  score: { fontSize: 15, fontWeight: '600', color: C.text },
  form: { gap: 10, padding: 12, marginVertical: 6, borderRadius: R.field, borderWidth: 1, borderColor: C.border },
  pair: { flexDirection: 'row', gap: 8 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  small: { flexGrow: 0, minHeight: 44, paddingHorizontal: 16 },
  collapse: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44 },
  week: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.cardBorder },
  weekHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 48 },
  weekTitle: { color: C.text, fontSize: 15, fontWeight: '600' },
  classRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  classDay: { width: 40, fontSize: 11.5, color: C.accentSoft, fontFamily: mono },
  input: { color: C.text, fontSize: 15, borderWidth: 1, borderColor: C.cardBorder, borderRadius: R.field, paddingHorizontal: 12, minHeight: 44, backgroundColor: C.surfaceSunken },
  addBtn: { width: 44, height: 44, borderRadius: R.button, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
});
