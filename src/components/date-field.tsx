// Campo de fecha: se escribe DD/MM/AAAA o se elige tocando el día en un mini calendario que se abre debajo.
// El valor sigue siendo el texto "DD/MM/AAAA" (los formularios ya lo validan con parseDate).
import { ReactNode, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { IconBack, IconCalendar, IconChevron } from '@/components/icons';
import { Label } from '@/components/ui';
import { C, mono, R } from '@/theme';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const WEEK = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

const pad = (n: number) => String(n).padStart(2, '0');
const toText = (y: number, m: number, d: number) => `${pad(d)}/${pad(m + 1)}/${y}`;

/** "24/10/2026" → { y, m (0-11), d }; null si no se entiende. */
function parse(text: string) {
  const t = text.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (!t) return null;
  const [d, m, y] = [Number(t[1]), Number(t[2]) - 1, Number(t[3])];
  const date = new Date(y, m, d);
  return date.getMonth() === m && date.getDate() === d ? { y, m, d } : null;
}

/**
 * `future`: si se pueden elegir días después de hoy (vencimientos, próximos servicios). Por defecto no.
 * `clearable`: muestra "Borrar" para dejar la fecha vacía (campos opcionales).
 */
export function DateField({
  label,
  value,
  onChange,
  hint,
  future = false,
  clearable = false,
  placeholder = 'DD/MM/AAAA',
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  hint?: string;
  future?: boolean;
  clearable?: boolean;
  placeholder?: string;
}) {
  const today = new Date();
  const picked = parse(value);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState({ y: picked?.y ?? today.getFullYear(), m: picked?.m ?? today.getMonth() });

  const toggle = () => {
    if (!open) setView({ y: picked?.y ?? today.getFullYear(), m: picked?.m ?? today.getMonth() });
    setOpen(!open);
  };
  const shift = (months: number) => {
    const d = new Date(view.y, view.m + months, 1);
    setView({ y: d.getFullYear(), m: d.getMonth() });
  };
  const choose = (d: number) => {
    onChange(toText(view.y, view.m, d));
    setOpen(false);
  };

  // Semanas que empiezan el lunes.
  const first = (new Date(view.y, view.m, 1).getDay() + 6) % 7;
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const cells = [...Array<null>(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59).getTime();
  const isFuture = (d: number) => new Date(view.y, view.m, d).getTime() > endOfToday;

  return (
    <View style={{ gap: 6 }}>
      <Label>{label}</Label>
      <View style={styles.row}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={C.muted}
          keyboardType="numbers-and-punctuation"
          maxLength={10}
          style={styles.input}
          accessibilityLabel={label}
        />
        <Pressable onPress={toggle} style={[styles.calBtn, open && styles.calBtnOn]} accessibilityRole="button" accessibilityLabel={`Elegir ${label.toLowerCase()} en el calendario`} accessibilityState={{ expanded: open }}>
          <IconCalendar color={open ? C.text : C.accentSoft} size={20} />
        </Pressable>
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}

      {open ? (
        <View style={styles.cal}>
          <View style={styles.head}>
            <Nav label="Año anterior" onPress={() => shift(-12)}>
              <Text style={styles.navText}>«</Text>
            </Nav>
            <Nav label="Mes anterior" onPress={() => shift(-1)}>
              <IconBack color={C.accentSoft} size={18} />
            </Nav>
            <Text style={styles.month}>{`${MONTHS[view.m]} ${view.y}`}</Text>
            <Nav label="Mes siguiente" onPress={() => shift(1)}>
              <IconChevron color={C.accentSoft} />
            </Nav>
            <Nav label="Año siguiente" onPress={() => shift(12)}>
              <Text style={styles.navText}>»</Text>
            </Nav>
          </View>
          <View style={styles.grid}>
            {WEEK.map((w, i) => (
              <Text key={`w${i}`} style={styles.week}>
                {w}
              </Text>
            ))}
            {cells.map((d, i) => {
              if (d === null) return <View key={`e${i}`} style={styles.cell} />;
              const selected = picked && picked.y === view.y && picked.m === view.m && picked.d === d;
              const isToday = today.getFullYear() === view.y && today.getMonth() === view.m && today.getDate() === d;
              const disabled = !future && isFuture(d);
              return (
                <Pressable
                  key={d}
                  onPress={() => choose(d)}
                  disabled={disabled}
                  style={[styles.cell, styles.day, isToday && styles.today, selected && styles.selected]}
                  accessibilityRole="button"
                  accessibilityLabel={`${d} de ${MONTHS[view.m]} de ${view.y}`}
                  accessibilityState={{ selected: Boolean(selected), disabled }}>
                  <Text style={[styles.dayText, selected && { color: C.onAccent, fontWeight: '700' }, disabled && { color: C.textFaint }]}>{d}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.foot}>
            <Pressable
              onPress={() => {
                onChange(toText(today.getFullYear(), today.getMonth(), today.getDate()));
                setOpen(false);
              }}
              style={styles.footBtn}
              accessibilityRole="button">
              <Text style={styles.footText}>Hoy</Text>
            </Pressable>
            {clearable ? (
              <Pressable
                onPress={() => {
                  onChange('');
                  setOpen(false);
                }}
                style={styles.footBtn}
                accessibilityRole="button">
                <Text style={[styles.footText, { color: C.muted }]}>Borrar</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={() => setOpen(false)} style={styles.footBtn} accessibilityRole="button">
              <Text style={[styles.footText, { color: C.muted }]}>Cerrar</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Nav({ children, label, onPress }: { children: ReactNode; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.nav} accessibilityRole="button" accessibilityLabel={label}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, color: C.text, fontSize: 15, borderWidth: 1, borderColor: C.cardBorder, borderRadius: R.field, paddingHorizontal: 12, minHeight: 44, backgroundColor: C.surfaceSunken, fontFamily: mono },
  calBtn: { width: 44, height: 44, borderRadius: R.field, borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceInput, alignItems: 'center', justifyContent: 'center' },
  calBtnOn: { backgroundColor: C.surfaceSelected, borderColor: C.accent },
  hint: { color: C.muted, fontSize: 12 },
  cal: { gap: 6, padding: 10, borderRadius: R.card, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, maxWidth: 360 },
  head: { flexDirection: 'row', alignItems: 'center' },
  nav: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  navText: { color: C.accentSoft, fontSize: 20, fontWeight: '600' },
  month: { flex: 1, textAlign: 'center', color: C.text, fontSize: 15, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  week: { width: `${100 / 7}%`, textAlign: 'center', color: C.muted, fontFamily: mono, fontSize: 11, paddingVertical: 4 },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, maxHeight: 44 },
  day: { alignItems: 'center', justifyContent: 'center', borderRadius: R.pill },
  today: { borderWidth: 1, borderColor: C.accentSoft },
  selected: { backgroundColor: C.accent },
  dayText: { color: C.text, fontSize: 14, fontVariant: ['tabular-nums'] },
  foot: { flexDirection: 'row', justifyContent: 'flex-end', gap: 4 },
  footBtn: { minHeight: 40, paddingHorizontal: 12, justifyContent: 'center' },
  footText: { color: C.accentSoft, fontSize: 14, fontWeight: '600' },
});
