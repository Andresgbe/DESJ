// Módulos · TO BUY: lista de compras con categorías. Arriba se agrega (título + categoría); se ven solo las
// pendientes, agrupadas por categoría y con filtro. Al marcar el check pasan a "Completado", que está plegado
// y se abre con un toque. Las categorías se agregan, renombran, cambian de color y borran en "Categorías".
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Btn } from '@/components/form';
import { IconCheck, IconPlus, IconTrash } from '@/components/icons';
import { ModuleIcon } from '@/components/modules';
import { Card, Label, Row, Screen, Title } from '@/components/ui';
import { confirm, notify } from '@/lib/confirm';
import { useModules } from '@/lib/modules';
import { BuyCategory, BuyItem, PALETTE, useToBuy } from '@/lib/tobuy';
import { C, R } from '@/theme';

const NONE = '__none__'; // filtro y grupo "Sin categoría"

export default function ToBuy() {
  const { ready: modulesReady, modules, reload: reloadModules } = useModules();
  const mod = modules.find((m) => m.kind === 'tobuy');
  const tb = useToBuy(mod?.id);
  const { reload } = tb;
  const [title, setTitle] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [manage, setManage] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void reloadModules();
      reload()
        .then(() => setLoadError(null))
        .catch((e: Error) => setLoadError(e.message));
    }, [reloadModules, reload]),
  );

  if (!mod || !tb.ready) {
    return (
      <Screen module="Módulos · To buy" back>
        <Text style={styles.caption}>{loadError ?? (modulesReady && !mod ? 'Este módulo ya no existe. Agrégalo desde el catálogo de Módulos.' : 'Cargando…')}</Text>
      </Screen>
    );
  }

  const catOf = (id: string | null) => tb.categories.find((c) => c.id === id);
  const matches = (x: BuyItem) => filter === null || (filter === NONE ? !catOf(x.category_id) : x.category_id === filter);
  const pending = tb.items.filter((x) => !x.done && matches(x));
  const done = tb.items.filter((x) => x.done && matches(x)).sort((a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? ''));
  const groups = [
    ...tb.categories.map((c) => ({ key: c.id, name: c.name, color: c.color, items: pending.filter((x) => x.category_id === c.id) })),
    { key: NONE, name: 'Sin categoría', color: C.muted, items: pending.filter((x) => !catOf(x.category_id)) },
  ].filter((g) => g.items.length);

  const add = async () => {
    if (!title.trim()) return;
    if (await tb.addItem(title, cat)) setTitle('');
    else notify('No pude agregarlo. Revisa tu conexión e intenta de nuevo.');
  };

  const clearDone = async () => {
    if (await confirm('Borrar completados', `¿Borrar ${done.length === 1 ? 'la cosa comprada' : `las ${done.length} cosas compradas`}?`, 'Borrar')) void tb.removeItems(done.map((x) => x.id));
  };

  return (
    <Screen module="Módulos · To buy" back>
      <Row style={{ justifyContent: 'flex-start' }}>
        <View style={styles.icon}>
          <ModuleIcon kind="tobuy" color={C.accentSoft} size={24} />
        </View>
        <View style={{ gap: 2, flex: 1 }}>
          <Label>Lista de compras</Label>
          <Title accent="buy">To</Title>
        </View>
      </Row>

      <Card>
        <View style={styles.addRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="¿Qué necesitas comprar?"
            placeholderTextColor={C.muted}
            value={title}
            onChangeText={setTitle}
            onSubmitEditing={add}
            returnKeyType="done"
            submitBehavior="submit"
          />
          <Pressable onPress={add} style={styles.addBtn} accessibilityRole="button" accessibilityLabel="Agregar">
            <IconPlus color={C.onAccent} size={20} />
          </Pressable>
        </View>
        <CategoryChips categories={tb.categories} value={cat} onChange={setCat} noneLabel="Sin categoría" />
      </Card>

      <View style={styles.filters}>
        <Chip label="Todas" active={filter === null} onPress={() => setFilter(null)} />
        {tb.categories.map((c) => (
          <Chip key={c.id} label={c.name} color={c.color} active={filter === c.id} onPress={() => setFilter(filter === c.id ? null : c.id)} />
        ))}
        <Chip label="Categorías" outline onPress={() => setManage(!manage)} active={manage} />
      </View>

      {manage ? <CategoryManager categories={tb.categories} onAdd={tb.addCategory} onUpdate={tb.updateCategory} onRemove={tb.removeCategory} /> : null}

      {pending.length === 0 ? (
        <Card>
          <Text style={styles.body}>{tb.items.some((x) => !x.done) ? 'Nada pendiente en esta categoría.' : 'Nada pendiente por comprar.'}</Text>
        </Card>
      ) : (
        groups.map((g) => (
          <Card key={g.key} style={{ gap: 2 }}>
            <Row>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[styles.dot, { backgroundColor: g.color }]} />
                <Label style={{ color: C.accentSoft }}>{g.name}</Label>
              </View>
              <Text style={styles.caption}>{g.items.length}</Text>
            </Row>
            {g.items.map((x) =>
              editing === x.id ? (
                <EditItem
                  key={x.id}
                  item={x}
                  categories={tb.categories}
                  onCancel={() => setEditing(null)}
                  onSave={async (patch) => {
                    if (await tb.updateItem(x.id, patch)) setEditing(null);
                    else notify('No pude guardar el cambio.');
                  }}
                  onRemove={async () => {
                    setEditing(null);
                    await tb.removeItems([x.id]);
                  }}
                />
              ) : (
                <ItemRow key={x.id} item={x} onToggle={() => tb.updateItem(x.id, { done: true })} onEdit={() => setEditing(x.id)} />
              ),
            )}
          </Card>
        ))
      )}

      {done.length ? (
        <Card style={{ gap: 2 }}>
          <Pressable onPress={() => setShowDone(!showDone)} style={styles.collapse} accessibilityRole="button" accessibilityState={{ expanded: showDone }}>
            <Label style={{ color: C.ok }}>{`Completado (${done.length})`}</Label>
            <Text style={styles.caption}>{showDone ? 'Ocultar' : 'Ver'}</Text>
          </Pressable>
          {showDone ? (
            <>
              {done.map((x) => (
                <ItemRow key={x.id} item={x} category={catOf(x.category_id)} onToggle={() => tb.updateItem(x.id, { done: false })} />
              ))}
              <Btn label="Borrar completados" kind="ghost" onPress={clearDone} />
            </>
          ) : null}
        </Card>
      ) : null}
    </Screen>
  );
}

function ItemRow({ item, category, onToggle, onEdit }: { item: BuyItem; category?: BuyCategory; onToggle: () => void; onEdit?: () => void }) {
  return (
    <View style={styles.item}>
      <Pressable onPress={onToggle} style={styles.check} accessibilityRole="checkbox" accessibilityState={{ checked: item.done }} accessibilityLabel={item.title}>
        <View style={[styles.box, item.done && styles.boxOn]}>{item.done ? <IconCheck color={C.onAccent} size={14} /> : null}</View>
      </Pressable>
      <Pressable onPress={onEdit} disabled={!onEdit} style={{ flex: 1, minHeight: 44, justifyContent: 'center' }} accessibilityRole={onEdit ? 'button' : undefined} accessibilityHint={onEdit ? 'Editar' : undefined}>
        <Text style={[styles.title, item.done && styles.titleDone]}>{item.title}</Text>
        {category ? <Text style={styles.caption}>{category.name}</Text> : null}
      </Pressable>
    </View>
  );
}

function EditItem({
  item,
  categories,
  onSave,
  onCancel,
  onRemove,
}: {
  item: BuyItem;
  categories: BuyCategory[];
  onSave: (patch: { title: string; category_id: string | null }) => void;
  onCancel: () => void;
  onRemove: () => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [cat, setCat] = useState(item.category_id);
  return (
    <View style={styles.edit}>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} autoFocus onSubmitEditing={() => title.trim() && onSave({ title: title.trim(), category_id: cat })} />
      <CategoryChips categories={categories} value={cat} onChange={setCat} noneLabel="Sin categoría" />
      <Row>
        <Pressable onPress={onRemove} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel={`Eliminar ${item.title}`}>
          <IconTrash color={C.bad} />
        </Pressable>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Btn label="Cancelar" kind="ghost" onPress={onCancel} style={styles.small} />
          <Btn label="Guardar" onPress={() => title.trim() && onSave({ title: title.trim(), category_id: cat })} style={styles.small} />
        </View>
      </Row>
    </View>
  );
}

function CategoryChips({ categories, value, onChange, noneLabel }: { categories: BuyCategory[]; value: string | null; onChange: (id: string | null) => void; noneLabel: string }) {
  return (
    <View style={styles.filters}>
      {categories.map((c) => (
        <Chip key={c.id} label={c.name} color={c.color} active={value === c.id} onPress={() => onChange(value === c.id ? null : c.id)} />
      ))}
      <Chip label={noneLabel} active={value === null} onPress={() => onChange(null)} />
    </View>
  );
}

function Chip({ label, color, active, outline, onPress }: { label: string; color?: string; active?: boolean; outline?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, outline && { borderStyle: 'dashed' }, active && styles.chipOn]} accessibilityRole="button" accessibilityState={{ selected: active }}>
      {color ? <View style={[styles.dot, { backgroundColor: color }]} /> : null}
      <Text style={[styles.chipText, active && { color: C.onAccent }]}>{label}</Text>
    </Pressable>
  );
}

/** Categorías: agregar, renombrar (se guarda al salir del campo), cambiar color (toque en el punto) y borrar. */
function CategoryManager({
  categories,
  onAdd,
  onUpdate,
  onRemove,
}: {
  categories: BuyCategory[];
  onAdd: (name: string) => Promise<boolean>;
  onUpdate: (id: string, patch: Partial<Pick<BuyCategory, 'name' | 'color'>>) => Promise<boolean>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const add = async () => {
    if (!name.trim()) return;
    if (await onAdd(name)) setName('');
    else notify('No pude agregar la categoría.');
  };
  const remove = async (c: BuyCategory) => {
    if (await confirm('Borrar categoría', `¿Borrar "${c.name}"? Lo que tenga queda sin categoría.`, 'Borrar')) void onRemove(c.id);
  };
  return (
    <Card glow>
      <Label style={{ color: C.accentSoft }}>Categorías</Label>
      <Text style={styles.caption}>Toca el punto para cambiar el color.</Text>
      {categories.map((c) => (
        <View key={c.id} style={styles.catRow}>
          <Pressable
            onPress={() => onUpdate(c.id, { color: PALETTE[(PALETTE.indexOf(c.color) + 1) % PALETTE.length] })}
            style={styles.iconBtn}
            accessibilityRole="button"
            accessibilityLabel={`Cambiar color de ${c.name}`}>
            <View style={[styles.dot, { width: 16, height: 16, borderRadius: 8, backgroundColor: c.color }]} />
          </Pressable>
          <NameInput value={c.name} onSave={(v) => onUpdate(c.id, { name: v })} />
          <Pressable onPress={() => remove(c)} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel={`Borrar ${c.name}`}>
            <IconTrash color={C.bad} />
          </Pressable>
        </View>
      ))}
      <View style={styles.addRow}>
        <TextInput style={[styles.input, { flex: 1 }]} placeholder="Nueva categoría" placeholderTextColor={C.muted} value={name} onChangeText={setName} onSubmitEditing={add} />
        <Btn label="Agregar" onPress={add} style={styles.small} />
      </View>
    </Card>
  );
}

/** Nombre de categoría: se guarda al salir del campo o con Enter. */
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
  icon: { width: 48, height: 48, borderRadius: R.card, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surfaceInput },
  input: { color: C.text, fontSize: 15, borderWidth: 1, borderColor: C.cardBorder, borderRadius: R.field, paddingHorizontal: 12, minHeight: 44, backgroundColor: C.surfaceSunken },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  addBtn: { width: 48, height: 48, borderRadius: R.button, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.surfaceInput },
  chipOn: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { color: C.chipText, fontSize: 13.5, fontWeight: '500' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  check: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: C.ok, borderColor: C.ok },
  title: { color: C.text, fontSize: 15.5 },
  titleDone: { color: C.muted, textDecorationLine: 'line-through' },
  edit: { gap: 8, padding: 10, borderRadius: R.field, borderWidth: 1, borderColor: C.border, marginVertical: 4 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  small: { flexGrow: 0, minHeight: 44, paddingHorizontal: 16 },
  collapse: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44 },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
