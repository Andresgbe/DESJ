// Módulos · Goals: metas a corto, mediano y largo plazo. Pestañas por plazo (más "Logrados"), filtro por
// categoría (Finanzas, Universidad, Escritura… editables) y cada meta con fecha, progreso y pasos. Tocar una meta
// la abre: pasos para marcar, "Llevo…" si tiene número, progreso a mano si no, Logrado, Editar y Borrar.
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { DateField } from '@/components/date-field';
import { Btn, Field } from '@/components/form';
import { IconCheck, IconPlus, IconTrash } from '@/components/icons';
import { ModuleIcon } from '@/components/modules';
import { Card, Label, Mono, Row, Screen, Title } from '@/components/ui';
import { Chip } from '@/components/university';
import { confirm, notify } from '@/lib/confirm';
import { formatDate } from '@/lib/dates';
import { amount, Goal, GOAL_COLORS, GoalCategory, GoalStep, Horizon, HORIZONS, progressOf, SEED_CATEGORIES, untilLabel, useGoals } from '@/lib/goals';
import { useModules } from '@/lib/modules';
import { C, R } from '@/theme';

type Tab = Horizon | 'logrados';
type GoalInput = Omit<Goal, 'id' | 'done_at' | 'position' | 'current_amount' | 'progress'>;

const dmy = (iso: string) => iso.split('-').reverse().join('/');
const isoOf = (text: string) => {
  const m = text.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return d.getDate() === Number(m[1]) ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
};
const parseNum = (t: string) => {
  const v = Number(t.trim().replace(/\./g, '').replace(',', '.'));
  return t.trim() && Number.isFinite(v) ? v : null;
};

export default function Goals() {
  const { ready: modulesReady, modules, reload: reloadModules } = useModules();
  const mod = modules.find((m) => m.kind === 'goals');
  const g = useGoals(mod?.id);
  const { reload, insert } = g;
  const [tab, setTab] = useState<Tab>('corto');
  const [filter, setFilter] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<Goal | 'new' | null>(null);
  const [manage, setManage] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const seeding = useRef(false);

  useFocusEffect(
    useCallback(() => {
      void reloadModules();
      reload()
        .then(async (d) => {
          setLoadError(null);
          // La primera vez (sin categorías ni metas) se siembran las categorías de base.
          if (d && !d.goal_categories.length && !d.goals.length && !seeding.current) {
            seeding.current = true;
            for (const c of SEED_CATEGORIES) await insert('goal_categories', c);
          }
        })
        .catch((e: Error) => setLoadError(e.message));
      // eslint-disable-next-line react-hooks/exhaustive-deps -- insert cambia en cada render; basta con reload
    }, [reloadModules, reload]),
  );

  if (!mod || !g.ready) {
    return (
      <Screen module="Módulos · Goals" back>
        <Text style={styles.caption}>{loadError ?? (modulesReady && !mod ? 'Este módulo ya no existe. Agrégalo desde el catálogo de Módulos.' : 'Cargando…')}</Text>
      </Screen>
    );
  }

  const { goal_categories: categories, goals, goal_steps: steps } = g.data;
  const catOf = (id: string | null) => categories.find((c) => c.id === id);
  const stepsOf = (id: string) => steps.filter((s) => s.goal_id === id).sort((a, b) => a.position - b.position);
  const inFilter = (x: Goal) => filter === null || x.category_id === filter;
  const countOf = (t: Tab) => goals.filter((x) => (t === 'logrados' ? x.done_at : !x.done_at && x.horizon === t) && inFilter(x)).length;
  const list = goals
    .filter((x) => (tab === 'logrados' ? x.done_at : !x.done_at && x.horizon === tab) && inFilter(x))
    .sort((a, b) => (tab === 'logrados' ? (b.done_at ?? '').localeCompare(a.done_at ?? '') : (a.target_date ?? '9999').localeCompare(b.target_date ?? '9999') || a.position - b.position));

  const saveGoal = async (input: GoalInput, id?: string) => {
    if (id) return g.update('goals', id, input);
    const saved = await g.insert('goals', { ...input, current_amount: 0, progress: 0, done_at: null, position: goals.length });
    if (saved) {
      setTab(input.horizon);
      setOpenId(saved.id);
    }
    return Boolean(saved);
  };

  const removeGoal = async (x: Goal) => {
    if (!(await confirm('Borrar meta', `¿Borrar "${x.title}" y sus pasos?`, 'Borrar'))) return;
    await g.remove({ goals: [x.id], goal_steps: stepsOf(x.id).map((s) => s.id) });
  };

  const toggleDone = async (x: Goal) => {
    if (!(await g.update('goals', x.id, { done_at: x.done_at ? null : new Date().toISOString() }))) notify('No pude guardarlo. Revisa tu conexión.');
  };

  return (
    <Screen module="Módulos · Goals" back>
      <Row style={{ justifyContent: 'flex-start' }}>
        <View style={styles.icon}>
          <ModuleIcon kind="goals" color={C.accentSoft} size={24} />
        </View>
        <View style={{ gap: 2, flex: 1 }}>
          <Label>Corto, mediano y largo plazo</Label>
          <Title accent="goals">Tus</Title>
        </View>
      </Row>

      <View style={styles.tabs}>
        {[...HORIZONS.map((h) => ({ id: h.id as Tab, label: h.label })), { id: 'logrados' as Tab, label: 'Logrados' }].map((t) => (
          <Pressable key={t.id} onPress={() => setTab(t.id)} style={[styles.tab, tab === t.id && styles.tabOn]} accessibilityRole="button" accessibilityState={{ selected: tab === t.id }}>
            <Text style={[styles.tabText, tab === t.id && { color: C.onAccent }]}>{t.label}</Text>
            <Text style={[styles.tabCount, tab === t.id && { color: C.onAccent }]}>{countOf(t.id)}</Text>
          </Pressable>
        ))}
      </View>
      {tab !== 'logrados' ? <Text style={styles.caption}>{HORIZONS.find((h) => h.id === tab)!.hint}</Text> : null}

      <View style={styles.chips}>
        <Chip label="Todas" active={filter === null} onPress={() => setFilter(null)} />
        {categories.map((c) => (
          <Chip key={c.id} label={c.name} color={c.color} active={filter === c.id} onPress={() => setFilter(filter === c.id ? null : c.id)} />
        ))}
        <Chip label="Categorías" active={manage} onPress={() => setManage(!manage)} />
      </View>

      {manage ? (
        <CategoryManager
          categories={categories}
          onAdd={async (name) => Boolean(await g.insert('goal_categories', { name, color: GOAL_COLORS[categories.length % GOAL_COLORS.length], position: categories.length }))}
          onUpdate={(id, patch) => g.update('goal_categories', id, patch)}
          onRemove={async (c) => {
            if (!(await confirm('Borrar categoría', `¿Borrar "${c.name}"? Sus metas quedan sin categoría.`, 'Borrar'))) return;
            await g.updateMany('goals', goals.filter((x) => x.category_id === c.id).map((x) => ({ id: x.id, patch: { category_id: null } })));
            await g.remove({ goal_categories: [c.id] });
            if (filter === c.id) setFilter(null);
          }}
        />
      ) : null}

      {list.length === 0 && form !== 'new' ? (
        <Card>
          <Text style={styles.body}>
            {tab === 'logrados' ? 'Todavía no hay metas logradas. Cuando cumplas una, márcala como lograda y aparece aquí.' : 'Sin metas aquí todavía. Agrega una: qué quieres lograr, para cuándo y cómo vas a medir el avance.'}
          </Text>
        </Card>
      ) : null}

      {list.map((x) =>
        form !== 'new' && form?.id === x.id ? (
          <GoalForm key={x.id} initial={x} categories={categories} onCancel={() => setForm(null)} onSave={async (v) => (await saveGoal(v, x.id)) && (setForm(null), true)} />
        ) : (
          <GoalCard
            key={x.id}
            goal={x}
            category={catOf(x.category_id)}
            steps={stepsOf(x.id)}
            open={openId === x.id}
            onToggle={() => setOpenId(openId === x.id ? null : x.id)}
            onUpdate={(patch) => g.update('goals', x.id, patch)}
            onAddStep={async (title) => Boolean(await g.insert('goal_steps', { goal_id: x.id, title, done: false, position: stepsOf(x.id).length }))}
            onToggleStep={(s) => g.update('goal_steps', s.id, { done: !s.done })}
            onRemoveStep={(s) => g.remove({ goal_steps: [s.id] })}
            onDone={() => toggleDone(x)}
            onEdit={() => setForm(x)}
            onRemove={() => removeGoal(x)}
          />
        ),
      )}

      {form === 'new' ? (
        <GoalForm categories={categories} defaultHorizon={tab === 'logrados' ? 'corto' : tab} defaultCategory={filter} onCancel={() => setForm(null)} onSave={async (v) => (await saveGoal(v)) && (setForm(null), true)} />
      ) : (
        <Btn label="Nueva meta" kind="outline" icon={<IconPlus color={C.chipText} />} onPress={() => setForm('new')} />
      )}
    </Screen>
  );
}

// ---------------------------------------------------------------------------- tarjeta

function GoalCard({
  goal,
  category,
  steps,
  open,
  onToggle,
  onUpdate,
  onAddStep,
  onToggleStep,
  onRemoveStep,
  onDone,
  onEdit,
  onRemove,
}: {
  goal: Goal;
  category?: GoalCategory;
  steps: GoalStep[];
  open: boolean;
  onToggle: () => void;
  onUpdate: (patch: Partial<Goal>) => Promise<boolean>;
  onAddStep: (title: string) => Promise<boolean>;
  onToggleStep: (s: GoalStep) => void;
  onRemoveStep: (s: GoalStep) => void;
  onDone: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const p = progressOf(goal, steps);
  const color = category?.color ?? C.accent;
  const [current, setCurrent] = useState(String(goal.current_amount || ''));
  const [step, setStep] = useState('');
  const late = goal.target_date && !goal.done_at && untilLabel(goal.target_date).startsWith('venció');

  const addStep = async () => {
    if (!step.trim()) return;
    if (await onAddStep(step.trim().slice(0, 200))) setStep('');
    else notify('No pude guardar el paso.');
  };
  const saveAmount = async () => {
    const v = parseNum(current);
    if (v === null || v < 0) return notify('Escribe cuánto llevas, por ejemplo 1200.');
    if (!(await onUpdate({ current_amount: v }))) notify('No pude guardarlo.');
  };

  return (
    <View style={[styles.card, goal.done_at && { opacity: 0.85 }]}>
      <View style={[styles.cardBar, { backgroundColor: color }]} />
      <View style={{ flex: 1, gap: 10, padding: 14 }}>
        <Pressable onPress={onToggle} style={{ gap: 8 }} accessibilityRole="button" accessibilityState={{ expanded: open }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <Text style={[styles.title, goal.done_at && styles.titleDone]}>{goal.title}</Text>
            {goal.done_at ? (
              <View style={styles.doneBadge}>
                <IconCheck color={C.onAccent} size={12} />
              </View>
            ) : null}
          </View>
          <Text style={styles.caption}>
            {[category?.name, goal.done_at ? `Logrado el ${formatDate(goal.done_at.slice(0, 10))}` : goal.target_date ? `Para el ${formatDate(goal.target_date)} · ${untilLabel(goal.target_date)}` : null].filter(Boolean).join(' · ')}
          </Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.max(2, p.value * 100)}%`, backgroundColor: goal.done_at ? C.ok : color }]} />
          </View>
          <Row>
            <Text style={[styles.caption, late && { color: C.warn }]}>{p.label}</Text>
            <Mono style={styles.pct}>{`${Math.round(p.value * 100)}%`}</Mono>
          </Row>
        </Pressable>

        {open ? (
          <View style={{ gap: 12 }}>
            {goal.description ? <Text style={styles.body}>{goal.description}</Text> : null}

            {goal.target_amount && !goal.done_at ? (
              <View style={{ gap: 6 }}>
                <Label>{`Llevo (${goal.unit || 'unidades'})`}</Label>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput style={[styles.input, { flex: 1 }]} value={current} onChangeText={setCurrent} keyboardType="decimal-pad" onSubmitEditing={saveAmount} placeholder="0" placeholderTextColor={C.muted} />
                  <Btn label="Actualizar" onPress={saveAmount} style={styles.small} />
                </View>
                <Text style={styles.caption}>{`Meta: ${amount(goal.target_amount, goal.unit)}`}</Text>
              </View>
            ) : null}

            {!goal.target_amount && !steps.length && !goal.done_at ? (
              <View style={{ gap: 6 }}>
                <Label>Avance</Label>
                <View style={styles.chips}>
                  {[0, 25, 50, 75, 100].map((v) => (
                    <Chip key={v} label={`${v}%`} active={goal.progress === v} onPress={() => onUpdate({ progress: v })} />
                  ))}
                </View>
              </View>
            ) : null}

            <View style={{ gap: 4 }}>
              <Label>{`Pasos${steps.length ? ` (${steps.filter((s) => s.done).length}/${steps.length})` : ''}`}</Label>
              {steps.map((s) => (
                <View key={s.id} style={styles.stepRow}>
                  <Pressable onPress={() => onToggleStep(s)} style={styles.check} accessibilityRole="checkbox" accessibilityState={{ checked: s.done }} accessibilityLabel={s.title}>
                    <View style={[styles.box, s.done && styles.boxOn]}>{s.done ? <IconCheck color={C.onAccent} size={13} /> : null}</View>
                  </Pressable>
                  <Text style={[styles.body, { flex: 1 }, s.done && styles.titleDone]}>{s.title}</Text>
                  <Pressable onPress={() => onRemoveStep(s)} style={styles.check} accessibilityRole="button" accessibilityLabel={`Borrar ${s.title}`}>
                    <IconTrash color={C.muted} size={14} />
                  </Pressable>
                </View>
              ))}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput style={[styles.input, { flex: 1 }]} placeholder="Agregar un paso" placeholderTextColor={C.muted} value={step} onChangeText={setStep} onSubmitEditing={addStep} />
                <Pressable onPress={addStep} style={styles.addBtn} accessibilityRole="button" accessibilityLabel="Agregar paso">
                  <IconPlus color={C.onAccent} size={18} />
                </Pressable>
              </View>
            </View>

            <Row style={{ justifyContent: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
              <Btn label={goal.done_at ? 'Reabrir' : '¡Logrado!'} kind={goal.done_at ? 'ghost' : 'primary'} onPress={onDone} style={styles.small} />
              <Btn label="Editar" kind="ghost" onPress={onEdit} style={styles.small} />
              <Btn label="Borrar" kind="danger" onPress={onRemove} style={styles.small} />
            </Row>
          </View>
        ) : null}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------- formulario

function GoalForm({
  initial,
  categories,
  defaultHorizon = 'corto',
  defaultCategory = null,
  onSave,
  onCancel,
}: {
  initial?: Goal;
  categories: GoalCategory[];
  defaultHorizon?: Horizon;
  defaultCategory?: string | null;
  onSave: (g: GoalInput) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [horizon, setHorizon] = useState<Horizon>(initial?.horizon ?? defaultHorizon);
  const [category, setCategory] = useState<string | null>(initial ? initial.category_id : defaultCategory);
  const [date, setDate] = useState(initial?.target_date ? dmy(initial.target_date) : '');
  const [target, setTarget] = useState(initial?.target_amount ? String(initial.target_amount) : '');
  const [unit, setUnit] = useState(initial?.unit ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim()) return setError('Escribe la meta.');
    const due = date.trim() ? isoOf(date) : null;
    if (date.trim() && !due) return setError('La fecha va en DD/MM/AAAA, o déjala vacía.');
    const t = target.trim() ? parseNum(target) : null;
    if (target.trim() && (t === null || t <= 0)) return setError('La meta con número tiene que ser mayor que 0, o déjala vacía.');
    setSaving(true);
    const ok = await onSave({ title: title.trim().slice(0, 160), horizon, category_id: category, target_date: due, target_amount: t, unit: unit.trim().slice(0, 20), description: description.trim().slice(0, 2000) });
    setSaving(false);
    if (!ok) setError('No pude guardarla. Revisa tu conexión.');
  };

  return (
    <Card glow>
      <Label style={{ color: C.accentSoft }}>{initial ? 'Editar meta' : 'Nueva meta'}</Label>
      <Field label="¿Qué quieres lograr?" placeholder="Ej. Ahorrar para un carro" value={title} onChangeText={setTitle} autoFocus={!initial} />
      <View style={{ gap: 6 }}>
        <Label>Plazo</Label>
        <View style={styles.chips}>
          {HORIZONS.map((h) => (
            <Chip key={h.id} label={`${h.label} · ${h.hint.toLowerCase()}`} active={horizon === h.id} onPress={() => setHorizon(h.id)} />
          ))}
        </View>
      </View>
      {categories.length ? (
        <View style={{ gap: 6 }}>
          <Label>Categoría</Label>
          <View style={styles.chips}>
            {categories.map((c) => (
              <Chip key={c.id} label={c.name} color={c.color} active={category === c.id} onPress={() => setCategory(category === c.id ? null : c.id)} />
            ))}
          </View>
        </View>
      ) : null}
      <DateField label="¿Para cuándo? (opcional)" value={date} onChange={setDate} future clearable placeholder="Opcional" />
      <View style={{ gap: 6 }}>
        <Label>Meta con número (opcional)</Label>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput style={[styles.input, { flex: 2 }]} placeholder="Ej. 5000" placeholderTextColor={C.muted} value={target} onChangeText={setTarget} keyboardType="decimal-pad" accessibilityLabel="Meta con número" />
          <TextInput style={[styles.input, { flex: 1 }]} placeholder="$, libros…" placeholderTextColor={C.muted} value={unit} onChangeText={setUnit} accessibilityLabel="Unidad" />
        </View>
        <Text style={styles.caption}>Si la pones, el avance es lo que llevas sobre esa meta. Si no, cuentan los pasos.</Text>
      </View>
      <Field label="¿Por qué y cómo? (opcional)" placeholder="Lo que te motiva y el plan" value={description} onChangeText={setDescription} multiline />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Row>
        <Btn label="Cancelar" kind="ghost" onPress={onCancel} />
        <Btn label={saving ? 'Guardando…' : 'Guardar'} onPress={save} disabled={saving} />
      </Row>
    </Card>
  );
}

// ---------------------------------------------------------------------------- categorías

function CategoryManager({
  categories,
  onAdd,
  onUpdate,
  onRemove,
}: {
  categories: GoalCategory[];
  onAdd: (name: string) => Promise<boolean>;
  onUpdate: (id: string, patch: Partial<GoalCategory>) => Promise<boolean>;
  onRemove: (c: GoalCategory) => void;
}) {
  const [name, setName] = useState('');
  const add = async () => {
    if (!name.trim()) return;
    if (await onAdd(name.trim().slice(0, 60))) setName('');
    else notify('No pude agregar la categoría.');
  };
  return (
    <Card glow>
      <Label style={{ color: C.accentSoft }}>Categorías</Label>
      <Text style={styles.caption}>Toca el punto para cambiar el color.</Text>
      {categories.map((c) => (
        <View key={c.id} style={styles.catRow}>
          <Pressable onPress={() => onUpdate(c.id, { color: GOAL_COLORS[(GOAL_COLORS.indexOf(c.color) + 1) % GOAL_COLORS.length] })} style={styles.check} accessibilityRole="button" accessibilityLabel={`Cambiar color de ${c.name}`}>
            <View style={[styles.dot, { backgroundColor: c.color }]} />
          </Pressable>
          <NameInput value={c.name} onSave={(v) => onUpdate(c.id, { name: v })} />
          <Pressable onPress={() => onRemove(c)} style={styles.check} accessibilityRole="button" accessibilityLabel={`Borrar ${c.name}`}>
            <IconTrash color={C.bad} />
          </Pressable>
        </View>
      ))}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput style={[styles.input, { flex: 1 }]} placeholder="Nueva categoría" placeholderTextColor={C.muted} value={name} onChangeText={setName} onSubmitEditing={add} />
        <Btn label="Agregar" onPress={add} style={styles.small} />
      </View>
    </Card>
  );
}

function NameInput({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [text, setText] = useState(value);
  const commit = () => {
    const v = text.trim().slice(0, 60);
    if (v && v !== value) onSave(v);
    else setText(value);
  };
  return <TextInput style={[styles.input, { flex: 1 }]} value={text} onChangeText={setText} onBlur={commit} onSubmitEditing={commit} accessibilityLabel={`Nombre de ${value}`} />;
}

const styles = StyleSheet.create({
  body: { color: C.text, fontSize: 14.5, lineHeight: 20 },
  caption: { color: C.muted, fontSize: 12.5, lineHeight: 18 },
  error: { color: C.bad, fontSize: 13 },
  icon: { width: 48, height: 48, borderRadius: R.card, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surfaceInput },
  tabs: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 999, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.surfaceSunken },
  tab: { flex: 1, minHeight: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, paddingHorizontal: 4 },
  tabOn: { backgroundColor: C.accent },
  tabText: { color: C.muted, fontSize: 13.5, fontWeight: '600' },
  tabCount: { color: C.textFaint, fontSize: 12, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  card: { flexDirection: 'row', borderRadius: R.card, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.card, overflow: 'hidden' },
  cardBar: { width: 5 },
  title: { flex: 1, color: C.text, fontSize: 16.5, fontWeight: '600', lineHeight: 22 },
  titleDone: { color: C.muted, textDecorationLine: 'line-through' },
  doneBadge: { width: 22, height: 22, borderRadius: 11, backgroundColor: C.ok, alignItems: 'center', justifyContent: 'center' },
  track: { height: 8, borderRadius: 4, backgroundColor: C.surfaceSunken, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  pct: { color: C.text, fontSize: 13, fontWeight: '700' },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  check: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: C.ok, borderColor: C.ok },
  input: { color: C.text, fontSize: 15, borderWidth: 1, borderColor: C.cardBorder, borderRadius: R.field, paddingHorizontal: 12, minHeight: 44, backgroundColor: C.surfaceSunken },
  addBtn: { width: 44, height: 44, borderRadius: R.button, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  small: { flexGrow: 0, minHeight: 44, paddingHorizontal: 16 },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 16, height: 16, borderRadius: 8 },
});
