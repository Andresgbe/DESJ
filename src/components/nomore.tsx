// Piezas del módulo NO MORE: teclado del PIN, tarjeta de cada cosa que se está dejando (contador en vivo,
// próxima meta, mejor racha, "Perdí la racha" e historial), formulario y tarjeta de versículos.
import { ReactNode, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DateField } from '@/components/date-field';
import { Btn, Field } from '@/components/form';
import { IconBack, IconLock, IconPencil, IconTrash } from '@/components/icons';
import { Card, Label, Mono, Row } from '@/components/ui';
import { formatDate, parseDate, toDmy } from '@/lib/dates';
import { daysLabel, Habit, nextMilestone, PIN_LENGTH, Reset, splitStreak } from '@/lib/nomore';
import { SUGGESTIONS, VERSES, VERSES_CREDIT } from '@/lib/nomore-content';
import { C, mono, R } from '@/theme';

// ---------------------------------------------------------------------------- PIN

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

/** Teclado numérico del PIN: al completar los dígitos llama a onComplete y se limpia. */
export function PinPad({ title, subtitle, error, disabled, onComplete }: { title: string; subtitle?: string; error?: string | null; disabled?: boolean; onComplete: (pin: string) => void }) {
  const [pin, setPin] = useState('');
  const press = (k: string) => {
    if (disabled) return;
    if (k === 'del') return setPin((p) => p.slice(0, -1));
    const next = (pin + k).slice(0, PIN_LENGTH);
    setPin(next);
    if (next.length === PIN_LENGTH) {
      setPin('');
      onComplete(next);
    }
  };
  return (
    <View style={styles.pin}>
      <View style={styles.lock}>
        <IconLock color={C.accentSoft} size={26} />
      </View>
      <Text style={styles.pinTitle}>{title}</Text>
      {subtitle ? <Text style={[styles.caption, { textAlign: 'center' }]}>{subtitle}</Text> : null}
      <View style={styles.dots} accessibilityLabel={`${pin.length} de ${PIN_LENGTH} dígitos`}>
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <View key={i} style={[styles.dot, i < pin.length && styles.dotOn]} />
        ))}
      </View>
      <Text style={[styles.error, !error && { opacity: 0 }]}>{error || ' '}</Text>
      <View style={styles.keys}>
        {KEYS.map((k, i) =>
          k === '' ? (
            <View key={i} style={styles.key} />
          ) : (
            <Pressable
              key={i}
              onPress={() => press(k)}
              disabled={disabled}
              style={({ pressed }) => [styles.key, styles.keyBtn, pressed && { backgroundColor: C.surfaceSelected }, disabled && { opacity: 0.4 }]}
              accessibilityRole="button"
              accessibilityLabel={k === 'del' ? 'Borrar' : k}>
              {k === 'del' ? <IconBack color={C.muted} size={20} /> : <Text style={styles.keyText}>{k}</Text>}
            </Pressable>
          ),
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------- contador

export function HabitCard({
  habit,
  resets,
  now,
  onRelapse,
  onEdit,
  onRemove,
}: {
  habit: Habit;
  resets: Reset[];
  now: number;
  onRelapse: (note: string) => Promise<void>;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const [relapsing, setRelapsing] = useState(false);
  const [note, setNote] = useState('');
  const [history, setHistory] = useState(false);
  const seconds = Math.max(0, Math.floor((now - new Date(habit.started_at).getTime()) / 1000));
  const { days, clock } = splitStreak(seconds);
  const { next, progress } = nextMilestone(seconds);
  const best = Math.max(seconds, ...resets.map((r) => r.streak_seconds));
  const started = habit.started_at.slice(0, 10);

  return (
    <Card>
      <Row>
        <Label style={{ color: C.accentSoft, flex: 1 }}>{habit.name}</Label>
        <View style={{ flexDirection: 'row' }}>
          <IconAction label={`Editar ${habit.name}`} onPress={onEdit}>
            <IconPencil color={C.muted} />
          </IconAction>
          <IconAction label={`Eliminar ${habit.name}`} onPress={onRemove}>
            <IconTrash color={C.bad} />
          </IconAction>
        </View>
      </Row>

      <View style={{ gap: 2 }}>
        <Mono style={styles.days}>{daysLabel(days)}</Mono>
        <Mono style={styles.clock}>{clock}</Mono>
        <Text style={styles.caption}>{`Sin ${habit.name.toLowerCase()} desde el ${formatDate(started)}`}</Text>
      </View>

      <View style={{ gap: 6 }}>
        <Row>
          <Text style={styles.caption}>{`Próxima meta: ${daysLabel(next)}`}</Text>
          <Text style={styles.caption}>{`${Math.round(progress * 100)}%`}</Text>
        </Row>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.max(2, progress * 100)}%` }]} />
        </View>
      </View>

      <View style={styles.stats}>
        <Stat label="Mejor racha" value={daysLabel(splitStreak(best).days)} />
        <Stat label="Veces que volví a empezar" value={String(resets.length)} />
      </View>

      {habit.reason ? (
        <View style={styles.reason}>
          <Label>Por qué lo dejo</Label>
          <Text style={styles.body}>{habit.reason}</Text>
        </View>
      ) : null}

      {relapsing ? (
        <View style={styles.relapse}>
          <Text style={styles.body}>El contador vuelve a cero desde ahora. Lo que lograste queda guardado en tu historial.</Text>
          <Field label="¿Qué pasó? (opcional)" placeholder="Ej. estaba solo y aburrido de noche" value={note} onChangeText={setNote} multiline />
          <Row>
            <Btn label="Cancelar" kind="ghost" onPress={() => setRelapsing(false)} />
            <Btn
              label="Volver a empezar"
              kind="danger"
              onPress={async () => {
                await onRelapse(note);
                setNote('');
                setRelapsing(false);
              }}
            />
          </Row>
        </View>
      ) : (
        <Btn label="Perdí la racha" kind="outline" onPress={() => setRelapsing(true)} />
      )}

      {resets.length ? (
        <View>
          <Pressable onPress={() => setHistory(!history)} style={styles.collapse} accessibilityRole="button" accessibilityState={{ expanded: history }}>
            <Label>{`Historial (${resets.length})`}</Label>
            <Text style={styles.caption}>{history ? 'Ocultar' : 'Mostrar'}</Text>
          </Pressable>
          {history
            ? resets.map((r) => (
                <View key={r.id} style={styles.histRow}>
                  <Mono style={styles.histDate}>{formatDate(r.at.slice(0, 10))}</Mono>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.body}>{`Racha de ${daysLabel(splitStreak(r.streak_seconds).days)}`}</Text>
                    {r.note ? <Text style={styles.caption}>{r.note}</Text> : null}
                  </View>
                </View>
              ))
            : null}
        </View>
      ) : null}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Mono style={styles.statValue}>{value}</Mono>
    </View>
  );
}

function IconAction({ children, label, onPress }: { children: ReactNode; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel={label}>
      {children}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------- formulario

/** "¿Desde cuándo?": hoy = desde este momento; otro día = desde las 00:00 de ese día. */
export function HabitForm({ initial, onSave, onCancel }: { initial?: Habit; onSave: (h: { name: string; reason: string; started_at: string }) => Promise<boolean>; onCancel: () => void }) {
  const today = toDmy(localIso(new Date()));
  const initialDate = initial ? toDmy(localIso(new Date(initial.started_at))) : today;
  const [name, setName] = useState(initial?.name ?? '');
  const [reason, setReason] = useState(initial?.reason ?? '');
  const [date, setDate] = useState(initialDate);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return setError('Escribe qué estás dejando.');
    const iso = parseDate(date);
    if (!iso) return setError('Elige una fecha de hoy o de antes.');
    const started_at =
      initial && date === initialDate ? initial.started_at : date === today ? new Date().toISOString() : new Date(`${iso}T00:00:00`).toISOString();
    setSaving(true);
    const ok = await onSave({ name, reason, started_at });
    setSaving(false);
    if (!ok) setError('No pude guardarlo. Revisa tu conexión e intenta de nuevo.');
  };

  return (
    <Card glow>
      <Label style={{ color: C.accentSoft }}>{initial ? 'Editar' : 'Algo que estás dejando'}</Label>
      <Field label="¿Qué estás dejando?" placeholder="Ej. Fumar" value={name} onChangeText={setName} />
      {!initial ? (
        <View style={styles.chips}>
          {SUGGESTIONS.map((s) => (
            <Pressable key={s} onPress={() => setName(s)} style={[styles.chip, name === s && styles.chipOn]} accessibilityRole="button">
              <Text style={[styles.chipText, name === s && { color: C.onAccent }]}>{s}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Field label="¿Por qué lo dejas? (opcional)" placeholder="Te lo recordaremos cuando cueste" value={reason} onChangeText={setReason} multiline />
      <DateField label="¿Desde cuándo?" value={date} onChange={setDate} hint="Si es hoy, cuenta desde este momento." />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Row>
        <Btn label="Cancelar" kind="ghost" onPress={onCancel} />
        <Btn label={saving ? 'Guardando…' : 'Guardar'} onPress={save} disabled={saving} />
      </Row>
    </Card>
  );
}

const localIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ---------------------------------------------------------------------------- versículo

export function VerseCard({ index, onNext }: { index: number; onNext: () => void }) {
  const v = VERSES[index % VERSES.length];
  return (
    <Card>
      <Label style={{ color: C.accentSoft }}>Versículo</Label>
      <Text style={styles.verse}>{`«${v.text}»`}</Text>
      <Mono style={styles.ref}>{v.ref}</Mono>
      <Btn label="Otro versículo" kind="outline" onPress={onNext} />
      <Text style={styles.credit}>{VERSES_CREDIT}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { color: C.text, fontSize: 14.5, lineHeight: 20 },
  caption: { color: C.muted, fontSize: 12.5, lineHeight: 18 },
  error: { color: C.bad, fontSize: 13 },
  pin: { alignItems: 'center', gap: 12, paddingVertical: 12 },
  lock: { width: 56, height: 56, borderRadius: 28, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surfaceInput },
  pinTitle: { color: C.text, fontSize: 18, fontWeight: '600', textAlign: 'center' },
  dots: { flexDirection: 'row', gap: 16, marginTop: 4 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: C.border },
  dotOn: { backgroundColor: C.accent, borderColor: C.accent },
  keys: { flexDirection: 'row', flexWrap: 'wrap', width: 3 * 72 + 2 * 16, gap: 16, justifyContent: 'center' },
  key: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center' },
  keyBtn: { borderRadius: 36, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.surfaceInput },
  keyText: { color: C.text, fontSize: 26, fontFamily: mono },
  days: { fontSize: 40, fontWeight: '700', color: C.text },
  clock: { fontSize: 14, color: C.accentSoft, fontVariant: ['tabular-nums'] },
  track: { height: 6, borderRadius: 3, backgroundColor: C.surfaceSunken, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3, backgroundColor: C.accent },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, gap: 2, padding: 10, borderRadius: R.field, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.surfaceSunken },
  statLabel: { color: C.muted, fontSize: 11.5 },
  statValue: { color: C.text, fontSize: 16, fontWeight: '600' },
  reason: { gap: 4, padding: 10, borderRadius: R.field, borderLeftWidth: 2, borderLeftColor: C.accentSoft, backgroundColor: C.surfaceSunken },
  relapse: { gap: 10, padding: 12, borderRadius: R.field, borderWidth: 1, borderColor: C.warn },
  collapse: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44 },
  histRow: { flexDirection: 'row', gap: 12, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.cardBorder },
  histDate: { width: 92, fontSize: 12, color: C.muted },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { minHeight: 44, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: C.cardBorder, justifyContent: 'center' },
  chipOn: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { color: C.chipText, fontSize: 13 },
  verse: { color: C.text, fontSize: 16, lineHeight: 24, fontStyle: 'italic' },
  ref: { color: C.accentSoft, fontSize: 12.5, letterSpacing: 0.5 },
  credit: { color: C.textFaint, fontSize: 10.5, lineHeight: 15 },
});
